/**
 * Component Interface Contracts for Card Preview System
 * 
 * These interfaces define the expected behavior and data contracts
 * for components involved in the card preview functionality.
 */

import * as THREE from 'three';

// ===== CORE DATA CONTRACTS =====

/**
 * Essential data required to display a card preview
 */
export interface CardPreviewData {
  /** Unique identifier for card image/asset lookup */
  slug: string;
  /** Human-readable card name */
  name: string;
  /** Card type (Creature, Site, Spell, etc.) - can be null for unknown types */
  type: string | null;
}

/**
 * Data structure for Three.js mesh userData to enable hover detection
 */
export interface CardMeshUserData {
  /** Database ID of the card */
  cardId: number;
  /** Asset identifier for the card */
  slug: string;
  /** Card type information */
  type: string | null;
  /** Optional display name */
  name?: string;
}

// ===== COMPONENT CONTRACTS =====

/**
 * Props contract for enhanced DraggableCard3D component
 */
export interface DraggableCard3DProps {
  /** Card asset identifier */
  slug: string;
  /** 3D position coordinates */
  x: number;
  z: number;
  y?: number;
  
  // Hover functionality
  /** Database reference for metadata */
  cardId?: number;
  /** Callback when hover state changes */
  onHoverChange?: (isHovered: boolean) => void;
  /** Callback to trigger preview display */
  onHoverStart?: (card: CardPreviewData) => void;
  /** Callback to hide preview */
  onHoverEnd?: () => void;
  
  // Existing functionality (preserved)
  isSite?: boolean;
  onDrop?: (x: number, z: number) => void;
  onDragChange?: (isDragging: boolean) => void;
  getTopRenderOrder?: () => number;
  baseRenderOrder?: number;
  disabled?: boolean;
  lockUpright?: boolean;
  stackIndex?: number;
  totalInStack?: number;
}

/**
 * Props contract for MouseTracker component
 */
export interface MouseTrackerProps {
  /** Array of card data with position information */
  cards: Array<{
    id: number;
    card: {
      slug: string;
      cardName: string;
      type: string | null;
    };
    x: number;
    z: number;
  }>;
  /** Callback when hover state changes */
  onHover: (card: CardPreviewData | null) => void;
}

/**
 * Props contract for CardPreview component (existing)
 */
export interface CardPreviewProps {
  /** Card data to display - null hides the preview */
  card: CardPreviewData | null;
  /** Anchor position for the preview overlay */
  anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Optional close callback */
  onClose?: () => void;
}

// ===== BEHAVIOR CONTRACTS =====

/**
 * Contract for hover state management
 */
export interface HoverStateManager {
  /** Show card preview with debouncing */
  showCardPreview(card: CardPreviewData): void;
  /** Hide card preview with delay */
  hideCardPreview(): void;
  /** Immediately clear any pending timers */
  clearHoverTimers(): void;
  /** Current hover state */
  readonly isHovering: boolean;
  /** Currently displayed card */
  readonly currentCard: CardPreviewData | null;
}

/**
 * Contract for raycast-enabled mesh objects
 */
export interface RaycastEnabledMesh {
  /** Must have userData for hover detection */
  userData: CardMeshUserData;
  /** Must be raycastable (not disabled) */
  raycast?: undefined | ((raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => void);
}

// ===== VALIDATION CONTRACTS =====

/**
 * Validation rules for card preview data
 */
export interface CardPreviewValidation {
  /** Validates that card data is complete and valid */
  isValidCardData(card: unknown): card is CardPreviewData;
  /** Validates that mesh has proper userData for hover detection */
  isValidMeshUserData(userData: unknown): userData is CardMeshUserData;
}

// ===== TIMING CONTRACTS =====

/**
 * Timing constants for hover behavior
 */
export const HOVER_TIMING = {
  /** Delay before showing preview (immediate) */
  SHOW_DELAY: 0,
  /** Delay before hiding preview (debounced) */
  HIDE_DELAY: 400,
  /** Maximum time to wait for cleanup on unmount */
  CLEANUP_TIMEOUT: 100,
} as const;

// ===== ERROR CONTRACTS =====

/**
 * Error cases that implementations must handle
 */
export interface CardPreviewErrors {
  /** Card data is invalid or missing required fields */
  INVALID_CARD_DATA: 'INVALID_CARD_DATA';
  /** Asset/slug cannot be resolved to an image */
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND';
  /** Raycast system is not properly configured */
  RAYCAST_DISABLED: 'RAYCAST_DISABLED';
  /** Hover timers leaked/not cleaned up */
  TIMER_LEAK: 'TIMER_LEAK';
}