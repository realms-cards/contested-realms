"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import CardPreview from "@/components/game/CardPreview";
import { useSound } from "@/lib/contexts/SoundContext";
import {
  useCardHover,
  type CardPreviewData,
} from "@/lib/game/hooks/useCardHover";
import { useMobileDevice } from "@/lib/hooks/useTouchDevice";

type SearchResultCard = {
  cardId: number;
  variantId: number;
  name: string;
  slug: string;
  type: string | null;
  subTypes: string | null;
  rarity: string | null;
  cost: number | null;
  attack: number | null;
  defence: number | null;
  thresholds: string | null;
  elements: string | null;
  set: string;
};

interface CardSearchDialogProps {
  onSelectCard: (card: SearchResultCard) => void;
  onClose: () => void;
}

export default function CardSearchDialog({
  onSelectCard,
  onClose,
}: CardSearchDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SearchResultCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const { playCardSelect } = useSound();
  const { isMobile } = useMobileDevice();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enhanced card preview state
  const [hoverPreview, setHoverPreview] = useState<CardPreviewData | null>(
    null,
  );
  const { showCardPreview, hideCardPreview, clearHoverTimers } = useCardHover({
    onShow: (card: CardPreviewData) => {
      setHoverPreview(card);
    },
    onHide: () => {
      setHoverPreview(null);
    },
  });

  const searchCards = useCallback(async (query: string, type: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query });
      if (type) params.set("type", type);
      const res = await fetch(`/api/cards/search-unique?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error("[CardSearchDialog] Search error:", err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchCards(searchTerm, typeFilter);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm, typeFilter, searchCards]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
      clearHoverTimers();
    };
  }, [onClose, clearHoverTimers]);

  const formatStats = (card: SearchResultCard) => {
    const parts: string[] = [];
    if (card.cost !== null) parts.push(`Cost: ${card.cost}`);
    if (card.attack !== null && card.defence !== null) {
      parts.push(`${card.attack}/${card.defence}`);
    }
    return parts.join(" · ");
  };

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={dialogRef}
        className="bg-zinc-900/95 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-2xl p-6 w-[420px] max-h-[80vh] text-white flex flex-col"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Search className="w-5 h-5" />
            Search All Cards
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 mb-4">
          <div
            role="search"
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-dashlane-ignore="true"
            data-np-ignore="true"
            data-keeper-lock="true"
          >
            <input
              id="card-search-input"
              type="search"
              name="card-search"
              autoComplete="off section-card-search"
              role="searchbox"
              inputMode="search"
              aria-autocomplete="list"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-dashlane-ignore="true"
              data-np-ignore="true"
              data-keeper-lock="true"
              data-keepassxc-browser-skip="true"
              data-form-type="other"
              placeholder="Search by card name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
              onMouseDown={(e) => e.currentTarget.removeAttribute("readonly")}
              onTouchStart={(e) => e.currentTarget.removeAttribute("readonly")}
              readOnly={!isMobile}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setTypeFilter("")}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                typeFilter === ""
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter("spell")}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                typeFilter === "spell"
                  ? "bg-purple-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Spells
            </button>
            <button
              onClick={() => setTypeFilter("site")}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                typeFilter === "site"
                  ? "bg-green-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Sites
            </button>
            <button
              onClick={() => setTypeFilter("avatar")}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                typeFilter === "avatar"
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              Avatars
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-[200px]">
          {loading ? (
            <div className="text-center text-zinc-400 py-8">Searching...</div>
          ) : !searchTerm.trim() ? (
            <div className="text-center text-zinc-400 py-8">
              Type to search for cards
            </div>
          ) : results.length === 0 ? (
            <div className="text-center text-zinc-400 py-8">
              No cards found for &quot;{searchTerm}&quot;
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((card) => (
                <div
                  key={card.cardId}
                  className="bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg p-3 transition-colors cursor-pointer"
                  onMouseEnter={() => {
                    if (card.slug) {
                      showCardPreview({
                        slug: card.slug,
                        name: card.name,
                        type: card.type,
                      });
                    }
                  }}
                  onMouseLeave={() => {
                    hideCardPreview();
                  }}
                  onClick={() => {
                    try {
                      playCardSelect();
                    } catch {}
                    onSelectCard(card);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">
                        {card.name}
                      </div>
                      {card.type && (
                        <div className="text-xs text-zinc-400 truncate">
                          {card.type}
                          {card.subTypes && ` — ${card.subTypes}`}
                        </div>
                      )}
                      {formatStats(card) && (
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {formatStats(card)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        try {
                          playCardSelect();
                        } catch {}
                        onSelectCard(card);
                      }}
                      className="flex-shrink-0 text-xs bg-emerald-600/80 hover:bg-emerald-500 rounded px-3 py-1.5 transition-colors"
                    >
                      Draw
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {results.length > 0 && `${results.length} cards found`}
          </span>
          <button
            className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Enhanced Card Preview Overlay */}
      {hoverPreview && (
        <CardPreview
          card={hoverPreview}
          anchor="top-left"
          zIndexClass="z-[60]"
        />
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
