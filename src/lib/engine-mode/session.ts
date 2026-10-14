import { create } from "zustand";
import { setSiteCardScaleFallback } from "@/hooks/useGraphicsSettings";
import { withSfxSource } from "@/lib/audio/gameSfx";
import type { SfxSource } from "@/lib/audio/gameSfx";
import { TILE_SIZE } from "@/lib/game/constants";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { CPU_SPELL_REVEAL_READ_MS, cpuRevealsPending, useCpuReveals } from "@/lib/game/cpu/revealQueue";
import { useGameStore } from "@/lib/game/store";
import type { BoardArrangeTarget, GameState } from "@/lib/game/store/types";
import {
  actingSeatFor,
  applyAchievements,
  applyAction,
  BY_ID as ACHIEVEMENTS_BY_ID,
  createGame,
  evaluate,
  viewFor,
} from "@sorcery/shared";
import type { Action, ActionResult, DeckList, GameState as EngineState, PlayerId, PlayerView } from "@sorcery/shared";
import { botActionKey, botNeedsToAct } from "@untested-realm/bot/bot";
import type { BotReply, BotRequest } from "@untested-realm/bot/bot.worker";
import { loadCardIndex } from "./cardIndex";
import { localizeEngineText } from "./coords";
import type { LegalReply, LegalRequest } from "./engine-legal.worker";
import { narrate, narratePromptAnswer, snapshotPromptAnswer } from "./narration";
import type { EngineFeedNote, Narration } from "./narration";
import { clearEngineGame, readArrangement, readControlTurns, readFeedNotes, saveEngineGame } from "./persistence";
import type { SavedEngineGame } from "./persistence";
import {
  arrangeableCell,
  boardReveal,
  damageSince,
  damageSnapshot,
  disabledUnits,
  harbingerTiles,
  hiddenLayerCounts,
  projectView,
  pruneArrangement,
  unitPower,
  sitesLostSince,
} from "./projection";
import type { Arrangement, BoardLayer, BoardReveal, DamageSnapshot, HiddenCounts, ProjectedState } from "./projection";
import { ENGINE_BUILD } from "@shared/engine/build";
import "@shared/engine/scriptPatches";

export const HUMAN_SEAT: PlayerId = 0;

/** How large sites are drawn in engine mode when the player has not chosen a size themselves. */
const ENGINE_SITE_SCALE = 1.5;
export const BOT_SEAT: PlayerId = 1;

/**
 * Courtesan Thaïs hands you the *opponent's* turn to play.
 *
 * The engine models it with `flow.thaisActive`: the active player stays seat 1, but
 * `actingSeatFor` redirects the decisions to seat 0 (game.ts), and `applyAction` remaps what
 * seat 0 sends onto seat 1. Neither of our two "whose turn is it" tests saw that — we gated
 * the legal-move worker on `activePlayer === HUMAN_SEAT`, so the human got nothing to click,
 * and `botNeedsToAct(BOT_SEAT)` is false because the decisions are not the bot's to make.
 * The match simply stopped.
 */
export function humanDecisionSeat(game: EngineState, viewer: PlayerId = HUMAN_SEAT): PlayerId | null {
  if (actingSeatFor(game, game.activePlayer) === viewer) return game.activePlayer;
  return null;
}

/** True while the human is playing the opponent's turn for them. */
export function isPiloting(game: EngineState, viewer: PlayerId = HUMAN_SEAT): boolean {
  const seat = humanDecisionSeat(game, viewer);
  return seat !== null && seat !== viewer;
}

const isSeat = (value: unknown): value is PlayerId => value === 0 || value === 1;

/** The seat whose turn is being played by the OTHER seat right now (Courtesan Thaïs), or null. */
export function thaisActiveSeat(game: EngineState): PlayerId | null {
  const flow: unknown = game.flow;
  if (!flow || typeof flow !== "object" || !("thaisActive" in flow)) return null;
  return isSeat(flow.thaisActive) ? flow.thaisActive : null;
}

/** The seats whose NEXT turn the other seat will play (Courtesan Thaïs was cast). */
export function thaisPendingSeats(game: EngineState): PlayerId[] {
  const flow: unknown = game.flow;
  if (!flow || typeof flow !== "object" || !("thaisPending" in flow) || !Array.isArray(flow.thaisPending)) return [];
  return flow.thaisPending.filter(isSeat);
}

export type ControlSwapKind = "computer-plays-yours" | "you-play-theirs" | "computer-will-play-yours" | "you-will-play-theirs";

export interface ControlSwap {
  kind: ControlSwapKind;
  /** true for the turn being played right now; false for the announcement of the next one */
  now: boolean;
  text: string;
}

/**
 * Who is playing whose turn under Courtesan Thaïs, as one sentence for a banner — the turn in
 * progress (`flow.thaisActive`) first, else the swap the next turn will bring
 * (`flow.thaisPending` naming the seat whose turn comes next). Null when control is normal.
 */
export function controlSwap(game: EngineState, viewer: PlayerId = HUMAN_SEAT): ControlSwap | null {
  // "yours" is the viewer's seat and "theirs" the other one — in single player that is the
  // human and the bot, in a player-vs-player match whichever seat this client holds
  const them: PlayerId = viewer === 0 ? (1 as PlayerId) : (0 as PlayerId);
  if (game.phase === "over") return null;
  const active = thaisActiveSeat(game);
  if (active === viewer) {
    return { kind: "computer-plays-yours", now: true, text: "Courtesan Thaïs: the Computer is playing your turn" };
  }
  if (active === them) {
    return { kind: "you-play-theirs", now: true, text: "Courtesan Thaïs: you are playing the Computer's turn" };
  }
  const next: PlayerId = game.activePlayer === viewer ? them : viewer;
  if (!thaisPendingSeats(game).includes(next)) return null;
  return next === viewer
    ? { kind: "computer-will-play-yours", now: false, text: "Courtesan Thaïs: the Computer will play your next turn" }
    : { kind: "you-will-play-theirs", now: false, text: "Courtesan Thaïs: you will play the Computer's next turn" };
}

/**
 * Which of the log lines the computer's last action wrote become toasts. Its own seat's lines;
 * while it is playing the HUMAN's turn (Courtesan Thaïs) the lines it writes on our seat too —
 * those are its moves, not ours; and Thaïs's own bargain line whichever seat it is tagged with,
 * since it announces the swap. Our own actions never come through here (see `committed`).
 */
export function linesForToast(
  log: readonly { player: PlayerId | null; msg: string }[],
  from: number,
  pilotedUs: boolean,
): string[] {
  return log
    .slice(from)
    .filter((l) => l.player === BOT_SEAT || (pilotedUs && l.player === HUMAN_SEAT) || /Thaïs's bargain/.test(l.msg))
    .map((l) => l.msg);
}
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
/** feed notes kept per match (the feed only reads the last 200 log lines anyway) */
const FEED_NOTES_KEPT = 60;

export type BotLevel = "quick" | "thinking";
const BOT_BUDGET_MS: Record<BotLevel, number> = { quick: 1500, thinking: 20000 };

interface EngineSession {
  game: EngineState | null;
  /**
   * Which engine seat this client plays. Single player is always seat 0; in a player-vs-player
   * match the server says, and the board, the hand, the prompts and every tile coordinate are
   * drawn from this seat's side.
   */
  seat: PlayerId;
  /**
   * `local` owns the authoritative GameState and resolves its own actions. `remote` holds only
   * the redacted view the server sent it and posts actions back — it cannot resolve anything,
   * which is the point: the state it would need contains both hands and the seed.
   */
  mode: "local" | "remote";
  /** bumps on every applied action so React selectors re-render (the engine mutates in place) */
  rev: number;
  botLevel: BotLevel;
  botThinking: boolean;
  /** what the computer just did, in plain language (null on the human's turn); `cells` are the
   *  board tokens it lit (tiles, units) */
  narration: { text: string; seq: number; cells?: readonly string[] } | null;
  /**
   * Feed entries the engine's log cannot give on its own (the card a toll discarded), keyed to
   * the log lines they explain. Pruned when an undo rewinds past them.
   */
  feedNotes: EngineFeedNote[];
  /** turns played under Courtesan Thaïs: engine turn → the seat whose turn the OTHER seat played */
  controlTurns: Record<number, PlayerId>;
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
  /** Whose turn the human is deciding: our own seat, the opponent's while piloting, or null. */
  decisionSeat: PlayerId | null;
  /** The "your avatar is still untapped" warning is up, the same one /play shows. */
  endTurnConfirm: boolean;
  /** End the turn, or ask first when the avatar has not been used. */
  requestEndTurn: () => void;
  dismissEndTurn: () => void;
  lastError: string | null;
  /**
   * Remote only: the server runs different rules from this page (a release landed on one and
   * not yet the other). Nothing can be played until the player reloads.
   */
  outdated: boolean;
  canUndo: boolean;
  start: (human: DeckList, bot: DeckList, botLevel: BotLevel, opts?: { secondSeer?: boolean }) => Promise<void>;
  /** pre-game: true once the Harbinger portent roll has been shown (always true without a Harbinger) */
  portalsRevealed: boolean;
  revealPortals: () => void;
  /** apply a human action; returns the engine's verdict */
  dispatch: (action: Action) => ActionResult;
  /**
   * Hand this client over to a server-run match. From here it holds no GameState at all: it
   * paints whatever view arrives and posts actions back.
   */
  joinRemote: (matchId: string, seat: PlayerId, send: (message: unknown) => void) => void;
  /** A view envelope from the server. Older revisions are ignored, not applied out of order. */
  applyRemoteView: (envelope: {
    matchId: string;
    rev: number;
    seat: PlayerId;
    view: PlayerView;
    power: Record<string, { atk: number; def: number }>;
    disabled: string[];
    legal: Action[];
    over?: boolean;
    /** The server's ENGINE_BUILD */
    build: string;
  }) => void;
  /** The server refused an action; show why and stop pretending it happened. */
  applyRemoteReject: (reason: string) => void;
  undo: () => void;
  stop: () => void;
  /** Rebuild a match saved before a reload; false when the record could not be restored. */
  resume: (saved: SavedEngineGame) => boolean;
  /** Forget the saved match (the player started another one). */
  discardSaved: () => void;
  setLayer: (layer: BoardLayer) => void;
  /** switch layers when every unit among these pick tokens is on the hidden one */
  revealTokens: (tokens: string[]) => void;
  /**
   * Where the player has slid cards within their tiles, by engine unit / artifact id. Display
   * only: never sent to the engine, so the rules and the computer never see it. Saved with the
   * match; a card that leaves its tile drops its entry (see CardArrangement).
   */
  arrangement: Arrangement;
  /** Phones: dragging a card arranges it instead of tapping it (the More sheet's toggle). */
  arrangeMode: boolean;
  /** The arrange modifier (Alt / Option) is held: desktop drags arrange (watchArrangeModifier). */
  arrangeHeld: boolean;
  /** Slide a card within its tile; `centre` is its centre from the tile's centre, in tiles. */
  arrange: (id: string, at: string, centre: [number, number]) => void;
  /** Back to the automatic layout: one tile's cards, or the whole board's. */
  resetArrangement: (at?: string) => void;
  setArrangeMode: (on: boolean) => void;
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
/** Views that already narrate the computer's lines on their own surfaces opt out of the toasts. */
let botLineToastHolds = 0;
let arrangeWatchers = 0;
let unwatchArrangeKeys: (() => void) | null = null;

/**
 * Stop toasting the computer's log lines while the caller is mounted (the 2D view says every
 * one in its status line and feed, and the toast box would cover the hand or the board).
 * Returns the release. A counter, so overlapping holders cannot re-enable it for each other.
 * It has to happen at the source: the toast host listens on `window` itself, where listeners
 * run in registration order whatever their capture flag, so a later listener cannot swallow it.
 */
export function holdBotLineToasts(): () => void {
  botLineToastHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    botLineToastHolds -= 1;
  };
}
/**
 * Keep `arrangeHeld` in step with the arrange modifier while the caller is mounted: Alt, which
 * is Option on a Mac (nothing in engine mode or the camera controls binds it — OrbitControls
 * takes Ctrl/Meta/Shift for panning). Pointer events re-read it too, so a key pressed while the
 * window was unfocused still counts. Returns the release; a counter, like holdBotLineToasts.
 */
export function watchArrangeModifier(): () => void {
  if (typeof window === "undefined") return () => undefined;
  arrangeWatchers += 1;
  if (!unwatchArrangeKeys) {
    const sync = (held: boolean) => {
      if (useEngineSession.getState().arrangeHeld !== held) useEngineSession.setState({ arrangeHeld: held });
    };
    const onInput = (e: KeyboardEvent | PointerEvent) => sync(e.altKey);
    // a key released while the window is unfocused never reports its key-up
    const release = () => sync(false);
    window.addEventListener("keydown", onInput);
    window.addEventListener("keyup", onInput);
    window.addEventListener("pointerdown", onInput, true);
    window.addEventListener("pointermove", onInput, true);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    unwatchArrangeKeys = () => {
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("keyup", onInput);
      window.removeEventListener("pointerdown", onInput, true);
      window.removeEventListener("pointermove", onInput, true);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
      release();
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    arrangeWatchers -= 1;
    if (arrangeWatchers > 0) return;
    unwatchArrangeKeys?.();
    unwatchArrangeKeys = null;
  };
}

/** The shared store's transport/seat, borrowed for the match and put back on stop(). */
let borrowed: {
  transport: GameState["transport"];
  actorKey: GameState["actorKey"];
  resolversDisabled: GameState["resolversDisabled"];
} | null = null;
/** earliest timestamp the computer may take its next action */
let nextBotAt = 0;
let lastBotTurn = -1;
let narrationSeq = 0;
/** Highest engine reveal `seq` already shown; a reveal is replayed only when it advances. */
let lastRevealSeq = 0;
/** Per-unit damage at the last projection, for the "any damage dealt" diff. */
let lastDamage: DamageSnapshot | null = null;
/** Damage with no engine reveal behind it (plain combat) still needs a unique, falling key. */
let standaloneRevealSeq = 0;
/** A deferred board reveal (see `showReveal`), cancelled if another lands first. */
let revealTimer: ReturnType<typeof setTimeout> | null = null;
let matchCounter = 0;
/** How a remote match posts actions back. Null in single player. */
let remoteSend: ((message: unknown) => void) | null = null;

export const useEngineSession = create<EngineSession>((set, get) => {
  /**
   * Turn an engine PICTURE into the board.
   *
   * Split from `project` because the two modes arrive at that picture differently. Single
   * player holds the authoritative GameState and derives its own view; a player-vs-player
   * client is SENT its view by the server and never has the state at all — it could not
   * compute one, and must not be trusted with the hands and seed inside it. Everything after
   * that point is identical, so it lives here once.
   */
  function paint(
    view: PlayerView,
    power: Record<string, { atk: number; def: number }>,
    disabled: ReadonlySet<string>,
    source: SfxSource,
  ) {
    const { layer, seat } = get();
    set({ hidden: hiddenLayerCounts(view, layer, seat) });
    // What just resolved, drawn on the board: the engine's own caption/caster/affected squares
    // (only when its `seq` advances, so a cosmetic re-project never replays it), plus damage
    // numbers diffed off the units themselves so EVERY source lands — combat, spells,
    // abilities and triggers alike.
    const hits = damageSince(lastDamage, view, seat);
    const razed = sitesLostSince(lastDamage, view, seat);
    lastDamage = damageSnapshot(view, seat);
    const event = boardReveal(view, lastRevealSeq, seat);
    if (event) lastRevealSeq = event.seq;
    if (event || hits.length || razed.length) {
      const base = event ?? {
        // plain combat raises no engine reveal; give it a falling key of its own
        seq: --standaloneRevealSeq,
        sites: [] as string[],
        caster: null,
        name: "",
        element: "none",
        card: null,
      };
      showReveal(
        {
          ...base,
          hits,
          sites: [...new Set([...base.sites, ...razed])],
          name: base.name || (razed.length ? (razed.length > 1 ? `${razed.length} sites destroyed` : "Site destroyed") : ""),
        },
        source,
      );
    }
    const projection = projectView(view, layer, get().portalsRevealed, power, disabled, get().arrangement, seat);
    lastProjection = projection;
    // the sound director diffs store updates; tag who caused this one (cosmetic ones stay silent)
    withSfxSource(source, () => useGameStore.setState(projection));
  }

  function project(game: EngineState, source: SfxSource = "silent") {
    const seat = get().seat;
    // While piloting, the engine intends the pilot to see the hand they are playing.
    const view = viewFor(game, seat, isPiloting(game, seat) ? { revealAll: true } : undefined);
    // `unitPower` and `disabledUnits` need the full engine state, which only this side has —
    // see their docblocks. In a player-vs-player match the server computes both instead.
    paint(view, unitPower(game), disabledUnits(game), source);
  }


  /**
   * Put a board reveal on screen — but not on top of the computer's own card.
   *
   * The card panel and the effect used to fire in the same tick: `publish()` shows the card
   * the computer just cast, then `committed()` immediately projects, and the damage numbers
   * played out while the player was still reading the card. By the time you looked at the
   * board the effect had finished. For the computer's actions the effect now waits until its
   * card has been up long enough to read, so a spell reads as: here is the card, here is what
   * it did. Our own actions stay immediate — we know what we just played.
   */
  function showReveal(reveal: BoardReveal, source: SfxSource) {
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = null;
    if (source !== "remote" || !cpuRevealsPending()) {
      set({ reveal });
      return;
    }
    revealTimer = setTimeout(() => {
      revealTimer = null;
      set({ reveal });
    }, CPU_SPELL_REVEAL_READ_MS);
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
  function toastNewBotLines(game: EngineState, pilotedUs: boolean) {
    const fresh = linesForToast(game.log, toastedLogLength, pilotedUs);
    toastedLogLength = game.log.length;
    if (botLineToastHolds > 0) return;
    for (const line of fresh.slice(-TOAST_LINES)) {
      try {
        window.dispatchEvent(new CustomEvent("app:toast", { detail: { message: localizeEngineText(line) } }));
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
    const { game, botLevel, portalsRevealed, layer, matchId, controlTurns, feedNotes, arrangement, mode } = get();
    // Never save a remote match. What this client holds is a redacted view, not a game, and a
    // state restored from a player's own machine is a state that player could have edited.
    // Reconnecting asks the server instead.
    if (mode === "remote") return;
    if (game) saveEngineGame(game, { botLevel, portalsRevealed, layer, matchId, controlTurns, feedNotes, arrangement });
  }

  /**
   * Take the shared store over for this match: no transport to sync to, no seat ownership
   * checks, and free-form gestures refused. Borrow, don't steal — the online provider installs
   * its transport once per page load, so stop() puts it back.
   */
  /**
   * Shut down everything that only makes sense when this tab owns the game.
   *
   * Against a human none of it is merely useless: an undo history, a bot that can be asked to
   * move for you, and a locally saved state a client could edit and resume from are all ways
   * to cheat.
   */
  function stopLocalWork() {
    if (botTimer) clearTimeout(botTimer);
    botTimer = null;
    worker?.terminate();
    worker = null;
    legalWorker?.terminate();
    legalWorker = null;
    history.length = 0;
  }

  function takeOverBoard() {
    useGameStore.getState().resetGameState();
    const shared = useGameStore.getState();
    borrowed ??= { transport: shared.transport, actorKey: shared.actorKey, resolversDisabled: shared.resolversDisabled };
    // `resolversDisabled` is literally true here: the vendored engine resolves every card, so
    // none of OUR card resolvers run. Leaving it false made Hand3D/PermanentStack paint the
    // purple "this card is automated" outline (hasCustomResolver) over cards whose automation
    // belongs to a different engine entirely — a promise engine mode cannot keep.
    useGameStore.setState({
      transport: null,
      actorKey: null,
      boardGesturesLocked: true,
      resolversDisabled: true,
      // the board's one free gesture here: sliding a card within its tile (display only)
      boardArrange: arrangeFromBoard,
    });
    // This board is read far more than it is dragged on, so sites want to be bigger here than
    // the printed fifth-of-a-tile. It is only a FALLBACK: the moment the player sets the slider
    // themselves, their number wins here and everywhere else. Put back on stop().
    setSiteCardScaleFallback(ENGINE_SITE_SCALE);
  }

  /** A board drag (Alt in 3D) onto the session's arrangement: the store's card, in tiles. */
  function arrangeFromBoard(target: BoardArrangeTarget, centre: [number, number]) {
    const { game } = get();
    if (!game) return;
    const store = useGameStore.getState();
    let id: string | undefined;
    let at: string | null = null;
    if (target.kind === "avatar") {
      const pos = store.avatars[target.who]?.pos;
      id = game.players[target.who === "p1" ? 0 : 1]?.avatarUnitId;
      at = pos ? `${pos[0]},${pos[1]}` : null;
    } else {
      const item = store.permanents[target.at]?.[target.index];
      // pinned (lifted) and attached cards keep their automatic placement
      if (item && !item.attachedTo && !item.lift) id = item.instanceId ?? undefined;
      at = target.at;
    }
    if (id && at) get().arrange(id, at, [centre[0] / TILE_SIZE, centre[1] / TILE_SIZE]);
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

  function committed(game: EngineState, source: SfxSource, error: string | null = null, pilotedUs = false) {
    const logLength = game.log.length;
    const swapped = thaisActiveSeat(game);
    set((s) => {
      // an undo rewound the log: notes about lines that no longer exist would attach to new ones
      const notes = s.feedNotes.filter((n) => n.after < logLength && n.lines.every((l) => l < logLength));
      const turns = swapped !== null && s.controlTurns[game.turn] !== swapped ? { ...s.controlTurns, [game.turn]: swapped } : s.controlTurns;
      return {
        rev: s.rev + 1,
        lastError: error,
        canUndo: history.length > 0,
        legal: null,
        decisionSeat: humanDecisionSeat(game),
        endTurnConfirm: false,
        feedNotes: notes.length === s.feedNotes.length ? s.feedNotes : notes,
        controlTurns: turns,
        // a card that left the tile it was arranged on goes back to the automatic layout
        arrangement: pruneArrangement(s.arrangement, game),
      };
    });
    persist();
    project(game, source);
    if (source === "remote") toastNewBotLines(game, pilotedUs);
    else toastedLogLength = game.log.length;
    requestLegal(game);
    scheduleBot();
  }

  /** Main-phase choices come from the engine's move generator; prompts and the mulligan have their own UI. */
  function requestLegal(game: EngineState) {
    const id = ++legalRequestId;
    // Ask for the seat whose decisions are OURS, which under Courtesan Thaïs is the opponent's.
    const seat = humanDecisionSeat(game);
    if (seat === null || game.phase !== "main" || game.prompts.length) return;
    legalWorker ??= new Worker(new URL("./engine-legal.worker.ts", import.meta.url), { type: "module" });
    legalWorker.onerror = () => set({ legal: [], lastError: "Could not work out the legal moves." });
    legalWorker.onmessage = (e: MessageEvent<LegalReply>) => {
      if (e.data.id !== legalRequestId) return;
      if (e.data.error) set({ lastError: e.data.error });
      set({ legal: e.data.actions });
    };
    // The generator refuses to enumerate moves for a seat that is being piloted, so strip the
    // marker from the COPY we send it. Measured: with `thaisActive` set the generator returns
    // 0 actions for that seat; without it, the actions it returns are all accepted by the real
    // state when the human dispatches them (applyAction does the seat remap itself).
    let payload = game;
    if (seat !== HUMAN_SEAT) {
      const clone = JSON.parse(JSON.stringify(game)) as EngineState;
      const flow: { thaisActive?: PlayerId } | undefined = clone.flow;
      if (flow) delete flow.thaisActive;
      payload = clone;
    }
    const request: LegalRequest = { id, state: JSON.stringify(payload), seat };
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
    const { game, mode } = get();
    // There is no bot in a match against a human, and `game` is only a view here anyway.
    if (mode === "remote") return;
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

  /**
   * Secret achievements. Upstream deliberately keeps this OUT of applyAction — the search bot
   * applies thousands of hypothetical actions and must never pay the cost nor mint phantom
   * unlocks — and expects "the three REAL apply sites" to call it. We are one of them, and
   * never did, so engine mode minted none at all (achievements.ts:1-10).
   */
  function awardAchievements(before: EngineState, after: EngineState, actor: PlayerId, action: Action) {
    let fresh: { id: string; seat: PlayerId }[] = [];
    try {
      fresh = applyAchievements(before, after, actor, action);
    } catch {
      return; // cosmetic: never let detection break a match
    }
    for (const unlock of fresh) {
      if (unlock.seat !== HUMAN_SEAT) continue; // the computer's unlocks are not news
      const name = ACHIEVEMENTS_BY_ID[unlock.id]?.name;
      if (!name) continue;
      try {
        window.dispatchEvent(new CustomEvent("app:toast", { detail: { message: `Achievement: ${name}` } }));
      } catch {
        // toasts are decoration
      }
    }
  }

  /** Show what the computer just did, and give its result room to be read. */
  function publish(story: Narration | null) {
    if (!story) {
      // still pace: an unnarrated action (a prompt answer) should not snap past the eye
      nextBotAt = Date.now() + BOT_GAP_MS;
      return;
    }
    set({ narration: { text: story.text, seq: ++narrationSeq, cells: story.highlight } });
    if (story.reveal) {
      try {
        // the card's owner, not the actor: under Courtesan Thaïs the computer casts OUR cards
        useCpuReveals.getState().show({ ...story.reveal, seat: story.revealSeat ?? "p2" });
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
    // Courtesan Thaïs: the computer is playing OUR turn, so its moves are told as moves of ours
    const pilotedUs = thaisActiveSeat(game) === HUMAN_SEAT;
    const pendingBefore = thaisPendingSeats(game);
    // Compose the narration from the PRE-action state (ids still resolve to names and squares),
    // but only publish it once the engine has actually accepted the action — a refused action
    // must never be announced, and a fallback is narrated in its place.
    let story: Narration | null = narrate(game, action, narrationSeq + 1, { pilotingHuman: pilotedUs });
    // A prompt answer is told by what it cost (Troll Bridge's toll): the prompt and both hands
    // have to be read now, before the engine shifts the prompt off and moves the card.
    const answer = snapshotPromptAnswer(game, action);
    const logBefore = game.log.length;
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
      const paid = answer ? narratePromptAnswer(answer, game, narrationSeq + 1) : null;
      if (paid) {
        story = paid;
        const lines: number[] = [];
        for (let i = logBefore; i < game.log.length; i++) lines.push(i);
        const card = paid.discarded[0]?.name ?? null;
        const note: EngineFeedNote = { lines, after: logBefore - 1, seat: "p2", kind: "discard", text: paid.text, card, cells: paid.cells };
        set((s) => ({ feedNotes: [...s.feedNotes, note].slice(-FEED_NOTES_KEPT) }));
      }
      // the computer's Courtesan Thaïs: say now that it will be playing our next turn
      if (story && !pendingBefore.includes(HUMAN_SEAT) && thaisPendingSeats(game).includes(HUMAN_SEAT) && game.activePlayer === BOT_SEAT) {
        story = { ...story, text: `${story.text} Courtesan Thaïs: the Computer will play your next turn.`, weighty: true };
      }
      publish(story);
      if (before !== null && evaluate(game, BOT_SEAT) === before) bannedThisTurn.add(botActionKey(action));
    }
    committed(game, "remote", null, pilotedUs);
  }

  return {
    game: null,
    seat: HUMAN_SEAT,
    mode: "local",
    rev: 0,
    botLevel: "quick",
    botThinking: false,
    matchId: "",
    narration: null,
    feedNotes: [],
    controlTurns: {},
    reveal: null,
    decisionSeat: null,
    endTurnConfirm: false,
    legal: null,
    lastError: null,
    outdated: false,
    canUndo: false,
    layer: "surface",
    hidden: {},
    portalsRevealed: true,
    arrangement: {},
    arrangeMode: false,
    arrangeHeld: false,

    arrange: (id, at, [x, y]) => {
      const { game, arrangement } = get();
      if (!game || arrangeableCell(game, id) !== at) return;
      const seq = Math.max(0, ...Object.values(arrangement).map((e) => e.seq)) + 1;
      const clamp = (v: number) => (Number.isFinite(v) ? Math.max(-0.5, Math.min(0.5, v)) : 0);
      set({ arrangement: { ...arrangement, [id]: { at, x: clamp(x), y: clamp(y), seq } } });
      project(game);
      persist();
    },

    resetArrangement: (at) => {
      const { game, arrangement } = get();
      const kept = at ? Object.fromEntries(Object.entries(arrangement).filter(([, e]) => e.at !== at)) : {};
      if (Object.keys(kept).length === Object.keys(arrangement).length) return;
      set({ arrangement: kept });
      if (game) project(game);
      persist();
    },

    setArrangeMode: (on) => set({ arrangeMode: on }),

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

    revealTokens: () => {
      // Deliberately does nothing now. This used to yank the board down to the subsurface
      // whenever every pickable unit happened to be below, which moved the view out from
      // under the player mid-decision. Those units are drawn under their sites on the surface
      // view (see `faded` in projection.ts) and are clickable there, so there is nothing to
      // reveal: changing layers stays something the player asks for, with V or the rail.
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
        // the turns played under Courtesan Thaïs and the feed's notes outlive a reload too
        feedNotes: readFeedNotes(saved.feedNotes).filter((n) => n.after < game.log.length && n.lines.every((l) => l < game.log.length)),
        controlTurns: readControlTurns(saved.controlTurns),
        // committed() drops any card that is no longer where it was arranged
        arrangement: readArrangement(saved.arrangement),
      });
      watchProjection();
      // a rebuilt or rewound board is not 'damage since last time': start the diff afresh
      lastDamage = null;
      lastRevealSeq = 0;
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
      set({
        game,
        matchId: `m${++matchCounter}`,
        botLevel,
        lastError: null,
        portalsRevealed: !hasPortents,
        feedNotes: [],
        controlTurns: {},
        arrangement: {},
      });
      watchProjection();
      // a rebuilt or rewound board is not 'damage since last time': start the diff afresh
      lastDamage = null;
      lastRevealSeq = 0;
      toastedLogLength = game.log.length;
      committed(game, "silent");
    },

    dispatch: (action) => {
      const { game, mode } = get();
      if (mode === "remote") {
        // Nothing is applied here. The server is the only authority, and this client does not
        // even hold a state to apply against — `game` is the redacted view it was sent. The
        // board changes when the next view arrives, which is also what makes a refused action
        // simply not happen rather than having to be rolled back.
        if (!remoteSend) return { ok: false, error: "Not connected to the match." };
        remoteSend({ type: "engine:action", matchId: get().matchId, action, rev: get().rev, build: ENGINE_BUILD });
        return { ok: true };
      }
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
      awardAchievements(JSON.parse(snapshot) as EngineState, game, HUMAN_SEAT, action);
      history.push(snapshot);
      if (history.length > UNDO_LIMIT) history.shift();
      // our own move clears the computer's last line and its board glow
      set({ narration: null });
      const picker = useCpuBoardPicker.getState();
      if (picker.request.startsWith("engine-cpu:")) picker.clear(picker.request);
      committed(game, "local");
      return result;
    },

    requestEndTurn: () => {
      const { game } = get();
      if (!game) return;
      const seat = humanDecisionSeat(game);
      // Mirrors /play's requestEndTurn: an untapped avatar almost always means a forgotten
      // site or draw, so ask before spending the turn. Same wording, same dialog.
      const avatar = seat !== null ? game.units[game.players[seat].avatarUnitId] : null;
      if (avatar && !avatar.tapped) {
        set({ endTurnConfirm: true });
        return;
      }
      get().dispatch({ t: "endTurn" });
    },

    dismissEndTurn: () => set({ endTurnConfirm: false }),

    joinRemote: (matchId, seat, send) => {
      // Tear down anything local first: a remote match must not have a bot thinking, an undo
      // history, or a saved game on this machine. Those are all cheats against a human.
      stopLocalWork();
      remoteSend = send;
      set({
        mode: "remote",
        matchId,
        seat,
        game: null,
        rev: -1,
        legal: null,
        canUndo: false,
        botThinking: false,
        narration: null,
        lastError: null,
        outdated: false,
        decisionSeat: null,
      });
      takeOverBoard();
      send({ type: "engine:resync", matchId });
    },

    applyRemoteView: (envelope) => {
      const { mode, matchId, rev } = get();
      if (mode !== "remote" || envelope.matchId !== matchId) return;
      // Views can overtake each other; an older one would roll the board backwards.
      if (envelope.rev < rev) return;
      // Painted with different rules the view could be misread, and every action built from it
      // would be refused anyway — stop here and say why.
      if (envelope.build !== ENGINE_BUILD) {
        set({ outdated: true, legal: null, decisionSeat: null });
        return;
      }
      set({
        // The view is engine-state SHAPED (units, sites, players, prompts, flow), which is why
        // every board component reads it exactly as it reads a local game.
        game: envelope.view as unknown as EngineState,
        rev: envelope.rev,
        seat: envelope.seat,
        legal: envelope.legal,
        lastError: null,
        decisionSeat: envelope.over ? null : envelope.seat,
      });
      paint(envelope.view, envelope.power, new Set(envelope.disabled), "remote");
    },

    applyRemoteReject: (reason) => {
      // The server also sends the real board straight after, so there is nothing to undo —
      // only something to say.
      set({ lastError: reason });
    },

    undo: () => {
      const snapshot = history.pop();
      if (!snapshot) return;
      cancelBot();
      const game = JSON.parse(snapshot) as EngineState;
      // rewinding lowers damage counters; that is not healing to animate
      lastDamage = null;
      set({ game, reveal: null });
      committed(game, "undo");
    },

    stop: () => {
      cancelBot();
      // a deferred effect must not fire into a torn-down match
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = null;
      unsubscribeStore?.();
      unsubscribeStore = null;
      lastProjection = null;
      nextBotAt = 0;
      lastBotTurn = -1;
      useCpuReveals.getState().reset();
      setSiteCardScaleFallback(1);
      useGameStore.setState({ boardGesturesLocked: false, boardArrange: null, ...(borrowed ?? {}) });
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
      set({
        game: null,
        rev: 0,
        botThinking: false,
        narration: null,
        legal: null,
        lastError: null,
        canUndo: false,
        layer: "surface",
        hidden: {},
        feedNotes: [],
        controlTurns: {},
        arrangement: {},
        arrangeMode: false,
      });
    },
  };
});

// Dev handle for driving engine matches from the console / headless checks (like window.__gameStore).
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__engineSession = useEngineSession;
}
