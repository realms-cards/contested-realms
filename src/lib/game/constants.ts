// Physics and rendering constants

// Base tile size (playmat uses this); visual grid previously reduced by 15%.
// Increase grid size by ~10% while keeping playmat size unchanged.
export const BASE_TILE_SIZE = 1.5;
export const TILE_SIZE = BASE_TILE_SIZE * 0.85 * 1.1; // world units per cell (slightly increased)

// Playmat native pixel size and aspect ratio (must be preserved)
export const MAT_PIXEL_W = 2556;
export const MAT_PIXEL_H = 1663;
export const MAT_RATIO = MAT_PIXEL_W / MAT_PIXEL_H; // ~1.5385

// Standard card size (keep long edge consistent across spells and sites)
export const CARD_LONG = TILE_SIZE * 0.55; // long edge
export const CARD_SHORT = CARD_LONG * 0.75; // 3:4 ratio

// Physics constants
export const CARD_THICK = Math.max(0.012, CARD_LONG * 0.02); // Thin physical thickness for card collisions
export const DRAG_LIFT = CARD_THICK * 2 + 0.15; // Height to lift a card while dragging so it clears neighbors and the ground
export const GROUND_HALF_THICK = 0.05; // Ground collider half-thickness; keep robust to avoid tunneling through a too-thin floor
export const EDGE_MARGIN = TILE_SIZE * 0.5; // expand ground beyond mat a little

// Hand layout constants (3D hand anchored to camera)
export const HAND_DIST = 3.2; // world units in front of camera
export const HAND_BOTTOM_MARGIN = 0.2; // gap from screen bottom (world units)
export const HAND_MAX_TOTAL_ANGLE = 0.9; // radians, cap total fan angle across all cards (~51°)
export const HAND_STEP_MAX = 0.12; // radians, max per-card step (~6.9°)
export const HAND_OVERLAP_FRAC = 0.35; // fraction of CARD_SHORT used as horizontal overlap
export const HAND_FAN_ARC_Y = CARD_LONG * 0.08; // world units vertical arc across fan (0 disables)

export const WALL_THICK = 0.06;
export const WALL_HALF_HEIGHT = 0.6; // 1.2 units tall walls

// Drag interaction constants
export const DRAG_THRESHOLD = TILE_SIZE * 0.08; // Require some pointer travel before starting a drag (avoid click-move)
export const DRAG_HOLD_MS = 80; // Require a tiny hold before allowing drag start (prevents right-click wiggle drags)

// Hand visual scales
export const HAND_CARD_SCALE = 1.25; // base scale factor for hand cards (bigger than default)
export const HAND_HOVER_SCALE = 1; // multiplier when hovering a hand card
