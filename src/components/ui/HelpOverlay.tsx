"use client";

import React from "react";
import { createPortal } from "react-dom";

export type HelpOverlayProps = {
  title?: string;
  /** Content to render inside the overlay. Can be text, images, or videos. */
  children?: React.ReactNode;
  /** Optional className for the trigger button. */
  triggerClassName?: string;
  /** Optional ARIA label for the trigger button. */
  triggerAriaLabel?: string;
  /** Optional ID suffix to help stabilize aria-controls/id when multiple instances exist on a page. */
  idSuffix?: string;
};

export default function HelpOverlay({
  title = "Help",
  children,
  triggerClassName = "",
  triggerAriaLabel = "Open help",
  idSuffix,
}: HelpOverlayProps) {
  const [open, setOpen] = React.useState(false);
  const overlayId = React.useId();
  const baseId = idSuffix ? `help-overlay-${idSuffix}` : overlayId;
  const labelId = `${baseId}-label`;

  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Prevent body scroll when open
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={baseId}
        aria-label={triggerAriaLabel}
        className={
          "inline-flex items-center justify-center w-6 h-6 rounded-full border border-slate-600/70 text-slate-200/90 hover:text-white hover:border-slate-400/80 bg-slate-800/60 hover:bg-slate-700/60 transition-colors text-xs font-semibold " +
          triggerClassName
        }
      >
        ?
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={baseId}
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm grid justify-items-center p-4 min-h-[100svh]"
            onMouseDown={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelId}
              className="relative place-self-center w-full max-w-3xl bg-slate-900/95 text-white rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
                <h2 id={labelId} className="text-lg md:text-xl font-semibold">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-3 text-slate-300 hover:text-white rounded-md px-2 py-1 border border-transparent hover:border-slate-600"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="px-5 py-4 max-h-[70svh] overflow-auto">
                {children}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-200 hover:bg-slate-700/70"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
