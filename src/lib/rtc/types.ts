/**
 * WebRTC and Video Overlay type definitions
 * Consolidated from spec contracts into a shared module
 */

import type { Vector3 } from "three";
import type { SocketTransport } from "@/lib/net/socketTransport";

// ---------- Screen / Overlay ----------

export type ScreenType =
  | "draft"
  | "draft-3d"
  | "deck-editor"
  | "game"
  | "game-3d"
  | "lobby"
  | "leaderboard";

export interface VideoOverlayConfig {
  screenType: ScreenType;
  showVideo: boolean;
  showControls: boolean;
  audioOnly: boolean;
  seatPosition: Vector3 | null;
}

export interface SeatVideoPlacement {
  playerId: string;
  worldPosition: Vector3;
  rotation: number;
  dimensions: { width: number; height: number };
  visible: boolean;
}

export interface VideoOverlayContextValue {
  overlayConfig: VideoOverlayConfig;
  updateScreenType: (type: ScreenType) => void;
  setSeatPosition: (playerId: string, position: Vector3 | null) => void;
  shouldShowVideo: boolean;
  shouldShowControls: boolean;
  isAudioOnly: boolean;
}

export interface VideoOverlayProviderProps {
  children: React.ReactNode;
  initialScreenType?: ScreenType;
}

// ---------- WebRTC State ----------

export type RtcState =
  | "idle"
  | "joining"
  | "negotiating"
  | "connected"
  | "failed"
  | "closed";

export type PermissionState = "checking" | "granted" | "denied" | "prompt";

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
  join: () => Promise<void>;
  leave: () => void;
  retry: () => Promise<void>;
  toggleMicrophone: () => void;
  toggleCamera: () => void;
  setAudioDevice: (deviceId: string | null) => Promise<void>;
  setVideoDevice: (deviceId: string | null) => Promise<void>;
  refreshDevices: () => Promise<void>;
  checkPermissions: () => Promise<boolean>;
  requestPermissions: () => Promise<boolean>;
  clearError: () => void;
}

// ---------- UI Component Props ----------

export interface GlobalVideoOverlayProps {
  className?: string;
  position?: "top-right" | "bottom-left" | "bottom-right";
  showUserAvatar?: boolean;
  transport?: SocketTransport | null;
  myPlayerId?: string | null;
  matchId?: string | null;
  userDisplayName?: string;
  userAvatarUrl?: string;
}

export interface UserAvatarMenuProps {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  className?: string;
  onSettingsClick?: () => void;
}

export interface MediaControlsPanelProps {
  rtcState: WebRTCHookReturn;
  compact?: boolean;
  showDeviceSettings?: boolean;
  className?: string;
}

export interface SeatVideo3DProps {
  playerId: string;
  stream: MediaStream | null;
  position: Vector3;
  rotation?: number;
  width?: number;
  height?: number;
  visible?: boolean;
}

export interface VideoStreamOverlayProps {
  stream: MediaStream | null;
  playerId: string;
  displayName: string;
  muted?: boolean;
  className?: string;
}

export interface PermissionRequestDialogProps {
  isOpen: boolean;
  onRequestPermissions: () => Promise<void>;
  onCancel: () => void;
  permissionType: "camera" | "microphone" | "both";
}

export interface DeviceSelectionMenuProps {
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioId: string | null;
  selectedVideoId: string | null;
  onAudioDeviceChange: (deviceId: string | null) => void;
  onVideoDeviceChange: (deviceId: string | null) => void;
  onRefreshDevices: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export interface ConnectionStatusIndicatorProps {
  connectionState: RtcState;
  lastError?: string | null;
  onRetry?: () => void;
  compact?: boolean;
}

export type ScreenOverlayConfig = {
  [K in ScreenType]: {
    showVideoOverlay: boolean;
    showControls: boolean;
    overlayPosition: "top-right" | "bottom-left" | "bottom-right" | "floating";
    allowAudioOnly: boolean;
    show3DVideo: boolean;
  };
};
