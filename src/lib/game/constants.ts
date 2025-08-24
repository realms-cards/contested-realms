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
export const WALL_THICK = 0.06;
export const WALL_HALF_HEIGHT = 0.6; // 1.2 units tall walls

// Drag interaction constants
export const DRAG_THRESHOLD = TILE_SIZE * 0.08; // Require some pointer travel before starting a drag (avoid click-move)
export const DRAG_HOLD_MS = 80; // Require a tiny hold before allowing drag start (prevents right-click wiggle drags)