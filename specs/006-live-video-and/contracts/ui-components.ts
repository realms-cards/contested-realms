/**
 * Contract: UI Component Interfaces
 * Defines the component interfaces for video overlay system
 */

import type { Vector3 } from 'three';
import type { WebRTCHookReturn } from './webrtc-hooks';
import type { ScreenType } from './video-overlay';

export interface GlobalVideoOverlayProps {
  className?: string;
  position?: 'top-right' | 'bottom-left' | 'bottom-right';
  showUserAvatar?: boolean;
  // WebRTC configuration for proper camera/audio functionality
  transport?: any;
  myPlayerId?: string | null;
  matchId?: string | null;
  // User information for avatar display
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
  permissionType: 'camera' | 'microphone' | 'both';
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
  connectionState: 'idle' | 'joining' | 'negotiating' | 'connected' | 'failed' | 'closed';
  lastError?: string | null;
  onRetry?: () => void;
  compact?: boolean;
}

/**
 * Screen-specific overlay configuration
 */
export type ScreenOverlayConfig = {
  [K in ScreenType]: {
    showVideoOverlay: boolean;
    showControls: boolean;
    overlayPosition: 'top-right' | 'bottom-left' | 'bottom-right' | 'floating';
    allowAudioOnly: boolean;
    show3DVideo: boolean;
  };
};

export const SCREEN_OVERLAY_CONFIGS: ScreenOverlayConfig = {
  'draft': {
    showVideoOverlay: false,
    showControls: true,
    overlayPosition: 'top-right',
    allowAudioOnly: true,
    show3DVideo: false,
  },
  'draft-3d': {
    showVideoOverlay: false,
    showControls: true,
    overlayPosition: 'top-right', 
    allowAudioOnly: true,
    show3DVideo: false,
  },
  'deck-editor': {
    showVideoOverlay: false,
    showControls: true,
    overlayPosition: 'top-right',
    allowAudioOnly: true,
    show3DVideo: false,
  },
  'game': {
    showVideoOverlay: true,
    showControls: true,
    overlayPosition: 'bottom-right',
    allowAudioOnly: false,
    show3DVideo: false,
  },
  'game-3d': {
    showVideoOverlay: false,
    showControls: true,
    overlayPosition: 'bottom-right',
    allowAudioOnly: false,
    show3DVideo: true,
  },
  'lobby': {
    showVideoOverlay: true,
    showControls: true,
    overlayPosition: 'floating',
    allowAudioOnly: false,
    show3DVideo: false,
  },
  'leaderboard': {
    showVideoOverlay: true,
    showControls: false,
    overlayPosition: 'top-right',
    allowAudioOnly: false,
    show3DVideo: false,
  },
};