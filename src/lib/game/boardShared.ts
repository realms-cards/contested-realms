import { CARD_THICK, TILE_SIZE } from "@/lib/game/constants";

/**
 * Minimal shape of the rapier rigid body API the board components use.
 * Keeping this in a shared module avoids import cycles between components.
 */
export type BodyApi = {
  wakeUp: () => void;
  setLinvel: (v: { x: number; y: number; z: number }, wake: boolean) => void;
  setAngvel: (v: { x: number; y: number; z: number }, wake: boolean) => void;
  setTranslation: (
    v: { x: number; y: number; z: number },
    wake: boolean
  ) => void;
  setNextKinematicTranslation: (v: { x: number; y: number; z: number }) => void;
  setBodyType: (
    t: "dynamic" | "fixed" | "kinematicPosition" | "kinematicVelocity",
    wake: boolean
  ) => void;
};

// Shared stack/placement constants for permanents on the board.
export const STACK_SPACING = TILE_SIZE * 0.32;
export const STACK_MARGIN_Z = TILE_SIZE * 0.1;
// Each stacked card lifts to sit clearly on top of the previous card
// Must be large enough to prevent z-fighting between overlapping cards
export const STACK_LAYER_LIFT = CARD_THICK * 10;
// Card elevations - Y position is center of 3D card (thickness ~0.003)
// Cards rest on playmat (Y=0), so center is at half thickness
export const BURROWED_ELEVATION = CARD_THICK * 0.5; // Card center when lying flat
export const BASE_CARD_ELEVATION = CARD_THICK * 2; // Sites/normal cards slightly above burrowed
export const RUBBLE_ELEVATION = CARD_THICK * 2; // Same as BASE_CARD_ELEVATION to sit at site level
export const AVATAR_AVOID_Z = TILE_SIZE * 0.15;
export const TILE_OFFSET_LIMIT_X = TILE_SIZE * 0.35;
export const TILE_OFFSET_LIMIT_Z = TILE_SIZE * 0.65; // Increased to allow reaching tile center and beyond

export function clampOffset(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
