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
// Real Sorcery cards are 63mm x 88mm (same as standard TCG size)
export const CARD_LONG = TILE_SIZE * 0.55; // long edge (88mm)
export const CARD_SHORT = CARD_LONG * (63 / 88); // short edge (63mm) — 63:88 ratio

// Physics constants
// Real card: ~0.3mm thick, ~88mm long = 0.34% ratio
export const CARD_THICK = Math.max(0.003, CARD_LONG * 0.004); // Realistic card thickness (~0.3mm scale)
export const DRAG_LIFT = CARD_THICK * 2; // Height to lift a card while dragging so it clears neighbors and the ground
export const GROUND_HALF_THICK = 0.05; // Ground collider half-thickness; keep robust to avoid tunneling through a too-thin floor
export const EDGE_MARGIN = TILE_SIZE * 0.5; // expand ground beyond mat a little

// Hand layout constants (3D hand anchored to camera)
export const HAND_DIST = 3.2; // world units in front of camera
export const HAND_BOTTOM_MARGIN = 0.1; // reduced gap from screen bottom to allow more upward expansion
export const HAND_MAX_TOTAL_ANGLE = 0.9; // radians, cap total fan angle across all cards (~51°)
export const HAND_STEP_MAX = 0.12; // radians, max per-card step (~6.9°)
export const HAND_OVERLAP_FRAC = 0.4; // fraction of CARD_SHORT used as horizontal overlap - back to organized setting
export const HAND_FAN_ARC_Y = CARD_LONG * 0.08; // world units vertical arc across fan (0 disables)

export const WALL_THICK = 0.06;
export const WALL_HALF_HEIGHT = 0.6; // 1.2 units tall walls

// Drag interaction constants
export const DRAG_THRESHOLD = TILE_SIZE * 0.06; // Require some pointer travel before starting a drag (avoid click-move)
export const DRAG_HOLD_MS = 100; // Tighten hold so quick clicks don't trigger drags but interactions stay snappy

// Hand visual scales
export const HAND_CARD_SCALE = 1.35; // balanced scale factor for hand cards - big but not overwhelming
export const HAND_HOVER_SCALE = 1; // multiplier when hovering a hand card

// Player accent colors (p1 = blue, p2 = red). Spectators/unknown fall back to violet.
export const PLAYER_COLORS = {
  // P1 = blue, P2 = red (used consistently for cursors and transport glows)
  p1: "#93c5fd", // sky-300
  p2: "#fca5a5", // red-300
  spectator: "#a855f7", // violet-500
} as const;
export type PlayerColorKey = keyof typeof PLAYER_COLORS;
