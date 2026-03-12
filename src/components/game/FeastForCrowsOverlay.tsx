"use client";

import { Search, X } from "lucide-react";
import Image from "next/image";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import CardPreview from "@/components/game/CardPreview";
import { useSound } from "@/lib/contexts/SoundContext";
import {
  useCardHover,
  type CardPreviewData,
} from "@/lib/game/hooks/useCardHover";
import { useOverlaySlot, overlaySlotClass } from "@/lib/game/overlayRegistry";
import { useGameStore } from "@/lib/game/store";
import type {
  CardRef,
  FeastForCrowsMatch,
  PendingFeastForCrows,
} from "@/lib/game/store/types";
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

export default function FeastForCrowsOverlay() {
  const pending = useGameStore((s) => s.pendingFeastForCrows);
  const actorKey = useGameStore((s) => s.actorKey);
  const nameFeastForCrows = useGameStore((s) => s.nameFeastForCrows);
  const resolveFeastForCrows = useGameStore((s) => s.resolveFeastForCrows);
  const cancelFeastForCrows = useGameStore((s) => s.cancelFeastForCrows);

  const isActive =
    !!pending && pending.phase !== "complete" && pending.phase !== "resolving";
  const layout = useOverlaySlot("feastForCrows", 10, isActive, "Feast for Crows");

  const isCaster =
    actorKey === null || pending?.casterSeat === actorKey;

  if (!pending) return null;

  const phase = pending.phase;

  const getInstructionText = () => {
    if (phase === "naming") {
      return isCaster
        ? "Name a spell to search for..."
        : `${pending.casterSeat.toUpperCase()} is naming a spell...`;
    }
    if (phase === "revealing") {
      return isCaster
        ? `Searching for "${pending.namedCardName}" — ${pending.matches.length} found`
        : `${pending.casterSeat.toUpperCase()} named "${pending.namedCardName}" — searching your cards...`;
    }
    return "Resolving...";
  };

  // Minimized pill
  if (layout.minimized) {
    return (
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-4 py-2 rounded-full bg-black/90 text-white ring-1 ring-cyan-500/50 shadow-lg text-sm flex items-center gap-2 select-none">
          <span className="text-cyan-400 font-fantaisie">Feast for Crows</span>
          <span className="opacity-80 truncate max-w-[200px]">
            {getInstructionText()}
          </span>
          <button
            className="ml-1 rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 text-xs"
            onClick={layout.toggleMinimize}
            title="Expand overlay"
          >
            ▼
          </button>
        </div>
      </div>
    );
  }

  const slotClass = overlaySlotClass(layout.slot);

  return (
    <div className={`${slotClass} pointer-events-none flex flex-col`}>
      {/* Top status bar */}
      <div
        className={`${layout.tiled ? "" : "fixed inset-x-0 top-6 z-[201]"} pointer-events-none flex justify-center ${layout.tiled ? "pt-4 px-2" : ""}`}
      >
        <div className="pointer-events-auto px-4 py-2 rounded-full bg-black/90 text-white ring-1 ring-cyan-500/50 shadow-lg text-sm md:text-base flex items-center gap-2 select-none">
          <span className="text-cyan-400 font-fantaisie">Feast for Crows</span>
          <span className="opacity-80 truncate">
            {getInstructionText()}
          </span>
          {isCaster && (
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 select-none text-xs"
              onClick={cancelFeastForCrows}
            >
              Cancel
            </button>
          )}
          <button
            className="ml-1 rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 text-xs"
            onClick={layout.toggleMinimize}
            title="Minimize overlay"
          >
            ▲
          </button>
        </div>
      </div>

      {/* Naming phase — card search dialog */}
      {phase === "naming" && isCaster && (
        <div className="flex-1 flex items-center justify-center pointer-events-auto">
          <SpellNameSearch
            onSelect={(card) => nameFeastForCrows(card.name, card.slug)}
            onCancel={cancelFeastForCrows}
          />
        </div>
      )}

      {/* Naming phase — opponent waiting */}
      {phase === "naming" && !isCaster && (
        <div className="flex-1 flex items-center justify-center pointer-events-auto">
          <div className="bg-black/95 rounded-xl p-6 ring-1 ring-cyan-500/30 text-center">
            <p className="text-white/70">
              {pending.casterSeat.toUpperCase()} is naming a spell...
            </p>
          </div>
        </div>
      )}

      {/* Revealing phase — show opponent's cards */}
      {phase === "revealing" && (
        <div
          className={`flex-1 flex items-center justify-center pointer-events-auto ${layout.tiled ? "overflow-y-auto p-2" : ""}`}
        >
          <RevealPanel
            pending={pending}
            isCaster={isCaster}
            onResolve={resolveFeastForCrows}
            onCancel={cancelFeastForCrows}
            tiled={layout.tiled}
          />
        </div>
      )}
    </div>
  );
}

// ─── Spell Name Search ────────────────────────────────────────────────────────
function SpellNameSearch({
  onSelect,
  onCancel,
}: {
  onSelect: (card: SearchResultCard) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<SearchResultCard[]>([]);
  const [loading, setLoading] = useState(false);
  const { playCardSelect } = useSound();
  const { isMobile } = useMobileDevice();
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hoverPreview, setHoverPreview] = useState<CardPreviewData | null>(null);
  const { showCardPreview, hideCardPreview, clearHoverTimers } = useCardHover({
    onShow: (card: CardPreviewData) => setHoverPreview(card),
    onHide: () => setHoverPreview(null),
  });

  const searchCards = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      // Only search for spells — Feast for Crows says "Name a spell"
      const params = new URLSearchParams({ q: query, type: "spell" });
      const res = await fetch(`/api/cards/search-unique?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      searchCards(searchTerm);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchTerm, searchCards]);

  useEffect(() => {
    return () => clearHoverTimers();
  }, [clearHoverTimers]);

  const content = (
    <div
      ref={dialogRef}
      className="bg-zinc-900/95 backdrop-blur rounded-xl ring-1 ring-cyan-500/30 shadow-2xl p-6 w-[420px] max-h-[80vh] text-white flex flex-col"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-fantaisie flex items-center gap-2 text-cyan-400">
          <Search className="w-5 h-5" />
          Name a Spell
        </h3>
        <button
          onClick={onCancel}
          className="text-zinc-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div
        role="search"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-dashlane-ignore="true"
        data-np-ignore="true"
        data-keeper-lock="true"
        className="mb-4"
      >
        <input
          type="search"
          name="feast-search"
          autoComplete="off section-feast-search"
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
          placeholder="Search spell name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
          onMouseDown={(e) => e.currentTarget.removeAttribute("readonly")}
          onTouchStart={(e) => e.currentTarget.removeAttribute("readonly")}
          readOnly={!isMobile}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          autoFocus
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-[200px]">
        {loading ? (
          <div className="text-center text-zinc-400 py-8">Searching...</div>
        ) : !searchTerm.trim() ? (
          <div className="text-center text-zinc-400 py-8">
            Type a spell name to search
          </div>
        ) : results.length === 0 ? (
          <div className="text-center text-zinc-400 py-8">
            No spells found for &quot;{searchTerm}&quot;
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
                onMouseLeave={() => hideCardPreview()}
                onClick={() => {
                  try { playCardSelect(); } catch {}
                  onSelect(card);
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
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      try { playCardSelect(); } catch {}
                      onSelect(card);
                    }}
                    className="flex-shrink-0 text-xs bg-cyan-600/80 hover:bg-cyan-500 rounded px-3 py-1.5 transition-colors"
                  >
                    Name
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-800 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {results.length > 0 && `${results.length} spells found`}
        </span>
        <button
          className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

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
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      {content}
    </div>,
    document.body,
  );
}

// ─── Reveal Panel ─────────────────────────────────────────────────────────────
function RevealPanel({
  pending,
  isCaster,
  onResolve,
  onCancel,
  tiled,
}: {
  pending: PendingFeastForCrows;
  isCaster: boolean;
  onResolve: () => void;
  onCancel: () => void;
  tiled: boolean;
}) {
  const namedName = pending.namedCardName || "";
  const nameLower = namedName.toLowerCase();
  const matches = pending.matches;

  const isMatch = (card: CardRef) =>
    (card.name || "").toLowerCase() === nameLower;

  // Counts per zone
  const handMatches = matches.filter((m: FeastForCrowsMatch) => m.zone === "hand").length;
  const spellbookMatches = matches.filter((m: FeastForCrowsMatch) => m.zone === "spellbook").length;
  const graveyardMatches = matches.filter((m: FeastForCrowsMatch) => m.zone === "graveyard").length;

  return (
    <div
      className={`bg-black/95 rounded-xl p-4 md:p-6 w-full mx-2 md:mx-4 ring-1 ring-cyan-500/30 ${tiled ? "max-h-full" : "max-w-5xl max-h-[90vh]"} overflow-y-auto`}
    >
      <h2
        className={`font-fantaisie text-cyan-400 mb-2 text-center ${tiled ? "text-lg" : "text-2xl"}`}
      >
        Searching for &ldquo;{namedName}&rdquo;
      </h2>
      <p className="text-white/70 text-sm mb-4 text-center">
        {matches.length === 0
          ? "No copies found in opponent's cards"
          : `${matches.length} cop${matches.length === 1 ? "y" : "ies"} found — ${handMatches} in hand, ${spellbookMatches} in spellbook, ${graveyardMatches} in cemetery`}
      </p>

      {/* Hand section */}
      <ZoneSection
        zone="hand"
        cards={pending.revealedHand}
        isMatch={isMatch}
        matchCount={handMatches}
      />

      {/* Spellbook section */}
      <ZoneSection
        zone="spellbook"
        cards={pending.revealedSpellbook}
        isMatch={isMatch}
        matchCount={spellbookMatches}
      />

      {/* Graveyard section */}
      <ZoneSection
        zone="graveyard"
        cards={pending.revealedGraveyard}
        isMatch={isMatch}
        matchCount={graveyardMatches}
      />

      {/* Action buttons */}
      {isCaster && (
        <div className="flex gap-3 justify-center mt-4">
          <button
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors text-sm"
            onClick={onResolve}
          >
            {matches.length > 0
              ? `Banish ${matches.length} & Shuffle`
              : "Resolve (Shuffle)"}
          </button>
        </div>
      )}

      {!isCaster && (
        <div className="text-center text-white/60 text-sm mt-4">
          Waiting for {pending.casterSeat.toUpperCase()} to confirm...
        </div>
      )}
    </div>
  );
}

// ─── Zone config ──────────────────────────────────────────────────────────────
const ZONE_STYLES = {
  hand: {
    label: "Hand",
    icon: "✋",
    headerColor: "text-amber-400",
    badgeBg: "bg-amber-600",
    ringColor: "ring-amber-500/30",
    bgTint: "bg-amber-950/20",
    matchRing: "ring-amber-400",
    matchGlow: "shadow-amber-500/30",
    matchOverlay: "bg-amber-500/20",
    matchText: "text-amber-200",
  },
  spellbook: {
    label: "Spellbook",
    icon: "📖",
    headerColor: "text-cyan-400",
    badgeBg: "bg-cyan-600",
    ringColor: "ring-cyan-500/30",
    bgTint: "bg-cyan-950/20",
    matchRing: "ring-cyan-500",
    matchGlow: "shadow-cyan-500/30",
    matchOverlay: "bg-cyan-500/20",
    matchText: "text-cyan-200",
  },
  graveyard: {
    label: "Cemetery",
    icon: "⚰️",
    headerColor: "text-zinc-400",
    badgeBg: "bg-zinc-600",
    ringColor: "ring-zinc-500/30",
    bgTint: "bg-zinc-900/40",
    matchRing: "ring-zinc-300",
    matchGlow: "shadow-zinc-400/30",
    matchOverlay: "bg-zinc-400/20",
    matchText: "text-zinc-200",
  },
} as const;

type ZoneKey = keyof typeof ZONE_STYLES;

// ─── Zone Section ─────────────────────────────────────────────────────────────
function ZoneSection({
  zone,
  cards,
  isMatch,
  matchCount,
}: {
  zone: ZoneKey;
  cards: CardRef[];
  isMatch: (card: CardRef) => boolean;
  matchCount: number;
}) {
  if (cards.length === 0) return null;
  const s = ZONE_STYLES[zone];

  return (
    <div className={`mb-4 rounded-lg p-3 ${s.bgTint} ring-1 ${s.ringColor}`}>
      <h3 className={`text-sm font-semibold ${s.headerColor} mb-2 flex items-center gap-2`}>
        <span>{s.icon}</span>
        {s.label}
        <span className="text-white/50 font-normal">
          ({cards.length} card{cards.length !== 1 ? "s" : ""})
        </span>
        {matchCount > 0 && (
          <span className={`${s.badgeBg} text-white text-xs px-2 py-0.5 rounded-full ml-auto`}>
            {matchCount} banished
          </span>
        )}
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {cards.map((card, index) => (
          <RevealedCard
            key={`${zone}-${index}`}
            card={card}
            matched={isMatch(card)}
            matchRing={s.matchRing}
            matchGlow={s.matchGlow}
            matchOverlay={s.matchOverlay}
            matchText={s.matchText}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Revealed Card ────────────────────────────────────────────────────────────
function RevealedCard({
  card,
  matched,
  matchRing,
  matchGlow,
  matchOverlay,
  matchText,
}: {
  card: CardRef;
  matched: boolean;
  matchRing: string;
  matchGlow: string;
  matchOverlay: string;
  matchText: string;
}) {
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const hoverTimerRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = window.setTimeout(() => {
      setPreviewCard(card);
    }, 200);
  }, [card, setPreviewCard]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setPreviewCard(null);
  }, [setPreviewCard]);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="flex flex-col gap-1"
    >
      <div
        className={`relative aspect-[2.5/3.5] rounded-lg overflow-hidden transition-all ${
          matched
            ? `ring-4 ${matchRing} scale-105 shadow-lg ${matchGlow}`
            : "opacity-50"
        }`}
      >
        <Image
          src={`/api/images/${card.slug || card.cardId}`}
          alt={card.name || "Card"}
          fill
          className="object-cover"
          sizes="(max-width: 640px) 30vw, (max-width: 1024px) 15vw, 12vw"
          unoptimized
        />
        {matched && (
          <div className={`absolute inset-0 ${matchOverlay} flex items-end justify-center pb-1`}>
            <span className={`text-xs font-semibold ${matchText} bg-black/70 px-1.5 py-0.5 rounded`}>
              Banish
            </span>
          </div>
        )}
      </div>
      {/* Card name label */}
      <p className={`text-center text-[10px] leading-tight truncate px-0.5 ${matched ? "text-white font-medium" : "text-white/40"}`}>
        {card.name || "—"}
      </p>
    </div>
  );
}
