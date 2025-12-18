"use client";

import React, { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

export type KeyboardShortcutsHelpProps = {
  open: boolean;
  onClose: () => void;
  context?: "game" | "draft" | "editor";
};

type ShortcutItem = {
  keys: string[];
  description: string;
};

const COMMON_SHORTCUTS: ShortcutItem[] = [
  { keys: ["+", "="], description: "Zoom in" },
  { keys: ["-"], description: "Zoom out" },
  { keys: ["H", "?"], description: "Show this help" },
  { keys: ["Tab"], description: "Reset camera" },
  { keys: ["W", "↑"], description: "Pan camera up" },
  { keys: ["S", "↓"], description: "Pan camera down" },
  { keys: ["A", "←"], description: "Pan camera left" },
  { keys: ["D", "→"], description: "Pan camera right" },
  { keys: ["Esc"], description: "Close dialogs / Cancel" },
];

const GAME_SHORTCUTS: ShortcutItem[] = [
  { keys: ["T"], description: "Tap/untap selected card" },
  { keys: ["Enter"], description: "End turn" },
  { keys: ["Space"], description: "Board ping (while hovering)" },
];

const DRAFT_SHORTCUTS: ShortcutItem[] = [
  { keys: ["Space"], description: "Pick and pass selected card" },
];

const EDITOR_SHORTCUTS: ShortcutItem[] = [
  { keys: ["Space"], description: "Open card search" },
];

function ShortcutRow({ keys, description }: ShortcutItem) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-700/40 last:border-b-0">
      <span className="text-slate-300">{description}</span>
      <div className="flex gap-1">
        {keys.map((key, i) => (
          <React.Fragment key={key}>
            {i > 0 && <span className="text-slate-500 text-xs mx-0.5">or</span>}
            <kbd className="px-2 py-0.5 bg-slate-700/60 border border-slate-600 rounded text-xs font-mono text-slate-200">
              {key}
            </kbd>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export default function KeyboardShortcutsHelp({
  open,
  onClose,
  context = "game",
}: KeyboardShortcutsHelpProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const contextShortcuts =
    context === "game"
      ? GAME_SHORTCUTS
      : context === "draft"
      ? DRAFT_SHORTCUTS
      : EDITOR_SHORTCUTS;

  const contextLabel =
    context === "game"
      ? "Game Controls"
      : context === "draft"
      ? "Draft Controls"
      : "Editor Controls";

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm grid justify-items-center p-4 min-h-[100svh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-help-title"
        className="relative place-self-center w-full max-w-md bg-slate-900/95 text-white rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <h2
            id="shortcuts-help-title"
            className="text-lg md:text-xl font-semibold"
          >
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-3 text-slate-300 hover:text-white rounded-md px-2 py-1 border border-transparent hover:border-slate-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[70svh] overflow-auto space-y-4 prose-font">
          {/* Context-specific shortcuts */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
              {contextLabel}
            </h3>
            <div className="space-y-0">
              {contextShortcuts.map((s) => (
                <ShortcutRow key={s.description} {...s} />
              ))}
            </div>
          </div>

          {/* Common shortcuts */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Camera & Navigation
            </h3>
            <div className="space-y-0">
              {COMMON_SHORTCUTS.map((s) => (
                <ShortcutRow key={s.description} {...s} />
              ))}
            </div>
          </div>

          {/* Mouse controls */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-2">
              Mouse Controls
            </h3>
            <div className="space-y-0">
              <ShortcutRow
                keys={["Right-click drag"]}
                description="Pan camera"
              />
              <ShortcutRow keys={["Scroll wheel"]} description="Zoom in/out" />
              <ShortcutRow
                keys={["Left-click"]}
                description="Select / Interact"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-700/60">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-200 hover:bg-slate-700/70"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Hook to listen for "?" key press and toggle help overlay.
 * Returns [isOpen, setIsOpen] tuple.
 */
export function useHelpShortcut(
  enabled = true
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // Check if typing in an input
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      // "?" key (shift + /) or "h" key
      if (event.key === "?" || event.key === "h" || event.key === "H") {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, handleKeyDown]);

  return [isOpen, setIsOpen];
}
