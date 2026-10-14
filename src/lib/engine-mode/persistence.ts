/**
 * Keeps a Rules Engine match across a reload.
 *
 * Only the engine's own GameState is stored: it is the authoritative state, every board
 * visual is derived from it, and it is already plain JSON (the engine serialises it for the
 * worker). A mid-game state is ~12-30KB, which is why this uses localStorage rather than the
 * IndexedDB the hotseat snapshot needs — localStorage writes are SYNCHRONOUS, so the state is
 * on disk before the page can be torn down. An async store cannot promise that: a write
 * started from `pagehide` is not guaranteed to commit, which in testing lost the last action
 * on a quick reload. With a synchronous write there is no flush, no debounce and no window.
 *
 * The undo history is deliberately NOT stored: it is up to 80 full snapshots, and losing
 * "undo" across a reload is a fair trade for a small, fast write after every action.
 */

import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import upstream from "@untested-realm/upstream";
import type { EngineFeedNote } from "./narration";
import type { Arrangement, BoardLayer } from "./projection";
import type { BotLevel } from "./session";

const KEY = "realms:engineMatch";
/** Bump when the saved shape changes. */
const STORAGE_VERSION = 2;
/**
 * Which vendored engine produced a save. A `scripts/vendor-untested-realm.sh` sync can change
 * card scripts and state shape, and feeding an old state to a new engine throws deep inside a
 * card script — so a save from a different build is simply not offered.
 */
const ENGINE_BUILD: string = upstream.commit;
/** Refuse to store a freak state rather than blow the quota mid-match. */
const MAX_BYTES = 2_000_000;

export interface SavedEngineGame {
  version: number;
  savedAt: number;
  /** the vendored engine commit this state came from */
  engine: string;
  /** which match this is, so one tab never deletes another tab's game */
  matchId: string;
  /** JSON.stringify of the engine's GameState */
  game: string;
  botLevel: BotLevel;
  portalsRevealed: boolean;
  layer: BoardLayer;
  /** for the resume card: who is playing whom, and how far in */
  summary: { turn: number; you: string; opponent: string; over: boolean };
  /**
   * The session's own record of the match that the engine state does not hold: the turns
   * played under Courtesan Thaïs (the feed's "played by" labels and second-person wording) and
   * the feed notes (a toll's discarded card). Optional: older saves simply lack them.
   */
  controlTurns?: Record<string, PlayerId>;
  feedNotes?: EngineFeedNote[];
  /** where the player slid cards within their tiles (display only). Optional: older saves lack it. */
  arrangement?: Arrangement;
}

/** The session extras a save carries beside the engine state. */
export interface SavedSessionExtras {
  controlTurns: Record<number, PlayerId>;
  feedNotes: EngineFeedNote[];
  arrangement: Arrangement;
}

const isSeatId = (v: unknown): v is PlayerId => v === 0 || v === 1;
const isIndex = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** A saved `controlTurns`, checked entry by entry (anything malformed is dropped). */
export function readControlTurns(raw: unknown): Record<number, PlayerId> {
  const out: Record<number, PlayerId> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [turn, seat] of Object.entries(raw)) {
    const n = Number(turn);
    if (isIndex(n) && isSeatId(seat)) out[n] = seat;
  }
  return out;
}

/** Saved feed notes, each checked for the shape the feed reads (anything malformed is dropped). */
export function readFeedNotes(raw: unknown): EngineFeedNote[] {
  if (!Array.isArray(raw)) return [];
  const out: EngineFeedNote[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { lines, after, seat, kind, text, card, cells } = item as Record<string, unknown>;
    if (!Array.isArray(lines) || !lines.every(isIndex) || !isIndex(after)) continue;
    if ((seat !== "p1" && seat !== "p2") || kind !== "discard" || typeof text !== "string") continue;
    if (card !== null && typeof card !== "string") continue;
    if (!Array.isArray(cells) || !cells.every((c): c is string => typeof c === "string" && /^\d+,\d+$/.test(c))) continue;
    out.push({ lines, after, seat, kind, text, card, cells: cells as EngineFeedNote["cells"] });
  }
  return out;
}

/** A saved card arrangement, checked entry by entry (anything malformed is dropped). */
export function readArrangement(raw: unknown): Arrangement {
  const out: Arrangement = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const isUnit = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") continue;
    const { at, x, y, seq } = entry as Record<string, unknown>;
    if (typeof at !== "string" || !/^\d+,\d+$/.test(at) || !isUnit(x) || !isUnit(y) || !isIndex(seq)) continue;
    // a tile's centre is at most half a tile from its edge
    out[id] = { at, x: Math.max(-0.5, Math.min(0.5, x)), y: Math.max(-0.5, Math.min(0.5, y)), seq };
  }
  return out;
}

/** Everything here is best-effort: a match must never fail because storage did. */
export function saveEngineGame(
  game: EngineState,
  meta: { botLevel: BotLevel; portalsRevealed: boolean; layer: BoardLayer; matchId: string } & Partial<SavedSessionExtras>,
): void {
  try {
    const record: SavedEngineGame = {
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      engine: ENGINE_BUILD,
      matchId: meta.matchId,
      game: JSON.stringify(game),
      botLevel: meta.botLevel,
      portalsRevealed: meta.portalsRevealed,
      layer: meta.layer,
      summary: {
        turn: Math.max(1, game.turn),
        you: game.units[game.players[0]?.avatarUnitId ?? ""]?.name ?? "Your avatar",
        opponent: game.units[game.players[1]?.avatarUnitId ?? ""]?.name ?? "The computer",
        over: game.phase === "over",
      },
      ...(meta.controlTurns && Object.keys(meta.controlTurns).length ? { controlTurns: meta.controlTurns } : null),
      ...(meta.feedNotes?.length ? { feedNotes: meta.feedNotes } : null),
      ...(meta.arrangement && Object.keys(meta.arrangement).length ? { arrangement: meta.arrangement } : null),
    };
    const text = JSON.stringify(record);
    if (text.length > MAX_BYTES) return;
    localStorage.setItem(KEY, text);
  } catch {
    // storage is a convenience (private mode, quota, disabled cookies), never a dependency
  }
}

function clearAndFail(): null {
  clearEngineGame();
  return null;
}

/** The saved match, or null when there is none, it is from another build, or it is unreadable. */
export function loadEngineGame(): SavedEngineGame | null {
  try {
    const text = localStorage.getItem(KEY);
    if (!text) return null;
    const record = JSON.parse(text) as SavedEngineGame;
    if (!record || typeof record !== "object") return clearAndFail();
    // A record we can never use again (older save format, or a different vendored engine
    // build after a `scripts/vendor-untested-realm.sh` sync) is dropped rather than left to
    // sit there forever pretending a match is waiting.
    if (record.version !== STORAGE_VERSION || record.engine !== ENGINE_BUILD) return clearAndFail();
    if (typeof record.game !== "string" || typeof record.matchId !== "string") return clearAndFail();
    if (!record.summary || typeof record.summary.turn !== "number" || typeof record.summary.you !== "string") {
      return clearAndFail();
    }
    // only offer a resume we can actually rebuild
    const parsed = JSON.parse(record.game) as EngineState;
    if (!parsed || !Array.isArray(parsed.players) || parsed.players.length !== 2 || !parsed.units) {
      return clearAndFail();
    }
    return record;
  } catch {
    return clearAndFail();
  }
}

/**
 * Forget the saved match. `onlyMatchId` makes the delete conditional: another tab's live
 * game is never removed by this tab pressing "New game".
 */
export function clearEngineGame(onlyMatchId?: string): void {
  try {
    if (onlyMatchId) {
      const text = localStorage.getItem(KEY);
      if (text) {
        const existing = JSON.parse(text) as SavedEngineGame;
        if (existing?.matchId && existing.matchId !== onlyMatchId) return;
      }
    }
    localStorage.removeItem(KEY);
  } catch {
    // nothing to do
  }
}
