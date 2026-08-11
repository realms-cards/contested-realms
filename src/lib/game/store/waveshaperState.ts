/**
 * Waveshaper Avatar Ability State
 *
 * Ability (tap): "Flood a site near your body of water until you do so again.
 *   Tap minions without submerge there. They don't untap the next time they would."
 *
 * Flow:
 *   1. Right-click the Waveshaper avatar → "Flood Site" action (ContextMenu).
 *   2. beginWaveshaperFlood() computes valid target sites (sites at/adjacent to the
 *      caster's body of water — the contiguous group of water sites, any owner,
 *      containing at least one water site they own) and enters selectingTarget phase.
 *   3. The caster clicks a highlighted board tile (TileInteractionPlane → selectWaveshaperTarget).
 *   4. selectWaveshaperTarget() moves the flood (removes the previous Waveshaper flood),
 *      places a Flooded token, taps every minion there that lacks submerge, marks those
 *      minions to skip their next untap (skipNextUntap), and taps the avatar.
 *
 * "until you do so again": waveshaperFloodCells tracks the single flooded cell per seat;
 * re-using the ability removes the prior Flooded token before placing the new one.
 *
 * Rubble counts as a site (it is a permanent token, not a board.sites entry) and so
 * can be flooded, and a flooded Rubble extends the body of water. Sites that can't be
 * modified (Bedrock, Bluecap Knockers' site) stay targetable — their minions tap — but
 * the flood never lands there, so the previous flood stays put.
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
import { siteIsAlreadyWater } from "./realmFloodState";
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

/** A permanent is a Rubble token if its card name is "rubble". */
function isRubblePermanent(perm: PermanentItem): boolean {
  return (perm.card?.name || "").toLowerCase() === "rubble";
}

/**
 * Whether the cell holds a site that can be flooded.
 *
 * Rubble is still a site, but it lives in `permanents[cellKey]` as a
 * siteReplacement token rather than in `board.sites` (see geomancerState.ts),
 * so a `board.sites` lookup alone would miss it.
 */
function hasSiteAt(state: GameState, cellKey: CellKey): boolean {
  if (state.board.sites[cellKey]?.card) return true;
  return (state.permanents[cellKey] || []).some(isRubblePermanent);
}

/** Owner of the site occupying a cell (site tile, or the Rubble token on it). */
function siteOwnerAt(state: GameState, cellKey: CellKey): 1 | 2 | null {
  const tile = state.board.sites[cellKey];
  if (tile?.card) return tile.owner;
  const rubble = (state.permanents[cellKey] || []).find(isRubblePermanent);
  return rubble ? rubble.owner : null;
}

/**
 * "Can't be modified" sites (Bedrock, a site occupied by Bluecap Knockers)
 * can still be chosen as the target — the minions there are tapped — but the
 * flood itself never applies, so no Flooded token is placed.
 *
 * Rules text is the authoritative signal; the name check is a fallback for
 * board cards whose full text was not hydrated.
 */
function isFloodProtectedSite(state: GameState, cellKey: CellKey): boolean {
  const siteCard = state.board.sites[cellKey]?.card;
  const text = (siteCard?.text || "").toLowerCase().replace(/’/g, "'");
  if (text.includes("can't be modified")) return true;
  if (text.includes("destroyed, or modified")) return true;
  if ((siteCard?.name || "").toLowerCase() === "bedrock") return true;

  // "Bluecap Knockers' site can't be moved, destroyed, or modified."
  return (state.permanents[cellKey] || []).some(
    (perm) => (perm.card?.name || "").toLowerCase() === "bluecap knockers",
  );
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
 * Whether the site at cellKey is a water site (any owner) — it provides water
 * via its printed water threshold, a Flooded token, or an Atlantean Fate flood.
 *
 * A flooded Rubble counts too: it is a site (held as a permanent, not in
 * `board.sites`) carrying a Flooded token, so it extends the body of water.
 */
function isWaterSite(state: GameState, cellKey: CellKey): boolean {
  if (!hasSiteAt(state, cellKey)) return false;

  // Printed water threshold
  const waterThreshold =
    state.board.sites[cellKey]?.card?.thresholds?.water ?? 0;
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

/**
 * All sites at/adjacent to the caster's body of water.
 *
 * A body of water is a contiguous (orthogonally connected) group of water
 * sites regardless of owner. "Your body of water" is any such group that
 * contains at least one water site you own — so opponent water sites count
 * when they are connected to yours.
 */
function computeFloodTargets(state: GameState, who: PlayerKey): CellKey[] {
  const board = state.board;
  const ownerNum: 1 | 2 = who === "p1" ? 1 : 2;

  // All water sites on the board, any owner. Rubble sites live in `permanents`
  // rather than `board.sites`, so both maps are scanned.
  const waterSites = new Set<CellKey>();
  const occupiedCells = new Set<CellKey>([
    ...(Object.keys(board.sites) as CellKey[]),
    ...(Object.keys(state.permanents) as CellKey[]),
  ]);
  for (const cellKey of occupiedCells) {
    if (isWaterSite(state, cellKey)) {
      waterSites.add(cellKey);
    }
  }

  // Flood-fill from the caster's own water sites across connected water sites.
  // A water site counts as "yours" when you own the site, or when the water
  // itself is yours (your Flooded token on someone else's site or on Rubble).
  const bodyOfWater = new Set<CellKey>();
  const queue: CellKey[] = [];
  for (const cell of waterSites) {
    const ownsWater =
      siteOwnerAt(state, cell) === ownerNum ||
      (state.permanents[cell] || []).some(
        (perm) => isFloodedToken(perm) && perm.owner === ownerNum,
      );
    if (ownsWater) {
      bodyOfWater.add(cell);
      queue.push(cell);
    }
  }
  while (queue.length > 0) {
    const cell = queue.pop() as CellKey;
    for (const adj of getAdjacentCells(cell, board.size.w, board.size.h)) {
      if (waterSites.has(adj) && !bodyOfWater.has(adj)) {
        bodyOfWater.add(adj);
        queue.push(adj);
      }
    }
  }

  const candidates = new Set<CellKey>();
  for (const waterCell of bodyOfWater) {
    candidates.add(waterCell);
    for (const adj of getAdjacentCells(waterCell, board.size.w, board.size.h)) {
      candidates.add(adj);
    }
  }

  // Only sites can be flooded (Rubble included — it is a site)
  return Array.from(candidates).filter((c) => hasSiteAt(state, c));
}

/**
 * True if a minion has the Submerge keyword (and is therefore exempt from the
 * Waveshaper tap, per "Tap minions without submerge there").
 *
 * Primary signal is the card's printed rules text, which is the authoritative
 * source for the keyword; we fall back to the name-based heuristic (which also
 * consults the ability cache) and the live submerged position state.
 */
function minionHasSubmerge(
  state: GameState,
  perm: PermanentItem,
  cellKey: CellKey,
  index: number,
): boolean {
  const text = (perm.card?.text || "").toLowerCase();
  if (text.includes("submerge")) return true;
  const name = perm.card?.name || "";
  if (detectBurrowSubmergeAbilitiesSync(name).canSubmerge) return true;
  // Position/ability state is keyed by instanceId, falling back to the same
  // `perm:${cell}:${index}` key the board UI uses for id-less permanents.
  const ids = [
    perm.instanceId || perm.card?.instanceId || "",
    perm.instanceId ? "" : `perm:${cellKey}:${index}`,
  ].filter(Boolean);
  for (const id of ids) {
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

    // A site that can't be modified (Bedrock, Bluecap Knockers' site) or that
    // is already water is still a legal target — the minions there tap — but
    // the flood never lands, so the existing flood stays where it is
    // ("until you do so again" never happens).
    const blockReason = siteIsAlreadyWater(
      state.board.sites[targetCell]?.card,
      state.permanents[targetCell],
    )
      ? "is already a water site"
      : isFloodProtectedSite(state, targetCell)
        ? "can't be modified"
        : null;
    const floodBlocked = blockReason !== null;

    // ── 1. Remove the previous Waveshaper flood ("until you do so again") ──
    const prevCell = floodBlocked ? null : state.waveshaperFloodCells[who];
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
      if (minionHasSubmerge(state, perm, targetCell, i)) continue;
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
    if (!floodBlocked) {
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
    }
    permanentsNext[targetCell] = targetArr;
    if (!changedCells.includes(targetCell)) changedCells.push(targetCell);

    // ── 4. Tap the avatar ──
    const tappedAvatar = { ...avatar, tapped: true };
    const avatarsNext = {
      ...state.avatars,
      [who]: tappedAvatar,
    } as GameState["avatars"];

    const floodCellsNext = floodBlocked
      ? state.waveshaperFloodCells
      : {
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
    const tappedSuffix =
      tappedCount > 0
        ? ` — ${tappedCount} minion${tappedCount !== 1 ? "s" : ""} tapped (won't untap next time)`
        : "";
    get().log(
      (blockReason
        ? `[${who.toUpperCase()}] Waveshaper: site at #${cellNo} ${blockReason}, so it isn't flooded`
        : `[${who.toUpperCase()}] Waveshaper floods site at #${cellNo}`) +
        tappedSuffix,
    );

    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "toast",
          text: floodBlocked
            ? `Waveshaper: site at #${cellNo} can't be flooded`
            : `Waveshaper floods site at #${cellNo}`,
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
