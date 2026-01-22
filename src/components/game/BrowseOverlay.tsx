"use client";

import Image from "next/image";
import React, { useState, useCallback, useMemo } from "react";
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
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full bg-black/90 text-white ring-1 ring-blue-500/50 shadow-lg text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="text-blue-400 font-fantaisie">📜 Browse</span>
          <span className="opacity-80">
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
            <button
              className="mx-1 rounded bg-white/15 hover:bg-white/25 px-3 py-1 select-none"
              onClick={handleCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Main content area - only for caster */}
      {isCaster && (phase === "viewing" || phase === "ordering") && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-3 sm:p-6 max-w-4xl w-full mx-2 sm:mx-4 ring-1 ring-blue-500/30 max-h-[90vh] overflow-y-auto">
            {phase === "viewing" && (
              <>
                <h2 className="text-xl sm:text-2xl font-fantaisie text-blue-400 mb-2 text-center">
                  Your Next {pending.revealedCards.length} Spell
                  {pending.revealedCards.length !== 1 ? "s" : ""}
                </h2>
                <p className="text-white/70 text-xs sm:text-sm mb-4 sm:mb-6 text-center">
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
                <h2 className="text-xl sm:text-2xl font-fantaisie text-blue-400 mb-2 text-center">
                  Arrange Bottom Order
                </h2>
                <p className="text-white/70 text-xs sm:text-sm mb-3 sm:mb-4 text-center">
                  Drag to reorder. Last card will be at the very bottom.
                </p>

                {/* Selected card display */}
                {selectedCard && (
                  <div className="mb-6 p-3 rounded bg-green-900/30 ring-1 ring-green-500/50">
                    <p className="text-green-400 text-sm mb-2 text-center">
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
                  <p className="text-white/60 text-sm mb-2 text-center">
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
                          className={`flex items-center gap-3 p-2 rounded bg-white/5 hover:bg-white/10 cursor-move transition-colors ${
                            draggedIndex === orderIndex
                              ? "opacity-50 ring-2 ring-blue-500"
                              : ""
                          }`}
                        >
                          <span className="text-white/40 text-sm w-6 text-center">
                            {orderIndex + 1}
                          </span>
                          <div className="flex-1 flex items-center gap-2">
                            <div className="w-12 h-16 relative flex-shrink-0">
                              <Image
                                src={`/api/images/${card.slug || card.cardId}`}
                                alt={card.name || "Card"}
                                fill
                                className="object-cover rounded"
                                unoptimized
                              />
                            </div>
                            <span className="text-white/90 text-sm">
                              {card.name}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                moveUp(orderIndex);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              disabled={orderIndex === 0}
                              className="px-3 py-2 rounded bg-white/20 hover:bg-white/30 active:bg-white/40 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-bold select-none touch-manipulation"
                            >
                              ↑
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                moveDown(orderIndex);
                              }}
                              onMouseDown={(e) => e.stopPropagation()}
                              disabled={orderIndex >= remainingCards.length - 1}
                              className="px-3 py-2 rounded bg-white/20 hover:bg-white/30 active:bg-white/40 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-bold select-none touch-manipulation"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 justify-center">
                  <button
                    className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 font-medium transition-colors"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors"
                    onClick={handleResolve}
                  >
                    Confirm Order
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isCaster && (phase === "viewing" || phase === "ordering") && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-white/80 text-sm ring-1 ring-blue-500/30">
            <span className="text-blue-300">
              {pending.casterSeat.toUpperCase()}
            </span>{" "}
            is browsing their spellbook...
          </div>
        </div>
      )}
    </div>
  );
}
