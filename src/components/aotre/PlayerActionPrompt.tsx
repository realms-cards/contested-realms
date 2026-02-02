"use client";

/**
 * Attack of the Realm Eater - Player Action Prompt
 *
 * Compact bottom bar showing player hand, actions, and game state
 * Uses proper element symbols and game fonts
 */

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  getActivePlayerSlots,
  CARDS_DRAWN_PER_TURN,
} from "@/lib/aotre/constants";
import { useAotreStore } from "@/lib/aotre/store";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import type { CardRef, Thresholds } from "@/lib/game/store";

/** Element configuration matching existing codebase */
const ELEMENTS = [
  { key: "fire" as keyof Thresholds, icon: "/fire.png", color: "#f87171" },
  { key: "water" as keyof Thresholds, icon: "/water.png", color: "#67e8f9" },
  { key: "earth" as keyof Thresholds, icon: "/earth.png", color: "#f59e0b" },
  { key: "air" as keyof Thresholds, icon: "/air.png", color: "#93c5fd" },
];

/** Threshold display using proper element symbols */
function ThresholdIcons({
  thresholds,
}: {
  thresholds: Partial<Thresholds> | null | undefined;
}) {
  if (!thresholds) return null;

  const icons: React.ReactNode[] = [];
  for (const el of ELEMENTS) {
    const count = thresholds[el.key] ?? 0;
    for (let i = 0; i < count; i++) {
      icons.push(
        <Image
          key={`${el.key}-${i}`}
          src={el.icon}
          alt={el.key}
          width={12}
          height={12}
          className="inline-block"
        />,
      );
    }
  }

  return icons.length > 0 ? (
    <span className="inline-flex gap-0.5">{icons}</span>
  ) : null;
}

/** Get card image URL from slug */
function getCardImageUrl(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return `/api/images/${slug}`;
}

/** Props for the component */
interface PlayerActionPromptProps {
  onCardHover?: (card: CardPreviewData | null) => void;
}

/** Compact card display in hand - styled to match main game */
function HandCard({
  card,
  index: _index,
  isSelected,
  canAfford,
  onSelect,
  onHover,
}: {
  card: CardRef;
  index: number;
  isSelected: boolean;
  canAfford: boolean;
  onSelect: () => void;
  onHover?: (card: CardPreviewData | null) => void;
}) {
  const imageUrl = getCardImageUrl(card.slug);
  const isSite = card.type?.toLowerCase().includes("site");

  const handleMouseEnter = () => {
    onHover?.({
      slug: card.slug ?? "",
      name: card.name ?? "Card",
      type: card.type ?? "",
    });
  };

  const handleMouseLeave = () => {
    onHover?.(null);
  };

  // Check if card has threshold requirements
  const hasThresholds =
    card.thresholds && Object.values(card.thresholds).some((v) => (v ?? 0) > 0);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={!canAfford}
      className={`
        relative flex-shrink-0 overflow-hidden rounded-lg transition-all duration-200 shadow-lg
        ${isSite ? "h-20 w-28" : "h-24 w-16"}
        ${
          isSelected
            ? "ring-2 ring-amber-400 scale-110 -translate-y-3 z-10 shadow-amber-400/50"
            : "ring-1 ring-white/20 hover:ring-white/40"
        }
        ${
          canAfford
            ? "cursor-pointer hover:scale-105 hover:-translate-y-1.5"
            : "opacity-40 cursor-not-allowed saturate-50"
        }
      `}
      title={`${card.name}${card.cost ? ` - Cost: ${card.cost}` : ""}${!canAfford ? " (Cannot afford)" : ""}`}
    >
      {/* Card Image */}
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={card.name ?? "Card"}
          fill
          className="object-cover"
          sizes="112px"
          unoptimized
        />
      ) : (
        <div className={`absolute inset-0 ${getTypeBackground(card.type)}`} />
      )}

      {/* Top gradient for readability */}
      <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-black/60 to-transparent" />

      {/* Bottom gradient for readability */}
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      {/* Cost badge - styled like main game mana display */}
      <div className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md">
        <span className="font-fantaisie text-xs font-bold text-gray-900">
          {card.cost ?? 0}
        </span>
      </div>

      {/* Threshold icons - top right */}
      {hasThresholds && (
        <div className="absolute right-1 top-1 flex gap-0.5">
          <ThresholdIcons thresholds={card.thresholds} />
        </div>
      )}

      {/* Card name - bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-1">
        <div className="text-center font-fantaisie text-[9px] leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] line-clamp-2">
          {card.name ?? "Card"}
        </div>
        {/* Stats for units */}
        {(card.type === "Unit" || card.type === "Minion") && (
          <div className="flex justify-center gap-1.5 font-fantaisie text-[10px] mt-0.5">
            <span className="text-red-400 drop-shadow">{card.attack ?? 1}</span>
            <span className="text-gray-300">/</span>
            <span className="text-emerald-400 drop-shadow">
              {card.defence ?? 1}
            </span>
          </div>
        )}
      </div>

      {/* Selection glow effect */}
      {isSelected && (
        <div className="absolute inset-0 bg-amber-400/20 pointer-events-none" />
      )}

      {/* Unaffordable overlay */}
      {!canAfford && (
        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
      )}
    </button>
  );
}

/** Get background color for card type */
function getTypeBackground(type: string | null | undefined): string {
  switch (type) {
    case "Unit":
    case "Minion":
      return "bg-gradient-to-b from-blue-900 to-blue-950";
    case "Magic":
    case "Spell":
      return "bg-gradient-to-b from-purple-900 to-purple-950";
    case "Site":
      return "bg-gradient-to-b from-green-900 to-green-950";
    case "Aura":
      return "bg-gradient-to-b from-yellow-900 to-yellow-950";
    default:
      return "bg-gradient-to-b from-gray-800 to-gray-900";
  }
}

/** Action mode for board interaction */
type ActionMode = "none" | "play_card" | "select_unit" | "move" | "attack";

export function PlayerActionPrompt({ onCardHover }: PlayerActionPromptProps) {
  const phase = useAotreStore((s) => s.phase);
  const activePlayer = useAotreStore((s) => s.activePlayer);
  const playerCount = useAotreStore((s) => s.playerCount);
  const players = useAotreStore((s) => s.players);
  const passedPlayers = useAotreStore((s) => s.passedPlayers);
  const pass = useAotreStore((s) => s.pass);
  const turn = useAotreStore((s) => s.turn);
  const sharedMana = useAotreStore((s) => s.sharedMana);
  const canAffordCost = useAotreStore((s) => s.canAffordCost);
  const drawCard = useAotreStore((s) => s.drawCard);
  const completeMulligan = useAotreStore((s) => s.completeMulligan);
  const selectedHandCard = useAotreStore((s) => s.selectedHandCard);
  const selectHandCard = useAotreStore((s) => s.selectHandCard);
  const clearHandSelection = useAotreStore((s) => s.clearHandSelection);
  const selectedUnit = useAotreStore((s) => s.selectedUnit);
  const clearUnitSelection = useAotreStore((s) => s.clearUnitSelection);
  const executeRealmEaterTurn = useAotreStore((s) => s.executeRealmEaterTurn);
  const aiActionLog = useAotreStore((s) => s.aiActionLog);
  const aiPhase = useAotreStore((s) => s.aiPhase);
  const permanents = useAotreStore((s) => s.permanents);

  const [actionMode, setActionMode] = useState<ActionMode>("none");
  const aiExecutingRef = useRef(false);

  const activeSlots = getActivePlayerSlots(playerCount);
  const currentPlayer = players[activePlayer];
  const hand = currentPlayer?.hand ?? [];
  const cardsDrawnThisTurn = currentPlayer?.cardsDrawnThisTurn ?? 0;
  const canDraw =
    cardsDrawnThisTurn < CARDS_DRAWN_PER_TURN &&
    (currentPlayer?.spellbook?.length ?? 0) > 0;

  // Get player's units on board
  const playerUnits = Object.entries(permanents).filter(
    ([, cards]) => cards.length > 0,
  );

  // Auto-execute Realm Eater turn
  useEffect(() => {
    if (
      phase === "RealmEaterTurn" &&
      aiPhase === null &&
      !aiExecutingRef.current
    ) {
      aiExecutingRef.current = true;
      executeRealmEaterTurn().finally(() => {
        aiExecutingRef.current = false;
      });
    }
  }, [phase, aiPhase, executeRealmEaterTurn]);

  // Update action mode based on selections
  useEffect(() => {
    if (selectedHandCard) {
      setActionMode("play_card");
    } else if (selectedUnit) {
      setActionMode("select_unit");
    } else {
      setActionMode("none");
    }
  }, [selectedHandCard, selectedUnit]);

  // Handle card selection
  const handleSelectCard = useCallback(
    (index: number) => {
      clearUnitSelection();
      if (
        selectedHandCard?.player === activePlayer &&
        selectedHandCard?.index === index
      ) {
        clearHandSelection();
      } else {
        selectHandCard(activePlayer, index);
      }
    },
    [
      activePlayer,
      clearHandSelection,
      clearUnitSelection,
      selectHandCard,
      selectedHandCard,
    ],
  );

  // Handle draw card
  const handleDraw = useCallback(() => {
    if (canDraw) {
      drawCard(activePlayer, "spellbook");
    }
  }, [activePlayer, canDraw, drawCard]);

  // Handle pass
  const handlePass = useCallback(() => {
    clearHandSelection();
    clearUnitSelection();
    pass(activePlayer);
  }, [activePlayer, clearHandSelection, clearUnitSelection, pass]);

  // Handle move mode
  const handleMoveMode = useCallback(() => {
    if (selectedUnit) {
      setActionMode("move");
    }
  }, [selectedUnit]);

  // Handle attack mode
  const handleAttackMode = useCallback(() => {
    if (selectedUnit) {
      setActionMode("attack");
    }
  }, [selectedUnit]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    clearUnitSelection();
    clearHandSelection();
    setActionMode("none");
  }, [clearHandSelection, clearUnitSelection]);

  // Realm Eater Turn UI - Dramatic style
  if (phase === "RealmEaterTurn") {
    return (
      <div className="bg-gradient-to-t from-red-950/95 via-red-900/90 to-red-900/80 backdrop-blur-sm border-t border-red-500/30">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
            <span className="font-fantaisie text-lg text-red-300">
              Realm Eater&apos;s Turn
            </span>
            <span className="text-sm text-red-400/80 font-medium">
              {aiPhase ?? "Awakening..."}
            </span>
          </div>
          <div className="max-h-16 max-w-lg overflow-y-auto rounded-lg bg-black/40 px-3 py-2 text-xs text-red-200/90 font-mono ring-1 ring-red-500/20">
            {aiActionLog.slice(-3).map((log, i) => (
              <div key={i} className="py-0.5">
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Mulligan Phase UI - Polished style
  if (phase === "Mulligan") {
    return (
      <div className="bg-gradient-to-t from-blue-950/95 via-blue-900/90 to-blue-900/80 backdrop-blur-sm border-t border-blue-500/20">
        <div className="flex items-center justify-between px-4 py-3 border-b border-blue-500/10">
          <div className="flex items-center gap-3">
            <span className="font-fantaisie text-lg text-blue-300">
              Mulligan Phase
            </span>
            <span className="text-sm text-blue-400/70">
              Choose to keep or redraw your hand
            </span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => completeMulligan(activePlayer, true)}
              className="px-6 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/30 transition-all"
            >
              Keep Hand
            </button>
            <button
              onClick={() => completeMulligan(activePlayer, false)}
              className="px-6 py-2 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-500 shadow-lg shadow-amber-600/30 transition-all"
            >
              Mulligan
            </button>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 py-3">
          {hand.map((card, i) => (
            <HandCard
              key={i}
              card={card}
              index={i}
              isSelected={false}
              canAfford={true}
              onSelect={() => {}}
              onHover={onCardHover}
            />
          ))}
        </div>
      </div>
    );
  }

  if (phase !== "PlayerTurn") {
    return null;
  }

  // Main Player Turn UI - Polished style matching main game
  return (
    <div className="bg-gradient-to-t from-black/95 via-gray-900/95 to-gray-900/80 backdrop-blur-sm border-t border-white/10">
      {/* Top bar: Turn info, player status, actions */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-4">
          {/* Turn indicator */}
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5">
            <span className="text-xs text-gray-400">Turn</span>
            <span className="font-fantaisie text-lg text-white">{turn}</span>
          </div>

          {/* Player indicators */}
          <div className="flex items-center gap-1.5">
            {activeSlots.map((slot, idx) => (
              <div
                key={slot}
                className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  passedPlayers.has(slot)
                    ? "bg-gray-800 text-gray-500 ring-1 ring-gray-700"
                    : slot === activePlayer
                      ? "bg-emerald-500 text-white ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/30"
                      : "bg-gray-700 text-gray-300 ring-1 ring-gray-600"
                }`}
                title={
                  passedPlayers.has(slot)
                    ? `Player ${idx + 1} passed`
                    : `Player ${idx + 1}${slot === activePlayer ? " (active)" : ""}`
                }
              >
                {idx + 1}
              </div>
            ))}
          </div>

          {/* Action mode indicator */}
          {actionMode !== "none" && (
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                actionMode === "play_card"
                  ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30"
                  : actionMode === "move"
                    ? "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30"
                    : actionMode === "attack"
                      ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/30"
                      : "bg-gray-700/50 text-gray-300"
              }`}
            >
              <span className="w-2 h-2 rounded-full animate-pulse bg-current" />
              {actionMode === "play_card" && "Select target tile"}
              {actionMode === "select_unit" && "Choose action for unit"}
              {actionMode === "move" && "Select destination"}
              {actionMode === "attack" && "Select target to attack"}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {selectedUnit ? (
            <>
              <button
                onClick={handleMoveMode}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  actionMode === "move"
                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                    : "bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 ring-1 ring-blue-500/30"
                }`}
              >
                Move
              </button>
              <button
                onClick={handleAttackMode}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  actionMode === "attack"
                    ? "bg-red-500 text-white shadow-lg shadow-red-500/30"
                    : "bg-red-600/20 text-red-300 hover:bg-red-600/30 ring-1 ring-red-500/30"
                }`}
              >
                Attack
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 ring-1 ring-gray-600"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleDraw}
                disabled={!canDraw}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  canDraw
                    ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20"
                    : "bg-gray-800 text-gray-500 cursor-not-allowed"
                }`}
              >
                Draw ({CARDS_DRAWN_PER_TURN - cardsDrawnThisTurn})
              </button>
              <button
                onClick={handlePass}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-700/50 text-gray-300 hover:bg-gray-600/50 ring-1 ring-gray-600"
              >
                Pass
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hand display - horizontal scroll with padding */}
      <div className="flex gap-3 overflow-x-auto px-4 py-3">
        {hand.map((card, i) => {
          const isSelected =
            selectedHandCard?.player === activePlayer &&
            selectedHandCard?.index === i;
          const affordable = canAffordCost(
            card.cost ?? 0,
            card.thresholds ?? undefined,
          );
          return (
            <HandCard
              key={i}
              card={card}
              index={i}
              isSelected={isSelected}
              canAfford={affordable}
              onSelect={() => handleSelectCard(i)}
              onHover={onCardHover}
            />
          );
        })}

        {/* Units inline with hand */}
        {playerUnits.length > 0 && (
          <>
            <div className="w-px bg-gray-700 mx-1 self-stretch" />
            {playerUnits.map(([cellKey, cards]) =>
              cards.map((card, idx) => (
                <button
                  key={`${cellKey}-${idx}`}
                  onClick={() => {
                    clearHandSelection();
                    if (
                      selectedUnit?.cellKey === cellKey &&
                      selectedUnit?.index === idx
                    ) {
                      clearUnitSelection();
                      setActionMode("none");
                    } else {
                      const selectUnit = useAotreStore.getState().selectUnit;
                      selectUnit(cellKey, idx);
                    }
                  }}
                  className={`flex-shrink-0 h-20 w-14 rounded border overflow-hidden relative ${
                    selectedUnit?.cellKey === cellKey &&
                    selectedUnit?.index === idx
                      ? "border-green-400 ring-2 ring-green-400"
                      : "border-gray-600 hover:border-gray-400"
                  }`}
                >
                  {card.slug && (
                    <Image
                      src={getCardImageUrl(card.slug) ?? ""}
                      alt={card.name ?? "Unit"}
                      fill
                      className="object-cover"
                      sizes="56px"
                      unoptimized
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute bottom-0.5 left-0 right-0 text-center font-fantaisie text-[7px] text-white">
                    {card.name?.split(" ")[0]}
                  </div>
                  <div className="absolute top-0.5 left-0.5 text-[8px] font-fantaisie text-green-300">
                    @{cellKey.replace(",", ".")}
                  </div>
                </button>
              )),
            )}
          </>
        )}
      </div>
    </div>
  );
}
