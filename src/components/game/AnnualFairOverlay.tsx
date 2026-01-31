"use client";

import React from "react";
import { useGameStore } from "@/lib/game/store";
import type { ElementChoice } from "@/lib/game/store/types";

const ELEMENTS: { key: ElementChoice; icon: string; label: string; color: string }[] = [
  { key: "air", icon: "/air.png", label: "Air", color: "from-blue-500/20 to-blue-600/30" },
  { key: "water", icon: "/water.png", label: "Water", color: "from-cyan-500/20 to-cyan-600/30" },
  { key: "earth", icon: "/earth.png", label: "Earth", color: "from-amber-500/20 to-amber-600/30" },
  { key: "fire", icon: "/fire.png", label: "Fire", color: "from-red-500/20 to-red-600/30" },
];

export default function AnnualFairOverlay() {
  const pending = useGameStore((s) => s.pendingAnnualFair);
  const actorKey = useGameStore((s) => s.actorKey);
  const completeAnnualFair = useGameStore((s) => s.completeAnnualFair);
  const cancelAnnualFair = useGameStore((s) => s.cancelAnnualFair);

  if (!pending) return null;

  const { ownerSeat } = pending;

  // Hotseat: actorKey is null, always show owner UI
  // Online: only show owner UI if we're the owner
  const isOwner = actorKey === null || ownerSeat === actorKey;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top status bar */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full bg-black/90 text-white ring-1 ring-amber-500/50 shadow-lg text-lg flex items-center gap-3">
          <span className="text-amber-400 font-fantaisie">🎪 Annual Fair</span>
          <span className="opacity-80">Choose an element threshold to gain this turn</span>
        </div>
      </div>

      {/* Owner UI - Element selection */}
      {isOwner && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-black/70">
          <div className="bg-black/95 rounded-xl p-6 max-w-md w-full mx-4 ring-1 ring-amber-500/30">
            <h2 className="text-xl font-fantaisie text-amber-400 text-center mb-4">
              Pay ① to gain threshold
            </h2>

            {/* Element buttons */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {ELEMENTS.map((el) => (
                <button
                  key={el.key}
                  onClick={() => completeAnnualFair(el.key)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg bg-gradient-to-br ${el.color} hover:scale-105 transition-transform ring-1 ring-white/10 hover:ring-white/30`}
                >
                  <img src={el.icon} alt={el.label} className="w-12 h-12" />
                  <span className="text-white font-medium">{el.label}</span>
                </button>
              ))}
            </div>

            {/* Cancel button */}
            <div className="flex justify-center">
              <button
                onClick={cancelAnnualFair}
                className="px-6 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent waiting indicator */}
      {!isOwner && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div className="px-4 py-2 rounded-lg bg-black/90 text-sm text-amber-300">
            {ownerSeat.toUpperCase()} is choosing an element from Annual Fair...
          </div>
        </div>
      )}
    </div>
  );
}
