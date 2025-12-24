"use client";

import { useEffect, useCallback } from "react";
import { useGameStore } from "@/lib/game/store";
import type { ElementChoice } from "@/lib/game/store/types";

// Use the official element icons from public/
const ELEMENTS: { key: ElementChoice; icon: string }[] = [
  { key: "air", icon: "/air.png" },
  { key: "water", icon: "/water.png" },
  { key: "earth", icon: "/earth.png" },
  { key: "fire", icon: "/fire.png" },
];

export function ElementChoiceOverlay() {
  const pending = useGameStore((s) => s.specialSiteState.pendingElementChoice);
  const actorKey = useGameStore((s) => s.actorKey);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const completeElementChoice = useGameStore((s) => s.completeElementChoice);
  const cancelElementChoice = useGameStore((s) => s.cancelElementChoice);

  // Determine if we're the chooser:
  // - In online mode: actorKey must match chooserSeat
  // - In offline mode (actorKey is null): allow the owner (chooserSeat matches current control)
  const isChooser =
    pending &&
    (actorKey
      ? pending.chooserSeat === actorKey
      : pending.owner === currentPlayer); // Offline: owner's turn gets to choose

  const handleChoice = useCallback(
    (element: ElementChoice) => {
      completeElementChoice(element);
    },
    [completeElementChoice]
  );

  // Handle escape key to cancel
  useEffect(() => {
    if (!isChooser) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelElementChoice();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isChooser, cancelElementChoice]);

  if (!pending) return null;

  // If we're not the chooser, show a waiting message
  if (!isChooser) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="flex flex-col items-center gap-4">
          <p className="text-gray-400 text-sm">
            Opponent is choosing an element...
          </p>
          <div className="flex gap-3">
            {ELEMENTS.map((el) => (
              <div key={el.key} className="w-12 h-12 opacity-30 animate-pulse">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={el.icon} alt={el.key} className="w-full h-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      <div className="flex flex-col items-center gap-6">
        <p className="text-gray-400 text-sm">
          Choose threshold for {pending.siteName}
        </p>

        <div className="flex gap-4">
          {ELEMENTS.map((el) => (
            <button
              key={el.key}
              onClick={() => handleChoice(el.key)}
              className="w-16 h-16 hover:scale-125 transition-transform focus:outline-none focus:ring-2 focus:ring-white/50 rounded"
              title={el.key.charAt(0).toUpperCase() + el.key.slice(1)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={el.icon} alt={el.key} className="w-full h-full" />
            </button>
          ))}
        </div>

        <p className="text-gray-600 text-xs">Press Esc to cancel</p>
      </div>
    </div>
  );
}
