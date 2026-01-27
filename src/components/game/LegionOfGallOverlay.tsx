"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function LegionOfGallOverlay() {
  const pending = useGameStore((s) => s.pendingLegionOfGall);
  const actorKey = useGameStore((s) => s.actorKey);
  const zones = useGameStore((s) => s.zones);
  const selectCard = useGameStore((s) => s.selectLegionOfGallCard);
  const confirm = useGameStore((s) => s.confirmLegionOfGall);
  const resolve = useGameStore((s) => s.resolveLegionOfGall);
  const cancel = useGameStore((s) => s.cancelLegionOfGall);

  if (!pending) return null;

  const { phase, casterSeat, targetSeat, selectedIndices } = pending;

  // Hotseat: actorKey is null, always show caster UI
  // Online: only show caster UI if we're the caster
  const isCaster = actorKey === null || casterSeat === actorKey;

  const targetCollection = zones[targetSeat].collection;
  const canConfirm = selectedIndices.length > 0 && selectedIndices.length <= 3;

  const getPhaseMessage = () => {
    if (phase === "confirming") {
      return isCaster
        ? "Resolve effect?"
        : `${casterSeat.toUpperCase()} is deciding...`;
    }
    if (phase === "viewing") {
      return `Viewing ${targetSeat.toUpperCase()}'s collection`;
    }
    if (phase === "selecting") {
      return `Select up to 3 cards to banish (${selectedIndices.length}/3 selected)`;
    }
    if (phase === "resolving") {
      return "Banishing cards...";
    }
    return "Complete";
  };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-purple-500/50 shadow-lg text-lg flex items-center gap-3">
          <span className="text-purple-400 font-fantaisie">
            👁️ Legion of Gall
          </span>
          <span className="opacity-80">{getPhaseMessage()}</span>
        </div>
      </div>

      {/* Confirmation dialog - visible to caster */}
      {phase === "confirming" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-purple-500/30">
            <h2 className="text-2xl font-fantaisie text-purple-400 mb-4 text-center">
              👁️ Legion of Gall
            </h2>
            <p className="text-gray-300 text-center mb-4">
              Look at opponent&apos;s collection and banish up to 3 cards.
            </p>

            <p className="text-gray-400 text-center mb-6 text-sm">
              Auto-resolve will open the collection inspection UI.
              <br />
              <span className="text-yellow-400">
                Decline if the card is silenced or you want to skip the effect.
              </span>
            </p>

            {/* Action buttons */}
            <div className="flex gap-4 justify-center">
              <button
                onClick={cancel}
                className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Decline (Skip)
              </button>
              <button
                onClick={confirm}
                className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors ring-1 ring-purple-400/50"
              >
                Auto-Resolve
              </button>
            </div>

            <p className="text-gray-500 text-xs text-center mt-4">
              Declining keeps the spell on board for manual resolution.
            </p>
          </div>
        </div>
      )}

      {/* Caster UI - Collection view */}
      {isCaster && (phase === "viewing" || phase === "selecting") && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-5xl w-full mx-4 ring-1 ring-purple-500/30 max-h-[80vh] overflow-y-auto">
            <div className="mb-4">
              <h2 className="text-2xl font-fantaisie text-purple-300 mb-2">
                {targetSeat.toUpperCase()}&apos;s Collection
              </h2>
              <p className="text-sm text-gray-400">
                Select up to 3 cards to banish from their collection
              </p>
            </div>

            {targetCollection.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">Collection is empty</p>
                <p className="text-sm mt-2">No cards to banish</p>
              </div>
            ) : (
              <CardGrid columns={6}>
                {targetCollection.map((cardRef, idx) => (
                  <CardWithPreview
                    key={`${cardRef.cardId || idx}-${idx}`}
                    card={cardRef}
                    onClick={() => selectCard(idx)}
                    selected={selectedIndices.includes(idx)}
                    accentColor="purple"
                  />
                ))}
              </CardGrid>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center mt-6">
              <button
                onClick={cancel}
                className="px-6 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={resolve}
                disabled={!canConfirm}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                  canConfirm
                    ? "bg-purple-600 hover:bg-purple-500 text-white"
                    : "bg-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                Banish{" "}
                {selectedIndices.length > 0
                  ? `(${selectedIndices.length})`
                  : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster &&
        (phase === "confirming" ||
          phase === "viewing" ||
          phase === "selecting") && (
          <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
            <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-purple-300">
              {casterSeat.toUpperCase()} is resolving Legion of Gall...
            </div>
          </div>
        )}
    </div>
  );
}
