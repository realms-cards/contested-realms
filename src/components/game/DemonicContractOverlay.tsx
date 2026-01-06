"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

const RARITY_LABELS: Record<number, string> = {
  1: "Ordinary",
  2: "Exceptional",
  3: "Elite",
  4: "Unique",
};

export default function DemonicContractOverlay() {
  const pending = useGameStore((s) => s.pendingDemonicContract);
  const actorKey = useGameStore((s) => s.actorKey);
  const players = useGameStore((s) => s.players);
  const chooseCost = useGameStore((s) => s.chooseDemonicContractCost);
  const selectSacrifice = useGameStore((s) => s.selectDemonicContractSacrifice);
  const selectCard = useGameStore((s) => s.selectDemonicContractCard);
  const resolve = useGameStore((s) => s.resolveDemonicContract);
  const cancel = useGameStore((s) => s.cancelDemonicContract);

  if (!pending) return null;

  const {
    phase,
    casterSeat,
    maxRarity,
    highestDemonName,
    sacrificeOptions,
    eligibleCards,
    selectedCard,
  } = pending;
  const isOwner = actorKey === null || casterSeat === actorKey;
  const currentLife = players[casterSeat]?.life || 0;
  const canPayLife = currentLife > 4;
  const hasSacrificeOptions = sacrificeOptions.length > 0;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-red-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-red-400 font-fantaisie">
            📜 Demonic Contract
          </span>
          <span className="opacity-80">
            {phase === "choosing_cost" && "Choose payment method"}
            {phase === "choosing_sacrifice" && "Select token to sacrifice"}
            {phase === "loading" && "Searching spellbook..."}
            {phase === "selecting" &&
              (selectedCard ? "Confirm selection" : "Select a card")}
            {phase === "complete" && "Done!"}
          </span>
        </div>
      </div>

      {/* Cost selection phase */}
      {phase === "choosing_cost" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-lg w-full mx-4 ring-1 ring-red-500/30">
            <h2 className="text-2xl font-fantaisie text-red-400 mb-4 text-center">
              Demonic Contract
            </h2>

            <p className="text-gray-400 text-center mb-2">
              Highest Demon:{" "}
              <span className="text-red-300">{highestDemonName}</span>
            </p>
            <p className="text-gray-500 text-sm text-center mb-6">
              Can search for cards up to {RARITY_LABELS[maxRarity] || "Unknown"}{" "}
              rarity
            </p>

            <p className="text-white text-center mb-4">Choose your payment:</p>

            <div className="space-y-3">
              <button
                onClick={() => chooseCost("life")}
                disabled={!canPayLife}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  canPayLife
                    ? "border-red-600 hover:border-red-400 bg-red-900/30 hover:bg-red-900/50"
                    : "border-gray-600 bg-gray-800/30 cursor-not-allowed opacity-50"
                }`}
              >
                <div className="text-lg font-bold text-red-300">
                  💔 Pay 4 Life
                </div>
                <div className="text-sm text-gray-400">
                  Current: {currentLife} → {currentLife - 4}
                  {!canPayLife && " (Not enough life)"}
                </div>
              </button>

              <button
                onClick={() => chooseCost("sacrifice")}
                disabled={!hasSacrificeOptions}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  hasSacrificeOptions
                    ? "border-purple-600 hover:border-purple-400 bg-purple-900/30 hover:bg-purple-900/50"
                    : "border-gray-600 bg-gray-800/30 cursor-not-allowed opacity-50"
                }`}
              >
                <div className="text-lg font-bold text-purple-300">
                  🔮 Sacrifice Token
                </div>
                <div className="text-sm text-gray-400">
                  {hasSacrificeOptions
                    ? `${sacrificeOptions.length} valid token(s) available`
                    : "No valid tokens to sacrifice"}
                </div>
              </button>
            </div>

            <button
              onClick={cancel}
              className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Sacrifice selection phase */}
      {phase === "choosing_sacrifice" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-lg w-full mx-4 ring-1 ring-purple-500/30">
            <h2 className="text-2xl font-fantaisie text-purple-400 mb-4 text-center">
              Select Token to Sacrifice
            </h2>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {sacrificeOptions.map((opt) => (
                <button
                  key={`${opt.at}-${opt.index}`}
                  onClick={() => selectSacrifice(opt.at, opt.index)}
                  className="w-full p-3 rounded-lg border-2 border-purple-600 hover:border-purple-400 bg-purple-900/30 hover:bg-purple-900/50 text-left transition-all"
                >
                  <span className="text-purple-300 font-medium">
                    {opt.name}
                  </span>
                </button>
              ))}
            </div>

            <button
              onClick={cancel}
              className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Card selection phase */}
      {phase === "selecting" && isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-3xl w-full mx-4 ring-1 ring-red-500/30 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-fantaisie text-red-400 mb-4 text-center">
              Select Card (up to {RARITY_LABELS[maxRarity]} rarity)
            </h2>

            {eligibleCards.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                No eligible cards found in spellbook
              </p>
            ) : (
              <CardGrid columns={5}>
                {eligibleCards.map((card, idx) => (
                  <CardWithPreview
                    key={`${card.cardId}-${idx}`}
                    card={card}
                    onClick={() => selectCard(card)}
                    selected={selectedCard?.cardId === card.cardId}
                    interactive={true}
                    accentColor="red"
                  />
                ))}
              </CardGrid>
            )}

            <div className="flex justify-center gap-4">
              <button
                onClick={resolve}
                disabled={!selectedCard}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  selectedCard
                    ? "bg-red-600 hover:bg-red-500 text-white"
                    : "bg-gray-600 text-gray-400 cursor-not-allowed"
                }`}
              >
                Draw Card
              </button>
              <button
                onClick={cancel}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent view */}
      {!isOwner && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-sm text-red-300 ring-1 ring-red-500/30">
            {casterSeat.toUpperCase()} is resolving Demonic Contract...
          </div>
        </div>
      )}
    </div>
  );
}
