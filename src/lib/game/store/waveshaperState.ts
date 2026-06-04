/**
 * Waveshaper Avatar Ability State
 *
 * Ability (tap): "Flood a site near your body of water until you do so again.
 *   Tap minions without submerge there. They don't untap the next time they would."
 *
 * Flow:
 *   1. Right-click the Waveshaper avatar → "Flood Site" action (ContextMenu).
 *   2. beginWaveshaperFlood() computes valid target sites (sites at/adjacent to one of
 *      the caster's water sites — its "body of water") and enters selectingTarget phase.
 *   3. The caster clicks a highlighted board tile (TileInteractionPlane → selectWaveshaperTarget).
 *   4. selectWaveshaperTarget() moves the flood (removes the previous Waveshaper flood),
 *      places a Flooded token, taps every minion there that lacks submerge, marks those
 *      minions to skip their next untap (skipNextUntap), and taps the avatar.
 *
 * "until you do so again": waveshaperFloodCells tracks the single flooded cell per seat;
 * re-using the ability removes the prior Flooded token before placing the new one.
 *
 * The skipNextUntap flag is consumed by the untap step in coreState.ts (both
 * advancePhase and _executeTurnTransition).
 */

import type { StateCreator } from "zustand";
import { detectBurrowSubmergeAbilitiesSync } from "@/lib/game/cardAbilities";
import {
  TOKEN_BY_NAME,
  isMinionToken,
  newTokenInstanceId,
  tokenSlug,
} from "@/lib/game/tokens";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CellKey,
  GameState,
  PendingWaveshaper,
  PermanentItem,
  PlayerKey,
  ServerPatchT,
} from "./types";
import { getAdjacentCells, getCellNumber } from "./utils/boardHelpers";
import { prepareCardForSeat } from "./utils/cardHelpers";
import { newPermanentInstanceId } from "./utils/idHelpers";
import { randomTilt } from "./utils/permanentHelpers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function localToast(message: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("app:toast", { detail: { message } }));
  }
}

function newResolverId(): string {
  return `waveshaper_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** A permanent is a Flooded token if its card name is "flooded". */
function isFloodedToken(perm: PermanentItem): boolean {
  return (perm.card?.name || "").toLowerCase() === "flooded";
}

/**
 * A permanent is a minion if its card type contains "minion", or it is a minion
 * token (Skeleton, Foot Soldier, Frog, Bruin, Tawny) — those carry type "Token".
 */
function isMinionPermanent(perm: PermanentItem): boolean {
  if ((perm.card?.type || "").toLowerCase().includes("minion")) return true;
  return isMinionToken(perm.card?.name);
}

export function createInitialWaveshaperFloodCells(): Record<
  PlayerKey,
  CellKey | null
> {
  return { p1: null, p2: null };
}

/**
 * Whether the site at cellKey counts as part of `who`'s "body of water":
 * a site they own that provides water — either via its printed water threshold,
 * a Flooded token, or an Atlantean Fate flood.
 */
function isWaterSiteForSeat(
  state: GameState,
  cellKey: CellKey,
  who: PlayerKey,
): boolean {
  const tile = state.board.sites[cellKey];
  if (!tile || !tile.card) return false;
  const ownerNum: 1 | 2 = who === "p1" ? 1 : 2;
  if (tile.owner !== ownerNum) return false;

  // Printed water threshold
  const waterThreshold = tile.card.thresholds?.water ?? 0;
  if (waterThreshold > 0) return true;

  // Flooded token sitting on the site
  const perms = state.permanents[cellKey] || [];
  if (perms.some(isFloodedToken)) return true;

  // Flooded by an Atlantean Fate aura
  try {
    if (state.isSiteFlooded?.(cellKey)) return true;
  } catch {}

  return false;
}

/** All sites at/adjacent to one of the caster's water sites. */
function computeFloodTargets(state: GameState, who: PlayerKey): CellKey[] {
  const board = state.board;
  const waterSites: CellKey[] = [];
  for (const cellKey of Object.keys(board.sites)) {
    if (isWaterSiteForSeat(state, cellKey as CellKey, who)) {
      waterSites.push(cellKey as CellKey);
    }
  }

  const candidates = new Set<CellKey>();
  for (const waterCell of waterSites) {
    candidates.add(waterCell);
    for (const adj of getAdjacentCells(waterCell, board.size.w, board.size.h)) {
      candidates.add(adj);
    }
  }

  // Only sites can be flooded
  return Array.from(candidates).filter((c) => !!board.sites[c]);
}

/**
 * True if a minion has the Submerge keyword (and is therefore exempt from the
 * Waveshaper tap, per "Tap minions without submerge there").
 *
 * Primary signal is the card's printed rules text, which is the authoritative
 * source for the keyword; we fall back to the name-based heuristic (which also
 * consults the ability cache) and the live submerged position state.
 */
function minionHasSubmerge(state: GameState, perm: PermanentItem): boolean {
  const text = (perm.card?.text || "").toLowerCase();
  if (text.includes("submerge")) return true;
  const name = perm.card?.name || "";
  if (detectBurrowSubmergeAbilitiesSync(name).canSubmerge) return true;
  const id = perm.instanceId || perm.card?.instanceId || "";
  if (id) {
    // Registered submerge ability (e.g. Frog tokens from Tadpole Pool,
    // Atlantean Fate forced-submerge). Tokens carry no rules text, so this is
    // the authoritative source for them.
    if (state.permanentAbilities[id]?.canSubmerge) return true;
    if (state.permanentPositions[id]?.state === "submerged") return true;
  }
  return false;
}

// ─── Slice ───────────────────────────────────────────────────────────────────

export type WaveshaperSlice = Pick<
  GameState,
  | "pendingWaveshaper"
  | "waveshaperFloodCells"
  | "beginWaveshaperFlood"
  | "selectWaveshaperTarget"
  | "cancelWaveshaperFlood"
>;

export const createWaveshaperSlice: StateCreator<
  GameState,
  [],
  [],
  WaveshaperSlice
> = (set, get) => ({
  pendingWaveshaper: null,
  waveshaperFloodCells: createInitialWaveshaperFloodCells(),

  beginWaveshaperFlood: (who: PlayerKey) => {
    const state = get();
    const avatar = state.avatars[who];

    if (!avatar?.pos) {
      get().log(`[${who.toUpperCase()}] Waveshaper has no position`);
      localToast("Avatar must be on the board");
      return;
    }

    if (avatar.tapped) {
      get().log(`[${who.toUpperCase()}] Waveshaper is already tapped`);
      localToast("Waveshaper is already tapped");
      return;
    }

    const validTargets = computeFloodTargets(state, who);
    if (validTargets.length === 0) {
      get().log(`[${who.toUpperCase()}] Waveshaper: no site near a body of water`);
      localToast("No site near your body of water to flood");
      return;
    }

    const pending: PendingWaveshaper = {
      id: newResolverId(),
      ownerSeat: who,
      phase: "selectingTarget",
      validTargets,
      createdAt: Date.now(),
    };

    set({ pendingWaveshaper: pending } as Partial<GameState> as GameState);

    get().log(
      `[${who.toUpperCase()}] Waveshaper: choose a site near your body of water to flood`,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "waveshaperBegin",
          pending,
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectWaveshaperTarget: (targetCell: CellKey) => {
    const state = get();
    const pending = state.pendingWaveshaper;

    if (!pending || pending.phase !== "selectingTarget") {
      get().log("[WAVESHAPER] No pending flood or wrong phase");
      return;
    }
    if (!pending.validTargets.includes(targetCell)) {
      get().log(`[WAVESHAPER] Invalid target: ${targetCell}`);
      return;
    }

    const who = pending.ownerSeat;
    const avatar = state.avatars[who];
    if (!avatar) {
      get().log("[WAVESHAPER] No avatar");
      return;
    }
    const ownerNum: 1 | 2 = who === "p1" ? 1 : 2;
    const board = state.board;
    const permanentsNext = { ...state.permanents };
    const changedCells: CellKey[] = [];

    // ── 1. Remove the previous Waveshaper flood ("until you do so again") ──
    const prevCell = state.waveshaperFloodCells[who];
    const removedFloodTokens: PermanentItem[] = [];
    if (prevCell) {
      const prevPerms = [...(permanentsNext[prevCell] || [])];
      const keep: PermanentItem[] = [];
      for (const perm of prevPerms) {
        if (isFloodedToken(perm)) {
          removedFloodTokens.push(perm);
        } else {
          keep.push(perm);
        }
      }
      if (removedFloodTokens.length > 0) {
        permanentsNext[prevCell] = keep;
        if (!changedCells.includes(prevCell)) changedCells.push(prevCell);
      }
    }

    // ── 2. Place a Flooded token on the new target ──
    const floodedDef = TOKEN_BY_NAME["flooded"];
    if (!floodedDef) {
      get().log("[WAVESHAPER] Flooded token definition not found");
      return;
    }
    const floodedCard = prepareCardForSeat(
      {
        cardId: newTokenInstanceId(floodedDef),
        variantId: null,
        name: floodedDef.name,
        type: "Token",
        slug: tokenSlug(floodedDef),
        thresholds: null,
      },
      who,
    );
    const targetArr = [...(permanentsNext[targetCell] || [])];

    // ── 3. Tap minions without submerge & mark them to skip their next untap ──
    let tappedCount = 0;
    for (let i = 0; i < targetArr.length; i++) {
      const perm = targetArr[i];
      if (!perm || !isMinionPermanent(perm)) continue;
      if (minionHasSubmerge(state, perm)) continue;
      targetArr[i] = {
        ...perm,
        tapped: true,
        skipNextUntap: true,
        tapVersion: (perm.tapVersion ?? 0) + 1,
        version: (perm.version ?? 0) + 1,
      };
      tappedCount++;
    }

    // Add the flood token after tapping so it isn't itself processed
    targetArr.push({
      owner: ownerNum,
      card: floodedCard,
      offset: null,
      tilt: randomTilt(),
      tapVersion: 0,
      tapped: false,
      version: 0,
      instanceId: floodedCard.instanceId ?? newPermanentInstanceId(),
    });
    permanentsNext[targetCell] = targetArr;
    if (!changedCells.includes(targetCell)) changedCells.push(targetCell);

    // ── 4. Tap the avatar ──
    const tappedAvatar = { ...avatar, tapped: true };
    const avatarsNext = {
      ...state.avatars,
      [who]: tappedAvatar,
    } as GameState["avatars"];

    const floodCellsNext = {
      ...state.waveshaperFloodCells,
      [who]: targetCell,
    };

    set({
      permanents: permanentsNext,
      avatars: avatarsNext,
      waveshaperFloodCells: floodCellsNext,
      pendingWaveshaper: null,
    } as Partial<GameState> as GameState);

    // ── 5. Patches: only changed cells + actor's own avatar ──
    const permanentsPatch: Record<string, PermanentItem[]> = {};
    for (const cell of changedCells) {
      if (cell === prevCell && removedFloodTokens.length > 0) {
        // Include __remove markers so the merge actually drops the old token
        permanentsPatch[cell] = [
          ...(permanentsNext[cell] || []),
          ...removedFloodTokens.map(
            (perm) =>
              ({ ...perm, __remove: true }) as unknown as PermanentItem,
          ),
        ];
      } else {
        permanentsPatch[cell] = permanentsNext[cell] || [];
      }
    }

    const patch: ServerPatchT = {
      permanents: permanentsPatch as GameState["permanents"],
      avatars: { [who]: tappedAvatar } as GameState["avatars"],
    };
    get().trySendPatch(patch);

    const [tx, ty] = targetCell.split(",").map(Number);
    const cellNo = getCellNumber(tx, ty, board.size.w, board.size.h);
    get().log(
      `[${who.toUpperCase()}] Waveshaper floods site at #${cellNo}` +
        (tappedCount > 0
          ? ` — ${tappedCount} minion${tappedCount !== 1 ? "s" : ""} tapped (won't untap next time)`
          : ""),
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "toast",
          text: `Waveshaper floods site at #${cellNo}`,
          seat: who,
          cellKey: targetCell,
        } as never);
        transport.sendMessage({
          type: "waveshaperResolve",
          ownerSeat: who,
          targetCell,
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  cancelWaveshaperFlood: () => {
    const pending = get().pendingWaveshaper;
    if (!pending) return;

    set({ pendingWaveshaper: null } as Partial<GameState> as GameState);

    get().log(`[${pending.ownerSeat.toUpperCase()}] Waveshaper flood cancelled`);

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "waveshaperCancel",
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
