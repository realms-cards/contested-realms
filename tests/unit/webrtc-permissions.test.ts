/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkPermissionStatus,
  checkWebRTCSupport,
  getAvailableDevices,
  getPermissionErrorMessage,
  requestMediaPermissions,
  testDeviceConstraints,
  type DevicePermissionStatus
} from '../../src/lib/utils/webrtc-permissions';

type MutableNavigator = Navigator & Record<string, unknown>;
type MutableWindow = typeof window & Record<string, unknown>;

const navigatorRecord = navigator as MutableNavigator;
const windowRecord = window as MutableWindow;

const originalDescriptors = {
  mediaDevices: Object.getOwnPropertyDescriptor(navigatorRecord, 'mediaDevices'),
  permissions: Object.getOwnPropertyDescriptor(navigatorRecord, 'permissions'),
  RTCPeerConnection: Object.getOwnPropertyDescriptor(windowRecord, 'RTCPeerConnection')
};

const defineProperty = <T>(target: Record<string, unknown>, key: string, value: T) => {
  Object.defineProperty(target, key, {
    configurable: true,
    writable: true,
    value
  });
};

const restoreProperty = (target: Record<string, unknown>, key: string, descriptor?: PropertyDescriptor) => {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
  } else {
    Reflect.deleteProperty(target, key);
  }
};

const removeProperty = (target: unknown, key: string) => {
  Reflect.deleteProperty((target as Record<string, unknown>) ?? {}, key);
};

let mockGetUserMedia: ReturnType<typeof vi.fn>;
let mockEnumerateDevices: ReturnType<typeof vi.fn>;
let mockPermissionsQuery: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetUserMedia = vi.fn();
  mockEnumerateDevices = vi.fn();
  mockPermissionsQuery = vi.fn();

  const defaultStream = {
    getTracks: () => [{ stop: vi.fn() }]
  } as unknown as MediaStream;

  mockGetUserMedia.mockResolvedValue(defaultStream);
  mockEnumerateDevices.mockResolvedValue([]);
  mockPermissionsQuery.mockResolvedValue({ state: 'prompt' });

  defineProperty(windowRecord, 'RTCPeerConnection', vi.fn());
  defineProperty(navigatorRecord, 'mediaDevices', {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: mockEnumerateDevices
  } satisfies Partial<MediaDevices>);
  defineProperty(navigatorRecord, 'permissions', {
    query: mockPermissionsQuery
  });
});

afterEach(() => {
  vi.restoreAllMocks();

  restoreProperty(navigatorRecord, 'mediaDevices', originalDescriptors.mediaDevices);
  restoreProperty(navigatorRecord, 'permissions', originalDescriptors.permissions);
  restoreProperty(windowRecord, 'RTCPeerConnection', originalDescriptors.RTCPeerConnection);
});

describe('webrtc permission utilities', () => {
  describe('checkWebRTCSupport()', () => {
    it('reports full capabilities when browser APIs are available', () => {
      const support = checkWebRTCSupport();

      expect(support).toEqual({
        hasCamera: true,
        hasMicrophone: true,
        hasDeviceSelection: true,
        supportsConstraints: true
      });
    });

    it('detects missing APIs and flags them as unsupported', () => {
      removeProperty(windowRecord, 'RTCPeerConnection');
      const mediaDevicesRecord = navigatorRecord.mediaDevices as unknown as Record<string, unknown>;
      removeProperty(mediaDevicesRecord, 'getUserMedia');
      removeProperty(mediaDevicesRecord, 'enumerateDevices');

      const support = checkWebRTCSupport();

      expect(support).toEqual({
        hasCamera: false,
        hasMicrophone: false,
        hasDeviceSelection: false,
        supportsConstraints: false
      });
    });
  });

  describe('requestMediaPermissions()', () => {
    it('requests both audio and video by default', async () => {
      const mockStream = {
        getTracks: () => []
      } as unknown as MediaStream;
      mockGetUserMedia.mockResolvedValueOnce(mockStream);

      const result = await requestMediaPermissions();

      expect(mockGetUserMedia).toHaveBeenCalledWith({ video: true, audio: true });
      expect(result).toEqual({ success: true, stream: mockStream });
    });

    it('maps permission denial errors to friendly messages', async () => {
      const permissionError = new Error('permission denied');
      permissionError.name = 'NotAllowedError';
      mockGetUserMedia.mockRejectedValueOnce(permissionError);

      const result = await requestMediaPermissions();

      expect(result).toEqual({
        success: false,
        error: 'Permission denied. Please allow camera and microphone access.'
      });
    });

    it('reports unsupported browsers without calling getUserMedia', async () => {
      removeProperty(windowRecord, 'RTCPeerConnection');
      const mediaDevicesRecord = navigatorRecord.mediaDevices as unknown as Record<string, unknown>;
      removeProperty(mediaDevicesRecord, 'getUserMedia');

      const result = await requestMediaPermissions();

      expect(mockGetUserMedia).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: 'WebRTC not supported in this browser'
      });
    });

    it('wraps generic errors with the original message', async () => {
      const genericError = new Error('kaput');
      mockGetUserMedia.mockRejectedValueOnce(genericError);

      const result = await requestMediaPermissions();

      expect(result).toEqual({
        success: false,
        error: 'Media access failed: kaput'
      });
    });
  });

  describe('checkPermissionStatus()', () => {
    it('uses Permissions API states when available', async () => {
      mockPermissionsQuery
        .mockResolvedValueOnce({ state: 'granted' })
        .mockResolvedValueOnce({ state: 'granted' });

      const status = await checkPermissionStatus();

      expect(status).toEqual({
        camera: 'granted',
        microphone: 'granted',
        overall: 'granted'
      });
    });

    it('marks overall state as denied when any permission is denied', async () => {
      mockPermissionsQuery
        .mockResolvedValueOnce({ state: 'denied' })
        .mockResolvedValueOnce({ state: 'granted' });

      const status = await checkPermissionStatus();

      expect(status).toEqual({
        camera: 'denied',
        microphone: 'granted',
        overall: 'denied'
      });
    });

    it('falls back to device labels when Permissions API is missing', async () => {
      removeProperty(navigatorRecord, 'permissions');

      mockEnumerateDevices.mockResolvedValueOnce([
        { deviceId: 'cam', kind: 'videoinput', label: '', groupId: '1' }
      ] as MediaDeviceInfo[]);

      const promptStatus = await checkPermissionStatus();
      expect(promptStatus).toEqual({
        camera: 'prompt',
        microphone: 'prompt',
        overall: 'prompt'
      });

      mockEnumerateDevices.mockResolvedValueOnce([
        { deviceId: 'cam', kind: 'videoinput', label: 'Camera', groupId: '1' }
      ] as MediaDeviceInfo[]);

      const grantedStatus = await checkPermissionStatus();
      expect(grantedStatus).toEqual({
        camera: 'granted',
        microphone: 'granted',
        overall: 'granted'
      });
    });

    it('returns unsupported when core WebRTC APIs are absent', async () => {
      removeProperty(windowRecord, 'RTCPeerConnection');
      const mediaDevicesRecord = navigatorRecord.mediaDevices as unknown as Record<string, unknown>;
      removeProperty(mediaDevicesRecord, 'getUserMedia');

      const status = await checkPermissionStatus();

      expect(status).toEqual({
        camera: 'unsupported',
        microphone: 'unsupported',
        overall: 'unsupported'
      });
    });
  });

  describe('getAvailableDevices()', () => {
    it('returns available inputs when permissions are granted', async () => {
      mockPermissionsQuery.mockResolvedValue({ state: 'granted' });

      const devices = [
        { deviceId: 'cam', kind: 'videoinput', label: 'Camera', groupId: '1' },
        { deviceId: 'mic', kind: 'audioinput', label: 'Microphone', groupId: '2' },
        { deviceId: 'spk', kind: 'audiooutput', label: 'Speakers', groupId: '3' }
      ] as MediaDeviceInfo[];

      mockEnumerateDevices.mockResolvedValue(devices);

      const result = await getAvailableDevices();

      expect(result.videoInputs).toEqual([devices[0]]);
      expect(result.audioInputs).toEqual([devices[1]]);
      expect(result.hasPermissions).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('requests permissions and stops test tracks when labels are missing', async () => {
      const stop = vi.fn();
      const stream = {
        getTracks: () => [{ stop }]
      } as unknown as MediaStream;

      mockGetUserMedia.mockResolvedValueOnce(stream);

      mockEnumerateDevices
        .mockResolvedValueOnce([
          { deviceId: 'cam', kind: 'videoinput', label: '', groupId: '1' },
          { deviceId: 'mic', kind: 'audioinput', label: '', groupId: '2' }
        ] as MediaDeviceInfo[])
        .mockResolvedValueOnce([
          { deviceId: 'cam', kind: 'videoinput', label: 'Camera', groupId: '1' },
          { deviceId: 'mic', kind: 'audioinput', label: 'Microphone', groupId: '2' }
        ] as MediaDeviceInfo[]);

      const result = await getAvailableDevices();

      expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
      expect(stop).toHaveBeenCalled();
      expect(result.hasPermissions).toBe(true);
      expect(result.videoInputs[0].label).toBe('Camera');
      expect(result.audioInputs[0].label).toBe('Microphone');
    });

    it('returns an error payload when enumeration fails', async () => {
      const enumerateError = new Error('Cannot enumerate devices');
      mockEnumerateDevices.mockRejectedValueOnce(enumerateError);

      const result = await getAvailableDevices();

      expect(result).toEqual({
        audioInputs: [],
        videoInputs: [],
        hasPermissions: false,
        error: 'Cannot enumerate devices'
      });
    });

    it('handles browsers without enumerateDevices support', async () => {
      const mediaDevicesRecord = navigatorRecord.mediaDevices as unknown as Record<string, unknown>;
      removeProperty(mediaDevicesRecord, 'enumerateDevices');

      const result = await getAvailableDevices();

      expect(result).toEqual({
        audioInputs: [],
        videoInputs: [],
        hasPermissions: false,
        error: 'Device enumeration not supported'
      });
    });

    it('does not prompt for permissions when previously denied', async () => {
      mockPermissionsQuery
        .mockResolvedValueOnce({ state: 'denied' })
        .mockResolvedValueOnce({ state: 'denied' });

      const devices = [
        { deviceId: 'cam', kind: 'videoinput', label: '', groupId: '1' }
      ] as MediaDeviceInfo[];

      mockEnumerateDevices.mockResolvedValueOnce(devices);

      const result = await getAvailableDevices();

      expect(mockGetUserMedia).not.toHaveBeenCalled();
      expect(result.hasPermissions).toBe(false);
      expect(result.videoInputs).toEqual(devices);
    });
  });

  describe('testDeviceConstraints()', () => {
    it('returns success when constraints can be satisfied', async () => {
      const stop = vi.fn();
      mockGetUserMedia.mockResolvedValueOnce({
        getTracks: () => [{ stop }]
      } as unknown as MediaStream);

      const result = await testDeviceConstraints({ video: true });

      expect(mockGetUserMedia).toHaveBeenCalledWith({ video: true });
      expect(stop).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('maps overconstrained errors to a helpful message', async () => {
      const overconstrained = new Error('bad constraints');
      overconstrained.name = 'OverconstrainedError';
      mockGetUserMedia.mockRejectedValueOnce(overconstrained);

      const result = await testDeviceConstraints({ video: { deviceId: 'missing' } });

      expect(result).toEqual({
        success: false,
        error: 'The specified device or constraints are not available.'
      });
    });

    it('includes original messages for generic failures', async () => {
      const generic = new Error('fail');
      mockGetUserMedia.mockRejectedValueOnce(generic);

      const result = await testDeviceConstraints({ audio: true });

      expect(result).toEqual({
        success: false,
        error: 'Constraint test failed: fail'
      });
    });
  });

  describe('getPermissionErrorMessage()', () => {
    it('returns null when permissions are granted', () => {
      const status: DevicePermissionStatus = {
        camera: 'granted',
        microphone: 'granted',
        overall: 'granted'
      };

      expect(getPermissionErrorMessage(status)).toBeNull();
    });

    it('describes unsupported browsers', () => {
      const status: DevicePermissionStatus = {
        camera: 'unsupported',
        microphone: 'unsupported',
        overall: 'unsupported'
      };

      const message = getPermissionErrorMessage(status);
      expect(message).toContain('does not support');
    });

    it('lists denied devices in the guidance copy', () => {
      const status: DevicePermissionStatus = {
        camera: 'denied',
        microphone: 'prompt',
        overall: 'denied'
      };

      const message = getPermissionErrorMessage(status, { video: true, audio: false });
      expect(message).toContain('camera');
    });

    it('prompts the user when permissions are pending', () => {
      const status: DevicePermissionStatus = {
        camera: 'prompt',
        microphone: 'prompt',
        overall: 'prompt'
      };

      const message = getPermissionErrorMessage(status, { video: true, audio: true });
      expect(message).toContain('Please allow access to your');
    });
  });
});