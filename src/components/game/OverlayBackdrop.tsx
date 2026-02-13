"use client";

import { useOverlayRegistry } from "@/lib/game/overlayRegistry";

/**
 * Shared backdrop + storyline indicator for all game overlays.
 * Renders a dark backdrop when ANY non-minimized overlay is active.
 * Shows a numbered resolution queue when 2+ overlays exist.
 */
export default function OverlayBackdrop() {
  const overlays = useOverlayRegistry((s) => s.overlays);
  const minimized = useOverlayRegistry((s) => s.minimized);
  const boardInteraction = useOverlayRegistry((s) => s.boardInteractionActive);

  if (overlays.length === 0) return null;

  // Check if any overlay is expanded (not minimized)
  const hasExpanded = overlays.some(
    (o) => !minimized[o.id] && !boardInteraction,
  );

  const sorted = [...overlays].sort((a, b) => a.priority - b.priority);

  return (
    <>
      {/* Dark backdrop — only when at least one overlay is expanded */}
      {hasExpanded && (
        <div
          className="fixed inset-0 z-[199] bg-black/70 backdrop-blur-sm"
          aria-hidden
        />
      )}

      {/* Storyline indicator — shows resolution order when 2+ overlays */}
      {sorted.length >= 2 && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[202] pointer-events-none select-none">
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/80 ring-1 ring-white/20 text-[11px] text-white/70">
            <span className="font-semibold text-white/50 mr-0.5">
              Storyline
            </span>
            {sorted.map((o, i) => (
              <span key={o.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-white/30">›</span>}
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                    i === sorted.length - 1
                      ? "bg-purple-600/40 text-purple-200 ring-1 ring-purple-400/40"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-60">
                    {i + 1}
                  </span>
                  {o.label || o.id}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
