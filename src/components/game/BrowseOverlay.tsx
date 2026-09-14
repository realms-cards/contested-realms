"use client";

import Image from "next/image";
import React, { useState, useCallback, useMemo } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
// CardRef type used by CardWithPreview internally
import CardWithPreview, { CardGrid } from "./CardWithPreview";

type BrowseOverlayProps = {
  // Optional transport prop for consistency with other overlays
  transport?: unknown;
};

export default function BrowseOverlay({}: BrowseOverlayProps) {
  const pending = useGameStore((s) => s.pendingBrowse);
  const actorKey = useGameStore((s) => s.actorKey);
  const selectBrowseCard = useGameStore((s) => s.selectBrowseCard);
  const setBrowseBottomOrder = useGameStore((s) => s.setBrowseBottomOrder);
  const resolveBrowse = useGameStore((s) => s.resolveBrowse);
  const cancelBrowse = useGameStore((s) => s.cancelBrowse);

  // Local state for drag-and-drop reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // In hotseat mode (actorKey is null), always show caster UI since both players share the screen
  // In online mode, only show caster UI if we're the caster
  const isCaster = actorKey === null || pending?.casterSeat === actorKey;

  // Get the remaining cards (not selected) in their current order
  const remainingCards = useMemo(() => {
    if (!pending) return [];
    return pending.bottomOrder.map((i) => ({
      originalIndex: i,
      card: pending.revealedCards[i],
    }));
  }, [pending]);

  // Handle selecting a card to put in hand
  const handleSelectCard = useCallback(
    (index: number) => {
      if (!isCaster || pending?.phase !== "viewing") return;
      selectBrowseCard(index);
    },
    [isCaster, pending?.phase, selectBrowseCard],
  );

  // Handle reordering cards for bottom of spellbook
  const handleDragStart = useCallback(
    (e: React.DragEvent, orderIndex: number) => {
      if (!isCaster || pending?.phase !== "ordering") return;
      setDraggedIndex(orderIndex);
      e.dataTransfer.effectAllowed = "move";
    },
    [isCaster, pending?.phase],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetOrderIndex: number) => {
      e.preventDefault();
      if (draggedIndex === null || !pending) return;

      const newOrder = [...pending.bottomOrder];
      const [removed] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetOrderIndex, 0, removed);
      setBrowseBottomOrder(newOrder);
      setDraggedIndex(null);
    },
    [draggedIndex, pending, setBrowseBottomOrder],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // Move card up in order
  const moveUp = useCallback(
    (orderIndex: number) => {
      if (!pending || orderIndex === 0) return;
      const newOrder = [...pending.bottomOrder];
      const temp = newOrder[orderIndex - 1];
      newOrder[orderIndex - 1] = newOrder[orderIndex];
      newOrder[orderIndex] = temp;
      console.log("[Browse] moveUp", {
        orderIndex,
        newOrder,
        bottomOrder: pending.bottomOrder,
      });
      setBrowseBottomOrder(newOrder);
    },
    [pending, setBrowseBottomOrder],
  );

  // Move card down in order
  const moveDown = useCallback(
    (orderIndex: number) => {
      if (!pending || orderIndex >= pending.bottomOrder.length - 1) return;
      const newOrder = [...pending.bottomOrder];
      const temp = newOrder[orderIndex];
      newOrder[orderIndex] = newOrder[orderIndex + 1];
      newOrder[orderIndex + 1] = temp;
      console.log("[Browse] moveDown", {
        orderIndex,
        newOrder,
        bottomOrder: pending.bottomOrder,
      });
      setBrowseBottomOrder(newOrder);
    },
    [pending, setBrowseBottomOrder],
  );

  // Handle confirm/resolve
  const handleResolve = useCallback(() => {
    resolveBrowse();
  }, [resolveBrowse]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancelBrowse();
  }, [cancelBrowse]);

  if (!pending) return null;

  const phase = pending.phase;
  const selectedCard =
    pending.selectedCardIndex !== null
      ? pending.revealedCards[pending.selectedCardIndex]
      : null;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-2 sm:top-6 z-[201] pointer-events-none flex justify-center px-2">
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">Browse</span>
          <span className="text-rc-fg-muted">
            {phase === "viewing" &&
              (isCaster
                ? "Select a spell to put in your hand"
                : `${pending.casterSeat.toUpperCase()} is browsing spells...`)}
            {phase === "ordering" &&
              (isCaster
                ? "Arrange remaining spells for bottom of spellbook"
                : `${pending.casterSeat.toUpperCase()} is arranging spells...`)}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isCaster && phase === "viewing" && (
            <RcButton
              variant="outline"
              size="xs"
              className="mx-1"
              onClick={handleCancel}
            >
              Cancel
            </RcButton>
          )}
        </div>
      </div>

      {/* Main content area - only for caster */}
      {isCaster && (phase === "viewing" || phase === "ordering") && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-3 sm:p-6 max-w-4xl w-full mx-2 sm:mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[90vh] overflow-y-auto">
            {phase === "viewing" && (
              <>
                <h2 className="mb-2 text-center font-rc-display text-[22px] sm:text-[26px] leading-tight text-rc-fg-strong">
                  Your Next {pending.revealedCards.length} Spell
                  {pending.revealedCards.length !== 1 ? "s" : ""}
                </h2>
                <p className="text-rc-fg-muted text-xs sm:text-sm mb-4 sm:mb-6 text-center">
                  Click a spell to put it in your hand. The rest will go to the
                  bottom of your spellbook.
                </p>

                {/* Card grid */}
                <CardGrid columns={7}>
                  {pending.revealedCards.map((card, index) => (
                    <CardWithPreview
                      key={index}
                      card={card}
                      onClick={() => handleSelectCard(index)}
                      selected={false}
                      interactive={true}
                      accentColor="blue"
                    />
                  ))}
                </CardGrid>
              </>
            )}

            {phase === "ordering" && (
              <>
                <h2 className="mb-2 text-center font-rc-display text-[22px] sm:text-[26px] leading-tight text-rc-fg-strong">
                  Arrange Bottom Order
                </h2>
                <p className="text-rc-fg-muted text-xs sm:text-sm mb-3 sm:mb-4 text-center">
                  Drag to reorder. First card will be at the very bottom.
                </p>

                {/* Selected card display */}
                {selectedCard && (
                  <div className="mb-6 p-3 rounded-rc-md border border-rc-accent/35 bg-rc-accent/8">
                    <p className="text-rc-success text-sm mb-2 text-center">
                      Going to your hand:
                    </p>
                    <div className="flex justify-center">
                      <CardWithPreview
                        card={selectedCard}
                        selected={true}
                        interactive={false}
                        accentColor="green"
                      />
                    </div>
                  </div>
                )}

                {/* Remaining cards to order */}
                <div className="mb-6">
                  <p className="text-rc-fg-subtle text-sm mb-2 text-center">
                    Going to bottom of spellbook:
                  </p>
                  <div className="flex flex-col gap-2">
                    {remainingCards.map(
                      ({ originalIndex, card }, orderIndex) => (
                        <div
                          key={originalIndex}
                          draggable
                          onDragStart={(e) => handleDragStart(e, orderIndex)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, orderIndex)}
                          onDragEnd={handleDragEnd}
                          className={`flex items-center gap-3 p-2 rounded-rc-md border border-rc-line/12 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8 cursor-move transition-colors ${
                            draggedIndex === orderIndex
                              ? "opacity-50 ring-2 ring-rc-accent"
                              : ""
                          }`}
                        >
                          <span className="font-rc-mono tabular-nums text-rc-fg-subtle text-sm w-6 text-center">
                            {orderIndex + 1}
                          </span>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="w-12 h-16 relative flex-shrink-0">
                              <Image
                                src={`/api/images/${card.slug || card.cardId}`}
                                alt={card.name || "Card"}
                                fill
                                className="object-cover rounded-rc-sm"
                                unoptimized
                              />
                            </div>
                            <span className="font-rc-display text-rc-fg-strong text-sm">
                              {card.name}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <RcButton
                              variant="quiet"
                              size="icon-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                moveUp(orderIndex);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              disabled={orderIndex === 0}
                              className="rounded-rc-sm text-sm font-bold select-none touch-manipulation"
                            >
                              ↑
                            </RcButton>
                            <RcButton
                              variant="quiet"
                              size="icon-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                moveDown(orderIndex);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              disabled={orderIndex >= remainingCards.length - 1}
                              className="rounded-rc-sm text-sm font-bold select-none touch-manipulation"
                            >
                              ↓
                            </RcButton>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 justify-center">
                  <RcButton variant="outline" onClick={handleCancel}>
                    Cancel
                  </RcButton>
                  <RcButton onClick={handleResolve}>Confirm Order</RcButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isCaster && (phase === "viewing" || phase === "ordering") && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            <span className="text-rc-fg-strong">
              {pending.casterSeat.toUpperCase()}
            </span>{" "}
            is browsing their spellbook...
          </div>
        </div>
      )}
    </div>
  );
}
