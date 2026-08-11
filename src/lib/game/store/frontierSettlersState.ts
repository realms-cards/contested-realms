import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PermanentItem,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { getAdjacentCells } from "./utils/boardHelpers";

function newFrontierSettlersId() {
  return `frontier_settlers_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

/**
 * Rubble is a siteReplacement permanent token living in `permanents[cellKey]`,
 * not a `board.sites` entry (see geomancerState.ts) — so a cell holding Rubble
 * looks site-less, and both voids and Rubble are simply cells with no site.
 */
function findRubblePermanent(
  perms: PermanentItem[] | undefined,
): PermanentItem | undefined {
  return (perms || []).find(
    (perm) => (perm.card?.name || "").toLowerCase() === "rubble",
  );
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
        `[${ownerSeat.toUpperCase()}] Frontier Settlers has already used its ability`,
      );
      return;
    }

    // "Tap →" is the cost, so an already-tapped minion can't pay it
    if ((get().permanents[minion.at] || [])[minion.index]?.tapped) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Frontier Settlers is already tapped`,
      );
      return;
    }

    const zones = get().zones;
    const atlas = zones[ownerSeat]?.atlas || [];

    // Find topmost site in atlas
    if (atlas.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Frontier Settlers: No sites in atlas to reveal`,
      );
      return;
    }

    const topSite = atlas[0];
    const board = get().board;

    // Find valid targets: adjacent cells that are void or have Rubble
    const adjacentCells = getAdjacentCells(
      minion.at,
      board.size.w,
      board.size.h,
    );

    // A cell with no site is either a void or a Rubble tile (Rubble is a
    // permanent token) — both are legal targets. Cells holding a real site
    // are not.
    const validTargets: CellKey[] = adjacentCells.filter(
      (cellKey) => !board.sites[cellKey]?.card,
    );

    if (validTargets.length === 0) {
      get().log(
        `[${ownerSeat.toUpperCase()}] Frontier Settlers: No adjacent void or Rubble to place site`,
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
      } from atlas`,
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
          ownerSeat: pending.ownerSeat,
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

    // Remove site from atlas
    const atlas = [...(zones[ownerSeat]?.atlas || [])];
    const siteIndex = atlas.findIndex((c) => c.cardId === revealedSite.cardId);
    if (siteIndex !== -1) {
      atlas.splice(siteIndex, 1);
    }

    // Place site on board
    const ownerNum = ownerSeat === "p1" ? 1 : 2;
    const sitesNext = {
      ...board.sites,
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

    // The new site replaces any Rubble on the target tile. Rubble is a token,
    // so it is banished rather than put into a graveyard.
    const targetPermsBase = permanents[selectedTarget] || [];
    const removedRubble = findRubblePermanent(targetPermsBase);
    const targetPerms = removedRubble
      ? targetPermsBase.filter((perm) => perm !== removedRubble)
      : [...targetPermsBase];

    // Add to target
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
      board: { ...board, sites: sitesNext },
      zones: zonesNext,
      permanents: permanentsNext,
      frontierSettlersUsed: usedSet,
      pendingFrontierSettlers: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Send patches - send full zones for seat to prevent partial patch issues.
    // Only the two affected permanents cells are sent. Both the minion leaving
    // its old tile and the banished Rubble carry __remove: the merge keeps base
    // items that are simply absent from the patch, so without the marker the
    // opponent would keep a duplicate Frontier Settlers and the old Rubble.
    const sitesPatch: Record<string, unknown> = {
      [selectedTarget]: sitesNext[selectedTarget] ?? null,
    };
    const removalMarker = (perm: PermanentItem): PermanentItem =>
      ({ ...perm, __remove: true }) as unknown as PermanentItem;
    const patches: ServerPatchT = {
      board: { sites: sitesPatch } as unknown as ServerPatchT["board"],
      zones: {
        [ownerSeat]: zonesNext[ownerSeat],
      } as unknown as ServerPatchT["zones"],
      permanents: {
        [minion.at]: [...sourcePerms, removalMarker(minionPerm)],
        [selectedTarget]: removedRubble
          ? [...targetPerms, removalMarker(removedRubble)]
          : targetPerms,
      } as GameState["permanents"],
    };
    get().trySendPatch(patches);

    if (removedRubble) {
      get().log(`Rubble at ${selectedTarget} is banished`);
    }
    get().log(
      `[${ownerSeat.toUpperCase()}] Frontier Settlers plays ${
        revealedSite.name || "site"
      } and moves there`,
    );

    // Broadcast resolution
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "frontierSettlersResolve",
          id: pending.id,
          // ownerSeat and the minion id travel with the message: the server
          // patch can clear `pending` before this arrives, so the handler must
          // never read them off pendingFrontierSettlers
          ownerSeat,
          minionInstanceId: minion.instanceId,
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
      `[${pending.ownerSeat.toUpperCase()}] cancels Frontier Settlers ability`,
    );

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "frontierSettlersCancel",
          id: pending.id,
          ownerSeat: pending.ownerSeat,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
