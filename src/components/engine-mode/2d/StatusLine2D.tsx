"use client";

import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { soundManager } from "@/lib/audio/soundManager";
import { humanDecisionSeat, opponentName, useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { useActionFeed } from "./ActionFeed2D";
import { entrySummary } from "./actionFeed";
import { statusLine, type StatusLine } from "./actions2d";

/** How long one narration line stays up — EngineNarration's LINE_MS, so both views pace alike. */
const LINE_MS = 2200;
/** The least time any line of the opponent's stays readable before the next one replaces it. */
export const STATUS_DWELL_MS = 1600;
/** ...and a line that carries a result (damage, a death, life lost): the part a player must catch. */
export const STATUS_RESULT_DWELL_MS = 3200;
/** The computer's own "turn over" line. */
const ENDS_TURN = /\bends (?:its|their) turn\b/i;
/** A narration this soon after the feed's newest entry is about that same action. */
const SAME_ACTION_MS = 700;

const ICON: Record<"hint" | "cpu" | "thinking", string> = {
  hint: "game-icons:magnifying-glass",
  cpu: "game-icons:cpu",
  thinking: "game-icons:hourglass",
};

/** How long "Turn N — your turn." stays up: the 2D view's whole turn announcement. */
export const TURN_BEAT_MS = 2400;

/**
 * Your turn starting, as a beat for the status line: the turn number while it is fresh, else
 * null. It replaces the big "Turn N" overlay the 3D table centres over the board, and rings
 * the same gong. Nothing on mounting: switching to this view mid-turn is not a new turn.
 */
function useTurnBeat(): { turn: number; piloting: boolean } | null {
  // the turns whose decisions are ours: our own (unless Courtesan Thaïs has the computer playing
  // it — that is its turn to watch, not ours) and the opponent's while we pilot it
  const mine = useEngineSession((s) => {
    const g = s.game;
    if (!g || g.phase === "mulligan" || g.phase === "over") return null;
    const decider = humanDecisionSeat(g, s.seat);
    if (decider === null) return null;
    return `${g.turn}:${decider === s.seat ? "own" : "pilot"}`;
  });
  const seen = useRef(mine);
  const [beat, setBeat] = useState<{ turn: number; piloting: boolean } | null>(null);
  useEffect(() => {
    if (mine === seen.current) return;
    seen.current = mine;
    if (mine === null) {
      setBeat(null);
      return;
    }
    const [turn, whose] = mine.split(":");
    setBeat({ turn: Math.max(1, Number(turn) || 1), piloting: whose === "pilot" });
    try {
      soundManager.play("turnGong");
    } catch {
      // sound is decoration
    }
    const timer = setTimeout(() => setBeat(null), TURN_BEAT_MS);
    return () => clearTimeout(timer);
  }, [mine]);
  return beat;
}

/** How long a shown line holds before the next may replace it (a hint never waits). */
export function statusHold(line: StatusLine | null): number {
  if (!line || line.kind !== "cpu") return 0;
  return line.text.includes(" — ") ? STATUS_RESULT_DWELL_MS : STATUS_DWELL_MS;
}

/** The same action's line growing its results ("… — X dies.") replaces it at once. */
const grows = (shown: StatusLine, next: StatusLine) =>
  shown.kind === "cpu" && next.kind === "cpu" && next.text.startsWith(shown.text.replace(/\.$/, ""));

/**
 * The opponent's line, held: once shown, a line stays for its hold (statusHold) before the
 * next replaces it, and only the newest waiting line is kept — the feed has the rest. Without
 * this an attack's result ("… — Wayfaring Pilgrim dies.") was on screen for a third of a second
 * before the next move's narration took its place.
 */
function useHeldLine(line: StatusLine | null, flush = false): StatusLine | null {
  const [shown, setShown] = useState<StatusLine | null>(line);
  const current = useRef<{ line: StatusLine | null; since: number }>({ line, since: Date.now() });
  const text = line?.text ?? null;
  const kind = line?.kind ?? null;
  useEffect(() => {
    const next = text !== null && kind !== null ? { text, kind } : null;
    const now = current.current;
    if (now.line?.text === next?.text && now.line?.kind === next?.kind) return;
    const apply = () => {
      current.current = { line: next, since: Date.now() };
      setShown(next);
    };
    // `flush`: the turn came back to you, and nothing of theirs is worth holding over it
    const wait = flush || (now.line && next && grows(now.line, next)) ? 0 : now.since + statusHold(now.line) - Date.now();
    if (wait <= 0) {
      apply();
      return;
    }
    const timer = setTimeout(apply, wait);
    return () => clearTimeout(timer);
  }, [text, kind, flush]);
  return shown;
}

/**
 * The 2D view's single status strip, in the page flow (between the opponent bar and the board
 * in portrait, above the actions in the inspector column), so it never covers a tile.
 *
 * In order, it says: what the pointed-at token would do (the picker's hover label, the same
 * text the 3D board floats over a tile; on a touch screen the first tap of a two-tap pick sets
 * it); else what the opponent just did, with what it caused ("Spectral Stalker moves from tile
 * 3 to tile 8 and attacks Wayfaring Pilgrim — Wayfaring Pilgrim takes 2 damage, Wayfaring
 * Pilgrim dies.") — the feed's entry for the action the computer just narrated, which carries
 * its results, or the narration itself for an action the feed does not list (a draw); else that
 * the computer is thinking. The opponent's lines are held (useHeldLine) so a result is never
 * gone before it is read; a hint answers the pointer at once.
 *
 * When your turn starts it says so for a moment ("Turn 5 — your turn.", with the gong): the
 * 2D view's only turn announcement, in place of the big centred banner.
 *
 * It wraps to two lines rather than cutting the end off (the end is who was hit and how);
 * `large` sets it a size up for the desktop inspector.
 */
export default function StatusLine2D({ large = false }: { large?: boolean }) {
  const narration = useEngineSession((s) => s.narration);
  const botThinking = useEngineSession((s) => s.botThinking);
  const over = useEngineSession((s) => s.game?.phase === "over");
  // "them" is the seat we do not hold — the computer in single player, a person online
  const theirTurn = useEngineSession((s) => !!s.game && s.game.activePlayer !== s.seat);
  const turn = useEngineSession((s) => s.game?.turn ?? 0);
  // narration only exists in single player, so with no game yet the speaker is the computer
  const them = useEngineSession((s) => (s.game ? opponentName(s.game, s.seat) : "Computer"));
  const { hovered, labels } = useCpuBoardPicker(useShallow((p) => ({ hovered: p.hovered, labels: p.labels })));
  const turns = useActionFeed();

  // each narration line expires on its own clock, as EngineNarration's do
  const [said, setSaid] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (!narration) {
      setSaid(null);
      return;
    }
    setSaid({ text: narration.text, at: Date.now() });
    const timer = setTimeout(() => setSaid(null), LINE_MS);
    return () => clearTimeout(timer);
  }, [narration]);

  // the opponent's latest action this turn, with what it caused, and when it first appeared
  const entry = useMemo(() => {
    if (!theirTurn) return null;
    const group = turns.find((t) => t.turn === turn);
    return group?.entries.find((e) => e.seat === "p2" && e.kind !== "draw") ?? null;
  }, [turns, turn, theirTurn]);
  const [entrySeen, setEntrySeen] = useState<{ id: number; at: number } | null>(null);
  const entryId = entry?.id ?? null;
  useEffect(() => {
    if (entryId !== null) setEntrySeen({ id: entryId, at: Date.now() });
  }, [entryId]);

  // a narration right after the feed's newest entry is that entry's action: the entry says more
  const latest = entry ? entrySummary(entry) : null;
  const entryAt = entry && entrySeen?.id === entry.id ? entrySeen.at : 0;
  // "Ends its turn." is news while it is still their turn; once yours has started (a draw
  // prompt is up) it only crowds out what you are being asked
  const stale = !theirTurn && !!said && ENDS_TURN.test(said.text);
  const narrated = said && !stale ? (said.text.startsWith(them) ? said.text : `${them}: ${said.text}`) : null;
  const cpuText = said && narrated && (!latest || said.at - entryAt > SAME_ACTION_MS) ? narrated : latest;
  const cpuLine = useHeldLine(over ? null : statusLine({ hovered: null, labels, narration: cpuText, botThinking }), !theirTurn && !cpuText);
  const hint = over ? null : statusLine({ hovered, labels, narration: null, botThinking: false });
  const beat = useTurnBeat();
  const beatLine: StatusLine | null =
    beat === null
      ? null
      : { kind: "hint", text: beat.piloting ? `Turn ${beat.turn} — you play ${them}'s turn.` : `Turn ${beat.turn} — your turn.` };
  const line = hint ?? beatLine ?? cpuLine;
  const isBeat = !hint && !!beatLine;
  const fresh = line?.kind === "cpu" && line.text === cpuText;
  const tint = isBeat ? PLAYER_COLORS.p1 : line && line.kind !== "hint" ? PLAYER_COLORS.p2 : undefined;
  // still deciding its next move while the last one shows: the hourglass says so
  const busy = line?.kind === "cpu" && botThinking && !said;
  const icon = isBeat ? "game-icons:sands-of-time" : busy ? ICON.thinking : line ? ICON[line.kind] : "";
  const pulsing = line?.kind === "thinking" || busy;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-[22px] min-w-0 flex-none items-center gap-1.5 px-2 font-rc-sans ${large ? "py-0.5 text-[13px] leading-snug" : "text-[12px] leading-tight"}`}
    >
      {line && (
        <>
          <Icon
            icon={icon}
            aria-hidden
            className={`h-3.5 w-3.5 flex-none ${pulsing ? "motion-safe:animate-pulse" : ""} ${tint ? "" : "text-rc-accent-link"}`}
            style={tint ? { color: tint } : undefined}
          />
          <span
            data-status-text=""
            className={`line-clamp-2 min-w-0 ${line.kind === "hint" || fresh ? "text-rc-fg" : "text-rc-fg-muted"}`}
            title={line.text}
          >
            {line.text}
          </span>
        </>
      )}
    </div>
  );
}
