"use client";

import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import CardPreview from "@/components/game/CardPreview";
import { RcButton } from "@/components/ui/rc-button";
import { cardRefToPreview } from "@/lib/game/card-preview.types";
import type { CardRef, PlayerKey } from "@/lib/game/store";
import { useGameStore } from "@/lib/game/store";

export interface HandPeekDialogProps {
  title?: string;
  cards: CardRef[];
  source?: {
    seat: PlayerKey;
    pile: "spellbook" | "atlas" | "hand";
    from: "top" | "bottom";
  };
  onClose: () => void;
}

type PeekAction =
  | "top"
  | "bottom"
  | "hand"
  | "graveyard"
  | "banish"
  | "steal"
  | "topOfSpellbook"
  | "bottomOfSpellbook";

// Card dimensions for grid display (in pixels)
const GRID_CARD_WIDTH = 120;
const GRID_CARD_HEIGHT = 167; // ~3:4 aspect ratio

export default function HandPeekDialog({
  title = "Opponent Hand",
  cards,
  source,
  onClose,
}: HandPeekDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cardsToRender = useMemo(() => cards ?? [], [cards]);
  const handlePeekedCard = useGameStore((s) => s.handlePeekedCard);
  const cardPreviewsEnabled = useGameStore((s) => s.cardPreviewsEnabled);
  const toggleCardPreviews = useGameStore((s) => s.toggleCardPreviews);

  // Local preview state (separate from global to show inside dialog)
  const [previewCard, setPreviewCard] = useState<CardRef | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    cardIndex: number;
    card: CardRef;
  } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // "p" toggles card previews (same as main game)
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        toggleCardPreviews();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking inside the dialog or the context menu
      if (dialogRef.current && !dialogRef.current.contains(target)) {
        // Check if clicking on context menu (which is outside dialogRef but should not close)
        if (target.closest("[data-context-menu]")) return;
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose, toggleCardPreviews]);

  // Track cards that have been acted upon (removed from peek view)
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      // Don't close if clicking inside the context menu
      const target = e.target as HTMLElement;
      if (target.closest("[data-context-menu]")) return;
      setContextMenu(null);
    };
    // Use capture phase to handle before button clicks
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

  // Clear preview when cards change
  useEffect(() => {
    setPreviewCard(null);
  }, [cards]);

  // Handle context menu action
  const handleAction = useCallback(
    (action: PeekAction) => {
      console.log("[HandPeekDialog] handleAction called with action:", action);
      console.log("[HandPeekDialog] contextMenu:", contextMenu);
      console.log("[HandPeekDialog] source:", source);
      if (!contextMenu || !source) {
        console.log("[HandPeekDialog] ABORT: missing contextMenu or source");
        return;
      }
      // Use instanceId for reliable identification (indices shift after removals)
      const card = contextMenu.card;
      console.log("[HandPeekDialog] card:", card);
      console.log("[HandPeekDialog] card.instanceId:", card.instanceId);
      const instanceId = card.instanceId;
      if (!instanceId) {
        console.log(
          "[HandPeekDialog] ABORT: card has no instanceId, falling back to cardId",
        );
        // Fallback: use cardId if instanceId not available
        const cardId = card.cardId;
        if (!cardId) {
          console.log("[HandPeekDialog] ABORT: card has no cardId either");
          return;
        }
        console.log("[HandPeekDialog] Using cardId as fallback:", cardId);
      }
      const identifier = instanceId || String(card.cardId);
      console.log(
        "[HandPeekDialog] Calling handlePeekedCard with identifier:",
        identifier,
      );
      handlePeekedCard(source.seat, source.pile, identifier, action);
      console.log(
        "[HandPeekDialog] handlePeekedCard returned, marking card as removed",
      );
      // Mark this card as removed from the peek view (don't close dialog)
      setRemovedIndices((prev) => new Set([...prev, contextMenu.cardIndex]));
      setContextMenu(null);
    },
    [contextMenu, source, handlePeekedCard],
  );

  // Whether actions are available (only for pile peeks, not hand peeks)
  const canAct = !!source;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.5)] backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={dialogRef}
        className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] backdrop-blur shadow-rc-panel p-3 w-fit max-w-[90vw] max-h-[80vh] font-rc-sans text-rc-fg flex flex-col gap-3"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between">
          <h3 className="m-0 font-rc-display text-[22px] leading-none text-rc-fg-strong">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-rc-md px-1.5 text-rc-fg-muted transition-colors hover:bg-rc-line/6 hover:text-rc-fg-strong"
          >
            ✕
          </button>
        </div>

        {/* Hint for right-click actions */}
        {canAct && (
          <div className="-mt-1 font-rc-sans text-xs text-rc-fg-subtle">
            Right-click a card for actions
            {source?.pile === "hand"
              ? " (take, top/bottom of pile, discard, banish)"
              : " (draw, bottom, cemetery)"}
          </div>
        )}

        <div className="thin-scrollbar max-h-[60vh] overflow-y-auto">
          {cardsToRender.length === 0 ? (
            <div className="rc-hint text-center py-10 text-rc-fg-subtle">
              No cards available
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(
                  cardsToRender.length,
                  5,
                )}, minmax(120px, max-content))`,
              }}
              onMouseLeave={() => setPreviewCard(null)}
            >
              {cardsToRender.map((card, idx) => {
                const key = `${card.slug ?? "card"}-${
                  card.cardId ?? idx
                }-${idx}`;
                const isSite =
                  typeof card.type === "string" &&
                  card.type.toLowerCase().includes("site");
                const slug = card.slug ?? "";
                const isRemoved = removedIndices.has(idx);

                return (
                  <button
                    key={key}
                    type="button"
                    className={`relative rounded-rc-md transition-colors ${
                      isRemoved
                        ? "opacity-30 cursor-not-allowed"
                        : "bg-black/30 ring-1 ring-rc-line/12 hover:bg-rc-accent/8 hover:ring-rc-accent/35"
                    }`}
                    disabled={isRemoved}
                    onMouseEnter={() => !isRemoved && setPreviewCard(card)}
                    onFocus={() => !isRemoved && setPreviewCard(card)}
                    onBlur={() => setPreviewCard(null)}
                    onContextMenu={(e) => {
                      if (!canAct || isRemoved) return;
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        cardIndex: idx,
                        card,
                      });
                    }}
                  >
                    <div
                      className="relative overflow-hidden rounded-rc-sm"
                      style={{
                        width: isSite ? GRID_CARD_HEIGHT : GRID_CARD_WIDTH,
                        height: isSite ? GRID_CARD_WIDTH : GRID_CARD_HEIGHT,
                      }}
                    >
                      <img
                        src={`/api/images/${slug}`}
                        alt={card.name || slug}
                        className={`w-full h-full object-contain ${
                          isSite ? "rotate-90 scale-[1.333] origin-center" : ""
                        }`}
                        loading="lazy"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-rc-line/12 flex justify-end">
          <RcButton variant="outline" size="sm" onClick={onClose}>
            Close
          </RcButton>
        </div>
      </div>

      {/* Context menu for card actions */}
      {contextMenu && (
        <div
          data-context-menu
          className="fixed z-[60] rounded-rc-md border border-rc-line/18 bg-[rgba(9,13,25,0.95)] backdrop-blur shadow-rc-panel py-1 min-w-[140px] font-rc-sans text-rc-fg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 font-rc-display text-sm text-rc-fg-muted border-b border-rc-line/12 truncate max-w-[180px]">
            {contextMenu.card.name}
          </div>
          {/* Pile peek actions (spellbook/atlas) */}
          {source?.pile !== "hand" && (
            <>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-rc-line/8 transition-colors"
                onClick={() => handleAction("top")}
              >
                ✓ Keep on top
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-rc-line/8 transition-colors text-rc-success-ink"
                onClick={() => handleAction("hand")}
              >
                <Icon icon="game-icons:hand" width={14} height={14} className="mr-1 inline-block align-[-2px]" />
                Draw to hand
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-rc-line/8 transition-colors text-rc-warning-ink"
                onClick={() => handleAction("bottom")}
              >
                ↓ Put on bottom
              </button>
            </>
          )}
          {/* Hand peek actions - take to your hand */}
          {source?.pile === "hand" && (
            <>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-rc-line/8 transition-colors text-rc-success-ink"
                onClick={() => handleAction("steal")}
              >
                <Icon icon="game-icons:hand" width={14} height={14} className="mr-1 inline-block align-[-2px]" />
                Take to your hand
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-rc-line/8 transition-colors text-rc-moonlight"
                onClick={() => handleAction("topOfSpellbook")}
              >
                ↑ Put top of spellbook
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-rc-line/8 transition-colors text-rc-warning-ink"
                onClick={() => handleAction("bottomOfSpellbook")}
              >
                ↓ Put bottom of spellbook
              </button>
            </>
          )}
          {/* Common actions for both pile and hand peeks */}
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-rc-line/8 transition-colors text-rc-danger-ink"
            onClick={() => handleAction("graveyard")}
          >
            <Icon icon="game-icons:tombstone" width={14} height={14} className="mr-1 inline-block align-[-2px]" />
            Send to cemetery
          </button>
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-rc-line/8 transition-colors text-rc-ember"
            onClick={() => handleAction("banish")}
          >
            <Icon icon="game-icons:cancel" width={14} height={14} className="mr-1 inline-block align-[-2px]" />
            Banish
          </button>
        </div>
      )}

      {/* Card preview overlay - uses same component as main game */}
      {cardPreviewsEnabled && (
        <CardPreview
          card={cardRefToPreview(previewCard)}
          anchor="top-right"
          zIndexClass="z-[70]"
        />
      )}
    </div>
  );
}
