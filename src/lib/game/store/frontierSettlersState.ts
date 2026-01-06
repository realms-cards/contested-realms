import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { getAdjacentCells, seatFromOwner } from "./utils/boardHelpers";

function newFrontierSettlersId() {
  return `frontier_settlers_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export type FrontierSettlersPhase =
  | "revealing"
  | "selecting_target"
  | "complete";

export type PendingFrontierSettlers = {
  id: string;
  minion: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    owner: 1 | 2;
    card: CardRef;
  };
  ownerSeat: PlayerKey;
  phase: FrontierSettlersPhase;
  revealedSite: CardRef | null;
  validTargets: CellKey[]; // Adjacent voids and rubble tiles
  selectedTarget: CellKey | null;
  createdAt: number;
};

// Track which Frontier Settlers have used their ability (by instanceId)
export type FrontierSettlersUsed = Set<string>;

export type FrontierSettlersSlice = Pick<
  GameState,
  | "pendingFrontierSettlers"
  | "frontierSettlersUsed"
  | "triggerFrontierSettlersAbility"
  | "selectFrontierSettlersTarget"
  | "resolveFrontierSettlers"
  | "cancelFrontierSettlers"
  | "hasFrontierSettlersAbility"
>;

export const createFrontierSettlersSlice: StateCreator<
  GameState,
  [],
  [],
  FrontierSettlersSlice
> = (set, get) => ({
  pendingFrontierSettlers: null,
  frontierSettlersUsed: new Set<string>(),

  // Check if a Frontier Settlers minion still has its ability
  hasFrontierSettlersAbility: (instanceId: string): boolean => {
    return !get().frontierSettlersUsed.has(instanceId);
  },

  triggerFrontierSettlersAbility: (input: {
    minion: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      owner: 1 | 2;
      card: CardRef;
    };
    ownerSeat: PlayerKey;
  }) => {
    const id = newFrontierSettlersId();
    const { minion, ownerSeat } = input;

    // Check if ability already used
    if (
      minion.instanceId &&
      get().frontierSettlersUsed.has(minion.instanceId)
    ) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Frontier Settlers has already used its ability`
      );
      return;
    }

    const zones = get().zones;
    const atlas = zones[ownerSeat]?.atlas || [];

    // Find topmost site in atlas
    if (atlas.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Frontier Settlers: No sites in atlas to reveal`
      );
      return;
    }

    const topSite = atlas[0];
    const board = get().board;

    // Find valid targets: adjacent cells that are void or have Rubble
    const adjacentCells = getAdjacentCells(
      minion.at,
      board.size.w,
      board.size.h
    );

    const validTargets: CellKey[] = [];
    for (const cellKey of adjacentCells) {
      const site = board.sites[cellKey];
      if (!site) {
        // Void tile
        validTargets.push(cellKey);
      } else if (site.card?.name?.toLowerCase() === "rubble") {
        // Rubble tile
        validTargets.push(cellKey);
      }
    }

    if (validTargets.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Frontier Settlers: No adjacent void or Rubble to place site`
      );
      return;
    }

    // Set revealing phase
    set({
      pendingFrontierSettlers: {
        id,
        minion,
        ownerSeat,
        phase: "revealing",
        revealedSite: topSite,
        validTargets,
        selectedTarget: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    get().log(
      `[${ownerSeat.toUpperCase()}] Frontier Settlers reveals ${
        topSite.name || "a site"
      } from atlas`
    );

    // Move to selecting phase after brief reveal
    setTimeout(() => {
      const pending = get().pendingFrontierSettlers;
      if (pending?.id === id && pending.phase === "revealing") {
        set({
          pendingFrontierSettlers: { ...pending, phase: "selecting_target" },
        } as Partial<GameState> as GameState);
      }
    }, 500);

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "frontierSettlersBegin",
          id,
          minion,
          ownerSeat,
          revealedSite: topSite,
          validTargets,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectFrontierSettlersTarget: (targetCell: CellKey) => {
    const pending = get().pendingFrontierSettlers;
    if (!pending || pending.phase !== "selecting_target") return;

    // Validate target is in valid targets
    if (!pending.validTargets.includes(targetCell)) return;

    set({
      pendingFrontierSettlers: { ...pending, selectedTarget: targetCell },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "frontierSettlersSelectTarget",
          id: pending.id,
          targetCell,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveFrontierSettlers: () => {
    const pending = get().pendingFrontierSettlers;
    if (
      !pending ||
      pending.phase !== "selecting_target" ||
      !pending.selectedTarget
    ) {
      return;
    }

    const { minion, ownerSeat, revealedSite, selectedTarget } = pending;
    if (!revealedSite) return;

    const board = get().board;
    const zones = get().zones;
    const permanents = get().permanents;

    // Check if target has Rubble - if so, remove it first
    const targetSite = board.sites[selectedTarget];
    if (targetSite && targetSite.card?.name?.toLowerCase() === "rubble") {
      // Remove Rubble from board (it goes to its owner's graveyard)
      const rubbleOwnerSeat = seatFromOwner(targetSite.owner);
      const rubbleGraveyard = [...(zones[rubbleOwnerSeat]?.graveyard || [])];
      rubbleGraveyard.push(targetSite.card);

      const sitesNext = { ...board.sites };
      delete sitesNext[selectedTarget];

      set({
        board: { ...board, sites: sitesNext },
        zones: {
          ...zones,
          [rubbleOwnerSeat]: {
            ...zones[rubbleOwnerSeat],
            graveyard: rubbleGraveyard,
          },
        },
      } as Partial<GameState> as GameState);
    }

    // Remove site from atlas
    const atlas = [...(zones[ownerSeat]?.atlas || [])];
    const siteIndex = atlas.findIndex((c) => c.cardId === revealedSite.cardId);
    if (siteIndex !== -1) {
      atlas.splice(siteIndex, 1);
    }

    // Place site on board
    const ownerNum = ownerSeat === "p1" ? 1 : 2;
    const boardAfter = get().board;
    const sitesNext = {
      ...boardAfter.sites,
      [selectedTarget]: {
        owner: ownerNum as 1 | 2,
        card: revealedSite,
        tapped: false,
      },
    };

    // Move Frontier Settlers to new location
    const sourcePerms = [...(permanents[minion.at] || [])];
    const minionPerm = sourcePerms[minion.index];
    if (!minionPerm) return;

    // Remove from source
    sourcePerms.splice(minion.index, 1);

    // Add to target
    const targetPerms = [...(permanents[selectedTarget] || [])];
    targetPerms.push({ ...minionPerm, tapped: true }); // Tap as part of ability

    const permanentsNext = {
      ...permanents,
      [minion.at]: sourcePerms,
      [selectedTarget]: targetPerms,
    };

    // Mark ability as used
    const usedSet = new Set(get().frontierSettlersUsed);
    if (minion.instanceId) {
      usedSet.add(minion.instanceId);
    }

    const zonesNext = {
      ...get().zones,
      [ownerSeat]: { ...get().zones[ownerSeat], atlas },
    };

    // Update state
    set({
      board: { ...boardAfter, sites: sitesNext },
      zones: zonesNext,
      permanents: permanentsNext,
      frontierSettlersUsed: usedSet,
      pendingFrontierSettlers: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Send patches
    const patches: ServerPatchT = {
      board: { sites: sitesNext } as unknown as ServerPatchT["board"],
      zones: {
        [ownerSeat]: { atlas: zonesNext[ownerSeat].atlas },
      } as unknown as ServerPatchT["zones"],
      permanents: permanentsNext,
    };
    get().trySendPatch(patches);

    get().log(
      `[${ownerSeat.toUpperCase()}] Frontier Settlers plays ${
        revealedSite.name || "site"
      } and moves there`
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "frontierSettlersResolve",
          id: pending.id,
          selectedTarget,
          revealedSiteName: revealedSite.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }

    // Clear pending after delay
    setTimeout(() => {
      set((state) => {
        if (state.pendingFrontierSettlers?.id === pending.id) {
          return { ...state, pendingFrontierSettlers: null } as GameState;
        }
        return state;
      });
    }, 500);
  },

  cancelFrontierSettlers: () => {
    const pending = get().pendingFrontierSettlers;
    if (!pending) return;

    set({ pendingFrontierSettlers: null } as Partial<GameState> as GameState);

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] cancels Frontier Settlers ability`
    );

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "frontierSettlersCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
