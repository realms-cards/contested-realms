import type { StateCreator } from "zustand";
import { summonLayerOptions, unitsInRealm } from "@/lib/game/cpu/spells";
import type { GameState, ServerPatchT } from "./types";
import type { ContextMenuAction, PermanentPosition } from "../types";
import { createDefaultPlayerPositions } from "./utils/positionHelpers";

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
      // A unit never given a position entry is simply on the surface. Returning early here made a
      // menu action silently do nothing whenever the name-based registry had not seen the card.
      const currentPos: PermanentPosition = state.permanentPositions[permanentId] ?? {
        permanentId,
        state: "surface",
        position: { x: 0, y: 0, z: 0 },
      };
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
          // Send only the changed entry — a full-map patch would overwrite
          // concurrent position changes from the other seat (see patch
          // safety rules in CLAUDE.md).
          const patch: ServerPatchT = {
            permanentPositions: {
              [permanentId]: updatedPosition,
            } as GameState["permanentPositions"],
          };
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
    set((state) => {
      const nextSitePositions = {
        ...state.sitePositions,
        [siteId]: positionData,
      } as GameState["sitePositions"];
      try {
        const tr = get().transport;
        if (tr) {
          const patch: ServerPatchT = { sitePositions: nextSitePositions };
          get().trySendPatch(patch);
        }
      } catch {}
      return {
        sitePositions: nextSitePositions,
      } as Partial<GameState> as GameState;
    }),

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
    const ability = state.permanentAbilities[permanentId];
    const actions: ContextMenuAction[] = [];
    const currentState = state.permanentPositions[permanentId]?.state ?? "surface";
    if (currentState === "surface") {
      // Burrowing and Submerge are one mechanic and the SITE decides which applies: water sites
      // (flooded land included) submerge, land burrows. The rules layer counts printed and granted
      // keywords, so it decides for a unit on the board; the name-based registry only fills in for
      // units it cannot locate.
      const unit = unitsInRealm(state).find(
        (candidate) => candidate.target.kind === "permanent" && candidate.target.instanceId === permanentId,
      );
      const layers = unit
        ? summonLayerOptions(state, unit)
        : [
            ...(ability?.canBurrow ? (["burrowed"] as const) : []),
            ...(ability?.canSubmerge ? (["submerged"] as const) : []),
          ];
      if (layers.includes("burrowed")) {
        actions.push({
          actionId: "burrow",
          displayText: "Burrow",
          icon: "arrow-down",
          isEnabled: true,
          targetPermanentId: permanentId,
          newPositionState: "burrowed",
          description: "Move this permanent under the current land site",
        });
      }
      if (layers.includes("submerged")) {
        actions.push({
          actionId: "submerge",
          displayText: "Submerge",
          icon: "waves",
          isEnabled: true,
          targetPermanentId: permanentId,
          newPositionState: "submerged",
          description: "Submerge this permanent under the current water site",
        });
      }
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
