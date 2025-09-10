/**
 * Contract: Enhanced WebRTC Hook Interface
 * Defines the interface for global WebRTC state management
 */

import type { SocketTransport } from '@/lib/net/socketTransport';

export type RtcState = 
  | 'idle' 
  | 'joining' 
  | 'negotiating' 
  | 'connected' 
  | 'failed' 
  | 'closed';

export type PermissionState = 
  | 'checking' 
  | 'granted' 
  | 'denied' 
  | 'prompt';

export interface GlobalWebRTCState {
  connectionState: RtcState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  lastError: string | null;
  permissionsGranted: boolean;
  matchId: string | null;
  remotePeerId: string | null;
}

export interface UserMediaSettings {
  selectedAudioDeviceId: string | null;
  selectedVideoDeviceId: string | null;
  microphoneMuted: boolean;
  cameraDisabled: boolean;
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  devicePermissionStatus: PermissionState;
}

export interface WebRTCHookOptions {
  enabled: boolean;
  transport: SocketTransport | null;
  myPlayerId: string | null;
  matchId: string | null;
  iceServers?: RTCIceServer[];
}

export interface WebRTCHookReturn extends GlobalWebRTCState, UserMediaSettings {
  // Connection management
  join: () => Promise<void>;
  leave: () => void;
  retry: () => Promise<void>;
  
  // Media controls
  toggleMicrophone: () => void;
  toggleCamera: () => void;
  setAudioDevice: (deviceId: string | null) => Promise<void>;
  setVideoDevice: (deviceId: string | null) => Promise<void>;
  refreshDevices: () => Promise<void>;
  
  // Permission management  
  checkPermissions: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
  
  // Error handling
  clearError: () => void;
}

/**
 * Contract: useGlobalWebRTC Hook
 * Global WebRTC hook for managing connections across the application
 */
export declare function useGlobalWebRTC(options: WebRTCHookOptions): WebRTCHookReturn;