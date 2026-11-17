"use client";

import { Icon } from "@iconify/react";
import { useEffect, useRef, useState } from "react";
import { CLOCK_GIFTS, clockReading, formatClock } from "@/lib/engine-mode/clock";
import { opponentName, useEngineSession } from "@/lib/engine-mode/session";
import type { PlayerId } from "@sorcery/shared";

/** Below this a clock turns urgent (red), as a chess clock's last minute does. */
const LOW_MS = 60_000;
/** How often a running clock redraws: tenths show under a minute. */
const TICK_MS = 100;

/** The clocks as they read now, redrawn while one of them runs; null in an untimed game. */
function useClockNow() {
  const game = useEngineSession((s) => s.game);
  useEngineSession((s) => s.rev);
  const settledAt = useEngineSession((s) => s.clockSettledAt);
  const [now, setNow] = useState(() => Date.now());
  const reading = game ? clockReading(game, settledAt, now) : null;
  const running = reading?.running ?? null;
  useEffect(() => {
    if (running === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [running]);
  return reading;
}

/**
 * One seat's chess clock in an engine game: the time left, lit while it runs. Clicking the
 * OPPONENT's clock offers to give them time (the engine's `addTime`, a courtesy allowed at any
 * moment). Renders nothing in an untimed game.
 */
export default function EngineClock({ seat, compact = false }: { seat: PlayerId; compact?: boolean }) {
  const reading = useClockNow();
  const viewer = useEngineSession((s) => s.seat);
  const game = useEngineSession((s) => s.game);
  const dispatch = useEngineSession((s) => s.dispatch);
  // where the gift menu opens: fixed to the viewport, since the seat bars scroll and would clip it
  const [giving, setGiving] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const root = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!giving) return;
    const close = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setGiving(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [giving]);

  if (!reading || !game) return null;
  const left = reading.remaining[seat];
  const running = reading.running === seat;
  const low = left < LOW_MS;
  const theirs = seat !== viewer;
  const who = theirs ? opponentName(game, viewer) : "Your";
  const label = `${theirs ? `${who}'s` : who} clock: ${formatClock(left)}${running ? ", running" : ""}`;
  const canGive = theirs && game.phase !== "over";

  const face = (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-rc-mono tabular-nums leading-none ${
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-[13px]"
      } ${running ? (low ? "border-rc-danger bg-rc-danger/20 text-rc-danger-ink" : "border-rc-accent/70 bg-rc-accent/15 text-rc-fg-strong") : "border-rc-line/25 bg-[rgba(7,10,20,0.85)] text-rc-fg-muted"}`}
    >
      <Icon icon="game-icons:stopwatch" aria-hidden width={compact ? 11 : 13} height={compact ? 11 : 13} />
      {formatClock(left)}
    </span>
  );

  return (
    <div ref={root} className="relative inline-flex">
      {canGive ? (
        <button
          type="button"
          aria-label={`${label}. Give them extra time`}
          title="Give your opponent extra time"
          aria-expanded={!!giving}
          onClick={(e) => {
            if (giving) return setGiving(null);
            const box = e.currentTarget.getBoundingClientRect();
            const right = Math.max(8, window.innerWidth - box.right);
            // a clock low on the screen (your own seat bar's row) opens its menu upward
            setGiving(box.bottom > window.innerHeight - 200 ? { right, bottom: window.innerHeight - box.top + 4 } : { right, top: box.bottom + 4 });
          }}
          className="rounded-full focus-visible:outline-2 focus-visible:outline-rc-accent"
        >
          {face}
        </button>
      ) : (
        <span role="timer" aria-label={label} title={label}>
          {face}
        </span>
      )}
      {giving && (
        <div
          role="menu"
          aria-label="Give extra time"
          className="fixed z-[80] flex flex-col gap-1 rounded-rc-md border border-rc-line/25 bg-[rgba(7,10,20,0.96)] p-1.5 shadow-rc-panel"
          style={giving}
        >
          <span className="px-1 pb-0.5 font-rc-sans text-[11px] text-rc-fg-muted">Give {who} time</span>
          {CLOCK_GIFTS.map((gift) => (
            <button
              key={gift.ms}
              type="button"
              role="menuitem"
              className="rounded px-2 py-1 text-left font-rc-mono text-[12px] text-rc-fg hover:bg-rc-accent/15"
              onClick={() => {
                setGiving(null);
                dispatch({ t: "addTime", player: seat, ms: gift.ms });
              }}
            >
              {gift.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
