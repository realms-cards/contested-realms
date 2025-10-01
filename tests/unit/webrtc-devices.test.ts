/**
 * WebRTC Device Management Tests
 *
 * Tests for the MediaDeviceManager that handles device enumeration,
 * selection, and media stream creation with constraint validation.
 *
 * Critical requirements tested:
 * - Device enumeration and caching
 * - Device selection validation
 * - Constraint building for audio/video
 * - Error handling for getUserMedia failures
 * - Device monitoring and change detection
 * - Capabilities detection and validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MediaDeviceManager,
  getDeviceDisplayName,
  groupDevicesByType,
  deviceSupportsConstraints,
  type DeviceConstraints,
} from '@/lib/utils/webrtc-devices';

// Mock MediaDevices API
const mockDevices: MediaDeviceInfo[] = [
  {
    deviceId: 'audio-1',
    kind: 'audioinput',
    label: 'Built-in Microphone',
    groupId: 'group-1',
    toJSON: () => ({}),
  },
  {
    deviceId: 'audio-2',
    kind: 'audioinput',
    label: 'USB Microphone',
    groupId: 'group-2',
    toJSON: () => ({}),
  },
  {
    deviceId: 'video-1',
    kind: 'videoinput',
    label: 'Built-in Camera',
    groupId: 'group-3',
    toJSON: () => ({}),
  },
  {
    deviceId: 'default',
    kind: 'audioinput',
    label: 'Default - Built-in Microphone',
    groupId: 'group-1',
    toJSON: () => ({}),
  },
];

const mockStream = {
  getTracks: () => [
    {
      kind: 'audio',
      stop: vi.fn(),
      getCapabilities: () => ({
        sampleRate: { min: 8000, max: 48000 },
        channelCount: { min: 1, max: 2 },
        echoCancellation: [true, false],
        noiseSuppression: [true, false],
        autoGainControl: [true, false],
      }),
    },
  ],
  getAudioTracks: () => mockStream.getTracks().filter((t) => t.kind === 'audio'),
  getVideoTracks: () => mockStream.getTracks().filter((t) => t.kind === 'video'),
};

describe('MediaDeviceManager', () => {
  let manager: MediaDeviceManager;
  let stateChangeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stateChangeSpy = vi.fn();
    manager = new MediaDeviceManager(stateChangeSpy);

    // Mock navigator.mediaDevices
    global.navigator = {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue(mockDevices),
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        getSupportedConstraints: vi.fn().mockReturnValue({
          sampleRate: true,
          channelCount: true,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    } as unknown as Navigator;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Device Enumeration', () => {
    it('should enumerate devices successfully', async () => {
      const state = await manager.enumerateDevices();

      expect(state.audioDevices).toHaveLength(3); // audio-1, audio-2, default
      expect(state.videoDevices).toHaveLength(1);
      expect(state.hasPermissions).toBe(true);
    });

    it('should cache enumeration for 5 seconds', async () => {
      await manager.enumerateDevices();
      await manager.enumerateDevices();

      expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalledTimes(1);
    });

    it('should force refresh when requested', async () => {
      await manager.enumerateDevices();
      await manager.enumerateDevices(true);

      expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalledTimes(2);
    });

    it('should detect lack of permissions from empty labels', async () => {
      vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([
        {
          deviceId: 'audio-1',
          kind: 'audioinput',
          label: '',
          groupId: 'group-1',
          toJSON: () => ({}),
        },
      ]);

      const state = await manager.enumerateDevices();

      expect(state.hasPermissions).toBe(false);
    });

    it('should auto-select default audio device', async () => {
      const state = await manager.enumerateDevices();

      expect(state.selectedAudioId).toBe('default');
    });

    it('should auto-select first device if no default found', async () => {
      vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([
        {
          deviceId: 'audio-1',
          kind: 'audioinput',
          label: 'Microphone',
          groupId: 'group-1',
          toJSON: () => ({}),
        },
      ]);

      const state = await manager.enumerateDevices();

      expect(state.selectedAudioId).toBe('audio-1');
    });

    it('should notify state change after enumeration', async () => {
      await manager.enumerateDevices();

      expect(stateChangeSpy).toHaveBeenCalled();
    });

    it('should handle enumeration errors', async () => {
      vi.mocked(navigator.mediaDevices.enumerateDevices).mockRejectedValueOnce(
        new Error('Permission denied')
      );

      await expect(manager.enumerateDevices()).rejects.toThrow('Failed to access media devices');
    });
  });

  describe('Device Selection', () => {
    beforeEach(async () => {
      await manager.enumerateDevices();
    });

    it('should select valid audio device', () => {
      manager.selectAudioDevice('audio-1');

      expect(manager.getState().selectedAudioId).toBe('audio-1');
      expect(stateChangeSpy).toHaveBeenCalled();
    });

    it('should reject invalid audio device', () => {
      expect(() => manager.selectAudioDevice('invalid-id')).toThrow('Audio device not found');
    });

    it('should allow deselecting audio device', () => {
      manager.selectAudioDevice(null);

      expect(manager.getState().selectedAudioId).toBeNull();
    });

    it('should select valid video device', () => {
      manager.selectVideoDevice('video-1');

      expect(manager.getState().selectedVideoId).toBe('video-1');
    });

    it('should reject invalid video device', () => {
      expect(() => manager.selectVideoDevice('invalid-id')).toThrow('Video device not found');
    });
  });

  describe('Constraint Management', () => {
    it('should update audio constraints', () => {
      const constraints: Partial<DeviceConstraints> = {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 44100,
      };

      manager.updateAudioConstraints(constraints);

      const state = manager.getState();
      expect(state.audioConstraints.echoCancellation).toBe(false);
      expect(state.audioConstraints.noiseSuppression).toBe(false);
      expect(state.audioConstraints.sampleRate).toBe(44100);
    });

    it('should update video constraints', () => {
      const constraints: Partial<DeviceConstraints> = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60 },
      };

      manager.updateVideoConstraints(constraints);

      const state = manager.getState();
      expect(state.videoConstraints.width).toEqual({ ideal: 1280 });
      expect(state.videoConstraints.height).toEqual({ ideal: 720 });
      expect(state.videoConstraints.frameRate).toEqual({ ideal: 60 });
    });

    it('should preserve existing constraints when updating', () => {
      manager.updateAudioConstraints({ echoCancellation: false });
      manager.updateAudioConstraints({ sampleRate: 44100 });

      const state = manager.getState();
      expect(state.audioConstraints.echoCancellation).toBe(false);
      expect(state.audioConstraints.sampleRate).toBe(44100);
    });
  });

  describe('Media Stream Acquisition', () => {
    beforeEach(async () => {
      await manager.enumerateDevices();
      manager.selectAudioDevice('audio-1');
      manager.selectVideoDevice('video-1');
    });

    it('should get media stream with selected devices', async () => {
      const stream = await manager.getMediaStream();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.objectContaining({
            deviceId: { exact: 'audio-1' },
          }),
          video: expect.objectContaining({
            deviceId: { exact: 'video-1' },
          }),
        })
      );
      expect(stream).toBe(mockStream);
    });

    it('should get audio-only stream', async () => {
      await manager.getMediaStream({ audio: true, video: false });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: expect.any(Object),
        })
      );
    });

    it('should get video-only stream', async () => {
      await manager.getMediaStream({ audio: false, video: true });

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.any(Object),
        })
      );
    });

    it('should handle permission denied error', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(error);

      await expect(manager.getMediaStream()).rejects.toThrow(
        'Permission denied. Please allow camera and microphone access.'
      );
    });

    it('should handle device not found error', async () => {
      const error = new Error('Device not found');
      error.name = 'NotFoundError';
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(error);

      await expect(manager.getMediaStream()).rejects.toThrow(
        'No camera or microphone found on this device.'
      );
    });

    it('should handle device in use error', async () => {
      const error = new Error('Device in use');
      error.name = 'NotReadableError';
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(error);

      await expect(manager.getMediaStream()).rejects.toThrow(
        'Camera or microphone is already in use by another application.'
      );
    });

    it('should handle overconstrained error', async () => {
      const error = new Error('Overconstrained');
      error.name = 'OverconstrainedError';
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(error);

      await expect(manager.getMediaStream()).rejects.toThrow(
        'The requested media constraints cannot be satisfied.'
      );
    });
  });

  describe('Constraint Testing', () => {
    it('should test valid constraints successfully', async () => {
      const result = await manager.testConstraints({
        audio: { echoCancellation: true },
      });

      expect(result.success).toBe(true);
      expect(result.supportedConstraints).toBeDefined();
    });

    it('should detect overconstrained errors', async () => {
      const error = new Error('Overconstrained');
      error.name = 'OverconstrainedError';
      vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValueOnce(error);

      const result = await manager.testConstraints({
        video: { width: 99999 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Device constraints cannot be satisfied');
    });

    it('should clean up test stream', async () => {
      const stopSpy = vi.fn();
      const mockTestStream = {
        getTracks: () => [{ stop: stopSpy }],
      };
      vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValueOnce(
        mockTestStream as unknown as MediaStream
      );

      await manager.testConstraints({ audio: true });

      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('Device Monitoring', () => {
    it('should start device monitoring', () => {
      const cleanup = manager.startDeviceMonitoring();

      expect(navigator.mediaDevices.addEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      );
      expect(cleanup).toBeInstanceOf(Function);
    });

    it('should stop device monitoring', () => {
      const cleanup = manager.startDeviceMonitoring();
      cleanup();

      expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      );
    });
  });
});

describe('Device Utility Functions', () => {
  describe('getDeviceDisplayName', () => {
    it('should return label if available', () => {
      const device = mockDevices[0];
      expect(getDeviceDisplayName(device)).toBe('Built-in Microphone');
    });

    it('should return fallback for audio device without label', () => {
      const device = { ...mockDevices[0], label: '' };
      expect(getDeviceDisplayName(device)).toMatch(/^Microphone /);
    });

    it('should return fallback for video device without label', () => {
      const device = { ...mockDevices[2], label: '' };
      expect(getDeviceDisplayName(device)).toMatch(/^Camera /);
    });
  });

  describe('groupDevicesByType', () => {
    it('should group devices correctly', () => {
      const grouped = groupDevicesByType(mockDevices);

      expect(grouped.audioInputs).toHaveLength(3);
      expect(grouped.videoInputs).toHaveLength(1);
      expect(grouped.audioOutputs).toHaveLength(0);
    });
  });

  describe('deviceSupportsConstraints', () => {
    const capabilities: MediaTrackCapabilities = {
      width: { min: 320, max: 1920 },
      height: { min: 240, max: 1080 },
      frameRate: { min: 1, max: 60 },
    };

    it('should validate width constraints', () => {
      expect(
        deviceSupportsConstraints(capabilities, { width: 1280 })
      ).toBe(true);

      expect(
        deviceSupportsConstraints(capabilities, { width: 3840 })
      ).toBe(false);
    });

    it('should validate height constraints', () => {
      expect(
        deviceSupportsConstraints(capabilities, { height: 720 })
      ).toBe(true);

      expect(
        deviceSupportsConstraints(capabilities, { height: 2160 })
      ).toBe(false);
    });

    it('should validate frameRate constraints', () => {
      expect(
        deviceSupportsConstraints(capabilities, { frameRate: 30 })
      ).toBe(true);

      expect(
        deviceSupportsConstraints(capabilities, { frameRate: 120 })
      ).toBe(false);
    });

    it('should handle ideal constraint values', () => {
      expect(
        deviceSupportsConstraints(capabilities, {
          width: { ideal: 1280 },
        })
      ).toBe(true);
    });
  });
});
