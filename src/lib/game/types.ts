export type { SearchResult } from "@/lib/deckEditor/search";

// Burrow/Submerge Mechanics Types

export type PermanentPositionState = 'surface' | 'burrowed' | 'submerged';

export interface PermanentPosition {
  permanentId: number;
  state: PermanentPositionState;
  position: {
    x: number;
    y: number; // Depth offset: 0 for surface, negative for underground
    z: number;
  };
  transitionDuration?: number; // Animation duration in ms (default: 200)
}

export interface SitePositionData {
  siteId: number;
  tileCoordinates: {
    x: number;
    z: number;
  };
  ownerPlayerId: number;
  edgePosition: {
    x: number; // Offset from tile center toward player
    z: number; // Offset from tile center toward player
  };
  placementAngle: number; // Radians (0-2π) toward player position
}

export interface BurrowAbility {
  permanentId: number;
  canBurrow: boolean;
  canSubmerge: boolean;
  requiresWaterSite: boolean;
  abilitySource: string; // Card text/rule reference
}

export interface ContextMenuAction {
  actionId: string;
  displayText: string;
  icon?: string;
  isEnabled: boolean;
  targetPermanentId: number;
  newPositionState?: PermanentPositionState;
  requiresConfirmation?: boolean;
  description?: string;
}

export interface PlayerPositionReference {
  playerId: number;
  position: {
    x: number;
    z: number;
  };
}

// Validation utilities
export const PositionStateValidation = {
  isValidState: (state: string): state is PermanentPositionState => {
    return ['surface', 'burrowed', 'submerged'].includes(state);
  },
  
  isValidDepth: (state: PermanentPositionState, yPosition: number): boolean => {
    if (state === 'surface') return yPosition >= -0.05 && yPosition <= 0.05;
    if (state === 'burrowed' || state === 'submerged') {
      return yPosition >= -0.5 && yPosition <= -0.1;
    }
    return false;
  },
  
  isValidTransition: (from: PermanentPositionState, to: PermanentPositionState): boolean => {
    // Direct transitions allowed: surface ↔ burrowed, surface ↔ submerged
    // Forbidden: burrowed ↔ submerged (must go through surface)
    if (from === to) return false;
    if (from === 'burrowed' && to === 'submerged') return false;
    if (from === 'submerged' && to === 'burrowed') return false;
    return true;
  }
};

// Pre-defined context menu actions
export const BurrowSubmergeActions = {
  BURROW: {
    actionId: 'burrow',
    displayText: 'Burrow',
    icon: 'arrow-down',
    description: 'Move this permanent under the current site',
    newPositionState: 'burrowed' as PermanentPositionState
  },
  
  SUBMERGE: {
    actionId: 'submerge', 
    displayText: 'Submerge',
    icon: 'waves',
    description: 'Submerge this permanent underwater (water sites only)',
    newPositionState: 'submerged' as PermanentPositionState
  },
  
  SURFACE: {
    actionId: 'surface',
    displayText: 'Surface',
    icon: 'arrow-up',
    description: 'Bring this permanent back to the surface',
    newPositionState: 'surface' as PermanentPositionState
  },
  
  EMERGE: {
    actionId: 'emerge',
    displayText: 'Emerge', 
    icon: 'arrow-up',
    description: 'Emerge this permanent from underwater',
    newPositionState: 'surface' as PermanentPositionState
  }
} as const;
