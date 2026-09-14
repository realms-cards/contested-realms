/**
 * Game sound director.
 *
 * Instead of calling a sound from each of the hundreds of store actions, one
 * store subscriber compares the game state before and after every change and
 * turns the difference into sounds. Local actions and patches from the
 * opponent (or the CPU, which runs server-side) go through the same store, so
 * both are heard; patches applied by applyServerPatch are tagged "remote" and
 * play with the opponent voice.
 *
 * Existing direct calls in UI code (card play thud, flip, select) stay in
 * place; the sound manager merges an identical sound fired twice in the same
 * moment, so the director may cue the same clip without doubling it.
 */

import { useEffect } from "react";
import type { StoreApi } from "zustand";
import {
  soundManager,
  type SfxActor,
  type SfxLadder,
  type SoundEffectId,
} from "@/lib/audio/soundManager";
import type {
  CardRef,
  CellKey,
  GameState,
  PermanentItem,
  PlayerKey,
} from "@/lib/game/store/types";

// ─── Source tagging ──────────────────────────────────────────────────────

/** Where a state change came from: this client, a server patch, or undo. */
export type SfxSource = "local" | "remote" | "undo";

let activeSource: SfxSource = "local";

/**
 * Run a synchronous store update tagged with its source. Zustand notifies
 * subscribers synchronously inside set(), so the director sees the tag.
 */
export function withSfxSource<T>(source: SfxSource, fn: () => T): T {
  const previous = activeSource;
  activeSource = source;
  try {
    return fn();
  } finally {
    activeSource = previous;
  }
}

// ─── Diff ────────────────────────────────────────────────────────────────

/** The parts of the game state the director reads. */
export type SfxState = Pick<
  GameState,
  | "matchId"
  | "actorKey"
  | "zones"
  | "permanents"
  | "board"
  | "avatars"
  | "players"
  | "currentPlayer"
  | "phase"
  | "pendingCombat"
  | "lastCombatSummary"
  | "pendingMagic"
  | "gemTokens"
  | "matchEnded"
>;

export type SfxCue = {
  id: SoundEffectId;
  actor: SfxActor;
  ladder?: SfxLadder;
};

const PILES = ["hand", "spellbook", "atlas", "graveyard", "banished", "collection"] as const;
type Pile = (typeof PILES)[number];
type Location = { kind: "pile"; seat: PlayerKey; pile: Pile } | { kind: "board" } | { kind: "sites" };
type Entry = { loc: Location; id: string; sig: string; card: CardRef };

const SEATS: readonly PlayerKey[] = ["p1", "p2"];

/** Card movements beyond this in one change are a load, reset or resync, not play. */
const MAX_CARD_MOVES = 24;
/** At most this many distinct sounds per change, highest priority first. */
const MAX_CUES = 4;

// Highest priority first; ids not listed sort last.
const PRIORITY: readonly SoundEffectId[] = [
  "victory",
  "consent",
  "deathsDoor",
  "kill",
  "banish",
  "toCemetery",
  "attack",
  "endTurn",
  "sitePlaced",
  "minionEnters",
  "spellCast",
  "flood",
  "token",
  "cardPlay",
  "transform",
  "hit",
  "returnToHand",
  "draw",
  "discard",
  "cardShuffle",
  "move",
  "reveal",
  "counterUp",
  "counterDown",
  "cardFlip",
  "targetLock",
];

const seatNumber = (seat: PlayerKey): 1 | 2 => (seat === "p1" ? 1 : 2);

function cardEntry(loc: Location, card: CardRef | null | undefined, fallbackId?: string | null): Entry | null {
  if (!card) return null;
  return {
    loc,
    id: card.instanceId || fallbackId || "",
    sig: `${card.cardId}:${card.name}`,
    card,
  };
}

function zoneEntries(zones: SfxState["zones"] | undefined): Entry[] {
  const out: Entry[] = [];
  if (!zones) return out;
  for (const seat of SEATS) {
    const seatZones = zones[seat];
    if (!seatZones) continue;
    for (const pile of PILES) {
      const cards = seatZones[pile];
      if (!Array.isArray(cards)) continue;
      const loc: Location = { kind: "pile", seat, pile };
      for (const card of cards) {
        const entry = cardEntry(loc, card);
        if (entry) out.push(entry);
      }
    }
  }
  return out;
}

function boardEntries(permanents: SfxState["permanents"] | undefined): Entry[] {
  const out: Entry[] = [];
  if (!permanents) return out;
  const loc: Location = { kind: "board" };
  for (const items of Object.values(permanents)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const entry = cardEntry(loc, item?.card, item?.instanceId);
      if (entry) out.push(entry);
    }
  }
  return out;
}

function siteEntries(board: SfxState["board"] | undefined): Entry[] {
  const out: Entry[] = [];
  const sites = board?.sites;
  if (!sites) return out;
  const loc: Location = { kind: "sites" };
  for (const site of Object.values(sites)) {
    const entry = cardEntry(loc, site?.card);
    if (entry) out.push(entry);
  }
  return out;
}

const entryKey = (entry: Entry): string => (entry.id ? `i:${entry.id}` : `s:${entry.sig}`);
const sameLocation = (a: Location, b: Location): boolean =>
  a.kind === b.kind &&
  (a.kind !== "pile" || (b.kind === "pile" && a.seat === b.seat && a.pile === b.pile));
const locationKey = (loc: Location): string =>
  loc.kind === "pile" ? `${loc.seat}:${loc.pile}` : loc.kind;

/** Multiset difference per location: cards that left and cards that arrived. */
function diffEntries(prev: Entry[], next: Entry[]): { removed: Entry[]; added: Entry[] } {
  const buckets = new Map<string, Entry[]>();
  for (const entry of prev) {
    const key = `${locationKey(entry.loc)}|${entryKey(entry)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }
  const added: Entry[] = [];
  for (const entry of next) {
    const bucket = buckets.get(`${locationKey(entry.loc)}|${entryKey(entry)}`);
    if (bucket && bucket.length > 0) bucket.pop();
    else added.push(entry);
  }
  const removed: Entry[] = [];
  for (const bucket of buckets.values()) removed.push(...bucket);
  return { removed, added };
}

type Move = { from: Location | null; to: Location | null; card: CardRef };

/** Pair departures with arrivals: by instance id, then by card, then by seat. */
function pairMoves(removed: Entry[], added: Entry[]): Move[] {
  const moves: Move[] = [];
  const left = [...removed];
  const pending: Entry[] = [];

  const take = (predicate: (entry: Entry) => boolean): Entry | null => {
    const index = left.findIndex(predicate);
    if (index < 0) return null;
    const [entry] = left.splice(index, 1);
    return entry ?? null;
  };

  for (const arrival of added) {
    const source = arrival.id ? take((entry) => entry.id === arrival.id) : null;
    if (source) moves.push({ from: source.loc, to: arrival.loc, card: arrival.card });
    else pending.push(arrival);
  }
  const stillPending: Entry[] = [];
  for (const arrival of pending) {
    const source = take((entry) => entry.sig === arrival.sig && !sameLocation(entry.loc, arrival.loc));
    if (source) moves.push({ from: source.loc, to: arrival.loc, card: arrival.card });
    else stillPending.push(arrival);
  }
  for (const arrival of stillPending) {
    // Hidden cards (e.g. an opponent's hand) may not carry identities.
    const arrivalLoc = arrival.loc;
    const source =
      arrivalLoc.kind === "pile"
        ? take((entry) => entry.loc.kind === "pile" && entry.loc.seat === arrivalLoc.seat && entry.loc.pile !== arrivalLoc.pile)
        : null;
    moves.push({ from: source ? source.loc : null, to: arrival.loc, card: arrival.card });
  }
  for (const departure of left) moves.push({ from: departure.loc, to: null, card: departure.card });
  return moves;
}

function enterSound(card: CardRef): SoundEffectId {
  const type = (card.type ?? "").toLowerCase();
  if (type.includes("site")) return "sitePlaced";
  if (type.includes("token")) return /flood/i.test(card.name) ? "flood" : "token";
  if (type.includes("magic") || type.includes("aura")) return "spellCast";
  if (type.includes("artifact")) return "token";
  return "minionEnters";
}

const pileOf = (loc: Location | null): Pile | null => (loc && loc.kind === "pile" ? loc.pile : null);
const onBoard = (loc: Location | null): boolean => !!loc && (loc.kind === "board" || loc.kind === "sites");

function moveSounds(move: Move): SoundEffectId[] {
  const { from, to, card } = move;
  const fromPile = pileOf(from);
  const toPile = pileOf(to);

  if (to === null) return from && onBoard(from) ? ["toCemetery"] : [];
  if (toPile === "banished") return ["banish"];
  if (to.kind === "sites") return ["cardPlay", "sitePlaced"];
  if (to.kind === "board") return onBoard(from) ? [] : ["cardPlay", enterSound(card)];
  if (toPile === "graveyard") {
    if (onBoard(from)) return ["toCemetery"];
    return fromPile === "hand" || fromPile === "spellbook" || fromPile === "atlas" ? ["discard"] : [];
  }
  if (toPile === "hand") {
    // Opponent piles are hidden: server patches never empty a local pile, so
    // their draws arrive as a card appearing in hand with no pile departure.
    if (from === null) {
      return [(card.type ?? "").toLowerCase().includes("token") ? "token" : "draw"];
    }
    if (fromPile === "spellbook" || fromPile === "atlas") return ["draw"];
    if (onBoard(from) || fromPile === "graveyard" || fromPile === "banished") return ["returnToHand"];
    return [];
  }
  if ((toPile === "spellbook" || toPile === "atlas") && onBoard(from)) return ["returnToHand"];
  return [];
}

function permanentsById(permanents: SfxState["permanents"] | undefined): Map<string, { cell: CellKey; item: PermanentItem }> {
  const map = new Map<string, { cell: CellKey; item: PermanentItem }>();
  if (!permanents) return map;
  for (const [cell, items] of Object.entries(permanents)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const id = item?.card?.instanceId || item?.instanceId;
      if (id) map.set(id, { cell, item });
    }
  }
  return map;
}

function sitesById(board: SfxState["board"] | undefined): Map<string, CellKey> {
  const map = new Map<string, CellKey>();
  const sites = board?.sites;
  if (!sites) return map;
  for (const [cell, site] of Object.entries(sites)) {
    const id = site?.card?.instanceId;
    if (id) map.set(id, cell);
  }
  return map;
}

function pileOrderChanged(prev: CardRef[] | undefined, next: CardRef[] | undefined): boolean {
  if (!prev || !next || prev === next || prev.length !== next.length || prev.length < 2) return false;
  const counts = new Map<string, number>();
  let reordered = false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    const keyA = a?.instanceId || `${a?.cardId}:${a?.name}`;
    const keyB = b?.instanceId || `${b?.cardId}:${b?.name}`;
    if (keyA !== keyB) reordered = true;
    counts.set(keyA, (counts.get(keyA) ?? 0) + 1);
    counts.set(keyB, (counts.get(keyB) ?? 0) - 1);
  }
  if (!reordered) return false;
  for (const count of counts.values()) if (count !== 0) return false;
  return true;
}

const COMBAT_KILL = /destroy|slain|\bdies\b|\bdied\b|killed/i;

/**
 * Sounds for one state change. Pure: the same inputs always give the same cues.
 */
export function diffGameSfx(prev: SfxState, next: SfxState, source: SfxSource): SfxCue[] {
  if (source === "undo") return [];
  if (prev.matchId !== next.matchId) return [];

  const ids = new Set<SoundEffectId>();
  let ladder: SfxLadder | undefined;
  const actor: SfxActor = source === "remote" && next.actorKey ? "opponent" : "me";
  const turnChanged = prev.currentPlayer !== next.currentPlayer;

  // Cards changing places: draws, discards, deaths, banishes, plays.
  const zonesChanged = prev.zones !== next.zones;
  const boardChanged = prev.permanents !== next.permanents;
  const sitesChanged = prev.board !== next.board;
  if (zonesChanged || boardChanged || sitesChanged) {
    const removed: Entry[] = [];
    const added: Entry[] = [];
    const collect = (a: Entry[], b: Entry[]) => {
      const diff = diffEntries(a, b);
      removed.push(...diff.removed);
      added.push(...diff.added);
    };
    if (zonesChanged) collect(zoneEntries(prev.zones), zoneEntries(next.zones));
    if (boardChanged) collect(boardEntries(prev.permanents), boardEntries(next.permanents));
    if (sitesChanged) collect(siteEntries(prev.board), siteEntries(next.board));

    const burst = removed.length + added.length > MAX_CARD_MOVES;
    if (!burst) {
      for (const move of pairMoves(removed, added)) {
        for (const id of moveSounds(move)) ids.add(id);
      }
    }

    if (zonesChanged && !burst) {
      for (const seat of SEATS) {
        for (const pile of ["spellbook", "atlas"] as const) {
          if (pileOrderChanged(prev.zones?.[seat]?.[pile], next.zones?.[seat]?.[pile])) ids.add("cardShuffle");
        }
      }
    }

    // Permanents that stayed on the board: moves, taps, counters, damage, reveals.
    if (boardChanged && !burst) {
      const before = permanentsById(prev.permanents);
      const after = permanentsById(next.permanents);
      for (const [id, now] of after) {
        const was = before.get(id);
        if (!was) continue;
        if (was.cell !== now.cell) ids.add("move");
        if (!!was.item.tapped !== !!now.item.tapped && !turnChanged) ids.add("cardFlip");
        const counterDelta = (now.item.counters ?? 0) - (was.item.counters ?? 0);
        if (counterDelta !== 0) {
          const id: SoundEffectId = counterDelta > 0 ? "counterUp" : "counterDown";
          ids.add(id);
          ladder = { key: id, step: counterDelta > 0 ? 1 : -1 };
        }
        if ((now.item.damage ?? 0) > (was.item.damage ?? 0)) ids.add("hit");
        if (was.item.faceDown && !now.item.faceDown) ids.add("reveal");
        if (!was.item.faceDown && now.item.faceDown) ids.add("cardFlip");
        if (was.item.card?.name && now.item.card?.name && was.item.card.name !== now.item.card.name) {
          ids.add("transform");
        }
      }
    }

    if (sitesChanged && !burst) {
      const before = sitesById(prev.board);
      const after = sitesById(next.board);
      for (const [id, cell] of after) {
        const was = before.get(id);
        if (was && was !== cell) ids.add("move");
      }
      const prevSites = prev.board?.sites ?? {};
      for (const [cell, site] of Object.entries(next.board?.sites ?? {})) {
        const was = prevSites[cell];
        if (!was || !site) continue;
        if (!!was.tapped !== !!site.tapped && !turnChanged) ids.add("cardFlip");
        const sameIdentity = (was.card?.instanceId ?? null) === (site.card?.instanceId ?? null);
        if (sameIdentity && was.card?.name && site.card?.name && was.card.name !== site.card.name) {
          ids.add("transform");
        }
      }
    }
  }

  // Avatars: movement, taps, counters.
  if (prev.avatars !== next.avatars) {
    for (const seat of SEATS) {
      const was = prev.avatars?.[seat];
      const now = next.avatars?.[seat];
      if (!was || !now) continue;
      const wasPos = was.pos;
      const nowPos = now.pos;
      if (nowPos && (!wasPos || wasPos[0] !== nowPos[0] || wasPos[1] !== nowPos[1])) ids.add("move");
      if (!!was.tapped !== !!now.tapped && !turnChanged) ids.add("cardFlip");
      const counterDelta = (now.counters ?? 0) - (was.counters ?? 0);
      if (counterDelta !== 0) {
        const id: SoundEffectId = counterDelta > 0 ? "counterUp" : "counterDown";
        ids.add(id);
        ladder = { key: id, step: counterDelta > 0 ? 1 : -1 };
      }
    }
  }

  // Death's Door.
  if (prev.players !== next.players) {
    for (const seat of SEATS) {
      if (prev.players?.[seat]?.lifeState !== "dd" && next.players?.[seat]?.lifeState === "dd") {
        ids.add("deathsDoor");
      }
    }
  }

  // Turn and phase. When my turn starts the turn overlay plays the gong clip;
  // this marks my turn ending instead so each hand-over has one sound.
  if (turnChanged && next.actorKey && seatNumber(next.actorKey) !== next.currentPlayer) {
    ids.add("endTurn");
  } else if (!turnChanged && prev.phase !== next.phase && prev.phase !== "Setup" && next.phase !== "Setup") {
    ids.add("targetLock");
  }

  // Combat.
  const combat = next.pendingCombat;
  const combatBefore = prev.pendingCombat;
  if (combat && combat !== combatBefore) {
    if (!combatBefore || combatBefore.id !== combat.id) {
      if (combat.status === "declared" || combat.status === "defending") {
        ids.add("attack");
        if (next.actorKey && combat.defenderSeat === next.actorKey && combat.status === "defending") {
          ids.add("consent");
        }
      }
    } else if (combatBefore.status !== "committed" && combat.status === "committed") {
      ids.add("targetLock");
    }
  }
  const summary = next.lastCombatSummary;
  if (summary && summary.id !== prev.lastCombatSummary?.id) {
    ids.add(COMBAT_KILL.test(summary.text) ? "kill" : "hit");
  }

  // Magic targeting.
  const magic = next.pendingMagic;
  const magicBefore = prev.pendingMagic;
  if (magic && magicBefore && magic.id === magicBefore.id) {
    if ((!magicBefore.target && magic.target) || (magicBefore.status !== "confirm" && magic.status === "confirm")) {
      ids.add("targetLock");
    }
  }

  // Gem tokens.
  if (prev.gemTokens !== next.gemTokens && Array.isArray(next.gemTokens)) {
    const known = new Set((prev.gemTokens ?? []).map((token) => token.id));
    if (next.gemTokens.some((token) => !known.has(token.id))) ids.add("token");
  }

  // Hotseat match end (online matches play theirs from the match end overlay).
  if (!prev.matchEnded && next.matchEnded && !next.actorKey && !next.matchId) {
    ids.add("victory");
  }

  const rank = (id: SoundEffectId): number => {
    const index = PRIORITY.indexOf(id);
    return index < 0 ? PRIORITY.length : index;
  };
  return [...ids]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_CUES)
    .map((id) => ({
      id,
      actor,
      ...(ladder && ladder.key === id ? { ladder } : {}),
    }));
}

// ─── Installer ───────────────────────────────────────────────────────────

type SfxStore = Pick<StoreApi<GameState>, "subscribe">;

const RELEVANT_KEYS = [
  "zones",
  "permanents",
  "board",
  "avatars",
  "players",
] as const satisfies readonly (keyof GameState)[];

/** Death cues this soon after a kill sting are part of the same blow. */
const KILL_MERGE_MS = 700;

/** Subscribe the director to a game store. Returns the unsubscribe function. */
export function installGameSfx(store: SfxStore): () => void {
  let lastKillAt = 0;
  return store.subscribe((next, prev) => {
    if (activeSource === "undo") {
      if (RELEVANT_KEYS.some((key) => prev[key] !== next[key])) {
        soundManager.play("returnToHand");
      }
      return;
    }
    let cues: SfxCue[];
    try {
      cues = diffGameSfx(prev, next, activeSource);
    } catch {
      return;
    }
    const now = Date.now();
    for (const cue of cues) {
      if (cue.id === "kill") lastKillAt = now;
      if (cue.id === "toCemetery" && now - lastKillAt < KILL_MERGE_MS) continue;
      soundManager.play(cue.id, { actor: cue.actor, ladder: cue.ladder });
    }
  });
}

/** Mount on a match screen to hear the game. Renders nothing. */
export function GameSoundEffects({ store }: { store: SfxStore }): null {
  useEffect(() => installGameSfx(store), [store]);
  return null;
}
