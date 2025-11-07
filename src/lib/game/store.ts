import { create, type StateCreator } from "zustand";
import type {
  InteractionEnvelope,
  InteractionGrant,
  InteractionGrantRequest,
  InteractionDecision,
  InteractionMessage,
  InteractionRequestMessage,
  InteractionResponseMessage,
  InteractionRequestKind,
  InteractionResultMessage,
} from "@/lib/net/interactions";
import {
  wrapInteractionMessage,
  grantFromRequest,
  generateInteractionRequestId,
  createInteractionRequest,
  createInteractionResponse,
} from "@/lib/net/interactions";
import type { GameTransport, CustomMessage } from "@/lib/net/transport";
import type {
  AvatarState,
  BoardPingEvent,
  BoardSize,
  BoardState,
  CardRef,
  CellKey,
  GameEvent,
  GameState,
  InteractionRecordStatus,
  InteractionRequestEntry,
  InteractionResponseOptions,
  InteractionStateMap,
  Permanents,
  PermanentItem,
  Phase,
  PlayerKey,
  PlayerState,
  RemoteCursorState,
  ServerPatchT,
  SendInteractionRequestInput,
  SerializedGame,
  SiteTile,
  Thresholds,
  Zones,
} from "./store/types";
import {
  BOARD_PING_LIFETIME_MS,
  BOARD_PING_MAX_HISTORY,
} from "./store/types";
import type { PlayerPositionReference } from "./types";
import {
  createEmptyZonesRecord,
  normalizeZones,
} from "./store/utils/zoneHelpers";
import {
  bumpPermanentVersion,
  ensurePermanentVersion,
  normalizePermanentsRecord,
} from "./store/utils/permanentHelpers";
import {
  cloneCardForPatch,
  clonePatchForQueue,
  deepMergeReplaceArrays,
  mergePermanentsMap,
  type PermanentDeltaUpdate,
} from "./store/utils/patchHelpers";
import {
  createDefaultPlayerPositions,
  normalizePlayerPositions,
} from "./store/utils/positionHelpers";
import {
  createDefaultAvatars,
  normalizeAvatars,
} from "./store/utils/avatarHelpers";
import { mergeEvents } from "./store/utils/eventHelpers";
import { computeAvailableMana, computeThresholdTotals } from "./store/utils/resourceHelpers";
import {
  clearSnapshotsStorageFor,
  loadSnapshotsFromStorageFor,
  saveSnapshotsToStorageFor,
} from "./store/utils/snapshotHelpers";
import { createEventSlice } from "./store/eventState";
import { createDialogSlice } from "./store/dialogState";
import { createUiSlice } from "./store/uiState";
import { createBoardUiSlice } from "./store/boardUiState";
import { createBoardSlice } from "./store/boardState";
import { createHistorySlice } from "./store/historyState";
import { createCoreSlice } from "./store/coreState";
import { createResourceSlice } from "./store/resourceState";
import { createPermanentSlice } from "./store/permanentState";
import { createPositionSlice } from "./store/positionState";
import { createAvatarSlice } from "./store/avatarState";
import { createZoneSlice } from "./store/zoneState";
import { createPreferenceSlice } from "./store/preferenceState";
import { createCardMetaSlice } from "./store/cardMetaState";
import { createSessionSlice } from "./store/sessionState";
import { createRemoteCursorSlice } from "./store/remoteCursorState";
import {
  createTransportSlice,
  filterEchoPatchIfAny,
  setTransportStateAccessor,
} from "./store/transportState";
import { handleCustomMessage } from "./store/customMessageHandlers";
import { createInteractionSlice } from "./store/interactionState";
import { createGameActionsSlice } from "./store/gameActions";

function normalizeGrantRequest(
  candidate: unknown
): InteractionGrantRequest | null {
  if (!candidate || typeof candidate !== "object") return null;
  const src = candidate as Record<string, unknown>;
  const normalized: InteractionGrantRequest = {};
  if ("targetSeat" in src) {
    const seat = src.targetSeat;
    if (seat === "p1" || seat === "p2" || seat === null) {
      normalized.targetSeat = seat;
    }
  }
  if (typeof src.expiresAt === "number" && Number.isFinite(src.expiresAt)) {
    normalized.expiresAt = src.expiresAt;
  }
  if (typeof src.singleUse === "boolean") {
    normalized.singleUse = src.singleUse;
  }
  if (typeof src.allowOpponentZoneWrite === "boolean") {
    normalized.allowOpponentZoneWrite = src.allowOpponentZoneWrite;
  }
  if (typeof src.allowRevealOpponentHand === "boolean") {
    normalized.allowRevealOpponentHand = src.allowRevealOpponentHand;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function pickNextPendingInteraction(
  log: InteractionStateMap
): InteractionRequestEntry | null {
  let selected: InteractionRequestEntry | null = null;
  for (const entry of Object.values(log)) {
    if (!entry || entry.status !== "pending") continue;
    if (!selected) {
      selected = entry;
      continue;
    }
    if (selected.direction === "outbound" && entry.direction === "inbound") {
      selected = entry;
      continue;
    }
    if (
      entry.direction === selected.direction &&
      entry.receivedAt < selected.receivedAt
    ) {
      selected = entry;
    }
  }
  return selected;
}

function computeInteractionFocus(log: InteractionStateMap): {
  active: InteractionRequestEntry | null;
  pendingId: string | null;
} {
  const next = pickNextPendingInteraction(log);
  return {
    active: next,
    pendingId: next ? next.request.requestId : null,
  };
}

export {
  BOARD_PING_LIFETIME_MS,
  BOARD_PING_MAX_HISTORY,
  MAX_EVENTS,
  REMOTE_CURSOR_TTL_MS,
} from "./store/types";
export type {
  AvatarState,
  BoardPingEvent,
  BoardSize,
  BoardState,
  CardRef,
  CellKey,
  GameEvent,
  GameState,
  InteractionRecordStatus,
  InteractionRequestEntry,
  InteractionResponseOptions,
  InteractionStateMap,
  LifeState,
  Permanents,
  PermanentItem,
  Phase,
  PlayerKey,
  PlayerState,
  RemoteCursorState,
  ServerPatchT,
  SendInteractionRequestInput,
  SerializedGame,
  SiteTile,
  Thresholds,
  Zones,
} from "./store/types";

// Small random visual tilt for permanents to reduce overlap uniformity (radians ~ -0.05..+0.05)
// ---- Shared helpers (pure) -------------------------------------------------

// Build an updated avatars record with a new position/offset for a player.
function buildAvatarUpdate(
  s: GameState,
  who: PlayerKey,
  pos: [number, number],
  offset: [number, number] | null
): Record<PlayerKey, AvatarState> {
  const next = { ...s.avatars[who], pos, offset } as AvatarState;
  return { ...s.avatars, [who]: next } as Record<PlayerKey, AvatarState>;
}

const createGameStoreState: StateCreator<GameState> = (set, get, storeApi) => ({
  ...createEventSlice(set, get, storeApi),
  ...createDialogSlice(set, get, storeApi),
  ...createUiSlice(set, get, storeApi),
  ...createBoardSlice(set, get, storeApi),
  ...createBoardUiSlice(set, get, storeApi),
  ...createHistorySlice(set, get, storeApi),
  ...createCoreSlice(set, get, storeApi),
  ...createResourceSlice(set, get, storeApi),
  ...createPermanentSlice(set, get, storeApi),
  ...createPositionSlice(set, get, storeApi),
  ...createAvatarSlice(set, get, storeApi),
  ...createZoneSlice(set, get, storeApi),
  ...createGameActionsSlice(set, get, storeApi),
  ...createPreferenceSlice(set, get, storeApi),
  ...createCardMetaSlice(set, get, storeApi),
  ...createSessionSlice(set, get, storeApi),
  ...createRemoteCursorSlice(set, get, storeApi),
  ...createInteractionSlice(set, get, storeApi),
  ...createTransportSlice(set, get, storeApi),

  // Track last applied server timestamp to drop stale patches
  lastServerTs: 0,
  // Track last local action send time to coordinate undo ordering in online play
  lastLocalActionTs: 0,
  // Multiplayer transport (injected by online play UI)
  commitDefenders: () => {
    const pc = get().pendingCombat;
    if (!pc) return;
    set((s) => {
      if (!s.pendingCombat) return s as GameState;
      return {
        pendingCombat: { ...s.pendingCombat, status: "committed" as const },
      } as Partial<GameState> as GameState;
    });
    // Re-read state after update to get committed status
    const updated = get().pendingCombat;
    if (!updated) return;
    const tr = get().transport;
    if (tr?.sendMessage) {
      try {
        console.log('[commitDefenders] Sending combatCommit with defenders:', updated.defenders?.length || 0);
        tr.sendMessage({
          type: "combatCommit",
          id: updated.id,
          defenders: updated.defenders,
          target: updated.target ?? null,
          tile: updated.tile,
          playerKey: get().actorKey ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        console.log('[commitDefenders] combatCommit sent');
      } catch (err) {
        console.error('[commitDefenders] Error sending combatCommit:', err);
      }
    }
  },
  setDamageAssignment: (asgn) => {
    const pc = get().pendingCombat;
    if (!pc || pc.status !== "committed") return false;
    const { permanents, metaByCardId } = get();
    function getAtkDef(at: string, index: number): { atk: number; def: number } {
      try {
        const cardId = (permanents as Permanents)[at]?.[index]?.card?.cardId;
        const m = cardId ? (metaByCardId as Record<number, { attack: number | null; defence: number | null }>)[Number(cardId)] : undefined;
        const atk = Number(m?.attack ?? 0) || 0;
        const def = Number(m?.defence ?? m?.attack ?? 0) || 0;
        return { atk, def };
      } catch { return { atk: 0, def: 0 }; }
    }
    function getAttachments(at: string, index: number): Permanents[string] {
      const list = (permanents as Permanents)[at] || [];
      return list.filter((p) => p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index);
    }
    function computeEffectiveAttack(a: { at: CellKey; index: number }): { atk: number; firstStrike: boolean } {
      const base = getAtkDef(a.at, a.index).atk;
      const attachments = getAttachments(a.at, a.index);
      let atk = base; let firstStrike = false; let disabled = false;
      for (const tkn of attachments) {
        const nm = (tkn.card?.name || "").toLowerCase();
        if (nm === "lance") { firstStrike = true; atk += 1; }
        if (nm === "disabled") { disabled = true; }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }
    const eff = computeEffectiveAttack({ at: pc.attacker.at, index: pc.attacker.index });
    if (!Array.isArray(asgn)) return false;
    const defKeys = new Set((pc.defenders || []).map((d) => `${d.at}:${d.index}`));
    let sum = 0;
    for (const a of asgn) {
      if (!a || typeof a !== "object") return false;
      if (typeof a.at !== "string" || !Number.isFinite(Number(a.index)) || !Number.isFinite(Number(a.amount))) return false;
      if (!defKeys.has(`${a.at}:${a.index}`)) return false;
      if (a.amount < 0) return false;
      sum += Math.floor(Number(a.amount));
    }
    if (sum !== Math.floor(eff.atk)) return false;
    set((s) => {
      if (!s.pendingCombat) return s as GameState;
      return { pendingCombat: { ...s.pendingCombat, assignment: asgn.map((x) => ({ at: x.at, index: Number(x.index), amount: Math.floor(Number(x.amount)) })) } } as Partial<GameState> as GameState;
    });
    const tr = get().transport;
    if (tr?.sendMessage) {
      try {
        tr.sendMessage({ type: "combatAssign", id: pc.id, assignment: asgn, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }
    return true;
  },
  // Minimal combat state (MVP)
  pendingCombat: null,
  attackChoice: null,
  attackTargetChoice: null,
  attackConfirm: null,
  setAttackChoice: (v) => set({ attackChoice: v }),
  setAttackTargetChoice: (v) => set({ attackTargetChoice: v }),
  setAttackConfirm: (v) => set({ attackConfirm: v }),
  revertCrossMoveTick: 0,
  requestRevertCrossMove: () => set((s) => ({ revertCrossMoveTick: (s.revertCrossMoveTick || 0) + 1 })),
  lastCombatSummary: null,
  setLastCombatSummary: (smm) => set({ lastCombatSummary: smm } as Partial<GameState> as GameState),
  declareAttack: (tile, attacker, target) =>
    set((s) => {
      const id = `cmb_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const defenderSeat = (attacker.owner === 1 ? "p2" : "p1") as PlayerKey;
      const pc = {
        id,
        tile,
        attacker,
        target: target ?? null,
        defenderSeat,
        defenders: [],
        status: "declared" as const,
        createdAt: Date.now(),
      };
      const tr = get().transport;
      // Build nice labels
      const attackerLabel = (() => {
        try {
          const a = (get().permanents as Permanents)[attacker.at]?.[attacker.index] || null;
          return a?.card?.name || "Attacker";
        } catch { return "Attacker"; }
      })();
      const targetLabel = (() => {
        try {
          if (!target) return null;
          if (target.kind === "site") return "Site";
          if (target.kind === "avatar") return "Avatar";
          const list = (get().permanents as Permanents)[target.at] || [];
          const p = (target.index != null && list[target.index]) ? list[target.index] : null;
          return p?.card?.name || "Unit";
        } catch { return null; }
      })();
      if (tr?.sendMessage) {
        try {
          tr.sendMessage({
            type: "attackDeclare",
            id,
            tile,
            attacker,
            target: target ?? null,
            playerKey: s.actorKey ?? null,
            ts: Date.now(),
          } as unknown as CustomMessage);
          if (targetLabel) {
            tr.sendMessage({ type: "toast", text: `${attackerLabel} attacks ${targetLabel}` } as unknown as CustomMessage);
          }
        } catch {}
      }
      try {
        const cellNo = tile.y * s.board.size.w + tile.x + 1;
        if (targetLabel) get().log(`${attackerLabel} attacks ${targetLabel} at #${cellNo}`);
        else get().log(`Attack declared at #${cellNo}`);
      } catch {}
      return { pendingCombat: pc } as Partial<GameState> as GameState;
    }),
  offerIntercept: (tile, attacker) => {
    try {
      const defenderSeat = (attacker.owner === 1 ? "p2" : "p1") as PlayerKey;
      const key = `${tile.x},${tile.y}` as CellKey;
      const per = get().permanents as Permanents;
      const unitsHere = (per[key] || []).filter(
        (p) => p && p.owner === (attacker.owner === 1 ? 2 : 1) && !p.tapped
      );
      let avatarHere = false;
      try {
        const av = (get().avatars as GameState["avatars"])[defenderSeat];
        if (
          av && Array.isArray(av.pos) && av.pos.length === 2 &&
          av.pos[0] === tile.x && av.pos[1] === tile.y && !av.tapped
        ) avatarHere = true;
      } catch {}
      if (unitsHere.length === 0 && !avatarHere) return; // no eligible interceptors
      const id = `cmb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const tr = get().transport;
      if (tr?.sendMessage) {
        try {
          tr.sendMessage({
            type: "interceptOffer",
            id,
            tile,
            attacker,
            playerKey: get().actorKey ?? null,
            ts: Date.now(),
          } as unknown as CustomMessage);
        } catch {}
      }
      try { get().log("Intercept offered to defender"); } catch {}
    } catch {}
  },
  setDefenderSelection: (defenders) => {
    set((s) => {
      if (!s.pendingCombat) return s as GameState;
      return {
        pendingCombat: { ...s.pendingCombat, defenders, status: "defending" },
      } as Partial<GameState> as GameState;
    });
    const pc = get().pendingCombat;
    const tr = get().transport;
    if (pc && tr?.sendMessage) {
      try {
        tr.sendMessage({
          type: "combatSetDefenders",
          id: pc.id,
          defenders,
          playerKey: get().actorKey ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        tr.sendMessage({ type: "toast", text: `Acting player chose ${defenders.length} defender${defenders.length === 1 ? "" : "s"}` } as unknown as CustomMessage);
      } catch {}
    }
  },
  resolveCombat: () => {
    const pc = get().pendingCombat;
    if (!pc) return;
    const tr = get().transport;
    const existing = get().lastCombatSummary;
    const haveSummary = existing && String(existing.id) === String(pc.id);
    const permanents = get().permanents as Permanents;
    const meta = get().metaByCardId as Record<number, { attack: number | null; defence: number | null; cost: number | null }>;
    const players = get().players;
    const board = get().board;
    function getAtkDef(at: string, index: number): { atk: number; def: number } {
      try {
        const cardId = permanents[at]?.[index]?.card?.cardId;
        const m = cardId ? meta[Number(cardId)] : undefined;
        const atk = Number(m?.attack ?? 0) || 0;
        const def = Number(m?.defence ?? m?.attack ?? 0) || 0; // default health to base power when defence missing
        return { atk, def };
      } catch { return { atk: 0, def: 0 }; }
    }
    function getAttachments(at: string, index: number): Permanents[string] {
      const list = permanents[at] || [];
      return list.filter((p) => p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index);
    }
    function listAttachmentEffects(at: string, index: number): string[] {
      const effects: string[] = [];
      for (const t of getAttachments(at, index)) {
        const nm = (t.card?.name || "").trim();
        const low = nm.toLowerCase();
        if (low === "lance") effects.push("Lance(+1, FS)");
        else if (low === "disabled") effects.push("Disabled(Atk=0)");
        else if (nm) effects.push(nm);
      }
      return effects;
    }
    function getPermName(at: string, index: number): string {
      try { return permanents[at]?.[index]?.card?.name || "Unit"; } catch { return "Unit"; }
    }
    function getAvatarName(seat: PlayerKey): string {
      try { return (get().avatars?.[seat]?.card?.name as string) || "Avatar"; } catch { return "Avatar"; }
    }
    function computeEffectiveAttack(a: { at: CellKey; index: number }): { atk: number; firstStrike: boolean } {
      const base = getAtkDef(a.at, a.index).atk;
      const attachments = getAttachments(a.at, a.index);
      let atk = base;
      let firstStrike = false;
      let disabled = false;
      for (const t of attachments) {
        const nm = (t.card?.name || "").toLowerCase();
        if (nm === "lance") { firstStrike = true; atk += 1; }
        if (nm === "disabled") { disabled = true; }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }
    const eff = computeEffectiveAttack({ at: pc.attacker.at, index: pc.attacker.index });
    let summary = "Combat resolved";
    const attackerName = getPermName(pc.attacker.at, pc.attacker.index);
    const atkFx = listAttachmentEffects(pc.attacker.at, pc.attacker.index);
    const fxTxt = atkFx.length ? ` [${atkFx.join(", ")}]` : "";
    const fsTag = eff.firstStrike ? " (FS)" : "";
    const tileNo = (() => { try { return pc.tile.y * get().board.size.w + pc.tile.x + 1; } catch { return null; } })();
    const actorSeat = (pc.attacker.owner === 1 ? "p1" : "p2") as PlayerKey;
    let targetSeat: PlayerKey | undefined = undefined;
    if (pc.target && pc.target.kind === "site") {
      const owner = board.sites[pc.target.at]?.owner as 1 | 2 | undefined;
      const seat = owner === 1 ? "p1" : owner === 2 ? "p2" : (pc.defenderSeat as PlayerKey);
      if (seat) {
        targetSeat = seat as PlayerKey;
        const dd = players[seat].lifeState === "dd";
        const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
        const siteName = board.sites[pc.target.at]?.card?.name || "Site";
        const ddNote = dd ? " (DD rule)" : "";
        summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Site ${siteName} @#${tileNo ?? "?"} → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
      }
    } else if (pc.target && pc.target.kind === "avatar") {
      const seat = pc.attacker.owner === 1 ? "p2" : "p1";
      targetSeat = seat as PlayerKey;
      const state = players[seat];
      const avatarName = getAvatarName(seat as PlayerKey);
      if (state.lifeState === "dd") {
        summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${tileNo ?? "?"} → Expected: ${seat.toUpperCase()} to 0 (lethal from DD, match ends)`;
      } else {
        const life = Number(state.life) || 0;
        const dmg = Math.max(0, Math.floor(eff.atk));
        const next = Math.max(0, life - dmg);
        if (life > 0 && next <= 0) {
          summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${tileNo ?? "?"} → Expected: reaches Death's Door; further avatar/site damage this turn won't reduce life`;
        } else {
          summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Avatar ${avatarName} (${seat.toUpperCase()}) @#${tileNo ?? "?"} → Expected: ${dmg} dmg (life ${life} → ${next})`;
        }
      }
    } else {
      const tileKey = (() => { try { return `${pc.tile.x},${pc.tile.y}` as CellKey; } catch { return null as CellKey | null; } })();
      const siteAtTile = tileKey ? (board.sites[tileKey] as SiteTile | undefined) : undefined;
      if (!pc.target && siteAtTile && siteAtTile.card && ((pc.defenders?.length || 0) === 0)) {
        const owner = siteAtTile.owner as 1 | 2 | undefined;
        let seat: PlayerKey | null = owner === 1 ? "p1" : owner === 2 ? "p2" : (pc.defenderSeat as PlayerKey | null);
        if (!seat) seat = (pc.attacker.owner === 1 ? "p2" : "p1") as PlayerKey;
        if (seat) {
          targetSeat = seat as PlayerKey;
          const dd = players[seat].lifeState === "dd";
          const dmg = dd ? 0 : Math.max(0, Math.floor(eff.atk));
          const siteName = siteAtTile.card?.name || "Site";
          const ddNote = dd ? " (DD rule)" : "";
          summary = `Attacker ${attackerName}${fxTxt}${fsTag} hits Site ${siteName} @#${tileNo ?? "?"} → Expected: ${dmg} to ${seat.toUpperCase()}${ddNote}`;
        }
      } else {
        const aAtk = eff.atk;
        const targetDef = (() => {
          if (pc.target && pc.target.kind === "permanent" && pc.target.index != null) return getAtkDef(pc.target.at, pc.target.index).def;
          if (pc.defenders && pc.defenders.length > 0) return pc.defenders.reduce((s, d) => s + getAtkDef(d.at, d.index).def, 0);
          return 0;
        })();
        const targetName = pc.target && pc.target.kind === "permanent" && pc.target.index != null
          ? getPermName(pc.target.at, pc.target.index)
          : (pc.defenders?.length ? pc.defenders.map(d => getPermName(d.at, d.index)).slice(0,3).join(", ") + (pc.defenders.length > 3 ? ", …" : "") : "target");
        const kills = aAtk >= targetDef;
        targetSeat = pc.defenderSeat as PlayerKey;
        summary = `Attacker ${attackerName}${fxTxt}${fsTag} vs ${targetName} @#${tileNo ?? "?"} → Expected: Atk ${aAtk} vs Def ${targetDef} (${kills ? "likely kill" : "may fail"})`;
      }
    }
    // Always send combatResolve for taps/cleanup; only send summary if not already set
    if (tr?.sendMessage) {
      try {
        tr.sendMessage({
          type: "combatResolve",
          id: pc.id,
          attacker: pc.attacker,
          defenders: pc.defenders,
          tile: pc.tile,
          target: pc.target ?? null,
          ts: Date.now(),
        } as unknown as CustomMessage);
        if (!haveSummary) {
          set({ lastCombatSummary: { id: pc.id, text: summary, ts: Date.now(), actor: actorSeat, targetSeat } } as Partial<GameState> as GameState);
          tr.sendMessage({ type: "combatSummary", id: pc.id, text: summary, ts: Date.now(), actor: actorSeat, targetSeat } as unknown as CustomMessage);
        }
      } catch {}
    }
    set({ pendingCombat: null, attackChoice: null, attackTargetChoice: null, attackConfirm: null } as Partial<GameState> as GameState);
  },
  autoResolveCombat: () => {
    const pc = get().pendingCombat;
    if (!pc) return;
    if (pc.status !== "committed") return;
    // Only the attacker may trigger auto resolve
    const actor = get().actorKey as PlayerKey | null;
    const isIntercept = !pc.target;
    const wants = (pc.attacker.owner === 1 ? "p1" : "p2") as PlayerKey;
    const defSeat = pc.defenderSeat as PlayerKey | null;
    if (actor) {
      const defenderMay = Boolean(isIntercept && defSeat && actor === defSeat);
      if (!defenderMay && actor !== wants) return;
    }
    // Helpers copied from resolveCombat scope
    const { permanents, metaByCardId, board, players } = get();
    function getAtkDef(at: string, index: number): { atk: number; def: number } {
      try {
        const cardId = (permanents as Permanents)[at]?.[index]?.card?.cardId;
        const m = cardId ? (metaByCardId as Record<number, { attack: number | null; defence: number | null }>)[Number(cardId)] : undefined;
        const atk = Number(m?.attack ?? 0) || 0;
        const def = Number(m?.defence ?? m?.attack ?? 0) || 0; // default health to base power when defence missing
        return { atk, def };
      } catch { return { atk: 0, def: 0 }; }
    }
    function getAttachments(at: string, index: number): Permanents[string] {
      const list = (permanents as Permanents)[at] || [];
      return list.filter((p) => p.attachedTo && p.attachedTo.at === at && p.attachedTo.index === index);
    }
    function computeEffectiveAttack(a: { at: CellKey; index: number }): { atk: number; firstStrike: boolean } {
      const base = getAtkDef(a.at, a.index).atk;
      const attachments = getAttachments(a.at, a.index);
      let atk = base; let firstStrike = false; let disabled = false;
      for (const tkn of attachments) {
        const nm = (tkn.card?.name || "").toLowerCase();
        if (nm === "lance") { firstStrike = true; atk += 1; }
        if (nm === "disabled") { disabled = true; }
      }
      if (disabled) atk = 0;
      if (!Number.isFinite(atk)) atk = 0;
      return { atk, firstStrike };
    }
    const eff = computeEffectiveAttack({ at: pc.attacker.at, index: pc.attacker.index });
    const aSeat = (pc.attacker.owner === 1 ? "p1" : "p2") as PlayerKey;
    let tSeat: PlayerKey | undefined = undefined;
    const killList: Array<{ at: CellKey; index: number; owner: PlayerKey }> = [];
    const damageList: Array<{ at: CellKey; index: number; amount: number }> = [];
    // Resolve vs defenders using assignment
    let defenders = (pc.defenders || []).map((d) => {
      const stats = getAtkDef(d.at, d.index);
      const effD = computeEffectiveAttack({ at: d.at, index: d.index });
      return { ...d, def: stats.def, atk: effD.atk, fs: effD.firstStrike };
    });
    // If directly attacking a single unit (no intercept defenders), treat that unit as the sole defender
    if (defenders.length === 0 && pc.target && pc.target.kind === "permanent" && pc.target.index != null) {
      const ownerNum = (() => { try { return (permanents as Permanents)[pc.target.at]?.[pc.target.index]?.owner as 1 | 2 | undefined; } catch { return undefined; } })();
      if (ownerNum === 1 || ownerNum === 2) {
        const statsT = getAtkDef(pc.target.at, pc.target.index);
        const effT = computeEffectiveAttack({ at: pc.target.at, index: pc.target.index });
        defenders = [{ at: pc.target.at, index: Number(pc.target.index), owner: ownerNum, def: statsT.def, atk: effT.atk, fs: effT.firstStrike }];
      }
    }
    const defAssignMap = new Map<string, number>();
    if (defenders.length > 1) {
      const asgn = pc.assignment || [];
      let sum = 0;
      for (const a of asgn) { const k = `${a.at}:${a.index}`; defAssignMap.set(k, Math.floor(Number(a.amount) || 0)); sum += Math.floor(Number(a.amount) || 0); }
      if (sum !== Math.floor(eff.atk)) {
        // If interceptor resolves without assignment, distribute fairly to avoid deadlock
        const actorSeat = actor as PlayerKey | null;
        const defenderIsResolving = Boolean(isIntercept && actorSeat && defSeat && actorSeat === defSeat);
        if (defenderIsResolving) {
          const total = Math.floor(eff.atk);
          const count = defenders.length;
          const base = Math.floor(total / count);
          let rem = total - base * count;
          for (const d of defenders) {
            const k = `${d.at}:${d.index}`;
            const amt = base + (rem > 0 ? 1 : 0);
            defAssignMap.set(k, amt);
            if (rem > 0) rem -= 1;
          }
        } else {
          return; // invalid without fallback; attacker must assign
        }
      }
    } else if (defenders.length === 1) {
      const only = defenders[0];
      defAssignMap.set(`${only.at}:${only.index}`, Math.floor(eff.atk));
    }
    const attackerDef = getAtkDef(pc.attacker.at, pc.attacker.index).def;
    let attackerAlive = true;
    const aliveDefenders = new Set(defenders.map((d) => `${d.at}:${d.index}`));
    // First strike window
    if (eff.firstStrike || defenders.some((d) => d.fs)) {
      // Attacker FS hits first
      if (eff.firstStrike && defenders.length > 0) {
        for (const d of defenders) {
          const k = `${d.at}:${d.index}`;
          const amt = defAssignMap.get(k) || 0;
          if (amt >= d.def) { killList.push({ at: d.at, index: d.index, owner: (d.owner === 1 ? "p1" : "p2") as PlayerKey }); aliveDefenders.delete(k); }
          else if (amt > 0) { damageList.push({ at: d.at, index: d.index, amount: amt }); }
        }
        tSeat = pc.defenderSeat as PlayerKey;
      }
      // Defender FS hits back simultaneously
      const fsAtkFromDefs = defenders.filter((d) => d.fs && aliveDefenders.has(`${d.at}:${d.index}`)).reduce((s, d) => s + d.atk, 0);
      if (fsAtkFromDefs >= attackerDef && attackerDef > 0) attackerAlive = false;
    }
    // Simultaneous/remaining strikes
    if (attackerAlive) {
      for (const d of defenders) {
        const k = `${d.at}:${d.index}`;
        if (!aliveDefenders.has(k)) continue;
        const amt = defAssignMap.get(k) || 0;
        if (amt >= d.def) { killList.push({ at: d.at, index: d.index, owner: (d.owner === 1 ? "p1" : "p2") as PlayerKey }); aliveDefenders.delete(k); }
        else if (amt > 0) { damageList.push({ at: d.at, index: d.index, amount: amt }); }
      }
      tSeat = pc.defenderSeat as PlayerKey;
    }
    if (attackerAlive) {
      const anyFS = eff.firstStrike || defenders.some((d) => d.fs);
      let sumAtk = 0;
      if (anyFS) {
        const nonFsAlive = defenders.filter((d) => !d.fs && aliveDefenders.has(`${d.at}:${d.index}`));
        sumAtk = nonFsAlive.reduce((s, d) => s + d.atk, 0);
      } else {
        // Pure simultaneous: include defenders even if they died from attacker's damage
        sumAtk = defenders.reduce((s, d) => s + d.atk, 0);
      }
      if (sumAtk >= attackerDef && attackerDef > 0) attackerAlive = false;
    }
    if (!attackerAlive) {
      killList.push({ at: pc.attacker.at, index: pc.attacker.index, owner: aSeat });
    }
    // Apply temporary damage locally (only our seat's permanents)
    for (const dmg of damageList) {
      try { get().applyDamageToPermanent(dmg.at, dmg.index, dmg.amount); } catch {}
    }
    // If there are no defenders, apply avatar/site damage (with DD rules)
    if (defenders.length === 0) {
      if (pc.target && pc.target.kind === "site") {
        const owner = board.sites[pc.target.at]?.owner as 1 | 2 | undefined;
        if (owner === 1 || owner === 2) {
          const seat = owner === 1 ? "p1" : "p2";
          tSeat = seat as PlayerKey;
          const dd = players[seat].lifeState === "dd";
          if (!dd) {
            const dmg = Math.max(0, Math.floor(eff.atk));
            if (dmg > 0) try { get().addLife(seat as PlayerKey, -dmg); } catch {}
          }
        }
      } else if (pc.target && pc.target.kind === "avatar") {
        const seat = (pc.attacker.owner === 1 ? "p2" : "p1") as PlayerKey;
        tSeat = seat;
        const isDD = players[seat].lifeState === "dd";
        const dmg = Math.max(0, Math.floor(eff.atk));
        if (isDD) {
          try { get().addLife(seat, -1); } catch {}
        } else if (dmg > 0) {
          try { get().addLife(seat, -dmg); } catch {}
        }
      }
    }
    // Apply local kills only for our own seat; send message so opponent applies theirs
    const mySeat = get().actorKey as PlayerKey | null;
    console.log('[autoResolveCombat] killList:', killList, 'mySeat:', mySeat);
    if (mySeat) {
      for (const k of killList) {
        console.log('[autoResolveCombat] checking kill:', k, 'k.owner === mySeat?', k.owner === mySeat);
        if (k.owner === mySeat) {
          console.log('[autoResolveCombat] Applying kill to graveyard:', k.at, k.index);
          try { get().movePermanentToZone(k.at, k.index, "graveyard"); } catch (err) {
            console.error('[autoResolveCombat] Error moving to graveyard:', err);
          }
        }
      }
    } else {
      // Hotseat/spectator: apply all kills locally
      for (const k of killList) {
        try { get().movePermanentToZone(k.at, k.index, "graveyard"); } catch (err) {
          console.error('[autoResolveCombat] Error moving to graveyard (hotseat):', err);
        }
      }
    }
    // Compose and broadcast actual outcome summary before final resolve
    const tr = get().transport;
    if (tr?.sendMessage && killList.length > 0) {
      try {
        console.log('[autoResolveCombat] Sending combatAutoApply with kills:', killList);
        tr.sendMessage({ type: "combatAutoApply", id: pc.id, kills: killList, ts: Date.now() } as unknown as CustomMessage);
      } catch (err) {
        console.error('[autoResolveCombat] Error sending combatAutoApply:', err);
      }
    }
    if (tr?.sendMessage && damageList.length > 0) {
      try {
        tr.sendMessage({ type: "combatDamage", id: pc.id, damage: damageList, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }

    // Build an actual outcome summary
    const attackerNameForSummary = (() => {
      try { return (get().permanents as Permanents)[pc.attacker.at]?.[pc.attacker.index]?.card?.name || "Attacker"; } catch { return "Attacker"; }
    })();
    // Helper to get permanent name safely
    const getNameAt = (at: CellKey, index: number): string => {
      try { return (get().permanents as Permanents)[at]?.[index]?.card?.name || "Unit"; } catch { return "Unit"; }
    };
    const deadDefs = killList
      .filter((k) => k.owner === (pc.defenderSeat as PlayerKey))
      .map((k) => {
        try { return (get().permanents as Permanents)[k.at]?.[k.index]?.card?.name || null; } catch { return null; }
      })
      .filter(Boolean) as string[];
    const attackerDied = killList.some((k) => k.at === pc.attacker.at && k.index === pc.attacker.index);
    // Compute damage dealt to attacker (FS + simultaneous)
    let damageFromDefsFS = 0;
    let damageFromDefsSim = 0;
    try {
      const anyFS = eff.firstStrike || defenders.some((d) => d.fs);
      const fsContrib = defenders
        .filter((d) => d.fs && aliveDefenders.has(`${d.at}:${d.index}`))
        .reduce((s, d) => s + d.atk, 0);
      damageFromDefsFS = fsContrib;
      if (anyFS) {
        if (attackerAlive) {
          const nonFsContribAlive = defenders
            .filter((d) => !d.fs && aliveDefenders.has(`${d.at}:${d.index}`))
            .reduce((s, d) => s + d.atk, 0);
          damageFromDefsSim = nonFsContribAlive;
        }
      } else {
        // Pure simultaneous: defenders deal damage even if they die in this exchange
        damageFromDefsSim = defenders.reduce((s, d) => s + d.atk, 0);
      }
    } catch {}
    const totalDmgToAttacker = Math.max(0, Math.floor(damageFromDefsFS + damageFromDefsSim));
    let text = '';
    if ((pc.defenders?.length || 0) > 0) {
      // Unit-vs-unit outcome with names
      const defenderNames = (pc.defenders || []).map((d) => getNameAt(d.at, d.index));
      if (attackerDied) {
        const source = defenderNames.length === 1 ? `defending "${defenderNames[0]}"` : `defenders ${defenderNames.map((n) => `"${n}"`).join(', ')}`;
        text = `Attacker "${attackerNameForSummary}" takes ${totalDmgToAttacker} damage from ${source} and is destroyed`;
        if (deadDefs.length > 0) {
          text += `; defenders lost: ${deadDefs.join(', ')}`;
        }
      } else if (deadDefs.length > 0) {
        text = `Defenders destroyed: ${deadDefs.join(', ')}`;
      } else {
        const dmgDefs = damageList
          .map((d) => {
            const nm = getNameAt(d.at as CellKey, d.index);
            return `${nm}: ${d.amount}`;
          });
        text = dmgDefs.length ? `Damage dealt to defenders: ${dmgDefs.join(', ')}` : `No casualties`;
      }
    } else if (pc.target && pc.target.kind === 'avatar') {
      const seat: PlayerKey = pc.attacker.owner === 1 ? 'p2' : 'p1';
      const before = Number((players as GameState['players'])[seat]?.life ?? 0);
      const after = Number((get().players as GameState['players'])[seat]?.life ?? before);
      const dmg = Math.max(0, before - after);
      const avatarName = (() => { try { return (get().avatars?.[seat]?.card?.name as string) || 'Avatar'; } catch { return 'Avatar'; } })();
      if (before > 0 && after === 0) {
        text = `Attacker "${attackerNameForSummary}" strikes Avatar "${avatarName}" for lethal damage (reaches Death's Door)`;
      } else {
        text = `Attacker "${attackerNameForSummary}" strikes Avatar "${avatarName}" for ${dmg} damage (${seat.toUpperCase()} life ${before} -> ${after})`;
      }
    } else if (pc.target && pc.target.kind === 'site') {
      const owner = (get().board.sites[pc.target.at]?.owner as 1 | 2 | undefined);
      const seat: PlayerKey | null = owner === 1 ? 'p1' : owner === 2 ? 'p2' : null;
      const siteName = (() => { try { return pc.target && pc.target.at ? (get().board.sites[pc.target.at as CellKey]?.card?.name || 'Site') : 'Site'; } catch { return 'Site'; } })();
      if (seat) {
        const before = Number((players as GameState['players'])[seat]?.life ?? 0);
        const after = Number((get().players as GameState['players'])[seat]?.life ?? before);
        const dmg = Math.max(0, before - after);
        text = `Attacker "${attackerNameForSummary}" strikes Site "${siteName}" for ${dmg} damage (${seat.toUpperCase()} life ${before} -> ${after})`;
      } else {
        text = `Attacker "${attackerNameForSummary}" strikes Site "${siteName}"`;
      }
    } else {
      text = attackerDied ? `Attacker "${attackerNameForSummary}" is destroyed` : `No casualties`;
    }
    // Set and broadcast summary once
    set({ lastCombatSummary: { id: pc.id, text, ts: Date.now(), actor: aSeat, targetSeat: tSeat } } as Partial<GameState> as GameState);
    if (tr?.sendMessage) {
      try { tr.sendMessage({ type: 'combatSummary', id: pc.id, text, ts: Date.now(), actor: aSeat, targetSeat: tSeat } as unknown as CustomMessage); } catch {}
    }
    // Now finalize (taps, clear pending, etc.)
    get().resolveCombat();
  },
  cancelCombat: () => {
    const pc = get().pendingCombat;
    if (!pc) return;
    set({ pendingCombat: null });
    const tr = get().transport;
    if (tr?.sendMessage) {
      try {
        tr.sendMessage({ type: "combatCancel", id: pc.id, ts: Date.now() } as unknown as CustomMessage);
      } catch {}
    }
  },
  receiveCustomMessage: (msg) => handleCustomMessage(msg, set, get),

  board: { size: { w: 5, h: 4 }, sites: {} },
  // Apply an incremental server patch into the store.
  // - Only whitelisted game-state fields are updated
  // - Arrays are replaced; objects are deep-merged
  // - UI/transient fields (drag, dialogs, selection, overlays, camera, history) are untouched
  applyServerPatch: (patch, t) =>
    set((s) => {
      if (!patch || typeof patch !== "object") return s as GameState;
      if (typeof t === "number" && t < (s.lastServerTs ?? 0))
        return s as GameState;

      let incoming = patch as ServerPatchT;
      const replaceKeysCandidateInitial = Array.isArray(incoming.__replaceKeys)
        ? incoming.__replaceKeys
        : null;
      if (!replaceKeysCandidateInitial || replaceKeysCandidateInitial.length === 0) {
        const echoResult = filterEchoPatchIfAny(incoming);
        if (echoResult.matched) {
          if (!echoResult.patch) {
            if (typeof t === "number") {
              const lastTsEcho = Math.max(s.lastServerTs ?? 0, t);
              if (lastTsEcho !== (s.lastServerTs ?? 0)) {
                return { ...s, lastServerTs: lastTsEcho } as GameState;
              }
            }
            return s as GameState;
          }
          incoming = echoResult.patch;
        }
      }

      const p = incoming as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : []
      );
      if (replaceKeys.size > 0) {
        try {
          console.debug("[net] applyServerPatch: authoritative snapshot", {
            keys: Array.from(replaceKeys),
            t: typeof t === "number" ? t : null,
            prevTs: s.lastServerTs ?? 0,
          });
          // Compact diagnostics when board/zones/permanents are involved
          if (
            replaceKeys.has("permanents") ||
            replaceKeys.has("zones") ||
            replaceKeys.has("board")
          ) {
            const prevPerCount = Object.values(s.permanents || {}).reduce(
              (a, v) => a + (Array.isArray(v) ? v.length : 0),
              0
            );
            const prevSiteCount =
              s.board && s.board.sites ? Object.keys(s.board.sites).length : 0;
            const prevHandP1 = s.zones?.p1?.hand?.length ?? 0;
            const prevHandP2 = s.zones?.p2?.hand?.length ?? 0;
            console.debug("[net] snapshot(prev)", {
              per: prevPerCount,
              sites: prevSiteCount,
              handP1: prevHandP1,
              handP2: prevHandP2,
            });
            const pPer = p.permanents
              ? Object.values(p.permanents as Record<string, unknown[]>).reduce(
                  (a, v) => a + (Array.isArray(v) ? v.length : 0),
                  0
                )
              : undefined;
            const pBoard = p.board as GameState["board"] | undefined;
            const pZones = p.zones as GameState["zones"] | undefined;
            const pSites = pBoard?.sites
              ? Object.keys(pBoard.sites).length
              : undefined;
            const pHandP1 = pZones?.p1?.hand?.length;
            const pHandP2 = pZones?.p2?.hand?.length;
            console.debug("[net] snapshot(patch)", {
              per: pPer,
              sites: pSites,
              handP1: pHandP1,
              handP2: pHandP2,
            });
          }
        } catch {}
      }

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? p.players
          : deepMergeReplaceArrays(s.players, p.players);
      }
      if (p.currentPlayer !== undefined) {
        next.currentPlayer = p.currentPlayer;
      }
      if (p.turn !== undefined) {
        next.turn = p.turn;
      }
      if (p.phase !== undefined) {
        next.phase = p.phase;
      }
      if (p.d20Rolls !== undefined) {
        next.d20Rolls = replaceKeys.has("d20Rolls")
          ? p.d20Rolls
          : deepMergeReplaceArrays(s.d20Rolls, p.d20Rolls);
        console.log("[applyServerPatch] Applied d20Rolls:", { prev: s.d20Rolls, new: next.d20Rolls, isReplace: replaceKeys.has("d20Rolls") });
      }
      const patchHasSetupWinner =
        p.setupWinner !== undefined ||
        Object.prototype.hasOwnProperty.call(p, "setupWinner");
      if (p.setupWinner !== undefined) next.setupWinner = p.setupWinner;
      if (!patchHasSetupWinner) {
        const derivedFromD20 = (() => {
          const source = (next.d20Rolls ?? s.d20Rolls) as
            | Record<PlayerKey, number | null>
            | undefined;
          if (!source) return null;
          const r1 = source.p1;
          const r2 = source.p2;
          if (r1 == null || r2 == null) return null;
          if (Number(r1) === Number(r2)) return null;
          return Number(r1) > Number(r2) ? "p1" : "p2";
        })();
        if (derivedFromD20 && next.setupWinner === undefined) {
          next.setupWinner = derivedFromD20;
        }
      }

      // Apply match end result from server so all clients reflect the outcome
      let shouldClearSnapshots = false;
      if (p.matchEnded !== undefined) {
        next.matchEnded = !!p.matchEnded;
        if (p.matchEnded === true) {
          shouldClearSnapshots = true;
        }
      }
      if (p.winner !== undefined) {
        next.winner = p.winner as PlayerKey | null;
      }

      if (p.board !== undefined) {
        next.board = replaceKeys.has("board")
          ? p.board
          : deepMergeReplaceArrays(s.board, p.board);
      }
      if (p.zones !== undefined) {
        const candidate = replaceKeys.has("zones")
          ? (p.zones as Partial<Record<PlayerKey, Partial<Zones>>>)
          : (deepMergeReplaceArrays(s.zones, p.zones) as Partial<
              Record<PlayerKey, Partial<Zones>>
            >);
        next.zones = normalizeZones(
          candidate,
          replaceKeys.has("zones") ? undefined : s.zones
        );
      }
      if (p.avatars !== undefined) {
        const candidate = replaceKeys.has("avatars")
          ? (p.avatars as Partial<Record<PlayerKey, Partial<AvatarState>>>)
          : (deepMergeReplaceArrays(s.avatars, p.avatars) as Partial<
              Record<PlayerKey, Partial<AvatarState>>
            >);
        next.avatars = normalizeAvatars(
          candidate,
          replaceKeys.has("avatars") ? undefined : s.avatars
        );
      }
      if (p.permanents !== undefined) {
        const source = replaceKeys.has("permanents")
          ? (p.permanents as Permanents)
          : mergePermanentsMap(s.permanents, p.permanents);
        next.permanents = normalizePermanentsRecord(
          source as Permanents
        ) as GameState["permanents"];
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? p.mulligans
          : deepMergeReplaceArrays(s.mulligans, p.mulligans);
      } else if (replaceKeys.has("mulligans")) {
        next.mulligans = { p1: 0, p2: 0 } as GameState["mulligans"];
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? p.mulliganDrawn
          : deepMergeReplaceArrays(s.mulliganDrawn, p.mulliganDrawn);
      } else if (replaceKeys.has("mulliganDrawn")) {
        next.mulliganDrawn = { p1: [], p2: [] } as GameState["mulliganDrawn"];
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : deepMergeReplaceArrays(s.permanentPositions, p.permanentPositions);
      } else if (replaceKeys.has("permanentPositions")) {
        next.permanentPositions = {} as GameState["permanentPositions"];
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : deepMergeReplaceArrays(s.permanentAbilities, p.permanentAbilities);
      } else if (replaceKeys.has("permanentAbilities")) {
        next.permanentAbilities = {} as GameState["permanentAbilities"];
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : deepMergeReplaceArrays(s.sitePositions, p.sitePositions);
      } else if (replaceKeys.has("sitePositions")) {
        next.sitePositions = {} as GameState["sitePositions"];
      }
      if (p.playerPositions !== undefined) {
        const candidate = replaceKeys.has("playerPositions")
          ? (p.playerPositions as Partial<
              Record<PlayerKey, Partial<PlayerPositionReference>>
            >)
          : (deepMergeReplaceArrays(
              s.playerPositions,
              p.playerPositions
            ) as Partial<Record<PlayerKey, Partial<PlayerPositionReference>>>);
        next.playerPositions = normalizePlayerPositions(
          candidate,
          replaceKeys.has("playerPositions") ? undefined : s.playerPositions
        );
      } else if (replaceKeys.has("playerPositions")) {
        next.playerPositions = createDefaultPlayerPositions();
      }
      if (p.events !== undefined) {
        // Merge events deterministically
        next.events = replaceKeys.has("events")
          ? Array.isArray(p.events)
            ? p.events
            : []
          : mergeEvents(s.events, Array.isArray(p.events) ? p.events : []);
        next.eventSeq = Math.max(s.eventSeq, Number(p.eventSeq) || 0);
      }

      // Guarded auto-snapshot on Start phase or when new turn/seat is observed via server patches
      try {
        const candidatePhase = (p.phase as GameState["phase"]) ?? s.phase;
        const candidateTurn = (p.turn as GameState["turn"]) ?? s.turn;
        const candidateCP = (p.currentPlayer as GameState["currentPlayer"]) ?? s.currentPlayer;
        const newTurn = candidateTurn !== s.turn;
        const seatChanged = candidateCP !== s.currentPlayer;
        const enteringStart = candidatePhase === "Start" && s.phase !== "Start";
        if ((enteringStart || newTurn || seatChanged) && candidatePhase !== "Setup") {
          const prevSnaps = Array.isArray(s.snapshots) ? s.snapshots : [];
          const hasForTurn = prevSnaps.some((ss) => ss.kind === "auto" && ss.turn === candidateTurn);
          if (!hasForTurn) {
            setTimeout(() => {
              try {
                get().createSnapshot(`Turn ${candidateTurn} start (P${candidateCP})`, "auto");
              } catch {}
            }, 0);
          }
        }
      } catch {}

      const lastTs =
        typeof t === "number" ? Math.max(s.lastServerTs ?? 0, t) : Date.now();
      const extra: Partial<GameState> = {};
      if (replaceKeys.size > 0) {
        const pending = s.pendingPatches ?? [];
        const remainingPending: ServerPatchT[] = [];
        if (pending.length > 0) {
          try {
            console.debug("[net] applyServerPatch: reconciling pending patches");
          } catch {}
          for (const queued of pending) {
            if (!queued || typeof queued !== "object") continue;
            const queuedPatch = queued as ServerPatchT;
            const touchesCritical =
              "permanents" in queuedPatch ||
              "zones" in queuedPatch ||
              "board" in queuedPatch;
            if (!touchesCritical) {
              remainingPending.push(queuedPatch);
              continue;
            }
            const merged = deepMergeReplaceArrays(
              next,
              queuedPatch
            ) as Partial<GameState>;
            Object.assign(next, merged);
            try {
              console.debug("[net] applyServerPatch: applied pending after snapshot");
            } catch {}
          }
        }
        extra.pendingPatches = remainingPending;
        extra.selectedCard = null;
        extra.selectedPermanent = null;
        extra.previewCard = null;
        try {
          const mergedPer = (next.permanents ?? s.permanents) || {};
          const mergedPerCount = Object.values(mergedPer).reduce(
            (a, v) => a + (Array.isArray(v) ? v.length : 0),
            0
          );
          const mergedZones = next.zones ?? s.zones;
          const mergedSummary = {
            p1: {
              hand: mergedZones?.p1?.hand?.length ?? 0,
              spellbook: mergedZones?.p1?.spellbook?.length ?? 0,
              atlas: mergedZones?.p1?.atlas?.length ?? 0,
              graveyard: mergedZones?.p1?.graveyard?.length ?? 0,
            },
            p2: {
              hand: mergedZones?.p2?.hand?.length ?? 0,
              spellbook: mergedZones?.p2?.spellbook?.length ?? 0,
              atlas: mergedZones?.p2?.atlas?.length ?? 0,
              graveyard: mergedZones?.p2?.graveyard?.length ?? 0,
            },
          };
          console.debug("[net] snapshot(next)", {
            permanentsCount: mergedPerCount,
            zones: mergedSummary,
            hasPermanentPositions: !!(
              next.permanentPositions ?? s.permanentPositions
            ),
          });
        } catch {}
      }
      const result = {
        ...s,
        ...next,
        ...extra,
        lastServerTs: lastTs,
      } as Partial<GameState> as GameState;
      if (shouldClearSnapshots) {
        try { clearSnapshotsStorageFor(get().matchId ?? null); } catch {}
        (result as GameState).snapshots = [] as GameState["snapshots"];
      }
      return result;
    }),

  // Apply a replay patch (simplified version without server communication or timestamps)
  applyPatch: (patch) =>
    set((s) => {
      if (!patch || typeof patch !== "object") return s as GameState;

      const p = patch as ServerPatchT;
      const next: Partial<GameState> = {};
      const replaceKeys = new Set<string>(
        Array.isArray(p.__replaceKeys) ? p.__replaceKeys : []
      );

      if (p.players !== undefined) {
        next.players = replaceKeys.has("players")
          ? (p.players as GameState["players"])
          : deepMergeReplaceArrays(s.players, p.players);
      }
      if (p.currentPlayer !== undefined) {
        next.currentPlayer = p.currentPlayer;
      }
      if (p.turn !== undefined) {
        next.turn = p.turn;
      }
      if (p.phase !== undefined) {
        next.phase = p.phase;
      }
      if (p.d20Rolls !== undefined) {
        next.d20Rolls = p.d20Rolls;
      }
      if (p.setupWinner !== undefined) {
        next.setupWinner = p.setupWinner;
      }
      if (p.matchEnded !== undefined) {
        next.matchEnded = p.matchEnded;
      }
      if (p.winner !== undefined) {
        next.winner = p.winner;
      }
      if (p.board !== undefined) {
        next.board = replaceKeys.has("board")
          ? (p.board as GameState["board"])
          : deepMergeReplaceArrays(s.board, p.board);
      }
      if (p.zones !== undefined) {
        next.zones = replaceKeys.has("zones")
          ? (p.zones as GameState["zones"])
          : deepMergeReplaceArrays(s.zones, p.zones);
      }
      if (p.avatars !== undefined) {
        next.avatars = replaceKeys.has("avatars")
          ? (p.avatars as GameState["avatars"])
          : deepMergeReplaceArrays(s.avatars, p.avatars);
      }
      if (p.permanents !== undefined) {
        if (replaceKeys.has("permanents")) {
          next.permanents = normalizePermanentsRecord(
            (p.permanents as Permanents) || ({} as Permanents)
          ) as GameState["permanents"];
        } else {
          const merged = mergePermanentsMap(s.permanents, p.permanents);
          next.permanents = normalizePermanentsRecord(
            merged as Permanents
          ) as GameState["permanents"];
        }
      }
      if (p.mulligans !== undefined) {
        next.mulligans = replaceKeys.has("mulligans")
          ? (p.mulligans as GameState["mulligans"])
          : deepMergeReplaceArrays(s.mulligans, p.mulligans);
      }
      if (p.mulliganDrawn !== undefined) {
        next.mulliganDrawn = replaceKeys.has("mulliganDrawn")
          ? (p.mulliganDrawn as GameState["mulliganDrawn"])
          : deepMergeReplaceArrays(s.mulliganDrawn, p.mulliganDrawn);
      }
      if (p.permanentPositions !== undefined) {
        next.permanentPositions = replaceKeys.has("permanentPositions")
          ? (p.permanentPositions as GameState["permanentPositions"])
          : deepMergeReplaceArrays(
              s.permanentPositions,
              p.permanentPositions
            );
      }
      if (p.permanentAbilities !== undefined) {
        next.permanentAbilities = replaceKeys.has("permanentAbilities")
          ? (p.permanentAbilities as GameState["permanentAbilities"])
          : deepMergeReplaceArrays(
              s.permanentAbilities,
              p.permanentAbilities
            );
      }
      if (p.sitePositions !== undefined) {
        next.sitePositions = replaceKeys.has("sitePositions")
          ? (p.sitePositions as GameState["sitePositions"])
          : deepMergeReplaceArrays(s.sitePositions, p.sitePositions);
      }
      if (p.playerPositions !== undefined) {
        next.playerPositions = replaceKeys.has("playerPositions")
          ? (p.playerPositions as GameState["playerPositions"])
          : deepMergeReplaceArrays(s.playerPositions, p.playerPositions);
      }
      if (p.events !== undefined) {
        if (replaceKeys.has("events")) {
          const ev = (p.events as GameEvent[]) || [];
          next.events = ev;
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(Number(p.eventSeq) || 0, 0)
              : Math.max(ev.reduce((mx, e) => Math.max(mx, Number(e.id) || 0), 0), 0);
        } else {
          const merged = mergeEvents(s.events, (p.events as GameEvent[]) || []);
          next.events = merged;
          const mergedMaxId = merged.reduce(
            (mx, e) => Math.max(mx, Number(e.id) || 0),
            0
          );
          const candidateSeq = Math.max(s.eventSeq, mergedMaxId);
          next.eventSeq =
            p.eventSeq !== undefined
              ? Math.max(candidateSeq, Number(p.eventSeq) || 0)
              : candidateSeq;
        }
      } else if (p.eventSeq !== undefined) {
        next.eventSeq = replaceKeys.has("eventSeq")
          ? Math.max(Number(p.eventSeq) || 0, 0)
          : Math.max(s.eventSeq, Number(p.eventSeq) || 0);
      }

      return next as Partial<GameState> as GameState;
    }),

  // Derived selectors (no state mutation)
  toggleGridOverlay: () =>
    set((s) => ({ showGridOverlay: !s.showGridOverlay })),
  togglePlaymat: () => set((s) => ({ showPlaymat: !s.showPlaymat })),


  selectPermanent: (at, index) =>
    set((s) => {
      const arr = s.permanents[at] || [];
      if (!arr[index]) return s;
      return {
        selectedPermanent: { at, index },
        selectedCard: null,
        selectedAvatar: null,
        previewCard: null,
      };
    }),

  // Reset all game state to initial values (for new matches)
  resetGameState: () =>
    set((state) => {
      console.log("[game] Resetting game state for new match");
      try { clearSnapshotsStorageFor(get().matchId ?? null); } catch {}
      const reset: Partial<GameState> = {
        players: {
          p1: {
            life: 20,
            lifeState: "alive",
            mana: 0,
            thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
          },
          p2: {
            life: 20,
            lifeState: "alive",
            mana: 0,
            thresholds: { air: 0, water: 0, earth: 0, fire: 0 },
          },
        },
        currentPlayer: 1,
        turn: 1,
        phase: "Setup",
        lastServerTs: 0,
        lastLocalActionTs: 0,
        setupWinner: null,
        d20Rolls: { p1: null, p2: null },
        actorKey: state.actorKey, // Preserve actorKey during reset
        matchEnded: false,
        winner: null,
        board: { size: { w: 5, h: 4 }, sites: {} },
        zones: createEmptyZonesRecord(),
        selectedCard: null,
        selectedPermanent: null,
        selectedAvatar: null,
        mouseInHandZone: false,
        handHoverCount: 0,
        avatars: createDefaultAvatars(),
        permanents: {},
        permanentPositions: {},
        permanentAbilities: {},
        sitePositions: {},
        playerPositions: createDefaultPlayerPositions(),
        dragFromHand: false,
        dragFromPile: null,
        hoverCell: null,
        previewCard: null,
        contextMenu: null,
        boardPings: [],
        lastPointerWorldPos: null,
        history: [],
        historyByPlayer: { p1: [], p2: [] },
        mulligans: { p1: 1, p2: 1 },
        mulliganDrawn: { p1: [], p2: [] },
        events: [],
        eventSeq: 0,
        pendingPatches: [],
        interactionLog: {},
        pendingInteractionId: null,
        acknowledgedInteractionIds: {},
        activeInteraction: null,
        transportSubscriptions: [],
        snapshots: [],
      };
      return reset as GameState;
    })
});

export const createGameStore = () => create<GameState>(createGameStoreState);

export const useGameStore = createGameStore();
setTransportStateAccessor(useGameStore.getState);
