/**
 * Contract: Permanent Position State Management
 * 
 * Defines the interface for managing permanent positions in 3D space
 * (surface, burrowed, submerged states with depth positioning)
 */

export type PermanentPositionState = 'surface' | 'burrowed' | 'submerged';

export interface PermanentPositionUpdate {
  permanentId: number;
  newState: PermanentPositionState;
  position: {
    x: number;
    y: number; // Depth offset: 0 for surface, negative for underground
    z: number;
  };
  transitionDuration?: number; // Animation duration in ms (default: 200)
}

export interface PermanentPositionQuery {
  permanentId: number;
}

export interface PermanentPositionResponse {
  permanentId: number;
  currentState: PermanentPositionState;
  position: {
    x: number;
    y: number;
    z: number;
  };
  canBurrow: boolean;
  canSubmerge: boolean;
  isAtWaterSite?: boolean; // Required for submerge validation
}

/**
 * Store contract for position state management
 */
export interface IPermanentPositionStore {
  // State queries
  getPermanentPosition(permanentId: number): PermanentPositionResponse | null;
  getBurrowedAtSite(siteId: number): number[]; // Array of permanent IDs
  
  // State mutations
  setPermanentPosition(update: PermanentPositionUpdate): void;
  
  // Ability validation
  canUseBurrowAbility(permanentId: number): boolean;
  canUseSubmergeAbility(permanentId: number): boolean;
}

/**
 * Component contract for 3D positioning
 */
export interface IPermanentPositionComponent {
  permanentId: number;
  onPositionChange(update: PermanentPositionUpdate): void;
  onStateTransition(fromState: PermanentPositionState, toState: PermanentPositionState): void;
}

/**
 * Contract validation rules
 */
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