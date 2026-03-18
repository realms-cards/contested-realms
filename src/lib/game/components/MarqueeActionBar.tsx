import { useCallback, useEffect } from "react";

import { useSound } from "@/lib/contexts/SoundContext";
import { useGameStore } from "@/lib/game/store";

/**
 * Floating action bar shown when marquee selection is active (TTS mode).
 * Provides mass actions: Tap All, Untap All, Clear Selection.
 */
export function MarqueeActionBar() {
  const marqueeSelection = useGameStore((s) => s.marqueeSelection);
  const permanents = useGameStore((s) => s.permanents);
  const toggleTapPermanent = useGameStore((s) => s.toggleTapPermanent);
  const clearMarqueeSelection = useGameStore((s) => s.clearMarqueeSelection);
  const { playCardFlip } = useSound();

  // Click outside to clear selection
  useEffect(() => {
    if (marqueeSelection.length === 0) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-marquee-bar]")) return;
      // Don't clear on canvas clicks — let the marquee layer handle it
      if (target.tagName === "CANVAS") return;
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [marqueeSelection.length, clearMarqueeSelection]);

  const tapAll = useCallback(() => {
    const state = useGameStore.getState();
    for (const { at, index } of marqueeSelection) {
      const items = state.permanents[at];
      if (items && items[index] && !items[index].tapped) {
        toggleTapPermanent(at, index);
      }
    }
    try {
      playCardFlip();
    } catch {}
  }, [marqueeSelection, toggleTapPermanent, playCardFlip]);

  const untapAll = useCallback(() => {
    const state = useGameStore.getState();
    for (const { at, index } of marqueeSelection) {
      const items = state.permanents[at];
      if (items && items[index] && items[index].tapped) {
        toggleTapPermanent(at, index);
      }
    }
    try {
      playCardFlip();
    } catch {}
  }, [marqueeSelection, toggleTapPermanent, playCardFlip]);

  if (marqueeSelection.length === 0) return null;

  // Count tapped/untapped in selection
  let tappedCount = 0;
  let untappedCount = 0;
  for (const { at, index } of marqueeSelection) {
    const items = permanents[at];
    if (items && items[index]) {
      if (items[index].tapped) tappedCount++;
      else untappedCount++;
    }
  }

  return (
    <div
      data-marquee-bar
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[9998] flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/90 ring-1 ring-cyan-500/40 backdrop-blur-sm shadow-lg"
    >
      <span className="text-xs text-cyan-300 font-medium mr-1">
        {marqueeSelection.length} selected
      </span>

      {untappedCount > 0 && (
        <button
          type="button"
          onClick={tapAll}
          className="px-2.5 py-1 text-xs font-medium rounded bg-amber-600/80 hover:bg-amber-600 text-white transition-colors"
        >
          Tap All
        </button>
      )}

      {tappedCount > 0 && (
        <button
          type="button"
          onClick={untapAll}
          className="px-2.5 py-1 text-xs font-medium rounded bg-emerald-600/80 hover:bg-emerald-600 text-white transition-colors"
        >
          Untap All
        </button>
      )}

      <button
        type="button"
        onClick={clearMarqueeSelection}
        className="px-2.5 py-1 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
      >
        Clear
      </button>
    </div>
  );
}
