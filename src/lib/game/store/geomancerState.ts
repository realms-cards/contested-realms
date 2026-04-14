/**
 * Geomancer Avatar Ability State
 *
 * Ability 1 (passive trigger): "If you played an earth site, fill a void adjacent to you with Rubble."
 *   - Triggers automatically after playing a site with earth threshold
 *   - Shows overlay to pick an adjacent void tile to fill with Rubble token
 *
 * Ability 2 (tap): "Replace an adjacent Rubble with the topmost site of your atlas."
 *   - Right-click action on Geomancer avatar
 *   - Targets adjacent Rubble permanent tokens
 *   - Removes Rubble, places top atlas site, taps avatar
 *
 * IMPORTANT: Rubble is stored as a permanent token (in `permanents[cellKey]`),
 * NOT as a site in `board.sites`. Created via `TOKEN_BY_NAME["rubble"]`.
 */

import type { StateCreator } from "zustand";
import {
  TOKEN_BY_NAME,
  newTokenInstanceId,
  tokenSlug,
} from "@/lib/game/tokens";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CellKey,
  GameState,
  PlayerKey,
  CardRef,
  PermanentItem,
  ServerPatchT,
} from "./types";
import {
  getAdjacentCells,
  ownerFromSeat,
  getCellNumber,
} from "./utils/boardHelpers";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { newPermanentInstanceId } from "./utils/idHelpers";
import { randomTilt } from "./utils/permanentHelpers";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GeomancerPhase = "selectingTarget" | "complete";

export type PendingGeomancerPlay = {
  id: string;
  ownerSeat: PlayerKey;
  phase: GeomancerPhase;
  topSite: CardRef | null;
  validTargets: CellKey[];
  createdAt: number;
};

export type PendingGeomancerFill = {
  id: string;
  ownerSeat: PlayerKey;
  validTargets: CellKey[];
  createdAt: number;
};

export type GeomancerSlice = Pick<
  GameState,
  | "pendingGeomancerPlay"
  | "geomancerRubbleUsed"
  | "beginGeomancerRubble"
  | "selectGeomancerTarget"
  | "cancelGeomancerPlay"
  | "pendingGeomancerFill"
  | "beginGeomancerFill"
  | "selectGeomancerFillTarget"
  | "cancelGeomancerFill"
>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Show a toast only on the local client (not broadcast to opponent) */
function localToast(message: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app:toast", { detail: { message } }));
  }
}

function newResolverId(): string {
  return `geomancer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Check if a permanent is a Rubble token */
function isRubblePermanent(perm: PermanentItem): boolean {
  const name = (perm.card?.name || "").toLowerCase();
  return name === "rubble";
}

/** Find the index of a Rubble permanent in a cell's permanent list */
function findRubbleIndex(perms: PermanentItem[]): number {
  return perms.findIndex(isRubblePermanent);
}

export function createInitialGeomancerRubbleUsed(): Record<PlayerKey, boolean> {
  return { p1: false, p2: false };
}

// ─── Slice ───────────────────────────────────────────────────────────────────

export const createGeomancerSlice: StateCreator<
  GameState,
  [],
  [],
  GeomancerSlice
> = (set, get) => ({
  pendingGeomancerPlay: null,
  geomancerRubbleUsed: createInitialGeomancerRubbleUsed(),
  pendingGeomancerFill: null,

  // ── Ability 2: Replace adjacent Rubble with top atlas site ──────────────

  beginGeomancerRubble: (who: PlayerKey) => {
    const state = get();
    const avatar = state.avatars[who];

    if (!avatar) {
      get().log(`[${who.toUpperCase()}] No avatar found`);
      return;
    }

    if (avatar.tapped) {
      get().log(`[${who.toUpperCase()}] Geomancer is already tapped`);
      localToast("Geomancer is already tapped");
      return;
    }

    if (state.geomancerRubbleUsed[who]) {
      get().log(
        `[${who.toUpperCase()}] Geomancer rubble ability already used this turn`,
      );
      localToast("Geomancer ability already used this turn");
      return;
    }

    const atlas = state.zones[who]?.atlas || [];
    if (atlas.length === 0) {
      get().log(`[${who.toUpperCase()}] No sites in atlas`);
      localToast("No sites remaining in atlas");
      return;
    }

    const topSite = atlas[0];

    const avatarPos = avatar.pos;
    if (!avatarPos) {
      get().log(`[${who.toUpperCase()}] Avatar has no position`);
      return;
    }

    const [ax, ay] = avatarPos;
    const avatarCellKey = `${ax},${ay}` as CellKey;
    const board = state.board;
    const adjacentCells = getAdjacentCells(
      avatarCellKey,
      board.size.w,
      board.size.h,
    );

    // Rubble is stored as permanent tokens
    // Include the avatar's own cell — Rubble can share the same tile as the avatar
    const validTargets: CellKey[] = [];
    for (const cellKey of [avatarCellKey, ...adjacentCells]) {
      const perms = state.permanents[cellKey] || [];
      if (findRubbleIndex(perms) >= 0) {
        validTargets.push(cellKey);
      }
    }

    console.log("[GEOMANCER] beginGeomancerRubble:", {
      who,
      avatarPos,
      avatarCellKey,
      adjacentCells,
      rubbleFound: validTargets,
    });

    if (validTargets.length === 0) {
      get().log(`[${who.toUpperCase()}] No adjacent Rubble tiles`);
      localToast("No adjacent Rubble tiles to replace");
      return;
    }

    const pending: PendingGeomancerPlay = {
      id: newResolverId(),
      ownerSeat: who,
      phase: "selectingTarget",
      topSite,
      validTargets,
      createdAt: Date.now(),
    };

    set({ pendingGeomancerPlay: pending });

    get().log(
      `[${who.toUpperCase()}] Geomancer selecting target to replace Rubble with ${topSite.name}`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "geomancerBegin",
          pending,
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectGeomancerTarget: (targetCell: CellKey) => {
    const state = get();
    const pending = state.pendingGeomancerPlay;

    if (!pending || pending.phase !== "selectingTarget") {
      get().log("[GEOMANCER] No pending play or wrong phase");
      return;
    }

    if (!pending.validTargets.includes(targetCell)) {
      get().log(`[GEOMANCER] Invalid target: ${targetCell}`);
      return;
    }

    const who = pending.ownerSeat;
    const topSite = pending.topSite;
    if (!topSite) {
      get().log("[GEOMANCER] No top site");
      return;
    }

    const avatar = state.avatars[who];
    if (!avatar) {
      get().log("[GEOMANCER] No avatar");
      return;
    }

    const zones = state.zones;
    const atlas = zones[who]?.atlas || [];
    const board = state.board;
    const ownerNum: 1 | 2 = who === "p1" ? 1 : 2;

    // Remove top site from atlas
    const newAtlas = atlas.slice(1);

    // Remove Rubble permanent from the target cell (tokens are banished, not graveyarded)
    const cellPerms = [...(state.permanents[targetCell] || [])];
    const rubbleIdx = findRubbleIndex(cellPerms);
    if (rubbleIdx >= 0) {
      cellPerms.splice(rubbleIdx, 1);
    }
    const permanentsNext = {
      ...state.permanents,
      [targetCell]: cellPerms,
    };

    // Only update actor's own atlas
    const updatedZones: GameState["zones"] = {
      ...zones,
      [who]: {
        ...zones[who],
        atlas: newAtlas,
      },
    };

    // Place new site at target
    const newSites = {
      ...board.sites,
      [targetCell]: {
        owner: ownerNum,
        card: {
          ...topSite,
          instanceId:
            topSite.instanceId ||
            `geomancer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        },
        tapped: false,
      },
    };

    // Tap the avatar
    const tappedAvatar = { ...avatar, tapped: true };
    const newAvatars = {
      ...state.avatars,
      [who]: tappedAvatar,
    };

    // Mark ability as used
    const updatedUsed = { ...state.geomancerRubbleUsed, [who]: true };

    set({
      zones: updatedZones,
      board: { ...board, sites: newSites },
      avatars: newAvatars,
      permanents: permanentsNext,
      geomancerRubbleUsed: updatedUsed,
      pendingGeomancerPlay: null,
    } as Partial<GameState> as GameState);

    // Only send actor's own avatar in the patch to avoid
    // "Cannot tap or untap opponent avatar" server rejection
    const patchAvatars = { [who]: tappedAvatar } as GameState["avatars"];

    const sitesPatch: Record<string, unknown> = {
      [targetCell]: newSites[targetCell] ?? null,
    };

    // Build permanents patch with __remove marker for rubble so
    // mergePermanentsMap on the opponent's side actually removes it
    // (without __remove, the merge keeps base items not in the patch)
    // Only send the affected cell, not the entire permanents map
    const rubblePerms = state.permanents[targetCell] || [];
    const rubblePerm = rubblePerms.find(isRubblePermanent);
    const patchCellPerms = rubblePerm
      ? [...cellPerms, { ...rubblePerm, __remove: true }]
      : cellPerms;
    const permanentsPatch = {
      [targetCell]: patchCellPerms,
    };

    const patches: ServerPatchT = {
      board: { sites: sitesPatch } as unknown as ServerPatchT["board"],
      zones: {
        [who]: updatedZones[who],
      } as unknown as ServerPatchT["zones"],
      avatars: patchAvatars,
      permanents: permanentsPatch,
      geomancerRubbleUsed: updatedUsed,
    };

    get().trySendPatch(patches);

    get().log(
      `[${who.toUpperCase()}] Geomancer replaces Rubble with ${topSite.name} at ${targetCell}`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "toast",
          text: `Geomancer replaces Rubble with ${topSite.name}`,
          seat: who,
          cellKey: targetCell,
        } as never);
        transport.sendMessage({
          type: "geomancerResolve",
          targetCell,
          topSite,
          ownerSeat: who,
          atlasCount: newAtlas.length,
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  cancelGeomancerPlay: () => {
    const pending = get().pendingGeomancerPlay;
    if (!pending) return;

    set({ pendingGeomancerPlay: null });

    get().log(
      `[${pending.ownerSeat.toUpperCase()}] Geomancer rubble play cancelled`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "geomancerCancel",
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  // ── Ability 1: Fill adjacent void with Rubble after playing earth site ──

  beginGeomancerFill: (who: PlayerKey) => {
    const state = get();
    const avatar = state.avatars[who];

    if (!avatar?.pos) {
      get().log(`[${who.toUpperCase()}] Geomancer has no position`);
      return;
    }

    const [ax, ay] = avatar.pos;
    const avatarCellKey = `${ax},${ay}` as CellKey;
    const board = state.board;
    const adjacentCells = getAdjacentCells(
      avatarCellKey,
      board.size.w,
      board.size.h,
    );

    // Valid targets: adjacent void tiles (no site AND no rubble permanent)
    const validTargets: CellKey[] = [];
    for (const cellKey of adjacentCells) {
      const hasSite = !!board.sites[cellKey];
      if (hasSite) continue;
      // Also skip if there's already a Rubble permanent there
      const perms = state.permanents[cellKey] || [];
      if (findRubbleIndex(perms) >= 0) continue;
      validTargets.push(cellKey);
    }

    if (validTargets.length === 0) {
      get().log(`[${who.toUpperCase()}] Geomancer: no adjacent voids to fill`);
      return;
    }

    // If exactly one valid target, auto-place
    if (validTargets.length === 1) {
      placeRubbleAt(validTargets[0], who, get, set);
      return;
    }

    const pending: PendingGeomancerFill = {
      id: newResolverId(),
      ownerSeat: who,
      validTargets,
      createdAt: Date.now(),
    };

    set({ pendingGeomancerFill: pending });

    get().log(
      `[${who.toUpperCase()}] Geomancer: choose a void to fill with Rubble`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "geomancerFillBegin",
          pending,
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectGeomancerFillTarget: (targetCell: CellKey) => {
    const state = get();
    const pending = state.pendingGeomancerFill;
    if (!pending) return;

    if (!pending.validTargets.includes(targetCell)) {
      get().log(`[GEOMANCER] Invalid fill target: ${targetCell}`);
      return;
    }

    placeRubbleAt(targetCell, pending.ownerSeat, get, set);
  },

  cancelGeomancerFill: () => {
    const pending = get().pendingGeomancerFill;
    if (!pending) return;

    set({ pendingGeomancerFill: null });

    get().log(`[${pending.ownerSeat.toUpperCase()}] Geomancer fill cancelled`);

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "geomancerFillCancel",
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});

// ─── Shared rubble placement logic ───────────────────────────────────────────

function placeRubbleAt(
  targetCell: CellKey,
  who: PlayerKey,
  get: () => GameState,
  set: (
    partial: Partial<GameState> | ((state: GameState) => Partial<GameState>),
  ) => void,
) {
  const state = get();
  const board = state.board;
  const ownerNum = ownerFromSeat(who);

  const rubbleDef = TOKEN_BY_NAME["rubble"];
  if (!rubbleDef) {
    get().log("[GEOMANCER] Rubble token definition not found");
    return;
  }

  const rubbleCard = prepareCardForSeat(
    {
      cardId: newTokenInstanceId(rubbleDef),
      variantId: null,
      name: rubbleDef.name,
      type: "Token",
      slug: tokenSlug(rubbleDef),
      thresholds: null,
    },
    who,
  );

  const permanentsNext = { ...state.permanents };
  const arr = [...(permanentsNext[targetCell] || [])];
  arr.push({
    owner: ownerNum,
    card: rubbleCard,
    offset: null,
    tilt: randomTilt(),
    tapVersion: 0,
    tapped: false,
    version: 0,
    instanceId: rubbleCard.instanceId ?? newPermanentInstanceId(),
  });
  permanentsNext[targetCell] = arr;

  const [tx, ty] = targetCell.split(",").map(Number);
  const cellNo = getCellNumber(tx, ty, board.size.w, board.size.h);
  const playerNum = who === "p1" ? "1" : "2";

  get().log(
    `[p${playerNum}:PLAYER] Geomancer fills void at #${cellNo} with [p${playerNum}card:Rubble]`,
  );

  set({
    permanents: permanentsNext,
    pendingGeomancerFill: null,
  } as Partial<GameState> as GameState);

  // Send patch — only the affected cell, not the entire permanents map
  const patches: ServerPatchT = {
    permanents: { [targetCell]: arr } as GameState["permanents"],
  };
  get().trySendPatch(patches);

  // Broadcast
  const transport = get().transport;
  if (transport?.sendMessage) {
    try {
      transport.sendMessage({
        type: "toast",
        text: `Geomancer fills void at #${cellNo} with Rubble`,
        seat: who,
        cellKey: targetCell,
      } as never);
      transport.sendMessage({
        type: "geomancerFillResolve",
        targetCell,
        ownerSeat: who,
      } as unknown as CustomMessage);
    } catch {}
  }
}
