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
      <div className={`text-xs text-gray-500 ${className}`}>
        <span className="animate-pulse">📜...</span>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return null;
  }

  // Highlight all [[Card Name]] references in content
  const formatContent = (content: string) => {
    return content.replace(
      /\[\[([^\]]+)\]\]/g,
      '<span class="text-amber-300 font-medium">$1</span>'
    );
  };

  return (
    <div className={`${className}`}>
      {/* Clickable Badge */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
      >
        <span>📜</span>
        <span className="underline">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </button>

      {/* Full overlay modal */}
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] p-4"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="bg-gray-900 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl border border-amber-600/30 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
                <h3 className="text-lg font-bold text-amber-400">
                  📜 Codex: {cardName}
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white text-xl"
                >
                  ✕
                </button>
              </div>

              {/* Content - scrollable */}
              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-gray-800/50 rounded-lg p-4 border border-gray-700"
                  >
                    <h4 className="font-bold text-amber-300 text-lg mb-3 border-b border-amber-800/30 pb-2">
                      {entry.title}
                    </h4>
                    <div
                      className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: formatContent(entry.content),
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-gray-800 flex-shrink-0 text-center">
                <span className="text-xs text-gray-500">
                  Click outside or press ✕ to close
                </span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export const CodexTooltip = memo(CodexTooltipInner);
export default CodexTooltip;
