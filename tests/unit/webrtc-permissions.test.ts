/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  requestMediaPermissions,
  checkMediaPermissions,
  getAvailableDevices,
  isPermissionGranted,
  type MediaPermissionResult
} from '../../src/lib/utils/webrtc-permissions';

// Mock navigator.mediaDevices
const mockGetUserMedia = vi.fn();
const mockEnumerateDevices = vi.fn();

Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: mockEnumerateDevices,
  },
  writable: true,
});

// Mock permissions API
const mockPermissionsQuery = vi.fn();
Object.defineProperty(navigator, 'permissions', {
  value: {
    query: mockPermissionsQuery,
  },
  writable: true,
});

describe('WebRTC Permissions Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestMediaPermissions', () => {
    it('should request both audio and video permissions by default', async () => {
      const mockStream = {
        getVideoTracks: () => [{ kind: 'video', label: 'Camera' }],
        getAudioTracks: () => [{ kind: 'audio', label: 'Microphone' }],
        getTracks: () => [
          { kind: 'video', label: 'Camera' },
          { kind: 'audio', label: 'Microphone' }
        ]
      };

      mockGetUserMedia.mockResolvedValue(mockStream);

      const result = await requestMediaPermissions();

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: true,
        audio: true,
      });

      expect(result).toEqual({
        granted: true,
        video: true,
        audio: true,
        stream: mockStream,
        error: null,
      });
    });

    it('should request only audio permissions when video is false', async () => {
      const mockStream = {
        getVideoTracks: () => [],
        getAudioTracks: () => [{ kind: 'audio', label: 'Microphone' }],
        getTracks: () => [{ kind: 'audio', label: 'Microphone' }]
      };

      mockGetUserMedia.mockResolvedValue(mockStream);

      const result = await requestMediaPermissions({ video: false, audio: true });

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: false,
        audio: true,
      });

      expect(result).toEqual({
        granted: true,
        video: false,
        audio: true,
        stream: mockStream,
        error: null,
      });
    });

    it('should request only video permissions when audio is false', async () => {
      const mockStream = {
        getVideoTracks: () => [{ kind: 'video', label: 'Camera' }],
        getAudioTracks: () => [],
        getTracks: () => [{ kind: 'video', label: 'Camera' }]
      };

      mockGetUserMedia.mockResolvedValue(mockStream);

      const result = await requestMediaPermissions({ video: true, audio: false });

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: true,
        audio: false,
      });

      expect(result).toEqual({
        granted: true,
        video: true,
        audio: false,
        stream: mockStream,
        error: null,
      });
    });

    it('should handle permission denial gracefully', async () => {
      const permissionError = new Error('Permission denied');
      permissionError.name = 'NotAllowedError';

      mockGetUserMedia.mockRejectedValue(permissionError);

      const result = await requestMediaPermissions();

      expect(result).toEqual({
        granted: false,
        video: false,
        audio: false,
        stream: null,
        error: permissionError,
      });
    });

    it('should handle device not found error', async () => {
      const deviceError = new Error('Device not found');
      deviceError.name = 'NotFoundError';

      mockGetUserMedia.mockRejectedValue(deviceError);

      const result = await requestMediaPermissions();

      expect(result).toEqual({
        granted: false,
        video: false,
        audio: false,
        stream: null,
        error: deviceError,
      });
    });

    it('should handle overconstrained error', async () => {
      const constraintError = new Error('Overconstrained');
      constraintError.name = 'OverconstrainedError';

      mockGetUserMedia.mockRejectedValue(constraintError);

      const result = await requestMediaPermissions();

      expect(result).toEqual({
        granted: false,
        video: false,
        audio: false,
        stream: null,
        error: constraintError,
      });
    });
  });

  describe('checkMediaPermissions', () => {
    it('should check permissions using permissions API when available', async () => {
      mockPermissionsQuery
        .mockResolvedValueOnce({ state: 'granted' }) // camera
        .mockResolvedValueOnce({ state: 'granted' }); // microphone

      const result = await checkMediaPermissions();

      expect(mockPermissionsQuery).toHaveBeenCalledWith({ name: 'camera' });
      expect(mockPermissionsQuery).toHaveBeenCalledWith({ name: 'microphone' });

      expect(result).toEqual({
        video: 'granted',
        audio: 'granted',
      });
    });

    it('should handle denied permissions', async () => {
      mockPermissionsQuery
        .mockResolvedValueOnce({ state: 'denied' }) // camera
        .mockResolvedValueOnce({ state: 'granted' }); // microphone

      const result = await checkMediaPermissions();

      expect(result).toEqual({
        video: 'denied',
        audio: 'granted',
      });
    });

    it('should handle prompt state', async () => {
      mockPermissionsQuery
        .mockResolvedValueOnce({ state: 'prompt' }) // camera
        .mockResolvedValueOnce({ state: 'prompt' }); // microphone

      const result = await checkMediaPermissions();

      expect(result).toEqual({
        video: 'prompt',
        audio: 'prompt',
      });
    });

    it('should fallback to unknown when permissions API fails', async () => {
      mockPermissionsQuery.mockRejectedValue(new Error('Permissions API not supported'));

      const result = await checkMediaPermissions();

      expect(result).toEqual({
        video: 'unknown',
        audio: 'unknown',
      });
    });

    it('should fallback to unknown when permissions API is not available', async () => {
      // Temporarily remove permissions API
      const originalPermissions = navigator.permissions;
      // @ts-expect-error - Intentionally setting to undefined for test
      navigator.permissions = undefined;

      const result = await checkMediaPermissions();

      expect(result).toEqual({
        video: 'unknown',
        audio: 'unknown',
      });

      // Restore permissions API
      Object.defineProperty(navigator, 'permissions', {
        value: originalPermissions,
        writable: true,
      });
    });
  });

  describe('getAvailableDevices', () => {
    it('should enumerate available media devices', async () => {
      const mockDevices = [
        { deviceId: 'camera1', kind: 'videoinput', label: 'Built-in Camera', groupId: 'group1' },
        { deviceId: 'mic1', kind: 'audioinput', label: 'Built-in Microphone', groupId: 'group2' },
        { deviceId: 'speaker1', kind: 'audiooutput', label: 'Built-in Speakers', groupId: 'group3' },
      ];

      mockEnumerateDevices.mockResolvedValue(mockDevices);

      const result = await getAvailableDevices();

      expect(mockEnumerateDevices).toHaveBeenCalled();
      expect(result).toEqual({
        videoDevices: [mockDevices[0]],
        audioInputDevices: [mockDevices[1]],
        audioOutputDevices: [mockDevices[2]],
        allDevices: mockDevices,
      });
    });

    it('should handle empty device list', async () => {
      mockEnumerateDevices.mockResolvedValue([]);

      const result = await getAvailableDevices();

      expect(result).toEqual({
        videoDevices: [],
        audioInputDevices: [],
        audioOutputDevices: [],
        allDevices: [],
      });
    });

    it('should handle enumerate devices error', async () => {
      const enumerateError = new Error('Cannot enumerate devices');
      mockEnumerateDevices.mockRejectedValue(enumerateError);

      await expect(getAvailableDevices()).rejects.toThrow('Cannot enumerate devices');
    });

    it('should filter devices by type correctly', async () => {
      const mockDevices = [
        { deviceId: 'camera1', kind: 'videoinput', label: 'Camera 1', groupId: 'group1' },
        { deviceId: 'camera2', kind: 'videoinput', label: 'Camera 2', groupId: 'group2' },
        { deviceId: 'mic1', kind: 'audioinput', label: 'Microphone 1', groupId: 'group3' },
        { deviceId: 'mic2', kind: 'audioinput', label: 'Microphone 2', groupId: 'group4' },
        { deviceId: 'speaker1', kind: 'audiooutput', label: 'Speaker 1', groupId: 'group5' },
        { deviceId: 'unknown', kind: 'unknown', label: 'Unknown Device', groupId: 'group6' },
      ];

      mockEnumerateDevices.mockResolvedValue(mockDevices);

      const result = await getAvailableDevices();

      expect(result.videoDevices).toHaveLength(2);
      expect(result.audioInputDevices).toHaveLength(2);
      expect(result.audioOutputDevices).toHaveLength(1);
      expect(result.allDevices).toHaveLength(6);

      expect(result.videoDevices[0].kind).toBe('videoinput');
      expect(result.audioInputDevices[0].kind).toBe('audioinput');
      expect(result.audioOutputDevices[0].kind).toBe('audiooutput');
    });
  });

  describe('isPermissionGranted', () => {
    it('should return true for granted permission', () => {
      expect(isPermissionGranted('granted')).toBe(true);
    });

    it('should return false for denied permission', () => {
      expect(isPermissionGranted('denied')).toBe(false);
    });

    it('should return false for prompt permission', () => {
      expect(isPermissionGranted('prompt')).toBe(false);
    });

    it('should return false for unknown permission', () => {
      expect(isPermissionGranted('unknown')).toBe(false);
    });

    it('should return false for undefined permission', () => {
      expect(isPermissionGranted(undefined)).toBe(false);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle getUserMedia not available', async () => {
      // Temporarily remove getUserMedia
      const originalGetUserMedia = navigator.mediaDevices.getUserMedia;
      // @ts-expect-error - Intentionally setting to undefined for test
      navigator.mediaDevices.getUserMedia = undefined;

      await expect(requestMediaPermissions()).rejects.toThrow();

      // Restore getUserMedia
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    });

    it('should handle mediaDevices not available', async () => {
      // Temporarily remove mediaDevices
      const originalMediaDevices = navigator.mediaDevices;
      // @ts-expect-error - Intentionally setting to undefined for test
      navigator.mediaDevices = undefined;

      await expect(requestMediaPermissions()).rejects.toThrow();

      // Restore mediaDevices
      Object.defineProperty(navigator, 'mediaDevices', {
        value: originalMediaDevices,
        writable: true,
      });
    });

    it('should handle constraint validation', async () => {
      const mockStream = {
        getVideoTracks: () => [{ kind: 'video', label: 'Camera' }],
        getAudioTracks: () => [{ kind: 'audio', label: 'Microphone' }],
        getTracks: () => [
          { kind: 'video', label: 'Camera' },
          { kind: 'audio', label: 'Microphone' }
        ]
      };

      mockGetUserMedia.mockResolvedValue(mockStream);

      const result = await requestMediaPermissions({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { sampleRate: 44100 }
      });

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { sampleRate: 44100 }
      });

      expect(result.granted).toBe(true);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle permission flow for audio-only mode', async () => {
      // First check current permissions
      mockPermissionsQuery
        .mockResolvedValueOnce({ state: 'prompt' }) // camera
        .mockResolvedValueOnce({ state: 'prompt' }); // microphone

      const permissionCheck = await checkMediaPermissions();
      expect(permissionCheck.audio).toBe('prompt');

      // Then request only audio
      const mockStream = {
        getVideoTracks: () => [],
        getAudioTracks: () => [{ kind: 'audio', label: 'Microphone' }],
        getTracks: () => [{ kind: 'audio', label: 'Microphone' }]
      };

      mockGetUserMedia.mockResolvedValue(mockStream);

      const result = await requestMediaPermissions({ video: false, audio: true });

      expect(result.granted).toBe(true);
      expect(result.audio).toBe(true);
      expect(result.video).toBe(false);
    });

    it('should handle device enumeration after permission grant', async () => {
      // Request permissions first
      const mockStream = {
        getVideoTracks: () => [{ kind: 'video', label: 'Camera' }],
        getAudioTracks: () => [{ kind: 'audio', label: 'Microphone' }],
        getTracks: () => [
          { kind: 'video', label: 'Camera' },
          { kind: 'audio', label: 'Microphone' }
        ]
      };

      mockGetUserMedia.mockResolvedValue(mockStream);

      const permissionResult = await requestMediaPermissions();
      expect(permissionResult.granted).toBe(true);

      // Then enumerate devices
      const mockDevices = [
        { deviceId: 'camera1', kind: 'videoinput', label: 'Built-in Camera', groupId: 'group1' },
        { deviceId: 'mic1', kind: 'audioinput', label: 'Built-in Microphone', groupId: 'group2' },
      ];

      mockEnumerateDevices.mockResolvedValue(mockDevices);

      const devices = await getAvailableDevices();
      expect(devices.videoDevices).toHaveLength(1);
      expect(devices.audioInputDevices).toHaveLength(1);
    });
  });
});