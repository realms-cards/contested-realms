/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DeviceManager,
  type DevicePreferences,
  type DeviceChangeEvent
} from '../../src/lib/utils/device-management';

// Mock MediaDevices API
const mockGetUserMedia = vi.fn();
const mockEnumerateDevices = vi.fn();

// Create a proper EventTarget mock for device change events
class MockEventTarget extends EventTarget {
  addEventListener = vi.fn((type, listener, options) => {
    super.addEventListener(type, listener, options);
  });
  
  removeEventListener = vi.fn((type, listener, options) => {
    super.removeEventListener(type, listener, options);
  });
}

const mockMediaDevices = new MockEventTarget();
mockMediaDevices.getUserMedia = mockGetUserMedia;
mockMediaDevices.enumerateDevices = mockEnumerateDevices;

Object.defineProperty(navigator, 'mediaDevices', {
  value: mockMediaDevices,
  writable: true,
});

describe('DeviceManager', () => {
  let deviceManager: DeviceManager;
  let mockDevices: MediaDeviceInfo[];

  beforeEach(() => {
    vi.clearAllMocks();
    deviceManager = new DeviceManager();
    
    mockDevices = [
      {
        deviceId: 'camera1',
        kind: 'videoinput' as const,
        label: 'Built-in Camera',
        groupId: 'group1',
        toJSON: () => ({
          deviceId: 'camera1',
          kind: 'videoinput',
          label: 'Built-in Camera',
          groupId: 'group1'
        })
      },
      {
        deviceId: 'camera2',
        kind: 'videoinput' as const,
        label: 'External Webcam',
        groupId: 'group2',
        toJSON: () => ({
          deviceId: 'camera2',
          kind: 'videoinput',
          label: 'External Webcam',
          groupId: 'group2'
        })
      },
      {
        deviceId: 'mic1',
        kind: 'audioinput' as const,
        label: 'Built-in Microphone',
        groupId: 'group3',
        toJSON: () => ({
          deviceId: 'mic1',
          kind: 'audioinput',
          label: 'Built-in Microphone',
          groupId: 'group3'
        })
      },
      {
        deviceId: 'mic2',
        kind: 'audioinput' as const,
        label: 'USB Microphone',
        groupId: 'group4',
        toJSON: () => ({
          deviceId: 'mic2',
          kind: 'audioinput',
          label: 'USB Microphone',
          groupId: 'group4'
        })
      },
      {
        deviceId: 'speaker1',
        kind: 'audiooutput' as const,
        label: 'Built-in Speakers',
        groupId: 'group5',
        toJSON: () => ({
          deviceId: 'speaker1',
          kind: 'audiooutput',
          label: 'Built-in Speakers',
          groupId: 'group5'
        })
      }
    ];
  });

  afterEach(() => {
    deviceManager.destroy();
    vi.restoreAllMocks();
  });

  describe('Device Enumeration', () => {
    it('should initialize and load devices', async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);

      await deviceManager.initialize();
      const devices = deviceManager.getAvailableDevices();

      expect(mockEnumerateDevices).toHaveBeenCalled();
      expect(devices.videoDevices).toHaveLength(2);
      expect(devices.audioInputDevices).toHaveLength(2);
      expect(devices.audioOutputDevices).toHaveLength(1);
    });

    it('should refresh devices when requested', async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();

      // Add a new device
      const updatedDevices = [
        ...mockDevices,
        {
          deviceId: 'mic3',
          kind: 'audioinput' as const,
          label: 'Headset Microphone',
          groupId: 'group6',
          toJSON: () => ({
            deviceId: 'mic3',
            kind: 'audioinput',
            label: 'Headset Microphone',
            groupId: 'group6'
          })
        }
      ];

      mockEnumerateDevices.mockResolvedValue(updatedDevices);
      await deviceManager.refreshDevices();

      const devices = deviceManager.getAvailableDevices();
      expect(devices.audioInputDevices).toHaveLength(3);
    });

    it('should handle enumeration errors gracefully', async () => {
      mockEnumerateDevices.mockRejectedValue(new Error('Enumeration failed'));

      await expect(deviceManager.initialize()).rejects.toThrow('Enumeration failed');
    });
  });

  describe('Device Selection', () => {
    beforeEach(async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();
    });

    it('should set preferred video device', async () => {
      const success = await deviceManager.setPreferredVideoDevice('camera2');
      expect(success).toBe(true);

      const preferences = deviceManager.getDevicePreferences();
      expect(preferences.videoDeviceId).toBe('camera2');
    });

    it('should set preferred audio input device', async () => {
      const success = await deviceManager.setPreferredAudioInputDevice('mic2');
      expect(success).toBe(true);

      const preferences = deviceManager.getDevicePreferences();
      expect(preferences.audioInputDeviceId).toBe('mic2');
    });

    it('should set preferred audio output device', async () => {
      const success = await deviceManager.setPreferredAudioOutputDevice('speaker1');
      expect(success).toBe(true);

      const preferences = deviceManager.getDevicePreferences();
      expect(preferences.audioOutputDeviceId).toBe('speaker1');
    });

    it('should reject invalid device IDs', async () => {
      const success = await deviceManager.setPreferredVideoDevice('invalid-device');
      expect(success).toBe(false);

      const preferences = deviceManager.getDevicePreferences();
      expect(preferences.videoDeviceId).toBeNull();
    });

    it('should validate device compatibility', async () => {
      // Try to set an audio device as video device
      const success = await deviceManager.setPreferredVideoDevice('mic1');
      expect(success).toBe(false);
    });
  });

  describe('Device Constraints', () => {
    beforeEach(async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();
      await deviceManager.setPreferredVideoDevice('camera1');
      await deviceManager.setPreferredAudioInputDevice('mic1');
    });

    it('should generate constraints for selected devices', () => {
      const constraints = deviceManager.getMediaConstraints();

      expect(constraints).toEqual({
        video: { deviceId: { exact: 'camera1' } },
        audio: { deviceId: { exact: 'mic1' } }
      });
    });

    it('should generate constraints with additional video settings', () => {
      const constraints = deviceManager.getMediaConstraints({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      });

      expect(constraints.video).toEqual({
        deviceId: { exact: 'camera1' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      });
    });

    it('should generate constraints with additional audio settings', () => {
      const constraints = deviceManager.getMediaConstraints({
        audio: {
          sampleRate: 44100,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      expect(constraints.audio).toEqual({
        deviceId: { exact: 'mic1' },
        sampleRate: 44100,
        echoCancellation: true,
        noiseSuppression: true
      });
    });

    it('should handle disabled video', () => {
      const constraints = deviceManager.getMediaConstraints({
        video: false
      });

      expect(constraints.video).toBe(false);
    });

    it('should handle disabled audio', () => {
      const constraints = deviceManager.getMediaConstraints({
        audio: false
      });

      expect(constraints.audio).toBe(false);
    });

    it('should fallback when selected device is not available', async () => {
      // Remove the selected camera from available devices
      const reducedDevices = mockDevices.filter(d => d.deviceId !== 'camera1');
      mockEnumerateDevices.mockResolvedValue(reducedDevices);
      await deviceManager.refreshDevices();

      const constraints = deviceManager.getMediaConstraints();

      // Should fallback to first available video device or true
      expect(constraints.video).not.toEqual({ deviceId: { exact: 'camera1' } });
    });
  });

  describe('Device Change Detection', () => {
    it('should detect when devices are added', async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices.slice(0, 3)); // Only first 3 devices
      await deviceManager.initialize();

      const changeHandler = vi.fn();
      deviceManager.onDeviceChange(changeHandler);

      // Simulate devicechange event with new devices
      mockEnumerateDevices.mockResolvedValue(mockDevices); // All devices
      
      // Trigger devicechange event
      const event = new Event('devicechange');
      mockMediaDevices.dispatchEvent(event);

      // Wait for async device refresh
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(changeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'added',
          devices: expect.arrayContaining([
            expect.objectContaining({ deviceId: 'mic2' }),
            expect.objectContaining({ deviceId: 'speaker1' })
          ])
        })
      );
    });

    it('should detect when devices are removed', async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();

      const changeHandler = vi.fn();
      deviceManager.onDeviceChange(changeHandler);

      // Simulate device removal
      mockEnumerateDevices.mockResolvedValue(mockDevices.slice(0, 3)); // Remove last 2 devices
      
      // Trigger devicechange event
      const event = new Event('devicechange');
      mockMediaDevices.dispatchEvent(event);

      // Wait for async device refresh
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(changeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'removed',
          devices: expect.arrayContaining([
            expect.objectContaining({ deviceId: 'mic2' }),
            expect.objectContaining({ deviceId: 'speaker1' })
          ])
        })
      );
    });

    it('should detect when device labels change', async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();

      const changeHandler = vi.fn();
      deviceManager.onDeviceChange(changeHandler);

      // Change device label
      const updatedDevices = mockDevices.map(device => 
        device.deviceId === 'camera1' 
          ? { ...device, label: 'Updated Camera Name' }
          : device
      );

      mockEnumerateDevices.mockResolvedValue(updatedDevices);
      
      // Trigger devicechange event
      const event = new Event('devicechange');
      mockMediaDevices.dispatchEvent(event);

      // Wait for async device refresh
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(changeHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'changed',
          devices: expect.arrayContaining([
            expect.objectContaining({ 
              deviceId: 'camera1',
              label: 'Updated Camera Name'
            })
          ])
        })
      );
    });

    it('should remove event listeners when destroyed', async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();

      const changeHandler = vi.fn();
      deviceManager.onDeviceChange(changeHandler);

      deviceManager.destroy();

      expect(mockMediaDevices.removeEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      );
    });
  });

  describe('Stream Management', () => {
    beforeEach(async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();
    });

    it('should request media stream with preferred devices', async () => {
      await deviceManager.setPreferredVideoDevice('camera2');
      await deviceManager.setPreferredAudioInputDevice('mic2');

      const mockStream = {
        getTracks: () => [],
        getVideoTracks: () => [{ kind: 'video', label: 'External Webcam' }],
        getAudioTracks: () => [{ kind: 'audio', label: 'USB Microphone' }]
      };

      mockGetUserMedia.mockResolvedValue(mockStream);

      const stream = await deviceManager.getUserMedia();

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: { deviceId: { exact: 'camera2' } },
        audio: { deviceId: { exact: 'mic2' } }
      });

      expect(stream).toBe(mockStream);
    });

    it('should request media stream with custom constraints', async () => {
      const mockStream = {
        getTracks: () => [],
        getVideoTracks: () => [{ kind: 'video' }],
        getAudioTracks: () => [{ kind: 'audio' }]
      };

      mockGetUserMedia.mockResolvedValue(mockStream);

      const stream = await deviceManager.getUserMedia({
        video: { width: 640, height: 480 },
        audio: { sampleRate: 48000 }
      });

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: { width: 640, height: 480 },
        audio: { sampleRate: 48000 }
      });

      expect(stream).toBe(mockStream);
    });

    it('should handle getUserMedia errors', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      
      mockGetUserMedia.mockRejectedValue(error);

      await expect(deviceManager.getUserMedia()).rejects.toThrow('Permission denied');
    });

    it('should switch video device on active stream', async () => {
      const mockOldTrack = {
        kind: 'video',
        stop: vi.fn(),
        label: 'Built-in Camera'
      };

      const mockNewTrack = {
        kind: 'video',
        stop: vi.fn(),
        label: 'External Webcam'
      };

      const mockOldStream = {
        getTracks: () => [mockOldTrack],
        getVideoTracks: () => [mockOldTrack],
        getAudioTracks: () => []
      };

      const mockNewStream = {
        getTracks: () => [mockNewTrack],
        getVideoTracks: () => [mockNewTrack],
        getAudioTracks: () => []
      };

      mockGetUserMedia
        .mockResolvedValueOnce(mockOldStream)
        .mockResolvedValueOnce(mockNewStream);

      // Get initial stream
      const stream1 = await deviceManager.getUserMedia();
      expect(stream1).toBe(mockOldStream);

      // Switch device
      await deviceManager.setPreferredVideoDevice('camera2');
      const stream2 = await deviceManager.switchVideoDevice('camera2');

      expect(mockOldTrack.stop).toHaveBeenCalled();
      expect(stream2).toBe(mockNewStream);
    });
  });

  describe('Persistence', () => {
    beforeEach(async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();
    });

    it('should save preferences to localStorage', async () => {
      const mockLocalStorage = {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn()
      };
      
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true
      });

      await deviceManager.setPreferredVideoDevice('camera2');
      await deviceManager.setPreferredAudioInputDevice('mic2');

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'webrtc-device-preferences',
        JSON.stringify({
          videoDeviceId: 'camera2',
          audioInputDeviceId: 'mic2',
          audioOutputDeviceId: null
        })
      );
    });

    it('should load preferences from localStorage', () => {
      const savedPreferences = {
        videoDeviceId: 'camera1',
        audioInputDeviceId: 'mic1',
        audioOutputDeviceId: 'speaker1'
      };

      const mockLocalStorage = {
        getItem: vi.fn(() => JSON.stringify(savedPreferences)),
        setItem: vi.fn(),
        removeItem: vi.fn()
      };
      
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true
      });

      const newDeviceManager = new DeviceManager();
      const preferences = newDeviceManager.getDevicePreferences();

      expect(preferences).toEqual(savedPreferences);
    });

    it('should handle corrupted localStorage data', () => {
      const mockLocalStorage = {
        getItem: vi.fn(() => 'invalid-json'),
        setItem: vi.fn(),
        removeItem: vi.fn()
      };
      
      Object.defineProperty(window, 'localStorage', {
        value: mockLocalStorage,
        writable: true
      });

      const newDeviceManager = new DeviceManager();
      const preferences = newDeviceManager.getDevicePreferences();

      // Should return default preferences
      expect(preferences).toEqual({
        videoDeviceId: null,
        audioInputDeviceId: null,
        audioOutputDeviceId: null
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle device enumeration when no devices are available', async () => {
      mockEnumerateDevices.mockResolvedValue([]);
      await deviceManager.initialize();

      const devices = deviceManager.getAvailableDevices();
      expect(devices.videoDevices).toHaveLength(0);
      expect(devices.audioInputDevices).toHaveLength(0);
      expect(devices.audioOutputDevices).toHaveLength(0);
    });

    it('should handle devices with empty labels', async () => {
      const devicesWithoutLabels = mockDevices.map(device => ({
        ...device,
        label: ''
      }));

      mockEnumerateDevices.mockResolvedValue(devicesWithoutLabels);
      await deviceManager.initialize();

      const devices = deviceManager.getAvailableDevices();
      expect(devices.videoDevices).toHaveLength(2);
      expect(devices.videoDevices[0].label).toBe('');
    });

    it('should handle rapid device changes', async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();

      const changeHandler = vi.fn();
      deviceManager.onDeviceChange(changeHandler);

      // Trigger multiple rapid changes
      for (let i = 0; i < 5; i++) {
        const event = new Event('devicechange');
        mockMediaDevices.dispatchEvent(event);
      }

      // Wait for debouncing
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should only call handler once due to debouncing
      expect(changeHandler).toHaveBeenCalledTimes(1);
    });

    it('should clean up resources properly', async () => {
      mockEnumerateDevices.mockResolvedValue(mockDevices);
      await deviceManager.initialize();

      const changeHandler = vi.fn();
      deviceManager.onDeviceChange(changeHandler);

      deviceManager.destroy();

      // Verify cleanup
      expect(mockMediaDevices.removeEventListener).toHaveBeenCalled();
      
      // Verify no further callbacks after destruction
      const event = new Event('devicechange');
      mockMediaDevices.dispatchEvent(event);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(changeHandler).not.toHaveBeenCalled();
    });
  });
});