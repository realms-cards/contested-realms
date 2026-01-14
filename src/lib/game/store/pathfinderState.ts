/**
 * Pathfinder Avatar Ability State
 *
 * Pathfinder: Atlas can't contain duplicates. Draw no sites during setup.
 * Tap → Reveal and play the topmost site of your atlas to an adjacent void or Rubble and move there.
 *
 * This module handles the interactive flow for the Pathfinder tap ability:
 * 1. Player taps Pathfinder avatar
 * 2. Valid target tiles (adjacent void or Rubble) are highlighted
 * 3. Player clicks a target tile
 * 4. Top site from atlas is placed there, avatar moves to that tile
 */

import type { StateCreator } from "zustand";
import { isPathfinder } from "@/lib/game/avatarAbilities";
import type {
  CellKey,
  GameState,
  PlayerKey,
  CardRef,
} from "@/lib/game/store/types";

export type PathfinderPhase = "selectingTarget" | "complete";

export type PendingPathfinderPlay = {
  id: string;
  ownerSeat: PlayerKey;
  phase: PathfinderPhase;
  topSite: CardRef | null; // The site that will be played
  validTargets: CellKey[]; // Adjacent void or Rubble tiles
  createdAt: number;
};

export type PathfinderSlice = {
  pendingPathfinderPlay: PendingPathfinderPlay | null;
  pathfinderUsed: Record<PlayerKey, boolean>;
  beginPathfinderPlay: (who: PlayerKey) => void;
  selectPathfinderTarget: (targetCell: CellKey) => void;
  cancelPathfinderPlay: () => void;
};

function newResolverId(): string {
  return `pathfinder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Get adjacent cells (orthogonal only) to a position
 */
function getAdjacentCells(
  x: number,
  y: number,
  boardWidth: number,
  boardHeight: number
): CellKey[] {
  const cells: CellKey[] = [];
  const directions = [
    [0, -1], // up
    [0, 1], // down
    [-1, 0], // left
    [1, 0], // right
  ];
  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < boardWidth && ny >= 0 && ny < boardHeight) {
      cells.push(`${nx},${ny}` as CellKey);
    }
  }
  return cells;
}

/**
 * Check if a site is Rubble
 */
function isRubble(siteName: string | null | undefined): boolean {
  if (!siteName) return false;
  return siteName.toLowerCase().includes("rubble");
}

export function createInitialPathfinderUsed(): Record<PlayerKey, boolean> {
  return { p1: false, p2: false };
}

export const createPathfinderSlice: StateCreator<
  GameState,
  [],
  [],
  PathfinderSlice
> = (set, get) => ({
  pendingPathfinderPlay: null,
  pathfinderUsed: createInitialPathfinderUsed(),

  beginPathfinderPlay: (who: PlayerKey) => {
    const state = get();

    // Check if avatar is Pathfinder
    const avatar = state.avatars[who];
    if (!avatar || !isPathfinder(avatar.card?.name)) {
      get().log(`[${who.toUpperCase()}] Avatar is not Pathfinder`);
      return;
    }

    // Check if avatar is tapped (can't use if already tapped)
    if (avatar.tapped) {
      get().log(`[${who.toUpperCase()}] Pathfinder is already tapped`);
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "toast",
            text: `Pathfinder is already tapped`,
            seat: who,
          } as never);
        } catch {}
      }
      return;
    }

    // Check if already used this turn
    if (state.pathfinderUsed[who]) {
      get().log(`[${who.toUpperCase()}] Pathfinder ability already used`);
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "toast",
            text: `Pathfinder ability already used this turn`,
            seat: who,
          } as never);
        } catch {}
      }
      return;
    }

    // Check if atlas has any sites
    const atlas = state.zones[who]?.atlas || [];
    if (atlas.length === 0) {
      get().log(`[${who.toUpperCase()}] No sites in atlas`);
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "toast",
            text: `No sites remaining in atlas`,
            seat: who,
          } as never);
        } catch {}
      }
      return;
    }

    // Get top site from atlas
    const topSite = atlas[0];

    // Get avatar position
    const avatarPos = avatar.pos;
    if (!avatarPos) {
      get().log(`[${who.toUpperCase()}] Avatar has no position`);
      return;
    }

    // Find valid targets: adjacent void or Rubble tiles
    // avatarPos is [x, y] tuple, not a string
    const [ax, ay] = avatarPos;
    const board = state.board;
    const adjacentCells = getAdjacentCells(ax, ay, board.size.w, board.size.h);

    const validTargets: CellKey[] = [];
    for (const cellKey of adjacentCells) {
      const site = board.sites[cellKey];
      // Valid if void (no site) or Rubble
      if (!site || isRubble(site.card?.name)) {
        validTargets.push(cellKey);
      }
    }

    if (validTargets.length === 0) {
      get().log(
        `[${who.toUpperCase()}] No valid target tiles (void or Rubble)`
      );
      const transport = get().transport;
      if (transport?.sendMessage) {
        try {
          transport.sendMessage({
            type: "toast",
            text: `No adjacent void or Rubble tiles`,
            seat: who,
          } as never);
        } catch {}
      }
      return;
    }

    const pending: PendingPathfinderPlay = {
      id: newResolverId(),
      ownerSeat: who,
      phase: "selectingTarget",
      topSite,
      validTargets,
      createdAt: Date.now(),
    };

    set({ pendingPathfinderPlay: pending });

    get().log(
      `[${who.toUpperCase()}] Pathfinder selecting target for ${topSite.name}`
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pathfinderBegin",
          pending,
        } as never);
      } catch {}
    }
  },

  selectPathfinderTarget: (targetCell: CellKey) => {
    const state = get();
    const pending = state.pendingPathfinderPlay;

    if (!pending || pending.phase !== "selectingTarget") {
      get().log("[PATHFINDER] No pending play or wrong phase");
      return;
    }

    if (!pending.validTargets.includes(targetCell)) {
      get().log(`[PATHFINDER] Invalid target: ${targetCell}`);
      return;
    }

    const who = pending.ownerSeat;
    const topSite = pending.topSite;
    if (!topSite) {
      get().log("[PATHFINDER] No top site");
      return;
    }

    const avatar = state.avatars[who];
    if (!avatar) {
      get().log("[PATHFINDER] No avatar");
      return;
    }

    const zones = state.zones;
    const atlas = zones[who]?.atlas || [];
    const board = state.board;
    const ownerNum: 1 | 2 = who === "p1" ? 1 : 2;

    // Remove top site from atlas
    const newAtlas = atlas.slice(1);

    // Check if there's Rubble at target - if so, it gets replaced
    const existingSite = board.sites[targetCell];
    const isReplacingRubble = existingSite && isRubble(existingSite.card?.name);

    // Place site at target
    const newSites = {
      ...board.sites,
      [targetCell]: {
        owner: ownerNum,
        card: {
          ...topSite,
          instanceId:
            topSite.instanceId ||
            `pathfinder_${Date.now()}_${Math.random()
              .toString(36)
              .slice(2, 6)}`,
        },
        tapped: false,
      },
    };

    // Move avatar to target - parse CellKey "x,y" to [x, y] tuple
    const [targetX, targetY] = targetCell.split(",").map(Number) as [
      number,
      number
    ];
    const newAvatars = {
      ...state.avatars,
      [who]: {
        ...avatar,
        pos: [targetX, targetY] as [number, number],
        tapped: true, // Tap the avatar
      },
    };

    // Update zones
    const updatedZones = {
      ...zones,
      [who]: {
        ...zones[who],
        atlas: newAtlas,
      },
    };

    // Mark ability as used
    const updatedUsed = { ...state.pathfinderUsed, [who]: true };

    set({
      zones: updatedZones,
      board: { ...board, sites: newSites },
      avatars: newAvatars,
      pathfinderUsed: updatedUsed,
      pendingPathfinderPlay: null,
    } as Partial<GameState> as GameState);

    get().trySendPatch({
      zones: { [who]: updatedZones[who] } as GameState["zones"],
      board: { ...board, sites: newSites },
      avatars: newAvatars,
      pathfinderUsed: updatedUsed,
    });

    const actionDesc = isReplacingRubble
      ? `replaces Rubble with ${topSite.name}`
      : `places ${topSite.name}`;
    get().log(
      `[${who.toUpperCase()}] Pathfinder ${actionDesc} at ${targetCell} and moves there`
    );

    // Send toast
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "toast",
          text: `Pathfinder plays ${topSite.name} and moves there`,
          seat: who,
          cellKey: targetCell,
        } as never);
        // Broadcast resolution
        transport.sendMessage({
          type: "pathfinderResolve",
          targetCell,
          topSite,
        } as never);
      } catch {}
    }
  },

  cancelPathfinderPlay: () => {
    const pending = get().pendingPathfinderPlay;
    if (!pending) return;

    set({ pendingPathfinderPlay: null });

    get().log(`[${pending.ownerSeat.toUpperCase()}] Pathfinder play cancelled`);

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "pathfinderCancel",
        } as never);
      } catch {}
    }
  },
});
