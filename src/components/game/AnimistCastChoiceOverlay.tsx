"use client";

import { useEffect, useCallback } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import type { AnimistCastMode } from "@/lib/game/store/types";

export function AnimistCastChoiceOverlay() {
  const pending = useGameStore((s) => s.pendingAnimistCast);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const resolveAnimistCast = useGameStore((s) => s.resolveAnimistCast);
  const cancelAnimistCast = useGameStore((s) => s.cancelAnimistCast);

  // Determine if we're the caster:
  // - In online mode: actorKey must match casterSeat
  // - In offline mode (actorKey is null): allow the current player
  const isCaster =
    pending &&
    (actorKey
      ? pending.casterSeat === actorKey
      : (pending.casterSeat === "p1" ? 1 : 2) === currentPlayer);

  const handleChoice = useCallback(
    (mode: AnimistCastMode) => {
      resolveAnimistCast(mode);
    },
    [resolveAnimistCast]
  );

  // Handle escape key to cancel
  useEffect(() => {
    if (!isCaster) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelAnimistCast();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCaster, cancelAnimistCast]);

  if (!pending || pending.status !== "choosing") return null;

  // If we're not the caster, show a waiting message
  if (!isCaster) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.9)]">
        <div className="flex flex-col items-center gap-4 font-rc-sans">
          <p className="text-rc-fg-muted text-sm">
            Opponent is choosing how to cast {pending.card.name}...
          </p>
          <div className="flex gap-4">
            <div className="px-6 py-3 rounded-rc-md border border-rc-line/12 bg-black/30 opacity-50 animate-pulse">
              <span className="text-rc-fg-muted">Magic</span>
            </div>
            <div className="px-6 py-3 rounded-rc-md border border-rc-line/12 bg-black/30 opacity-50 animate-pulse">
              <span className="text-rc-fg-muted">Spirit</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.9)]">
      <div className="flex flex-col items-center gap-6 max-w-md text-center font-rc-sans text-rc-fg">
        <div className="flex flex-col gap-2">
          <h2 className="font-rc-display text-[22px] leading-tight text-rc-fg-strong">
            Animist&apos;s Gift
          </h2>
          <p className="text-rc-fg-muted">
            How would you like to cast{" "}
            <span className="font-rc-display text-rc-accent-link">
              {pending.card.name}
            </span>
            ?
          </p>
        </div>

        <div className="flex gap-6">
          {/* Cast as Magic */}
          <button
            onClick={() => handleChoice("magic")}
            className="flex flex-col items-center gap-3 px-8 py-6 rounded-rc-md border border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-rc-accent-ring"
          >
            <span className="text-lg font-medium text-rc-fg-strong">Magic</span>
            <span className="text-xs text-rc-fg-muted">
              Cast normally as a spell
            </span>
          </button>

          {/* Cast as Spirit */}
          <button
            onClick={() => handleChoice("spirit")}
            className="flex flex-col items-center gap-3 px-8 py-6 rounded-rc-md border border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-rc-accent-ring"
          >
            <span className="text-lg font-medium text-rc-fg-strong">
              Spirit
            </span>
            <span className="font-rc-mono tabular-nums text-xs text-rc-fg-muted">
              Power: {pending.manaCost}
            </span>
          </button>
        </div>

        <p className="text-rc-fg-subtle text-xs">
          Spirits have power equal to the spell&apos;s mana cost (
          {pending.manaCost})
        </p>

        <RcButton variant="ghost" size="sm" onClick={cancelAnimistCast}>
          Cancel (Esc)
        </RcButton>
      </div>
    </div>
  );
}
