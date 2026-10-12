"use client";

import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useCpuReveals } from "@/lib/game/cpu/revealQueue";

/**
 * How long one line stays up after it appears.
 *
 * Each line now expires on its own clock rather than the whole stack waiting for the
 * computer to finish its turn: the old behaviour left the last thing it did sitting on
 * screen long after it had happened. Narration should track the action, then get out of
 * the way. Comfortably longer than the bot's own 1.5s gap between actions, so a line is
 * still readable when the next one arrives.
 */
const LINE_MS = 2200;
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
    setLines((prev) =>
      prev[0]?.seq === narration.seq ? prev : [{ seq: narration.seq, text: narration.text }, ...prev].slice(0, KEEP),
    );
    // this line's own lifetime, independent of whose turn it is
    const seq = narration.seq;
    const timer = setTimeout(() => setLines((prev) => prev.filter((l) => l.seq !== seq)), LINE_MS);
    return () => clearTimeout(timer);
  }, [narration]);

  // A turn that ends takes its narration with it; individual lines expire on their own above.
  useEffect(() => {
    if (!game || game.phase === "over") setLines([]);
  }, [game]);

  if (!game || game.phase === "over" || (!lines.length && !botThinking) || revealUp) return null;

  return (
    // Centre of the screen, which is also the centre of the board (the camera targets
    // (0,0,0)): the player is already looking here, so what the computer is doing does not
    // have to be hunted for at an edge. The old top strip sat underneath the prompt banner
    // (top-14, ~70px tall, opaque), which hid the newest line outright.
    <div className="pointer-events-none fixed inset-x-0 top-1/2 z-[150] flex -translate-y-1/2 flex-col items-center gap-1 px-4">
      {botThinking && !lines.length && (
        <div className="flex items-center gap-2.5 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.92)] px-4 py-2 font-rc-sans text-[15px] text-rc-fg shadow-rc-panel">
          <Icon icon="game-icons:hourglass" className="h-4 w-4 animate-pulse" style={{ color: PLAYER_COLORS.p2 }} aria-hidden />
          The computer is thinking…
        </div>
      )}
      {lines.map((line, index) => (
        <div
          key={line.seq}
          role={index === 0 ? "status" : undefined}
          aria-live={index === 0 ? "polite" : undefined}
          className="flex max-w-[min(92vw,620px)] items-center gap-2 rounded-full border bg-[rgba(7,10,20,0.92)] px-3.5 py-1.5 text-center font-rc-sans text-sm shadow-rc-panel transition-opacity"
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
