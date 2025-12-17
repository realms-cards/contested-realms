"use client";

import React from "react";
import { createPortal } from "react-dom";

export type ChangelogOverlayProps = {
  /** Optional className for the trigger element. */
  triggerClassName?: string;
  /** Optional trigger label text. */
  triggerLabel?: string;
};

export default function ChangelogOverlay({
  triggerClassName = "",
  triggerLabel = "Changelog",
}: ChangelogOverlayProps) {
  const [open, setOpen] = React.useState(false);
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const overlayId = React.useId();
  const labelId = `${overlayId}-label`;

  // Fetch changelog when opened
  React.useEffect(() => {
    if (!open || content !== null) return;
    setLoading(true);
    fetch("/changelog.md")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load changelog");
        return res.text();
      })
      .then((text) => setContent(text))
      .catch(() => setContent("*Failed to load changelog.*"))
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

  // Simple markdown-to-HTML renderer (handles headers, bold, italic, links, lists, hr)
  const renderMarkdown = (md: string) => {
    const lines = md.split("\n");
    const elements: React.ReactNode[] = [];
    let listItems: React.ReactNode[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul
            key={`list-${elements.length}`}
            className="list-disc list-inside mb-3 space-y-1"
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
            className="underline text-blue-400 hover:text-blue-300"
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
      // Handle **bold** and *italic*
      return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
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
        elements.push(<hr key={idx} className="my-4 border-slate-600" />);
        return;
      }

      // Headers
      if (trimmed.startsWith("# ")) {
        flushList();
        elements.push(
          <h1 key={idx} className="text-2xl font-bold mt-4 mb-2">
            {parseInline(trimmed.slice(2))}
          </h1>
        );
        return;
      }
      if (trimmed.startsWith("## ")) {
        flushList();
        elements.push(
          <h2 key={idx} className="text-xl font-semibold mt-4 mb-2">
            {parseInline(trimmed.slice(3))}
          </h2>
        );
        return;
      }
      if (trimmed.startsWith("### ")) {
        flushList();
        elements.push(
          <h3 key={idx} className="text-lg font-semibold mt-3 mb-1">
            {parseInline(trimmed.slice(4))}
          </h3>
        );
        return;
      }

      // List items
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        listItems.push(<li key={idx}>{parseInline(trimmed.slice(2))}</li>);
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={overlayId}
        className={`underline hover:text-slate-300 ${triggerClassName}`}
      >
        {triggerLabel}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id={overlayId}
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm grid justify-items-center p-4 min-h-[100svh]"
            onMouseDown={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelId}
              className="relative place-self-center w-full max-w-2xl bg-slate-900/95 text-white rounded-xl border border-slate-700 shadow-2xl overflow-hidden flex flex-col"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
                <h2 id={labelId} className="text-lg md:text-xl font-semibold">
                  Changelog
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
              <div className="px-5 py-4 max-h-[70svh] overflow-auto text-sm text-slate-200 prose-font">
                {loading && <p className="text-slate-400">Loading...</p>}
                {!loading && content && renderMarkdown(content)}
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
