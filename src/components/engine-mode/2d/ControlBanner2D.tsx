"use client";

import { Icon } from "@iconify/react";
import { controlSwap, useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";

/**
 * Courtesan Thaïs, said for as long as it lasts: "the Computer is playing your turn" for the
 * whole of that turn, "you are playing the Computer's turn" for the whole of that one, and a
 * quieter heads-up for the swap the next turn will bring. Without it the computer moving your
 * pieces reads as a bug, and a hand of the opponent's cards appears from nowhere.
 *
 * A plain in-flow strip (no props, no positioning): the 2D layout decides where it sits. It
 * renders nothing while control is normal. The words carry the meaning; the seat colour on its
 * edge (whose decisions they are) only repeats it, so it reads the same in monochrome.
 */
export default function ControlBanner2D() {
  const game = useEngineSession((s) => s.game);
  useEngineSession((s) => s.rev);
  const swap = game ? controlSwap(game) : null;
  if (!swap) return null;
  // the seat making the decisions: the computer while it plays ours, us while we play theirs
  const decider = swap.kind === "computer-plays-yours" || swap.kind === "computer-will-play-yours" ? "p2" : "p1";
  const color = PLAYER_COLORS[decider];
  const [title, rest] = splitTitle(swap.text);
  return (
    <div
      role="status"
      aria-live="polite"
      data-control-swap={swap.kind}
      className={`pointer-events-auto relative flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-rc-md border px-2.5 py-1.5 font-rc-sans leading-tight shadow-rc-panel ${
        swap.now ? "border-rc-line/30 bg-[rgba(12,16,30,0.94)] text-[13px] text-rc-fg" : "border-rc-line/18 bg-[rgba(9,13,25,0.88)] text-[12px] text-rc-fg-muted"
      }`}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      <Icon icon="game-icons:puppet" aria-hidden className="h-4 w-4 flex-none" style={{ color }} />
      <span data-swap-text="" className="min-w-0 flex-1 break-words" title={swap.text}>
        <span className="font-fantaisie text-rc-fg-strong">{title}</span>
        {rest && <span>: {rest}</span>}
      </span>
      {swap.now && decider === "p2" && (
        <span className="flex-none font-rc-mono text-[10px] uppercase tracking-[0.1em] text-rc-fg-subtle">Watch</span>
      )}
    </div>
  );
}

/** "Courtesan Thaïs: the Computer…" → the card's name and the sentence after it. */
function splitTitle(text: string): [string, string] {
  const at = text.indexOf(": ");
  return at < 0 ? [text, ""] : [text.slice(0, at), text.slice(at + 2)];
}
