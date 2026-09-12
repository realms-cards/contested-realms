"use client";

import { useEffect, useState, memo } from "react";
import { createPortal } from "react-dom";

interface CodexEntry {
  id: number;
  title: string;
  content: string;
}

interface CodexTooltipProps {
  cardName: string;
  className?: string;
}

// Cache for codex entries by card name
const codexCache = new Map<string, CodexEntry[] | null>();

function CodexTooltipInner({ cardName, className = "" }: CodexTooltipProps) {
  const [entries, setEntries] = useState<CodexEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check cache first
    if (codexCache.has(cardName)) {
      setEntries(codexCache.get(cardName) || null);
      return;
    }

    setLoading(true);
    fetch(`/api/codex?card=${encodeURIComponent(cardName)}`)
      .then((res) => res.json())
      .then((data) => {
        const result = data.entries?.length > 0 ? data.entries : null;
        codexCache.set(cardName, result);
        setEntries(result);
      })
      .catch(() => {
        codexCache.set(cardName, null);
        setEntries(null);
      })
      .finally(() => setLoading(false));
  }, [cardName]);

  if (loading) {
    return (
      <div className={`rc-hint ${className}`}>
        <span className="animate-pulse">codex…</span>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return null;
  }

  // Highlight all [[Card Name]] references in content
  // SECURITY: HTML-escape content first to prevent XSS via dangerouslySetInnerHTML
  const formatContent = (content: string) => {
    const escaped = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    return escaped.replace(
      /\[\[([^\]]+)\]\]/g,
      '<span class="text-rc-accent-link font-medium">$1</span>',
    );
  };

  return (
    <div className={`${className}`}>
      {/* Clickable Badge */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1 font-rc-mono text-[11px] tracking-[0.1em] text-rc-accent-link underline underline-offset-[3px] transition-colors hover:text-rc-accent-hover"
      >
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </button>

      {/* Full overlay modal */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(6,10,20,0.82)] p-4 backdrop-blur-[4px]"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="rc-panel flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="rc-panel-head flex-shrink-0">
                <div className="min-w-0">
                  <div className="rc-eyebrow mb-1">codex</div>
                  <h3 className="m-0 truncate font-rc-display text-[26px] leading-none text-rc-fg-strong">
                    {cardName}
                  </h3>
                </div>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                  className="cursor-pointer rounded-rc-md px-2 py-0.5 text-xl leading-none text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
                >
                  ×
                </button>
              </div>

              {/* Content - scrollable */}
              <div className="thin-scrollbar flex-1 space-y-4 overflow-y-auto px-[18px] py-3.5">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-rc-md border border-rc-line/12 bg-black/30 p-4"
                  >
                    <h4 className="mb-3 border-b border-rc-line/12 pb-2 font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                      {entry.title}
                    </h4>
                    <div
                      className="whitespace-pre-wrap font-rc-sans text-sm leading-relaxed text-rc-fg"
                      dangerouslySetInnerHTML={{
                        __html: formatContent(entry.content),
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 border-t border-rc-line/12 px-[18px] py-3 text-center">
                <span className="rc-hint">
                  click outside or press × to close
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export const CodexTooltip = memo(CodexTooltipInner);
export default CodexTooltip;
