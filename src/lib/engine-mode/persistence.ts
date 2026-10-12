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

import type { GameState as EngineState } from "@sorcery/shared";
import upstream from "@untested-realm/upstream";
import type { BoardLayer } from "./projection";
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
}

/** Everything here is best-effort: a match must never fail because storage did. */
export function saveEngineGame(
  game: EngineState,
  meta: { botLevel: BotLevel; portalsRevealed: boolean; layer: BoardLayer; matchId: string },
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
