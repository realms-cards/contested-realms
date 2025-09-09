/**
 * Contract: Context Menu Actions for Burrow/Submerge
 * 
 * Defines the interface for dynamic context menu actions
 * based on permanent abilities and current state
 */

import { PermanentPositionState } from './position-state.contract';

export interface ContextMenuAction {
  actionId: string; // e.g., "burrow", "surface", "submerge", "emerge"
  displayText: string; // User-visible action name
  icon?: string; // Optional icon identifier
  isEnabled: boolean; // Whether action is currently available
  targetPermanentId: number; // Permanent this action applies to
  newPositionState?: PermanentPositionState; // Resulting state if action executed
  requiresConfirmation?: boolean; // Whether to show confirmation dialog
  description?: string; // Tooltip or help text
}

export interface ContextMenuQuery {
  permanentId: number;
  currentPosition: {
    x: number;
    y: number;
    z: number;
  };
  siteId?: number; // Site where permanent is located (if any)
}

export interface ContextMenuResponse {
  permanentId: number;
  availableActions: ContextMenuAction[];
  menuTitle: string; // e.g., "Burrowing Mole Actions"
  permanentName: string;
}

export interface ContextMenuExecution {
  actionId: string;
  permanentId: number;
  executedBy: number; // Player ID who triggered action
  timestamp: number; // When action was executed
  previousState: PermanentPositionState;
  newState: PermanentPositionState;
}

/**
 * Store contract for context menu management
 */
export interface IContextMenuStore {
  // Menu generation
  generateContextMenu(query: ContextMenuQuery): ContextMenuResponse;
  
  // Action execution
  executeAction(execution: ContextMenuExecution): Promise<boolean>;
  
  // Action validation
  validateAction(action: ContextMenuAction, query: ContextMenuQuery): boolean;
  
  // Menu state
  isMenuOpen(): boolean;
  getCurrentMenuTarget(): number | null; // Currently targeted permanent ID
  closeMenu(): void;
}

/**
 * Component contract for context menu rendering
 */
export interface IContextMenuComponent {
  // Menu display
  show(query: ContextMenuQuery): void;
  hide(): void;
  
  // Action handling
  onActionSelected(action: ContextMenuAction): void;
  onActionExecuted(execution: ContextMenuExecution): void;
  
  // Position management
  position: { x: number; y: number }; // Screen coordinates for menu placement
  
  // State
  isVisible: boolean;
  currentActions: ContextMenuAction[];
}

/**
 * Pre-defined action types for burrow/submerge mechanics
 */
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

/**
 * Contract validation rules
 */
export const ContextMenuValidation = {
  isValidActionId: (actionId: string): boolean => {
    return /^[a-z][a-z0-9_-]*$/.test(actionId) && actionId.length <= 20;
  },
  
  isValidDisplayText: (text: string): boolean => {
    return text.length > 0 && text.length <= 20 && !text.includes('\n');
  },
  
  validateAction: (action: ContextMenuAction): string[] => {
    const errors: string[] = [];
    
    if (!ContextMenuValidation.isValidActionId(action.actionId)) {
      errors.push('Invalid action ID format');
    }
    
    if (!ContextMenuValidation.isValidDisplayText(action.displayText)) {
      errors.push('Invalid display text');
    }
    
    if (action.targetPermanentId <= 0) {
      errors.push('Invalid target permanent ID');
    }
    
    return errors;
  },
  
  canShowAction: (
    action: ContextMenuAction,
    permanentAbilities: { canBurrow: boolean; canSubmerge: boolean },
    currentState: PermanentPositionState,
    isAtWaterSite: boolean
  ): boolean => {
    switch (action.actionId) {
      case 'burrow':
        return permanentAbilities.canBurrow && currentState === 'surface';
      case 'submerge':
        return permanentAbilities.canSubmerge && currentState === 'surface' && isAtWaterSite;
      case 'surface':
        return currentState === 'burrowed';
      case 'emerge':
        return currentState === 'submerged';
      default:
        return true; // Unknown actions default to visible
    }
  }
};