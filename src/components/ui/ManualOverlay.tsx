"use client";

import React from "react";
import { createPortal } from "react-dom";

export type ManualOverlayProps = {
  /** Optional className for the trigger element. */
  triggerClassName?: string;
  /** Optional trigger label text. */
  triggerLabel?: string;
  /** "chip" (default) renders the glowing amber chip; "plain" renders a bare text button styled only by triggerClassName. */
  variant?: "chip" | "plain";
};

export default function ManualOverlay({
  triggerClassName = "",
  triggerLabel = "Manual",
  variant = "chip",
}: ManualOverlayProps) {
  const [open, setOpen] = React.useState(false);
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const overlayId = React.useId();
  const labelId = `${overlayId}-label`;

  // Fetch manual when opened
  React.useEffect(() => {
    if (!open || content !== null) return;
    setLoading(true);
    fetch("/manual.md")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load manual");
        return res.text();
      })
      .then((text) => setContent(text))
      .catch(() => setContent("*Failed to load manual.*"))
      .finally(() => setLoading(false));
  }, [open, content]);

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

  // Simple markdown-to-HTML renderer (handles headers, bold, italic, links, lists, hr, inline code)
  const renderMarkdown = (md: string) => {
    const lines = md.split("\n");
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul
            key={`list-${elements.length}`}
            className="mb-3 list-outside list-disc space-y-1 pl-5 marker:text-rc-accent"
          >
            {listItems}
          </ul>
        );
        listItems = [];
      }
    };

    const parseInline = (text: string): React.ReactNode => {
      // Handle links [text](url)
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;
      while ((match = linkRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(parseInlineStyles(text.slice(lastIndex, match.index)));
        }
        parts.push(
          <a
            key={match.index}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="rc-link underline"
          >
            {match[1]}
          </a>
        );
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) {
        parts.push(parseInlineStyles(text.slice(lastIndex)));
      }
      return parts.length === 1 ? parts[0] : parts;
    };

    const parseInlineStyles = (text: string): React.ReactNode => {
      // Handle `code`, **bold**, *italic*, and _italic_
      return text
        .split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/)
        .map((part, i) => {
          if (part.startsWith("`") && part.endsWith("`")) {
            return (
              <code
                key={i}
                className="rounded-rc-sm border border-rc-line/7 bg-rc-line/6 px-1.5 py-0.5 font-rc-mono text-xs text-rc-accent-link"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
          }
          if (
            (part.startsWith("*") && part.endsWith("*")) ||
            (part.startsWith("_") && part.endsWith("_"))
          ) {
            return <em key={i}>{part.slice(1, -1)}</em>;
          }
          return part;
        });
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Horizontal rule
      if (/^---+$/.test(trimmed)) {
        flushList();
        elements.push(<hr key={idx} className="my-5 border-0 border-t border-rc-line/14" />);
        return;
      }

      // Headers
      if (trimmed.startsWith("# ")) {
        flushList();
        elements.push(
          <h1 key={idx} className="mb-2 mt-6 font-rc-display text-[30px] leading-tight text-rc-fg-strong">
            {parseInline(trimmed.slice(2))}
          </h1>
        );
        return;
      }
      if (trimmed.startsWith("## ")) {
        flushList();
        elements.push(
          <h2 key={idx} className="mb-2 mt-6 font-rc-display text-[24px] leading-tight text-rc-fg-strong">
            {parseInline(trimmed.slice(3))}
          </h2>
        );
        return;
      }
      if (trimmed.startsWith("### ")) {
        flushList();
        elements.push(
          <h3 key={idx} className="mb-1 mt-4 font-rc-display text-[20px] leading-tight text-rc-fg-strong">
            {parseInline(trimmed.slice(4))}
          </h3>
        );
        return;
      }

      // List items (- or *)
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        listItems.push(<li key={idx}>{parseInline(trimmed.slice(2))}</li>);
        return;
      }

      // Indented list continuation (for multi-line list items)
      if (line.startsWith("  ") && listItems.length > 0 && trimmed !== "") {
        // Treat as a new list item with indented content
        listItems.push(
          <li key={`${idx}-cont`} className="ml-4">
            {parseInline(trimmed)}
          </li>
        );
        return;
      }

      // Empty line
      if (trimmed === "") {
        flushList();
        return;
      }

      // Regular paragraph
      flushList();
      elements.push(
        <p key={idx} className="mb-2">
          {parseInline(trimmed)}
        </p>
      );
    });

    flushList();
    return elements;
  };

  return (
    <>
      {variant === "plain" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={overlayId}
          className={triggerClassName}
        >
          {triggerLabel}
        </button>
      ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={overlayId}
        className={`group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md 
          bg-gradient-to-r from-amber-500/20 via-yellow-400/30 to-amber-500/20 
          border border-amber-400/50 hover:border-amber-300/80
          text-amber-200 hover:text-amber-100 font-medium
          shadow-[0_0_12px_rgba(251,191,36,0.3)] hover:shadow-[0_0_20px_rgba(251,191,36,0.5)]
          transition-all duration-300 ${triggerClassName}`}
      >
        {/* Sparkle shimmer overlay */}
        <span
          className="absolute inset-0 rounded-md overflow-hidden pointer-events-none"
          aria-hidden="true"
        >
          <span
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent 
              -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out"
          />
        </span>
        <span className="relative">{triggerLabel}</span>
      </button>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={overlayId}
            className="fixed inset-0 z-[9999] grid min-h-[100svh] justify-items-center bg-[rgba(6,10,20,0.82)] p-4 backdrop-blur-[4px]"
            onMouseDown={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelId}
              className="rc-panel relative flex w-full max-w-2xl flex-col overflow-hidden place-self-center shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_18px_rgba(243,207,106,0.2)]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-rc-line/14 px-5 py-4">
                <h2 id={labelId} className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
                  Simulator Manual
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
              <div className="px-5 py-4 max-h-[70svh] overflow-auto font-rc-sans text-[15px] leading-[1.65] text-rc-fg">
                {loading && <p className="rc-hint">loading…</p>}
                {!loading && content && renderMarkdown(content)}
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
