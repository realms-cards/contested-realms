/**
 * Contract: Video Overlay Context Interface
 * Defines the context for managing video overlay state across screens
 */

import type { Vector3 } from 'three';

export type ScreenType = 
  | 'draft' 
  | 'draft-3d' 
  | 'deck-editor'
  | 'game' 
  | 'game-3d' 
  | 'lobby' 
  | 'leaderboard';

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
  // Configuration
  overlayConfig: VideoOverlayConfig;
  
  // Actions
  updateScreenType: (type: ScreenType) => void;
  setSeatPosition: (playerId: string, position: Vector3 | null) => void;
  
  // Computed properties
  shouldShowVideo: boolean;
  shouldShowControls: boolean;
  isAudioOnly: boolean;
}

/**
 * Contract: VideoOverlayProvider Component
 * Context provider for video overlay state management
 */
export interface VideoOverlayProviderProps {
  children: React.ReactNode;
  initialScreenType?: ScreenType;
}

export declare const VideoOverlayProvider: React.FC<VideoOverlayProviderProps>;
export declare function useVideoOverlay(): VideoOverlayContextValue;