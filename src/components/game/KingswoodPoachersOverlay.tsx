"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview, { CardGrid } from "./CardWithPreview";

export default function KingswoodPoachersOverlay() {
  const pending = useGameStore((s) => s.pendingKingswoodPoachers);
  const actorKey = useGameStore((s) => s.actorKey);
  const confirm = useGameStore((s) => s.confirmKingswoodPoachers);
  const selectSpellbook = useGameStore(
    (s) => s.selectKingswoodPoachersSpellbook,
  );
  const selectBeast = useGameStore((s) => s.selectKingswoodPoachersBeast);
  const resolve = useGameStore((s) => s.resolveKingswoodPoachers);
  const cancel = useGameStore((s) => s.cancelKingswoodPoachers);

  if (!pending) return null;

  const { phase, casterSeat, targetSeat, eligibleCards, selectedIndices } =
    pending;
  const opponentSeat = casterSeat === "p1" ? "p2" : "p1";

  // Hotseat: actorKey is null, always show caster UI.
  // Online: only show caster UI if we are the caster.
  const isCaster = actorKey === null || casterSeat === actorKey;

  const getPhaseMessage = () => {
    if (phase === "confirming") {
      return isCaster
        ? "Resolve Genesis?"
        : `${casterSeat.toUpperCase()} is deciding...`;
    }
    if (phase === "selecting_spellbook") {
      return "Choosing a spellbook to search";
    }
    if (phase === "selecting") {
      return `Select up to 3 Beasts to banish (${selectedIndices.length}/3)`;
    }
    if (phase === "resolving") return "Banishing Beasts...";
    return "Complete";
  };

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-emerald-500/50 shadow-lg text-lg flex items-center gap-3">
          <span className="text-emerald-400 font-fantaisie">
            🏹 Kingswood Poachers
          </span>
          <span className="opacity-80">{getPhaseMessage()}</span>
        </div>
      </div>

      {/* Confirmation dialog */}
      {phase === "confirming" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-emerald-500/30">
            <h2 className="text-2xl font-fantaisie text-emerald-400 mb-4 text-center">
              🏹 Kingswood Poachers
            </h2>
            <p className="text-gray-300 text-center mb-4">
              Genesis → Search a spellbook for up to three Beasts, banish them,
              then shuffle.
            </p>
            <p className="text-gray-400 text-center mb-6 text-sm">
              Auto-resolve lets you choose a spellbook and pick the Beasts.
              <br />
              <span className="text-yellow-400">
                Decline if the Genesis is silenced or you want to skip it.
              </span>
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={cancel}
                className="px-6 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
              >
                Decline (Skip)
              </button>
              <button
                onClick={confirm}
                className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors ring-1 ring-emerald-400/50"
              >
                Auto-Resolve
              </button>
            </div>
            <p className="text-gray-500 text-xs text-center mt-4">
              Declining keeps the minion on the board.
            </p>
          </div>
        </div>
      )}

      {/* Spellbook chooser */}
      {phase === "selecting_spellbook" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-emerald-500/30">
            <h2 className="text-2xl font-fantaisie text-emerald-300 mb-4 text-center">
              Search which spellbook?
            </h2>
            <p className="text-sm text-gray-400 text-center mb-6">
              Look through a spellbook for up to three Beasts to banish.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => selectSpellbook(casterSeat)}
                className="px-6 py-3 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-semibold transition-colors ring-1 ring-emerald-400/40"
              >
                Your spellbook
              </button>
              <button
                onClick={() => selectSpellbook(opponentSeat)}
                className="px-6 py-3 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold transition-colors ring-1 ring-rose-400/40"
              >
                Opponent&apos;s spellbook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Beast selection */}
      {phase === "selecting" && isCaster && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-5xl w-full mx-4 ring-1 ring-emerald-500/30 max-h-[80vh] overflow-y-auto">
            <div className="mb-4">
              <h2 className="text-2xl font-fantaisie text-emerald-300 mb-2">
                Beasts in {(targetSeat ?? casterSeat).toUpperCase()}&apos;s
                spellbook
              </h2>
              <p className="text-sm text-gray-400">
                Select up to 3 Beasts to banish, then shuffle the spellbook.
              </p>
            </div>

            {eligibleCards.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg">No Beasts found</p>
                <p className="text-sm mt-2">
                  The spellbook will still be shuffled.
                </p>
              </div>
            ) : (
              <CardGrid columns={6}>
                {eligibleCards.map((cardRef, idx) => (
                  <CardWithPreview
                    key={`${cardRef.instanceId || cardRef.cardId || idx}-${idx}`}
                    card={cardRef}
                    onClick={() => selectBeast(idx)}
                    selected={selectedIndices.includes(idx)}
                    accentColor="green"
                  />
                ))}
              </CardGrid>
            )}

            <div className="flex gap-3 justify-center mt-6">
              <button
                onClick={cancel}
                className="px-6 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={resolve}
                className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
              >
                {selectedIndices.length > 0
                  ? `Banish (${selectedIndices.length}) & Shuffle`
                  : "Shuffle (banish none)"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isCaster && phase !== "complete" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-emerald-300">
            {casterSeat.toUpperCase()} is resolving Kingswood Poachers...
          </div>
        </div>
      )}
    </div>
  );
}
