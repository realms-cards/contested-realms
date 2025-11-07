import type { StateCreator } from "zustand";
import type { GameState, PlayerKey, ServerPatchT } from "./types";
import type {
  ContextMenuAction,
  PermanentPosition,
  PermanentPositionState,
  PlayerPositionReference,
  SitePositionData,
} from "../types";
import {
  createPermanentDeltaPatch,
  createPermanentsPatch,
} from "./utils/patchHelpers";
import {
  createDefaultPlayerPositions,
} from "./utils/positionHelpers";

type PositionSlice = Pick<
  GameState,
  | "permanentPositions"
  | "permanentAbilities"
  | "sitePositions"
  | "playerPositions"
  | "setPermanentPosition"
  | "updatePermanentState"
  | "setPermanentAbility"
  | "setSitePosition"
  | "setPlayerPosition"
  | "canTransitionState"
  | "getAvailableActions"
  | "calculateEdgePosition"
  | "calculatePlacementAngle"
>;

export const createPositionSlice: StateCreator<
  GameState,
  [],
  [],
  PositionSlice
> = (set, get) => ({
  permanentPositions: {},
  permanentAbilities: {},
  sitePositions: {},
  playerPositions: createDefaultPlayerPositions(),

  setPermanentPosition: (permanentId, position) =>
    set((state) => ({
      permanentPositions: {
        ...state.permanentPositions,
        [permanentId]: position,
      },
    })),

  updatePermanentState: (permanentId, newState) =>
    set((state) => {
      const currentPos = state.permanentPositions[permanentId];
      if (!currentPos) return state;
      let newY = currentPos.position.y;
      switch (newState) {
        case "surface":
          newY = 0;
          break;
        case "burrowed":
        case "submerged":
          newY = -0.25;
          break;
      }
      const updatedPosition: PermanentPosition = {
        ...currentPos,
        state: newState,
        position: {
          ...currentPos.position,
          y: newY,
        },
      };
      const nextPositions = {
        ...state.permanentPositions,
        [permanentId]: updatedPosition,
      } as GameState["permanentPositions"];
      try {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = { permanentPositions: nextPositions };
          get().trySendPatch(patch);
        }
      } catch {}
      return {
        permanentPositions: nextPositions,
      } as Partial<GameState> as GameState;
    }),

  setPermanentAbility: (permanentId, ability) =>
    set((state) => ({
      permanentAbilities: {
        ...state.permanentAbilities,
        [permanentId]: ability,
      },
    })),

  setSitePosition: (siteId, positionData) =>
    set((state) => ({
      sitePositions: {
        ...state.sitePositions,
        [siteId]: positionData,
      },
    })),

  setPlayerPosition: (playerId, position) =>
    set((state) => ({
      playerPositions: {
        ...state.playerPositions,
        [playerId]: position,
      },
    })),

  canTransitionState: (permanentId, targetState) => {
    const state = get();
    const currentPos = state.permanentPositions[permanentId];
    const ability = state.permanentAbilities[permanentId];
    if (!currentPos || !ability) return false;
    if (currentPos.state === targetState) return false;
    if (targetState === "burrowed" && !ability.canBurrow) return false;
    if (targetState === "submerged" && !ability.canSubmerge) return false;
    if (
      (currentPos.state === "burrowed" && targetState === "submerged") ||
      (currentPos.state === "submerged" && targetState === "burrowed")
    ) {
      return false;
    }
    return true;
  },

  getAvailableActions: (permanentId) => {
    const state = get();
    const currentPos = state.permanentPositions[permanentId];
    const ability = state.permanentAbilities[permanentId];
    if (!currentPos || !ability) return [];
    const actions: ContextMenuAction[] = [];
    const currentState = currentPos.state;
    if (currentState === "surface" && ability.canBurrow) {
      actions.push({
        actionId: "burrow",
        displayText: "Burrow",
        icon: "arrow-down",
        isEnabled: true,
        targetPermanentId: permanentId,
        newPositionState: "burrowed",
        description: "Move this permanent under the current site",
      });
    }
    if (currentState === "surface" && ability.canSubmerge) {
      const isAtWaterSite = true;
      actions.push({
        actionId: "submerge",
        displayText: "Submerge",
        icon: "waves",
        isEnabled: isAtWaterSite,
        targetPermanentId: permanentId,
        newPositionState: "submerged",
        description: "Submerge this permanent underwater (water sites only)",
      });
    }
    if (currentState === "burrowed") {
      actions.push({
        actionId: "surface",
        displayText: "Surface",
        icon: "arrow-up",
        isEnabled: true,
        targetPermanentId: permanentId,
        newPositionState: "surface",
        description: "Bring this permanent back to the surface",
      });
    }
    if (currentState === "submerged") {
      actions.push({
        actionId: "emerge",
        displayText: "Emerge",
        icon: "arrow-up",
        isEnabled: true,
        targetPermanentId: permanentId,
        newPositionState: "surface",
        description: "Emerge this permanent from underwater",
      });
    }
    return actions;
  },

  calculateEdgePosition: (tileCoords, playerPos) => {
    const dx = playerPos.x - tileCoords.x;
    const dz = playerPos.z - tileCoords.z;
    const magnitude = Math.sqrt(dx * dx + dz * dz);
    if (magnitude === 0) return { x: 0, z: 0 };
    const scale = 0.2;
    return {
      x: (dx / magnitude) * scale,
      z: (dz / magnitude) * scale,
    };
  },

  calculatePlacementAngle: (tilePos, playerPos) => {
    const dx = playerPos.x - tilePos.x;
    const dz = playerPos.z - tilePos.z;
    return Math.atan2(dz, dx);
  },
});
