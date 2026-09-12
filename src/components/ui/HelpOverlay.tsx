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
          "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-rc-line/28 bg-black/30 font-rc-mono text-xs font-semibold text-rc-fg-muted transition-colors hover:border-rc-accent hover:text-rc-accent-ring " +
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
            className="fixed inset-0 z-[9999] grid min-h-[100svh] justify-items-center bg-[rgba(6,10,20,0.82)] p-4 backdrop-blur-[4px]"
            onMouseDown={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelId}
              className="rc-panel relative flex w-full max-w-3xl flex-col overflow-hidden place-self-center shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_18px_rgba(243,207,106,0.2)]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-rc-line/14 px-5 py-4">
                <h2 id={labelId} className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-3 cursor-pointer rounded-rc-md px-2 py-1 text-xl leading-none text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {/* Body */}
              <div className="thin-scrollbar max-h-[70svh] overflow-auto px-5 py-4 font-rc-sans text-[15px] leading-[1.65] text-rc-fg">
                {children}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-rc-line/14 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 cursor-pointer items-center rounded-rc-md border border-rc-line/28 px-3 font-rc-sans text-sm text-rc-fg transition-colors hover:border-rc-accent hover:bg-rc-accent/8"
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
