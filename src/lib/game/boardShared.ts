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
// Each stacked card lifts by full card thickness + small margin so they sit on top of each other
export const STACK_LAYER_LIFT = CARD_THICK * 1.2;
export const BASE_CARD_ELEVATION = CARD_THICK * 0.55;
export const BURROWED_ELEVATION = CARD_THICK * 0.08;
export const RUBBLE_ELEVATION = CARD_THICK * 0.04;
export const AVATAR_AVOID_Z = TILE_SIZE * 0.15;
export const TILE_OFFSET_LIMIT_X = TILE_SIZE * 0.35;
export const TILE_OFFSET_LIMIT_Z = TILE_SIZE * 0.65; // Increased to allow reaching tile center and beyond

export function clampOffset(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}
