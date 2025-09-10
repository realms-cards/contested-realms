'use client';

/**
 * Video Overlay Context
 * 
 * Manages video overlay state and configuration across different screens in the application.
 * Provides screen-aware video calling functionality that adapts behavior based on the current
 * screen type (draft, game, lobby, etc.).
 * 
 * This context handles:
 * - Screen type management and transitions
 * - Video overlay visibility and behavior configuration
 * - 3D seat positioning for game screens
 * - Audio-only mode switching for appropriate screens
 * 
 * Screen Types and Behavior:
 * - 'draft': Audio-only communication during card drafting
 * - 'draft-3d': Audio-only with 3D visualizations
 * - 'game': Full video during gameplay
 * - 'game-3d': Video positioned at player seats in 3D space
 * - 'lobby': Full video for social interaction
 * - 'leaderboard': Video overlay while viewing scores
 * - 'deck-editor': Audio-only during deck construction
 * 
 * @example
 * ```tsx
 * // Wrap your app with the provider
 * function App() {
 *   return (
 *     <VideoOverlayProvider initialScreenType="lobby">
 *       <YourAppComponents />
 *     </VideoOverlayProvider>
 *   );
 * }
 * 
 * // Use in components to control overlay behavior
 * function GameScreen() {
 *   const { updateScreenType, overlayConfig } = useVideoOverlay();
 *   
 *   useEffect(() => {
 *     updateScreenType('game-3d');
 *   }, []);
 * 
 *   return overlayConfig.show3DVideo ? <Video3D /> : <VideoOverlay />;
 * }
 * ```
 */

import React, { createContext, useContext, useState, useMemo } from 'react';
import type { Vector3 } from 'three';
import type { 
  ScreenType, 
  VideoOverlayConfig, 
  SeatVideoPlacement, 
  VideoOverlayContextValue,
  VideoOverlayProviderProps
} from '../../../specs/006-live-video-and/contracts/video-overlay';

// Screen-specific overlay configurations
const SCREEN_OVERLAY_CONFIGS: Record<ScreenType, Omit<VideoOverlayConfig, 'screenType' | 'seatPosition'>> = {
  'draft': {
    showVideo: false,    // Audio-only during drafting
    showControls: true,
    audioOnly: true
  },
  'draft-3d': {
    showVideo: false,    // Audio-only during 3D drafting  
    showControls: true,
    audioOnly: true
  },
  'deck-editor': {
    showVideo: false,    // Audio-only during deck editing
    showControls: true,
    audioOnly: true
  },
  'game': {
    showVideo: true,     // Full video during games
    showControls: true,
    audioOnly: false
  },
  'game-3d': {
    showVideo: true,     // Video at seat positions in 3D
    showControls: true,
    audioOnly: false
  },
  'lobby': {
    showVideo: true,     // Full video in lobby
    showControls: true,
    audioOnly: false
  },
  'leaderboard': {
    showVideo: true,     // Full video on leaderboard
    showControls: true,
    audioOnly: false
  }
};

const VideoOverlayContext = createContext<VideoOverlayContextValue | null>(null);

/**
 * Video Overlay Provider Component
 * 
 * Provides video overlay context to child components. Should be placed high in the
 * component tree to ensure all screens can access video overlay functionality.
 * 
 * @param props - Provider configuration
 * @param props.children - Child components that will have access to the context
 * @param props.initialScreenType - Starting screen type, defaults to 'lobby'
 * @returns Context provider component
 */
export const VideoOverlayProvider: React.FC<VideoOverlayProviderProps> = ({ 
  children, 
  initialScreenType = 'lobby' 
}) => {
  const [screenType, setScreenType] = useState<ScreenType>(initialScreenType);
  const [seatPlacements, setSeatPlacements] = useState<Map<string, Vector3>>(new Map());

  // Get current screen configuration
  const screenConfig = useMemo(() => SCREEN_OVERLAY_CONFIGS[screenType], [screenType]);

  // Build full overlay configuration
  const overlayConfig: VideoOverlayConfig = useMemo(() => ({
    screenType,
    showVideo: screenConfig.showVideo,
    showControls: screenConfig.showControls,
    audioOnly: screenConfig.audioOnly,
    seatPosition: null // Individual seat positions managed separately
  }), [screenType, screenConfig]);

  // Update screen type
  const updateScreenType = (type: ScreenType) => {
    setScreenType(type);
  };

  // Set seat position for a specific player
  const setSeatPosition = (playerId: string, position: Vector3 | null) => {
    setSeatPlacements(prev => {
      const updated = new Map(prev);
      if (position === null) {
        updated.delete(playerId);
      } else {
        updated.set(playerId, position);
      }
      return updated;
    });
  };

  // Computed properties
  const shouldShowVideo = screenConfig.showVideo;
  const shouldShowControls = screenConfig.showControls;
  const isAudioOnly = screenConfig.audioOnly;

  const contextValue: VideoOverlayContextValue = {
    overlayConfig,
    updateScreenType,
    setSeatPosition,
    shouldShowVideo,
    shouldShowControls,
    isAudioOnly
  };

  return (
    <VideoOverlayContext.Provider value={contextValue}>
      {children}
    </VideoOverlayContext.Provider>
  );
};

/**
 * Hook to access video overlay context
 * 
 * Provides access to video overlay state and control functions. Must be used within
 * a VideoOverlayProvider component tree.
 * 
 * @returns Video overlay context value with state and controls
 * @throws Error if used outside of VideoOverlayProvider
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { 
 *     updateScreenType, 
 *     shouldShowVideo, 
 *     overlayConfig 
 *   } = useVideoOverlay();
 * 
 *   // Switch to game mode
 *   const startGame = () => updateScreenType('game');
 * 
 *   // Check if video should be shown
 *   if (shouldShowVideo) {
 *     return <VideoInterface />;
 *   }
 * 
 *   return <AudioOnlyInterface />;
 * }
 * ```
 */
export function useVideoOverlay(): VideoOverlayContextValue {
  const context = useContext(VideoOverlayContext);
  if (!context) {
    throw new Error('useVideoOverlay must be used within a VideoOverlayProvider');
  }
  return context;
}

// Export additional utilities for managing seat video placements
export interface SeatVideoManager {
  getSeatPosition: (playerId: string) => Vector3 | null;
  updateSeatPosition: (playerId: string, position: Vector3) => void;
  removeSeatPosition: (playerId: string) => void;
  getAllSeatPlacements: () => SeatVideoPlacement[];
}

export function useSeatVideoManager(): SeatVideoManager {
  const { setSeatPosition } = useVideoOverlay();
  const [seatPlacements] = useState<Map<string, Vector3>>(new Map());

  return {
    getSeatPosition: (playerId: string) => {
      return seatPlacements.get(playerId) || null;
    },
    
    updateSeatPosition: (playerId: string, position: Vector3) => {
      setSeatPosition(playerId, position);
    },
    
    removeSeatPosition: (playerId: string) => {
      setSeatPosition(playerId, null);
    },
    
    getAllSeatPlacements: () => {
      return Array.from(seatPlacements.entries()).map(([playerId, worldPosition]) => ({
        playerId,
        worldPosition,
        rotation: 0, // Default rotation, could be enhanced
        dimensions: { width: 1.2, height: 0.8 }, // Default video dimensions
        visible: true
      }));
    }
  };
}

// Hook for screen-specific behavior
export function useScreenVideoConfig(): {
  screenType: ScreenType;
  showVideo: boolean;
  showControls: boolean;
  audioOnly: boolean;
  canChange3DPositions: boolean;
} {
  const { overlayConfig } = useVideoOverlay();
  
  return {
    screenType: overlayConfig.screenType,
    showVideo: overlayConfig.showVideo,
    showControls: overlayConfig.showControls,
    audioOnly: overlayConfig.audioOnly,
    canChange3DPositions: overlayConfig.screenType === 'game-3d'
  };
}