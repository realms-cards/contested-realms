"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import CardWithPreview from "./CardWithPreview";

export default function KettletopLeprechaunOverlay() {
  const pending = useGameStore((s) => s.pendingKettletopLeprechaun);
  const actorKey = useGameStore((s) => s.actorKey);
  const resolve = useGameStore((s) => s.resolveKettletopLeprechaun);
  const cancel = useGameStore((s) => s.cancelKettletopLeprechaun);

  if (!pending) return null;

  const { phase, ownerSeat, drawnCard } = pending;
  const isOwner = actorKey === null || ownerSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-emerald-500/50 shadow-lg text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="text-emerald-400 font-fantaisie">
            Kettletop Leprechaun
          </span>
          <span className="opacity-80">
            {phase === "confirming" && "Deathrite — Draw a site?"}
            {phase === "complete" && "Site drawn!"}
          </span>
        </div>
      </div>

      {/* Confirmation dialog — only owner can act */}
      {isOwner && phase === "confirming" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-emerald-500/30">
            <h2 className="text-2xl font-fantaisie text-emerald-400 mb-2 text-center">
              Kettletop Leprechaun
            </h2>
            <p className="text-gray-400 text-center mb-2">
              Deathrite &mdash; Draw a site from your atlas.
            </p>
            <p className="text-yellow-400 text-sm text-center mb-6">
              Decline if silenced or you want to skip the effect.
            </p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={cancel}
                className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Decline
              </button>
              <button
                onClick={resolve}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
              >
                Draw Site
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete phase — show drawn card briefly */}
      {isOwner && phase === "complete" && drawnCard && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-emerald-500/30">
            <h2 className="text-xl font-fantaisie text-emerald-400 mb-4 text-center">
              Site Drawn
            </h2>
            <div className="flex justify-center mb-4">
              <CardWithPreview
                card={drawnCard}
                interactive={false}
                accentColor="green"
                size="md"
              />
            </div>
            <p className="text-gray-400 text-sm text-center">
              Added to your hand.
            </p>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isOwner && phase === "confirming" && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="pointer-events-auto px-4 py-2 rounded-lg bg-black/90 text-white/80 text-sm ring-1 ring-emerald-500/30">
            <span className="text-emerald-400">
              {ownerSeat.toUpperCase()}
            </span>{" "}
            is resolving Kettletop Leprechaun Deathrite...
          </div>
        </div>
      )}
    </div>
  );
}
