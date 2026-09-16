"use client";

import { useCallback, useEffect } from "react";
import { useGameStore } from "@/lib/game/store";
import type { SummonLayer } from "@/lib/game/store/types";

const CHOICE =
  "flex flex-col items-center gap-3 px-8 py-6 rounded-rc-md border border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-rc-accent-ring";

const LAYER_LABEL: Record<SummonLayer, { title: string; detail: string }> = {
  submerged: { title: "Submerge", detail: "Enter underwater, out of reach of the surface" },
  burrowed: { title: "Burrow", detail: "Enter underground, out of reach of the surface" },
};

/** Asks the summoning player whether a unit with Submerge or Burrowing (printed or granted)
 * enters the subsurface. Only the chooser sees it; Escape keeps the unit on the surface. */
export function SummonLayerChoiceOverlay() {
  const pending = useGameStore((s) => s.pendingSummonLayer);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const resolveSummonLayer = useGameStore((s) => s.resolveSummonLayer);

  // Online the seat must match; offline (no actorKey) the current player chooses.
  const isChooser =
    !!pending &&
    (actorKey ? pending.seat === actorKey : (pending.seat === "p1" ? 1 : 2) === currentPlayer);

  const stayOnSurface = useCallback(() => resolveSummonLayer("surface"), [resolveSummonLayer]);

  useEffect(() => {
    if (!isChooser) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stayOnSurface();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isChooser, stayOnSurface]);

  if (!pending || !isChooser) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.9)]">
      <div className="flex max-w-md flex-col items-center gap-6 text-center font-rc-sans text-rc-fg">
        <div className="flex flex-col gap-2">
          <h2 className="font-rc-display text-[22px] leading-tight text-rc-fg-strong">Summon below the surface?</h2>
          <p className="text-rc-fg-muted">
            Where should <span className="font-rc-display text-rc-accent-link">{pending.cardName}</span> enter?
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-6">
          <button type="button" onClick={stayOnSurface} className={CHOICE}>
            <span className="text-lg font-medium text-rc-fg-strong">Surface</span>
            <span className="text-xs text-rc-fg-muted">Enter atop the site as usual</span>
          </button>
          {pending.layers.map((layer) => (
            <button key={layer} type="button" onClick={() => resolveSummonLayer(layer)} className={CHOICE}>
              <span className="text-lg font-medium text-rc-fg-strong">{LAYER_LABEL[layer].title}</span>
              <span className="text-xs text-rc-fg-muted">{LAYER_LABEL[layer].detail}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-rc-fg-subtle">Esc keeps it on the surface</p>
      </div>
    </div>
  );
}
