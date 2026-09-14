"use client";

import { Eye, Search, X } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import CardPreview from "@/components/game/CardPreview";
import { RcButton } from "@/components/ui/rc-button";
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
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(6,10,20,0.5)] backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={dialogRef}
        className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] backdrop-blur shadow-rc-panel p-4 sm:p-6 w-[min(95vw,420px)] max-h-[85vh] font-rc-sans text-rc-fg flex flex-col"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="m-0 flex items-center gap-2 font-rc-display text-[22px] leading-none text-rc-fg-strong">
            <Search className="w-5 h-5 text-rc-accent-link" />
            Search All Cards
          </h3>
          <button
            onClick={onClose}
            className="-m-0.5 rounded-rc-md p-0.5 text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
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
              className="rc-input h-9 w-full placeholder:text-rc-fg-subtle"
              autoFocus
            />
          </div>

          <div className="rc-segment">
            <button
              onClick={() => setTypeFilter("")}
              aria-pressed={typeFilter === ""}
              data-tone="info"
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter("spell")}
              aria-pressed={typeFilter === "spell"}
              data-tone="moonlight"
            >
              Spells
            </button>
            <button
              onClick={() => setTypeFilter("site")}
              aria-pressed={typeFilter === "site"}
              data-tone="success"
            >
              Sites
            </button>
            <button
              onClick={() => setTypeFilter("avatar")}
              aria-pressed={typeFilter === "avatar"}
            >
              Avatars
            </button>
          </div>
        </div>

        <div className="thin-scrollbar flex-1 overflow-y-auto min-h-[200px]">
          {loading ? (
            <div className="rc-hint text-center py-8 text-rc-fg-subtle">Searching...</div>
          ) : !searchTerm.trim() ? (
            <div className="rc-hint text-center py-8 text-rc-fg-subtle">
              Type to search for cards
            </div>
          ) : results.length === 0 ? (
            <div className="rc-hint text-center py-8 text-rc-fg-subtle">
              No cards found for &quot;{searchTerm}&quot;
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((card) => (
                <div
                  key={card.cardId}
                  className="rounded-rc-md border border-rc-line/12 bg-black/30 p-3 transition-colors cursor-pointer hover:border-rc-accent/35 hover:bg-rc-accent/8"
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
                      <div className="truncate font-rc-display text-[16px] leading-tight text-rc-fg-strong">
                        {card.name}
                      </div>
                      {card.type && (
                        <div className="truncate text-xs text-rc-fg-muted">
                          {card.type}
                          {card.subTypes && ` — ${card.subTypes}`}
                        </div>
                      )}
                      {formatStats(card) && (
                        <div className="mt-0.5 font-rc-mono text-xs tabular-nums text-rc-fg-subtle">
                          {formatStats(card)}
                        </div>
                      )}
                    </div>
                    {isMobile && (
                      <RcButton
                        variant="quiet"
                        size="xs"
                        onClick={(e) => {
                          // Touch has no hover, and tapping the row draws the
                          // card, so give phones an explicit preview button.
                          e.stopPropagation();
                          if (card.slug) {
                            showCardPreview({
                              slug: card.slug,
                              name: card.name,
                              type: card.type,
                            });
                          }
                        }}
                        className="h-auto flex-shrink-0 px-2 py-1.5"
                        aria-label={`Preview ${card.name}`}
                        title="Preview"
                      >
                        <Eye className="w-4 h-4" />
                      </RcButton>
                    )}
                    <RcButton
                      onClick={(e) => {
                        e.stopPropagation();
                        try {
                          playCardSelect();
                        } catch {}
                        onSelectCard(card);
                      }}
                      variant="outline"
                      size="sm"
                      className="h-auto flex-shrink-0 px-3 py-1.5 text-xs"
                    >
                      Draw
                    </RcButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-rc-line/12 flex items-center justify-between">
          <span className="rc-hint tabular-nums">
            {results.length > 0 && `${results.length} cards found`}
          </span>
          <button
            className="text-sm text-rc-fg-muted transition-colors hover:text-rc-fg-strong"
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
          zIndexClass="z-[10000]"
        />
      )}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
