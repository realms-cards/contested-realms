"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
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

const GRID_CARD_WIDTH = CARD_SHORT * 0.55;
const GRID_CARD_HEIGHT = CARD_LONG * 0.55;

export default function HandPeekDialog({
  title = "Opponent Hand",
  cards,
  source,
  onClose,
}: HandPeekDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cardsToRender = useMemo(() => cards ?? [], [cards]);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const handlePeekedCard = useGameStore((s) => s.handlePeekedCard);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    cardIndex: number;
    card: CardRef;
  } | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

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

  useEffect(() => {
    // Clear global preview when dialog mounts/unmounts or card set changes
    setPreviewCard(null);
    return () => setPreviewCard(null);
  }, [setPreviewCard]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={dialogRef}
        className="bg-zinc-900/95 backdrop-blur rounded-2xl ring-1 ring-white/10 shadow-2xl p-3 w-fit max-w-[90vw] max-h-[80vh] text-white flex flex-col gap-3"
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Hint for right-click actions */}
        {canAct && (
          <div className="text-xs text-zinc-400 -mt-1">
            Right-click a card for actions
            {source?.pile === "hand"
              ? " (take, top/bottom of pile, discard, banish)"
              : " (draw, bottom, cemetery)"}
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto">
          {cardsToRender.length === 0 ? (
            <div className="text-center text-zinc-400 py-10">
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
                const rotationZ = isSite ? -Math.PI / 2 : 0;
                const slug = card.slug ?? "";
                const isRemoved = removedIndices.has(idx);

                return (
                  <button
                    key={key}
                    type="button"
                    className={`relative rounded-md transition-colors ${
                      isRemoved
                        ? "opacity-30 cursor-not-allowed"
                        : "bg-zinc-800/50 hover:bg-zinc-700/50"
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
                    <div className="relative w-[120px] aspect-[3/4]">
                      <Canvas
                        orthographic
                        camera={{ position: [0, 0, 5], zoom: 260 }}
                        gl={{ alpha: true, antialias: true }}
                        className="absolute inset-0"
                      >
                        <ambientLight intensity={1} />
                        <CardPlane
                          slug={slug}
                          width={GRID_CARD_WIDTH}
                          height={GRID_CARD_HEIGHT}
                          rotationZ={rotationZ}
                          upright
                          depthWrite={false}
                          interactive={false}
                          preferRaster
                        />
                      </Canvas>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-zinc-800 flex justify-end">
          <button
            className="px-3 py-1.5 text-sm font-medium text-zinc-200 bg-zinc-700/60 hover:bg-zinc-600/70 rounded-lg transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      {/* Context menu for card actions */}
      {contextMenu && (
        <div
          data-context-menu
          className="fixed z-[60] bg-zinc-800/95 backdrop-blur rounded-lg ring-1 ring-white/20 shadow-xl py-1 min-w-[140px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-zinc-400 border-b border-zinc-700 truncate max-w-[180px]">
            {contextMenu.card.name}
          </div>
          {/* Pile peek actions (spellbook/atlas) */}
          {source?.pile !== "hand" && (
            <>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors"
                onClick={() => handleAction("top")}
              >
                ✓ Keep on top
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors text-emerald-400"
                onClick={() => handleAction("hand")}
              >
                ✋ Draw to hand
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors text-amber-400"
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
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors text-emerald-400"
                onClick={() => handleAction("steal")}
              >
                ✋ Take to your hand
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors text-cyan-400"
                onClick={() => handleAction("topOfSpellbook")}
              >
                ↑ Put top of spellbook
              </button>
              <button
                className="w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors text-amber-400"
                onClick={() => handleAction("bottomOfSpellbook")}
              >
                ↓ Put bottom of spellbook
              </button>
            </>
          )}
          {/* Common actions for both pile and hand peeks */}
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors text-red-400"
            onClick={() => handleAction("graveyard")}
          >
            ☠ Send to cemetery
          </button>
          <button
            className="w-full px-3 py-1.5 text-sm text-left hover:bg-white/10 transition-colors text-purple-400"
            onClick={() => handleAction("banish")}
          >
            ⛔ Banish
          </button>
        </div>
      )}
    </div>
  );
}
