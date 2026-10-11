"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { HUMAN_SEAT, useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useCpuReveals } from "@/lib/game/cpu/revealQueue";

/** A line stays readable this long after the computer stops acting. */
const LINGER_MS = 2600;
/** How many of the computer's recent lines stay on screen. */
const KEEP = 3;

interface Line {
  seq: number;
  text: string;
}

/**
 * The computer's turn, narrated on screen: what it just did, in tile numbers, so the
 * player never has to open the log. Lines stack newest-first and fade out once the
 * computer hands the turn back.
 */
export default function EngineNarration() {
  const game = useEngineSession((s) => s.game);
  const narration = useEngineSession((s) => s.narration);
  const botThinking = useEngineSession((s) => s.botThinking);
  const [lines, setLines] = useState<Line[]>([]);
  const revealUp = useCpuReveals((state) => state.queue.length > 0);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // keep the tab-hidden state in sync so a reveal never expires unseen
  useEffect(() => {
    const onVisibility = () => useCpuReveals.getState().setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!narration) {
      setLines([]);
      return;
    }
    setLines((prev) => (prev[0]?.seq === narration.seq ? prev : [{ seq: narration.seq, text: narration.text }, ...prev].slice(0, KEEP)));
  }, [narration]);

  // clear once the computer is done and the player has had a moment to read
  const botTurn = !!game && game.activePlayer !== HUMAN_SEAT;
  useEffect(() => {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    if (botTurn || botThinking || !lines.length) return;
    fadeTimer.current = setTimeout(() => setLines([]), LINGER_MS);
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [botTurn, botThinking, lines.length]);

  // ONE channel at a time. When CpuPlayReveal has the computer's card on screen it is already
  // saying what just happened, with the card itself — a pill repeating it in a second place is
  // the "multiple notifications in multiple locations" problem. The pill carries the actions
  // that have no card to show (end turn, a move, a pass) and the thinking state.
  if (!game || game.phase === "over" || (!lines.length && !botThinking) || revealUp) return null;

  return (
    // Left edge, where CpuPlayReveal puts the computer's card: the two read as one place for
    // "what the computer is doing". The old top-[4.5rem] strip sat underneath the prompt
    // banner (top-14, ~70px tall, opaque) which hid the newest line outright.
    <div className="pointer-events-none fixed left-4 top-1/2 z-[150] flex max-w-[min(22rem,32vw)] -translate-y-1/2 flex-col items-start gap-1">
      {botThinking && !lines.length && (
        <div className="flex items-center gap-2 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] px-3 py-1.5 font-rc-sans text-sm text-rc-fg-muted shadow-rc-panel">
          <Icon icon="game-icons:hourglass" className="h-3.5 w-3.5 animate-pulse" style={{ color: PLAYER_COLORS.p2 }} aria-hidden />
          The computer is thinking…
        </div>
      )}
      {lines.map((line, index) => (
        <div
          key={line.seq}
          role={index === 0 ? "status" : undefined}
          aria-live={index === 0 ? "polite" : undefined}
          className="flex max-w-[min(92vw,620px)] items-center gap-2 rounded-full border bg-[rgba(7,10,20,0.92)] px-3.5 py-1.5 font-rc-sans text-sm shadow-rc-panel transition-opacity"
          style={{
            borderColor: `${PLAYER_COLORS.p2}${index === 0 ? "66" : "22"}`,
            opacity: index === 0 ? 1 : index === 1 ? 0.58 : 0.32,
          }}
        >
          {index === 0 && (
            <Icon icon="game-icons:cpu" className="h-3.5 w-3.5 flex-none" style={{ color: PLAYER_COLORS.p2 }} aria-hidden />
          )}
          <span className={index === 0 ? "text-rc-fg" : "text-rc-fg-muted"}>{line.text}</span>
        </div>
      ))}
    </div>
  );
}
