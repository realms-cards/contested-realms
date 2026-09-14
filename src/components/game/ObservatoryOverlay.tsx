"use client";

import Image from "next/image";
import React, { useState, useCallback, useMemo } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";

export default function ObservatoryOverlay() {
  const pending = useGameStore((s) => s.pendingObservatory);
  const actorKey = useGameStore((s) => s.actorKey);
  const setObservatoryOrder = useGameStore((s) => s.setObservatoryOrder);
  const resolveObservatory = useGameStore((s) => s.resolveObservatory);
  const cancelObservatory = useGameStore((s) => s.cancelObservatory);

  // Local state for drag-and-drop reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // In hotseat mode (actorKey is null), always show owner UI since both players share the screen
  // In online mode, only show owner UI if we're the owner
  const isOwner = actorKey === null || pending?.ownerSeat === actorKey;

  // Get the cards in their current order
  const orderedCards = useMemo(() => {
    if (!pending) return [];
    return pending.newOrder.map((i) => ({
      originalIndex: i,
      card: pending.revealedCards[i],
    }));
  }, [pending]);

  // Handle reordering cards
  const handleDragStart = useCallback(
    (e: React.DragEvent, orderIndex: number) => {
      if (!isOwner || pending?.phase !== "ordering") return;
      setDraggedIndex(orderIndex);
      e.dataTransfer.effectAllowed = "move";
    },
    [isOwner, pending?.phase],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetOrderIndex: number) => {
      e.preventDefault();
      if (draggedIndex === null || !pending) return;

      const newOrder = [...pending.newOrder];
      const [removed] = newOrder.splice(draggedIndex, 1);
      newOrder.splice(targetOrderIndex, 0, removed);
      setObservatoryOrder(newOrder);
      setDraggedIndex(null);
    },
    [draggedIndex, pending, setObservatoryOrder],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
  }, []);

  // Move card up in order
  const moveUp = useCallback(
    (orderIndex: number) => {
      if (!pending || orderIndex === 0) return;
      const newOrder = [...pending.newOrder];
      const temp = newOrder[orderIndex - 1];
      newOrder[orderIndex - 1] = newOrder[orderIndex];
      newOrder[orderIndex] = temp;
      setObservatoryOrder(newOrder);
    },
    [pending, setObservatoryOrder],
  );

  // Move card down in order
  const moveDown = useCallback(
    (orderIndex: number) => {
      if (!pending || orderIndex >= pending.newOrder.length - 1) return;
      const newOrder = [...pending.newOrder];
      const temp = newOrder[orderIndex];
      newOrder[orderIndex] = newOrder[orderIndex + 1];
      newOrder[orderIndex + 1] = temp;
      setObservatoryOrder(newOrder);
    },
    [pending, setObservatoryOrder],
  );

  // Handle confirm/resolve
  const handleResolve = useCallback(() => {
    resolveObservatory();
  }, [resolveObservatory]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    cancelObservatory();
  }, [cancelObservatory]);

  if (!pending) return null;

  const phase = pending.phase;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-2 sm:top-6 z-[201] pointer-events-none flex justify-center px-2">
        <div className="pointer-events-auto px-3 sm:px-5 py-2 sm:py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-sm sm:text-lg md:text-xl flex items-center gap-2 sm:gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">Observatory</span>
          <span className="text-rc-fg-muted">
            {phase === "ordering" &&
              (isOwner
                ? "Arrange your next spells in any order"
                : `${pending.ownerSeat.toUpperCase()} is reordering spells...`)}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isOwner && phase === "ordering" && (
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

      {/* Main content area - only for owner */}
      {isOwner && phase === "ordering" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="thin-scrollbar rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-3 sm:p-6 max-w-2xl w-full mx-2 sm:mx-4 font-rc-sans text-rc-fg shadow-rc-panel max-h-[90vh] overflow-y-auto">
            <h2 className="mb-2 text-center font-rc-display text-[22px] sm:text-[26px] leading-tight text-rc-fg-strong">
              Reorder Your Top {pending.revealedCards.length} Spell
              {pending.revealedCards.length !== 1 ? "s" : ""}
            </h2>
            <p className="text-rc-fg-muted text-xs sm:text-sm mb-4 sm:mb-6 text-center">
              Drag to reorder. First card will be on top (drawn first).
            </p>

            {/* Cards to order */}
            <div className="mb-6">
              <div className="flex flex-col gap-2">
                {orderedCards.map(({ originalIndex, card }, orderIndex) => (
                  <div
                    key={originalIndex}
                    draggable
                    onDragStart={(e) => handleDragStart(e, orderIndex)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, orderIndex)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-2 rounded-rc-md border border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8 cursor-move transition-colors ${
                      draggedIndex === orderIndex
                        ? "opacity-50 ring-2 ring-rc-accent"
                        : ""
                    }`}
                  >
                    <span className="font-rc-mono tabular-nums text-rc-accent-link text-sm w-6 text-center font-bold">
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
                        disabled={orderIndex >= orderedCards.length - 1}
                        className="rounded-rc-sm text-sm font-bold select-none touch-manipulation"
                      >
                        ↓
                      </RcButton>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 justify-center">
              <RcButton variant="outline" onClick={handleCancel}>
                Cancel
              </RcButton>
              <RcButton onClick={handleResolve}>Confirm Order</RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view - just a waiting indicator */}
      {!isOwner && phase === "ordering" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="rc-toast pointer-events-auto">
            <span className="text-rc-fg-strong">
              {pending.ownerSeat.toUpperCase()}
            </span>{" "}
            is reordering their spells...
          </div>
        </div>
      )}
    </div>
  );
}
