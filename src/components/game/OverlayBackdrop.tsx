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
          className="fixed inset-0 z-[199] bg-[rgba(6,10,20,0.7)] backdrop-blur-sm"
          aria-hidden
        />
      )}

      {/* Storyline indicator — shows resolution order when 2+ overlays */}
      {sorted.length >= 2 && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[202] pointer-events-none select-none">
          <div className="flex items-center gap-1 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.85)] px-3 py-1.5 font-rc-sans text-[11px] text-rc-fg-muted shadow-rc-md">
            <span className="rc-eyebrow mr-0.5 tracking-[0.18em]">
              Storyline
            </span>
            {sorted.map((o, i) => (
              <span key={o.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-rc-fg-dim">›</span>}
                <span
                  className={`inline-flex items-center gap-0.5 rounded-rc-sm px-1.5 py-0.5 ${
                    i === sorted.length - 1
                      ? "bg-rc-moonlight/12 text-rc-moonlight ring-1 ring-rc-moonlight/45"
                      : "bg-rc-line/8 text-rc-fg-muted"
                  }`}
                >
                  <span
                    className={`font-rc-mono text-[10px] tabular-nums ${
                      i === sorted.length - 1
                        ? "text-rc-moonlight"
                        : "text-rc-fg-subtle"
                    }`}
                  >
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
