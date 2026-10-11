import { create } from "zustand";
import { withSfxSource } from "@/lib/audio/gameSfx";
import type { SfxSource } from "@/lib/audio/gameSfx";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { cpuRevealsPending, useCpuReveals } from "@/lib/game/cpu/revealQueue";
import { useGameStore } from "@/lib/game/store";
import type { GameState } from "@/lib/game/store/types";
import { applyAction, createGame, evaluate, viewFor } from "@sorcery/shared";
import type { Action, ActionResult, DeckList, GameState as EngineState, PlayerId } from "@sorcery/shared";
import { botActionKey, botNeedsToAct } from "@untested-realm/bot/bot";
import type { BotReply, BotRequest } from "@untested-realm/bot/bot.worker";
import { loadCardIndex } from "./cardIndex";
import { localizeEngineText } from "./coords";
import type { LegalReply, LegalRequest } from "./engine-legal.worker";
import { narrate } from "./narration";
import { clearEngineGame, saveEngineGame } from "./persistence";
import type { SavedEngineGame } from "./persistence";
import { boardReveal, harbingerTiles, hiddenLayerCounts, layerOf, projectView } from "./projection";
import type { BoardLayer, BoardReveal, HiddenCounts, ProjectedState } from "./projection";

export const HUMAN_SEAT: PlayerId = 0;
export const BOT_SEAT: PlayerId = 1;
const UNDO_LIMIT = 80;
/**
 * How fast the computer plays. Our CPU matches use the same policy (bots/action-pacing.js):
 * a beat between actions, a longer one after something resolved, and no new action at all
 * while a card reveal is still on screen or the tab is hidden — so a turn can be followed.
 */
const BOT_GAP_MS = 1500;
/** a spell, ability or fight gets its result read before the next action */
const BOT_WEIGHTY_EXTRA_MS = 1400;
/** the first action of the computer's turn waits a touch longer */
const BOT_TURN_START_MS = 1100;
/** re-check interval while a reveal is up or the tab is hidden */
const BOT_HOLD_POLL_MS = 400;
/** at most this many of the computer's log lines become toasts per action */
const TOAST_LINES = 2;

export type BotLevel = "quick" | "thinking";
const BOT_BUDGET_MS: Record<BotLevel, number> = { quick: 1500, thinking: 20000 };

interface EngineSession {
  game: EngineState | null;
  /** bumps on every applied action so React selectors re-render (the engine mutates in place) */
  rev: number;
  botLevel: BotLevel;
  botThinking: boolean;
  /** what the computer just did, in plain language (null on the human's turn) */
  narration: { text: string; seq: number } | null;
  /** identifies this match, so one tab never deletes another tab's saved game */
  matchId: string;
  /** which layer the board shows (Untested Realm's subsurface view) */
  layer: BoardLayer;
  /** units on the other layer, per board cell, for the board badges */
  hidden: Record<string, HiddenCounts>;
  /**
   * The engine's own event animation for the action that just resolved, in BOARD space.
   * Upstream accumulates it in `state.flow.areaReveal` for exactly this ("the client animates
   * it when `seq` changes") and fingerprint-gates it so an idle trigger never flashes.
   */
  reveal: BoardReveal | null;
  /** the human's legal main-phase actions for the current `rev` (null while computing / not our turn) */
  legal: Action[] | null;
  lastError: string | null;
  canUndo: boolean;
  start: (human: DeckList, bot: DeckList, botLevel: BotLevel, opts?: { secondSeer?: boolean }) => Promise<void>;
  /** pre-game: true once the Harbinger portent roll has been shown (always true without a Harbinger) */
  portalsRevealed: boolean;
  revealPortals: () => void;
  /** apply a human action; returns the engine's verdict */
  dispatch: (action: Action) => ActionResult;
  undo: () => void;
  stop: () => void;
  /** Rebuild a match saved before a reload; false when the record could not be restored. */
  resume: (saved: SavedEngineGame) => boolean;
  /** Forget the saved match (the player started another one). */
  discardSaved: () => void;
  setLayer: (layer: BoardLayer) => void;
  /** switch layers when every unit among these pick tokens is on the hidden one */
  revealTokens: (tokens: string[]) => void;
}

let history: string[] = [];
let worker: Worker | null = null;
let legalWorker: Worker | null = null;
let legalRequestId = 0;
let botRequestId = 0;
let botTimer: ReturnType<typeof setTimeout> | null = null;
/** anti-loop ward: bot actions proven score-neutral this turn (upstream App does the same) */
let bannedThisTurn = new Set<string>();
let bannedTurn = -1;
let lastProjection: ProjectedState | null = null;
let unsubscribeStore: (() => void) | null = null;
let toastedLogLength = 0;
/** The shared store's transport/seat, borrowed for the match and put back on stop(). */
let borrowed: { transport: GameState["transport"]; actorKey: GameState["actorKey"] } | null = null;
/** earliest timestamp the computer may take its next action */
let nextBotAt = 0;
let lastBotTurn = -1;
let narrationSeq = 0;
/** Highest engine reveal `seq` already shown; a reveal is replayed only when it advances. */
let lastRevealSeq = 0;
let matchCounter = 0;

export const useEngineSession = create<EngineSession>((set, get) => {
  function project(game: EngineState, source: SfxSource = "silent") {
    const view = viewFor(game, HUMAN_SEAT);
    const { layer } = get();
    set({ hidden: hiddenLayerCounts(view, layer) });
    // The engine wrote an event animation for whatever just resolved — ours or the computer's,
    // spell, ability or trigger. Only a bumped `seq` is new; a cosmetic re-project must not
    // replay the last one.
    const reveal = boardReveal(view, lastRevealSeq);
    if (reveal) {
      lastRevealSeq = reveal.seq;
      set({ reveal });
    }
    const projection = projectView(view, layer, get().portalsRevealed);
    lastProjection = projection;
    // the sound director diffs store updates; tag who caused this one (cosmetic ones stay silent)
    withSfxSource(source, () => useGameStore.setState(projection));
  }

  /**
   * The computer's latest log lines, surfaced as the same toasts CPU matches use.
   *
   * Deliberately the bot's lines only. Your OWN triggers used to produce nothing on screen at
   * all — but the answer is not a second toast channel competing with this one; it is the
   * engine's board reveal (`BoardReveal`, drawn by EngineEventReveal), which fires for both
   * seats on the tile the thing actually happened on. Toasting your own lines here would
   * narrate actions you just took yourself.
   */
  function toastNewBotLines(game: EngineState) {
    const fresh = game.log.slice(toastedLogLength).filter((l) => l.player === BOT_SEAT);
    toastedLogLength = game.log.length;
    for (const line of fresh.slice(-TOAST_LINES)) {
      try {
        window.dispatchEvent(new CustomEvent("app:toast", { detail: { message: localizeEngineText(line.msg) } }));
      } catch {
        // toasts are decoration
      }
    }
  }

  /**
   * Write the match out after every change. localStorage is synchronous, so the state is on
   * disk before the player can reload — no debounce and no flush window to lose actions in.
   */
  function persist() {
    const { game, botLevel, portalsRevealed, layer, matchId } = get();
    if (game) saveEngineGame(game, { botLevel, portalsRevealed, layer, matchId });
  }

  /**
   * Take the shared store over for this match: no transport to sync to, no seat ownership
   * checks, and free-form gestures refused. Borrow, don't steal — the online provider installs
   * its transport once per page load, so stop() puts it back.
   */
  function takeOverBoard() {
    useGameStore.getState().resetGameState();
    const shared = useGameStore.getState();
    borrowed ??= { transport: shared.transport, actorKey: shared.actorKey };
    useGameStore.setState({ transport: null, actorKey: null, boardGesturesLocked: true });
  }

  /** If anything else writes the projected slice (a stray drag, a hotkey), put the engine's picture back. */
  function watchProjection() {
    unsubscribeStore?.();
    unsubscribeStore = useGameStore.subscribe((state) => {
      const p = lastProjection;
      // liveness: a subscription that outlived its match must never touch another mode's state
      if (!p || !get().game) return;
      if (
        state.board !== p.board ||
        state.permanents !== p.permanents ||
        state.avatars !== p.avatars ||
        state.zones !== p.zones ||
        state.players !== p.players
      ) {
        queueMicrotask(() => {
          if (lastProjection === p) useGameStore.setState(p);
        });
      }
    });
  }

  function committed(game: EngineState, source: SfxSource, error: string | null = null) {
    set((s) => ({ rev: s.rev + 1, lastError: error, canUndo: history.length > 0, legal: null }));
    persist();
    project(game, source);
    if (source === "remote") toastNewBotLines(game);
    else toastedLogLength = game.log.length;
    requestLegal(game);
    scheduleBot();
  }

  /** Main-phase choices come from the engine's move generator; prompts and the mulligan have their own UI. */
  function requestLegal(game: EngineState) {
    const id = ++legalRequestId;
    const humanActs = game.phase === "main" && game.prompts.length === 0 && game.activePlayer === HUMAN_SEAT;
    if (!humanActs) return;
    legalWorker ??= new Worker(new URL("./engine-legal.worker.ts", import.meta.url), { type: "module" });
    legalWorker.onerror = () => set({ legal: [], lastError: "Could not work out the legal moves." });
    legalWorker.onmessage = (e: MessageEvent<LegalReply>) => {
      if (e.data.id !== legalRequestId) return;
      if (e.data.error) set({ lastError: e.data.error });
      set({ legal: e.data.actions });
    };
    const request: LegalRequest = { id, state: JSON.stringify(game), seat: HUMAN_SEAT };
    legalWorker.postMessage(request);
  }

  function cancelBot() {
    botRequestId++;
    if (botTimer) clearTimeout(botTimer);
    botTimer = null;
    if (get().botThinking) set({ botThinking: false });
  }

  /** The computer waits while a card reveal is still readable, or the tab is hidden. */
  function botHeld(): boolean {
    if (cpuRevealsPending()) return true;
    return typeof document !== "undefined" && document.hidden;
  }

  function scheduleBot() {
    const { game } = get();
    if (!game || botTimer || get().botThinking || !botNeedsToAct(game, BOT_SEAT)) return;
    // a fresh computer turn gets its own opening beat
    if (lastBotTurn !== game.turn) {
      lastBotTurn = game.turn;
      nextBotAt = Math.max(nextBotAt, Date.now() + BOT_TURN_START_MS);
    }
    const wait = botHeld() ? BOT_HOLD_POLL_MS : Math.max(0, nextBotAt - Date.now());
    botTimer = setTimeout(() => {
      botTimer = null;
      // still holding (reveal up / tab hidden)? come back rather than act unseen
      if (botHeld() || Date.now() < nextBotAt) return scheduleBot();
      requestBotAction();
    }, wait);
  }

  function requestBotAction() {
    const { game, botLevel } = get();
    if (!game || !botNeedsToAct(game, BOT_SEAT)) return;
    if (bannedTurn !== game.turn) {
      bannedTurn = game.turn;
      bannedThisTurn = new Set();
    }
    worker ??= new Worker(new URL("./engine-bot.worker.ts", import.meta.url), { type: "module" });
    worker.onerror = () => {
      // the bot chunk failed: don't leave the turn hanging on a reply that will never come
      set({ botThinking: false, lastError: "The computer's planner stopped; it passes the turn." });
      const current = get().game;
      if (current) applyBotAction({ t: "endTurn" });
    };
    const id = ++botRequestId;
    const requestVersion = game.version;
    const request: BotRequest = {
      id,
      state: JSON.stringify(game),
      seat: BOT_SEAT,
      timeBudgetMs: BOT_BUDGET_MS[botLevel],
      banned: [...bannedThisTurn],
    };
    worker.onmessage = (e: MessageEvent<BotReply>) => {
      if (e.data.id !== botRequestId) return; // superseded (undo / restart)
      set({ botThinking: false });
      // an error reply carries no action: say so rather than silently passing every turn
      if (e.data.error) set({ lastError: `The computer could not plan: ${e.data.error}` });
      // the state moved on while the bot was thinking: ask again rather than force a stale answer
      const current = get().game;
      if (!current || current.version !== requestVersion) return scheduleBot();
      applyBotAction(e.data.action ?? { t: "endTurn" });
    };
    set({ botThinking: true });
    worker.postMessage(request);
  }

  /** Show what the computer just did, and give its result room to be read. */
  function publish(story: ReturnType<typeof narrate>) {
    if (!story) {
      // still pace: an unnarrated action (a prompt answer) should not snap past the eye
      nextBotAt = Date.now() + BOT_GAP_MS;
      return;
    }
    set({ narration: { text: story.text, seq: ++narrationSeq } });
    if (story.reveal) {
      try {
        useCpuReveals.getState().show({ ...story.reveal, seat: "p2" });
      } catch {
        // the reveal panel is decoration; never block the game on it
      }
    }
    const picker = useCpuBoardPicker.getState();
    // a non-interactive highlight: glow only, no clickable candidates
    if (story.highlight.length) picker.setGlow(`engine-cpu:${narrationSeq}`, story.highlight);
    else if (picker.request.startsWith("engine-cpu:")) picker.clear(picker.request);
    nextBotAt = Date.now() + BOT_GAP_MS + (story.weighty ? BOT_WEIGHTY_EXTRA_MS : 0);
  }

  /** Mirrors upstream applyBotAction: fall back so a bad bot answer can never wedge the game. */
  function applyBotAction(action: Action) {
    const { game } = get();
    if (!game) return;
    const before = game.phase === "main" && action.t !== "endTurn" ? evaluate(game, BOT_SEAT) : null;
    // Compose the narration from the PRE-action state (ids still resolve to names and squares),
    // but only publish it once the engine has actually accepted the action — a refused action
    // must never be announced, and a fallback is narrated in its place.
    const story = narrate(game, action, narrationSeq + 1);
    // A card script that throws must not strand the turn: treat it as a refused action and
    // let the fallback chain below hand the turn back.
    const attempt = (candidate: Action): ActionResult => {
      try {
        return applyAction(game, BOT_SEAT, candidate);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    };
    let result = attempt(action);
    if (!result.ok) {
      const prompt = game.prompts[0];
      const fallbacks: Action[] = prompt
        ? [{ t: "prompt", promptId: prompt.id, choice: null }]
        : game.phase === "mulligan"
          ? [{ t: "keepHand" }]
          : [{ t: "endTurn" }, { t: "concede" }];
      let taken: Action | null = null;
      for (const fallback of fallbacks) {
        result = attempt(fallback);
        if (result.ok) {
          taken = fallback;
          break;
        }
      }
      publish(taken ? narrate(game, taken, narrationSeq + 1) : null);
      // nothing the engine would accept: say so rather than silently looping
      if (!taken) set({ lastError: result.error ?? "The computer could not act." });
    } else {
      publish(story);
      if (before !== null && evaluate(game, BOT_SEAT) === before) bannedThisTurn.add(botActionKey(action));
    }
    committed(game, "remote");
  }

  return {
    game: null,
    rev: 0,
    botLevel: "quick",
    botThinking: false,
    matchId: "",
    narration: null,
    reveal: null,
    legal: null,
    lastError: null,
    canUndo: false,
    layer: "surface",
    hidden: {},
    portalsRevealed: true,

    revealPortals: () => {
      set({ portalsRevealed: true });
      const { game } = get();
      if (game) project(game);
      persist();
    },

    setLayer: (layer) => {
      if (get().layer === layer) return;
      set({ layer });
      const { game } = get();
      if (game) project(game);
      persist();
    },

    revealTokens: (tokens) => {
      const { game, layer } = get();
      if (!game) return;
      const layers = tokens
        .filter((t) => t.startsWith("unit:perm:"))
        .map((t) => game.units[t.slice("unit:perm:".length)])
        .filter((u) => u && !u.isAvatar)
        .map((u) => layerOf(u.region));
      if (layers.length && layers.every((l) => l !== layer)) get().setLayer(layers[0]);
    },

    resume: (saved) => {
      get().stop();
      let game: EngineState;
      try {
        game = JSON.parse(saved.game) as EngineState;
      } catch {
        void clearEngineGame();
        set({ lastError: "That saved game could not be read." });
        return false;
      }
      void loadCardIndex()
        .then(() => {
          const current = get().game;
          if (current) project(current);
        })
        .catch(() => undefined);
      history = [];
      nextBotAt = 0;
      lastBotTurn = -1;
      bannedTurn = -1;
      bannedThisTurn = new Set();
      useCpuReveals.getState().reset();
      takeOverBoard();
      set({
        game,
        matchId: saved.matchId || `m${++matchCounter}`,
        botLevel: saved.botLevel,
        portalsRevealed: saved.portalsRevealed,
        layer: saved.layer,
        lastError: null,
      });
      watchProjection();
      // the log is history now: replay none of it as toasts
      toastedLogLength = game.log.length;
      try {
        committed(game, "silent");
      } catch {
        // the record passed its shape check but this engine build cannot rebuild it:
        // drop it rather than leave the board locked on a half-restored match
        void clearEngineGame();
        get().stop();
        set({ lastError: "That saved game could not be restored." });
        return false;
      }
      return true;
    },

    discardSaved: () => clearEngineGame(get().matchId || undefined),

    start: async (human, bot, botLevel, opts) => {
      get().stop();
      // Don't hold the game for art: re-project once our printings are known (names show until then).
      void loadCardIndex()
        .then(() => {
          const current = get().game;
          if (current) project(current);
        })
        .catch(() => undefined);
      const seed = Math.floor(Math.random() * 0xffffffff);
      const first: PlayerId = Math.random() < 0.5 ? 0 : 1;
      const game = createGame([human, bot], ["You", "Computer"], seed, first, null, { secondSeer: opts?.secondSeer });
      history = [];
      nextBotAt = 0;
      lastBotTurn = -1;
      bannedTurn = -1;
      bannedThisTurn = new Set();
      useCpuReveals.getState().reset();
      takeOverBoard();
      // Harbinger portents were rolled in createGame; reveal them before the mulligan
      const hasPortents = Object.keys(harbingerTiles(viewFor(game, HUMAN_SEAT))).length > 0;
      set({ game, matchId: `m${++matchCounter}`, botLevel, lastError: null, portalsRevealed: !hasPortents });
      watchProjection();
      toastedLogLength = game.log.length;
      committed(game, "silent");
    },

    dispatch: (action) => {
      const { game } = get();
      if (!game) return { ok: false, error: "No game in progress." };
      const snapshot = JSON.stringify(game);
      let result: ActionResult;
      try {
        result = applyAction(game, HUMAN_SEAT, action);
      } catch (err) {
        // applyAction mutates in place with no rollback; restore the pre-action state so a
        // throwing card script cannot leave a half-applied board behind.
        set({ game: JSON.parse(snapshot) as EngineState });
        const restored = get().game;
        if (restored) committed(restored, "undo");
        const message = err instanceof Error ? err.message : String(err);
        set({ lastError: `That didn't resolve: ${message}` });
        return { ok: false, error: message };
      }
      if (!result.ok) {
        set({ lastError: result.error ?? "That action isn't legal." });
        return result;
      }
      history.push(snapshot);
      if (history.length > UNDO_LIMIT) history.shift();
      // our own move clears the computer's last line and its board glow
      set({ narration: null });
      const picker = useCpuBoardPicker.getState();
      if (picker.request.startsWith("engine-cpu:")) picker.clear(picker.request);
      committed(game, "local");
      return result;
    },

    undo: () => {
      const snapshot = history.pop();
      if (!snapshot) return;
      cancelBot();
      const game = JSON.parse(snapshot) as EngineState;
      set({ game });
      committed(game, "undo");
    },

    stop: () => {
      cancelBot();
      unsubscribeStore?.();
      unsubscribeStore = null;
      lastProjection = null;
      nextBotAt = 0;
      lastBotTurn = -1;
      useCpuReveals.getState().reset();
      useGameStore.setState({ boardGesturesLocked: false, ...(borrowed ?? {}) });
      borrowed = null;
      {
        const picker = useCpuBoardPicker.getState();
        if (picker.request.startsWith("engine-cpu:")) picker.clear(picker.request);
      }
      worker?.terminate();
      worker = null;
      legalRequestId++;
      legalWorker?.terminate();
      legalWorker = null;
      history = [];
      set({ game: null, rev: 0, botThinking: false, narration: null, legal: null, lastError: null, canUndo: false, layer: "surface", hidden: {} });
    },
  };
});

// Dev handle for driving engine matches from the console / headless checks (like window.__gameStore).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__engineSession = useEngineSession;
}
