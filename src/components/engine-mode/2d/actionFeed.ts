import type { EngineFeedNote } from "@/lib/engine-mode/narration";
import type { CellKey, GameEvent } from "@/lib/game/store/types";

/**
 * The action feed's model: the engine's log (already projected into `useGameStore.events`,
 * with squares rewritten to our tile numbers by localizeEngineText) regrouped into what a
 * player wants to follow — one entry per thing a seat DID (played a site, summoned, cast,
 * moved, attacked, used an ability), with what it caused (damage, deaths, destroyed sites,
 * life lost) folded underneath, grouped per turn, newest first.
 *
 * Pure: the page supplies who the seats are, how to look a card's type up and where a named
 * card sits on the board now, so it is tested against real engine logs without a store.
 */

export type FeedSeat = "p1" | "p2";

/** Things a seat does. */
export type ActionKind = "play" | "cast" | "summon" | "move" | "attack" | "ability" | "draw" | "discard";
/** What an action caused. */
export type OutcomeKind = "damage" | "death" | "destroy" | "lifeLoss" | "lifeGain" | "note";
export type FeedKind = ActionKind | OutcomeKind;

export interface FeedOutcome {
  id: number;
  kind: OutcomeKind;
  text: string;
  /** the card it happened to, when it names one */
  card: string | null;
  cells: CellKey[];
}

export interface FeedEntry {
  /** the engine log line it was built from (the first, when lines were merged) */
  id: number;
  seat: FeedSeat | null;
  kind: FeedKind;
  /** one plain sentence in the reader's person: "Computer casts Lightning Bolt." / "You cast…" */
  text: string;
  /** the card the entry is about (shown as its thumbnail), when there is one */
  card: string | null;
  /** tiles the entry itself names or that its card stands on */
  cells: CellKey[];
  outcomes: FeedOutcome[];
}

export interface FeedTurn {
  key: string;
  /** the engine's turn number; 0 is the opening (draws and mulligans) */
  turn: number;
  /** whose turn it is, when the log said so */
  seat: FeedSeat | null;
  /** the OTHER seat played this turn for its owner (Courtesan Thaïs): who actually decided */
  playedBy: FeedSeat | null;
  /** newest first */
  entries: FeedEntry[];
}

export interface FeedContext {
  /** the seats' names as the engine writes them: [ours, theirs] — usually ["You", "Computer"] */
  players: readonly [string, string];
  /** the card's printed type ("Minion", "Magic", "Site"…) or null when the words are not a card */
  cardType: (name: string) => string | null;
  /** where a card of this name stands on the board now (our cell keys); optional */
  locate?: (name: string) => CellKey[];
  /**
   * Where a card of this name stood just before (`before`) and just after (`now`) log line `id`
   * arrived — pinned when the line was new, so a summon's tile or a move's origin is not
   * rewritten when the card moves on later. Null when the page did not see the line arrive
   * (an older line, a resumed match). Optional.
   */
  placedAt?: (id: number, name: string) => { before: readonly CellKey[]; now: readonly CellKey[] } | null;
  /**
   * Entries the session recorded because the log cannot say them (the card a toll discarded).
   * Each stands as its own entry — never folded under an earlier action — and the log lines it
   * explains fold under it instead. Optional.
   */
  notes?: readonly EngineFeedNote[];
  /** turns played under Courtesan Thaïs: engine turn → the seat whose turn was piloted. Optional. */
  controlTurns?: Readonly<Record<number, 0 | 1>>;
  /** the engine seat this client plays (seat 1 in a player-vs-player match). Default 0. */
  viewer?: 0 | 1;
}

/** Lines that are pure bookkeeping: the feed would drown in them. */
const NOISE: RegExp[] = [/ provides \d+ mana\.$/, / skips? the first-turn draw\.$/, /^Both players may mulligan/];

const ABSORBS: ReadonlySet<FeedKind> = new Set<FeedKind>(["play", "cast", "summon", "move", "attack", "ability"]);

/** Our tile number (1–20, left→right, top→bottom) as a cell key. */
export function tileCell(tile: number): CellKey | null {
  if (!Number.isInteger(tile) || tile < 1 || tile > 20) return null;
  return `${(tile - 1) % 5},${Math.floor((tile - 1) / 5)}`;
}

/** A cell key's tile number (1–20), or null off the board. */
export function cellTile(cell: CellKey): number | null {
  const [x, y] = cell.split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 4 || y < 0 || y > 3) return null;
  return y * 5 + x + 1;
}

/** Every "tile N" the sentence names. */
function tilesIn(text: string): CellKey[] {
  const cells: CellKey[] = [];
  for (const m of text.matchAll(/\btile (\d+)\b/g)) {
    const cell = tileCell(Number(m[1]));
    if (cell && !cells.includes(cell)) cells.push(cell);
  }
  return cells;
}

/** No emoji in the interface: the engine decorates a handful of lines with them. */
function plain(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const union = (a: CellKey[], b: readonly CellKey[]) => {
  for (const c of b) if (!a.includes(c)) a.push(c);
  return a;
};

interface Parsed {
  kind: FeedKind | "turn" | "skip";
  text: string;
  card: string | null;
  cells: CellKey[];
  /** for merging a move into the attack that follows it */
  subject?: string;
}

/**
 * One localized log line, read.
 */
function parseLine(raw: string, ctx: FeedContext, id: number): Parsed {
  const text = plain(raw);
  const spot = (name: string) => ctx.placedAt?.(id, name) ?? null;
  const isCard = (name: string) => ctx.cardType(name) !== null;
  const locate = (name: string | null) => (name && ctx.locate ? ctx.locate(name).slice(0, 4) : []);
  if (!text || NOISE.some((re) => re.test(text))) return { kind: "skip", text, card: null, cells: [] };
  if (/^—\s*Turn \d+/.test(text)) return { kind: "turn", text, card: null, cells: [] };

  const [you, them] = ctx.players;
  const who = (name: string): FeedSeat | null => (name === you ? "p1" : name === them ? "p2" : null);
  const reader = (s: FeedSeat | null) => (s === "p1" ? "You" : s === "p2" ? them : "");
  const verb = (s: FeedSeat | null, base: string, third: string) => (s === "p1" ? base : third);

  // ---- a seat's own lines: "<player> <verb> …" ----
  const lead = /^(.+?) (plays?|casts?|draws?|discards?|keeps?|mulligans?|los(?:es|e|)|gains?) (.*)$/.exec(text);
  const actorSeat = lead ? who(lead[1]) : null;
  if (lead && actorSeat) {
    const [, , word, rest] = lead;
    const name = reader(actorSeat);
    const play = /^(.+?) at tile (\d+)\.?$/.exec(rest);
    if (word.startsWith("play") && play) {
      const card = play[1];
      return {
        kind: "play",
        text: `${name} ${verb(actorSeat, "play", "plays")} ${card} at tile ${play[2]}.`,
        card,
        cells: tilesIn(rest),
      };
    }
    if (word.startsWith("cast")) {
      const cast = /^(.+?)(?: as (.+?))?(?: with (.+?))?\.$/.exec(rest);
      if (cast) {
        const card = cast[2] ?? cast[1];
        const minion = (ctx.cardType(cast[1]) ?? "").toLowerCase().includes("minion");
        const with_ = cast[3] ? ` with ${cast[3]}` : "";
        // a summon names its tile: the one square where a card of that name appeared
        const placed = minion ? spot(card) : null;
        const fresh = placed ? placed.now.filter((c) => !placed.before.includes(c)) : [];
        const at = fresh.length === 1 ? fresh[0] : null;
        const tile = at ? cellTile(at) : null;
        return {
          kind: minion ? "summon" : "cast",
          text: minion
            ? `${name} ${verb(actorSeat, "summon", "summons")} ${card}${tile ? ` at tile ${tile}` : ""}${with_}.`
            : `${name} ${verb(actorSeat, "cast", "casts")} ${card}${with_}.`,
          card: isCard(card) ? card : cast[1],
          cells: at ? [at] : locate(card),
        };
      }
    }
    if (word.startsWith("draw")) {
      const draw = /^(a card|\d+ cards) from (?:their|your|its) (atlas|spellbook)/.exec(rest);
      if (draw) {
        const n = draw[1] === "a card" ? 1 : Number.parseInt(draw[1], 10);
        const what = draw[2] === "atlas" ? "site" : "spell";
        const count = n === 1 ? `a ${what}` : `${n} ${what}s`;
        return { kind: "draw", text: `${name} ${verb(actorSeat, "draw", "draws")} ${count}.`, card: null, cells: [] };
      }
    }
    if (word.startsWith("discard")) {
      const card = rest.replace(/\.$/, "");
      return {
        kind: "discard",
        text: `${name} ${verb(actorSeat, "discard", "discards")} ${card}.`,
        card: isCard(card) ? card : null,
        cells: [],
      };
    }
    const life = /^(\d+) life(?: \(now (\d+)\))?/.exec(rest);
    if (word.startsWith("los") && life) {
      const now = life[2] ? ` (now ${life[2]})` : "";
      return { kind: "lifeLoss", text: `${name} ${verb(actorSeat, "lose", "loses")} ${life[1]} life${now}.`, card: null, cells: [] };
    }
    if (word.startsWith("gain") && life) {
      const now = life[2] ? ` (now ${life[2]})` : "";
      return { kind: "lifeGain", text: `${name} ${verb(actorSeat, "gain", "gains")} ${life[1]} life${now}.`, card: null, cells: [] };
    }
    if (word.startsWith("keep")) {
      return { kind: "note", text: `${name} ${verb(actorSeat, "keep", "keeps")} the opening hand.`, card: null, cells: [] };
    }
  }

  // ---- a card's lines ----
  const move = /^(.+?) moves to (tile \d+)(?: (\w+))?\.$/.exec(text);
  if (move) {
    const region = move[3] ? ` (${move[3]})` : "";
    const to = tilesIn(move[2]);
    // where it came from: the one square the unit stood on before the move
    const placed = spot(move[1]);
    const origin = placed && placed.before.length === 1 && !to.includes(placed.before[0]) ? placed.before[0] : null;
    const fromTile = origin ? cellTile(origin) : null;
    return {
      kind: "move",
      text: `${move[1]} moves ${fromTile ? `from tile ${fromTile} ` : ""}to ${move[2]}${region}.`,
      card: move[1],
      cells: origin ? [origin, ...to] : to,
      subject: move[1],
    };
  }
  const attack = /^(.+?) attacks (.+?)!$/.exec(text);
  if (attack) {
    return {
      kind: "attack",
      text: `${attack[1]} attacks ${attack[2]}.`,
      card: attack[1],
      cells: union(locate(attack[1]), locate(attack[2])),
      subject: attack[1],
    };
  }
  const damage = /^(.+?) (?:takes (\d+) damage|is struck for (\d+))/.exec(text);
  if (damage) {
    const n = damage[2] ?? damage[3];
    return { kind: "damage", text: `${damage[1]} takes ${n} damage.`, card: isCard(damage[1]) ? damage[1] : null, cells: locate(damage[1]) };
  }
  const death = /^(.+?) dies\.(?: \((.+)\))?/.exec(text);
  if (death) {
    const by = death[2] ? ` (${death[2]})` : "";
    return { kind: "death", text: `${death[1]} dies${by}.`, card: isCard(death[1]) ? death[1] : null, cells: [] };
  }
  const gone = /^(.+?) (is destroyed|is banished|returns to its owner's hand|drowns)/.exec(text);
  if (gone) {
    return { kind: gone[2] === "drowns" ? "death" : "destroy", text, card: isCard(gone[1]) ? gone[1] : null, cells: locate(gone[1]) };
  }
  if (/^Death blow!/.test(text)) return { kind: "death", text, card: null, cells: [] };
  const ability = /^(.+?): (.+)$/.exec(text);
  if (ability && isCard(ability[1])) {
    return { kind: "ability", text: `${ability[1]}: ${ability[2]}`, card: ability[1], cells: locate(ability[1]) };
  }
  const token = /^An? (.+?) token appears\.$/.exec(text);
  if (token) return { kind: "note", text, card: isCard(token[1]) ? token[1] : null, cells: [] };
  return { kind: "note", text, card: null, cells: tilesIn(text) };
}

const seatOf = (player: GameEvent["player"]): FeedSeat | null => (player === 1 ? "p1" : player === 2 ? "p2" : null);

/**
 * The feed, newest turn first and newest entry first within a turn. A line about a result
 * (damage, a death, life lost, a flavour line) is folded into the action just before it in
 * the same turn; a unit's move followed by its attack reads as one "moves to tile 8 and
 * attacks …" entry.
 */
export function buildActionFeed(events: readonly GameEvent[], ctx: FeedContext): FeedTurn[] {
  const turns: FeedTurn[] = [];
  // the turn being filled and its newest entry (what a result line folds into)
  const at: { turn: FeedTurn | null; last: FeedEntry | null } = { turn: null, last: null };
  const piloted = (turn: number): FeedSeat | null => {
    const seat = ctx.controlTurns?.[turn];
    // the seat that DECIDED is the other one: ours ("p1") when the piloted turn was theirs
    if (seat !== 0 && seat !== 1) return null;
    return seat === (ctx.viewer ?? 0) ? "p2" : "p1";
  };
  // notes by the log line they explain, and the ones that only know where they go
  const noteOf = new Map<number, EngineFeedNote>();
  const placeAfter = new Map<number, EngineFeedNote[]>();
  for (const note of ctx.notes ?? []) {
    if (note.lines.length) for (const line of note.lines) noteOf.set(line, note);
    else placeAfter.set(note.after, [...(placeAfter.get(note.after) ?? []), note]);
  }
  const placed = new Map<EngineFeedNote, FeedEntry>();
  const open = (turn: number, seat: FeedSeat | null, id: number): FeedTurn => {
    const group: FeedTurn = { key: `t${turn}:${id}`, turn, seat, playedBy: piloted(turn), entries: [] };
    turns.push(group);
    at.turn = group;
    at.last = null;
    return group;
  };
  /** a note's own entry: first-class, so nothing earlier absorbs it */
  const placeNote = (note: EngineFeedNote, group: FeedTurn, id: number): FeedEntry => {
    const entry: FeedEntry = { id, seat: note.seat, kind: note.kind, text: note.text, card: note.card, cells: [...note.cells], outcomes: [] };
    group.entries.push(entry);
    placed.set(note, entry);
    at.last = entry;
    return entry;
  };
  const consume = (event: GameEvent) => {
    const turn = event.turn ?? 0;
    const seat = seatOf(event.player);
    const parsed = parseLine(event.text, ctx, event.id);
    const note = noteOf.get(event.id);
    if (note && parsed.kind !== "turn") {
      const group = at.turn && at.turn.turn === turn ? at.turn : open(turn, null, event.id);
      const entry = placed.get(note) ?? placeNote(note, group, event.id);
      // The line it explains ("X pays the troll's toll.") is said better by the note itself; a
      // result with substance (damage, a death, life) still reads underneath it.
      const kind = parsed.kind;
      if (kind === "damage" || kind === "death" || kind === "destroy" || kind === "lifeLoss" || kind === "lifeGain") {
        entry.outcomes.push({ id: event.id, kind, text: parsed.text, card: parsed.card, cells: parsed.cells });
      }
      return;
    }
    if (parsed.kind === "skip") return;
    if (parsed.kind === "turn") {
      open(turn, seat, event.id);
      return;
    }
    const group = at.turn && at.turn.turn === turn ? at.turn : open(turn, null, event.id);

    const kind = parsed.kind;
    const prev = at.last;
    const outcome =
      kind === "damage" ||
      kind === "death" ||
      kind === "destroy" ||
      kind === "lifeLoss" ||
      kind === "lifeGain" ||
      kind === "note" ||
      kind === "discard";
    if (outcome && prev && ABSORBS.has(prev.kind)) {
      prev.outcomes.push({
        id: event.id,
        kind: kind === "discard" ? "note" : kind,
        text: parsed.text,
        card: parsed.card,
        cells: parsed.cells,
      });
      return;
    }
    // a unit's move and the attack it was making read as one action
    if (
      kind === "attack" &&
      prev &&
      prev.kind === "move" &&
      prev.outcomes.length === 0 &&
      parsed.subject &&
      prev.card === parsed.subject
    ) {
      const to = / moves ((?:from tile \d+ )?to tile \d+(?: \(\w+\))?)\.$/.exec(prev.text)?.[1];
      const target = parsed.text.slice(parsed.subject.length + " attacks ".length);
      prev.kind = "attack";
      prev.text = to ? `${parsed.subject} moves ${to} and attacks ${target}` : parsed.text;
      union(prev.cells, parsed.cells);
      return;
    }
    const entry: FeedEntry = { id: event.id, seat, kind, text: parsed.text, card: parsed.card, cells: [...parsed.cells], outcomes: [] };
    group.entries.push(entry);
    at.last = entry;
  };
  for (const event of events) {
    consume(event);
    // a note whose answer wrote no log line of its own goes right after the line before it
    for (const note of placeAfter.get(event.id) ?? []) {
      if (placed.has(note)) continue;
      const group = at.turn ?? open(event.turn ?? 0, null, event.id);
      placeNote(note, group, event.id + 0.5);
    }
  }
  // a piloted turn (Courtesan Thaïs) says who decided: "Computer moves your Flamecaller…"
  for (const group of turns) {
    if (!group.playedBy) continue;
    for (const entry of group.entries) entry.text = pilotedText(entry, group.playedBy, ctx.players[1]);
  }
  // newest first, and an empty turn (a header and nothing else) is left out
  return turns
    .filter((t) => t.entries.length > 0)
    .map((t) => ({ ...t, entries: [...t.entries].reverse() }))
    .reverse();
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "casts" → "cast", "summons" → "summon", "draws" → "draw": the verb for "You". */
const baseVerb = (verb: string) => (/(?:sh|ch|x|z|ss)es$/.test(verb) ? verb.slice(0, -2) : verb.replace(/s$/, ""));
/** "cast" → "casts": the verb for the computer. */
const thirdVerb = (verb: string) => (/(?:sh|ch|x|z|s)$/.test(verb) ? `${verb}es` : `${verb}s`);

/**
 * An entry of a turn the OTHER seat played (Courtesan Thaïs), told as that seat's decision and
 * the owner's piece, in the reader's person: while the computer plays our turn, "Flamecaller
 * moves to tile 13." reads "Computer moves your Flamecaller to tile 13." and "You summon Pit
 * Vipers." reads "Computer summons Pit Vipers for you."; while we play theirs, "You move
 * Computer's Wild Boars…" and "You cast Lightning Bolt for Computer.". Entries of the deciding
 * seat's own pieces, and results, are left as they are.
 */
export function pilotedText(entry: Pick<FeedEntry, "seat" | "kind" | "text" | "card">, decider: FeedSeat, them: string): string {
  const owner = entry.seat;
  if (!owner || owner === decider) return entry.text;
  const you = decider === "p1";
  const actor = you ? "You" : them;
  const pieces = owner === "p1" ? "your" : `${them}'s`;
  const ownerName = owner === "p1" ? "You" : them;
  const { text, card } = entry;
  // a seat's own line: "You summon X at tile 13." / "Computer casts X."
  const lead = new RegExp(`^${escapeRe(ownerName)} (\\w+) (.*?)\\.?$`).exec(text);
  if (lead && ["play", "cast", "summon", "draw", "discard"].includes(entry.kind)) {
    const verb = you ? baseVerb(lead[1]) : thirdVerb(baseVerb(lead[1]));
    return `${actor} ${verb} ${lead[2]} for ${owner === "p1" ? "you" : them}.`;
  }
  if (!card) return text;
  if (entry.kind === "ability" && text.startsWith(`${card}: `)) return `${pieces.charAt(0).toUpperCase()}${pieces.slice(1)} ${text}`;
  if (!text.startsWith(`${card} `)) return text;
  const rest = text.slice(card.length + 1);
  // "X moves …" (and "X moves … and attacks Y")
  if (rest.startsWith("moves ")) return `${actor} ${you ? "move" : "moves"} ${pieces} ${card} ${rest.slice("moves ".length)}`;
  const attack = /^attacks (.+?)\.?$/.exec(rest);
  if (attack) return `${actor} ${you ? "attack" : "attacks"} ${attack[1]} with ${pieces} ${card}.`;
  return text;
}

/** Every tile an entry concerns: its own and its results'. */
export function entryCells(entry: FeedEntry): CellKey[] {
  const cells = [...entry.cells];
  for (const o of entry.outcomes) union(cells, o.cells);
  return cells;
}

/** The entry and what it caused, as one sentence for a status line or a caption. */
export function entrySummary(entry: FeedEntry): string {
  const results = entry.outcomes.filter((o) => o.kind !== "note").map((o) => o.text.replace(/\.$/, ""));
  return results.length ? `${entry.text.replace(/\.$/, "")} — ${results.join(", ")}.` : entry.text;
}

/** The newest thing the given seat did that concerns a card (for the inspector's quiet state). */
export function latestEntry(turns: readonly FeedTurn[], seat: FeedSeat, withCard = false): FeedEntry | null {
  for (const turn of turns) {
    for (const entry of turn.entries) {
      if (entry.seat !== seat) continue;
      if (!ABSORBS.has(entry.kind) && entry.kind !== "discard") continue;
      if (withCard && !entry.card) continue;
      return entry;
    }
  }
  return null;
}
