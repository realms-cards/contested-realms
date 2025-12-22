"use client";

import { useEffect, useCallback } from "react";
import { useGameStore } from "@/lib/game/store";
import type { ElementChoice } from "@/lib/game/store/types";

const ELEMENT_DATA: Record<
  ElementChoice,
  { label: string; color: string; icon: string; bgClass: string }
> = {
  air: {
    label: "Air",
    color: "#a0c4ff",
    icon: "/air.svg",
    bgClass: "from-sky-600/80 to-sky-800/80",
  },
  water: {
    label: "Water",
    color: "#6bc5ff",
    icon: "/water.svg",
    bgClass: "from-blue-600/80 to-blue-800/80",
  },
  earth: {
    label: "Earth",
    color: "#90be6d",
    icon: "/earth.svg",
    bgClass: "from-green-700/80 to-green-900/80",
  },
  fire: {
    label: "Fire",
    color: "#f77f00",
    icon: "/fire.svg",
    bgClass: "from-orange-600/80 to-red-700/80",
  },
};

export function ElementChoiceOverlay() {
  const pending = useGameStore((s) => s.specialSiteState.pendingElementChoice);
  const actorKey = useGameStore((s) => s.actorKey);
  const completeElementChoice = useGameStore((s) => s.completeElementChoice);
  const cancelElementChoice = useGameStore((s) => s.cancelElementChoice);

  // Only show if there's a pending choice and we're the chooser
  const isChooser = pending && pending.chooserSeat === actorKey;

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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="rounded-xl bg-gray-900/95 border border-amber-500/30 p-8 shadow-2xl max-w-md text-center">
          <h2 className="text-2xl font-bold text-amber-400 mb-4">
            {pending.siteName}
          </h2>
          <p className="text-gray-300">
            Opponent is choosing an element for this site...
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {(["air", "water", "earth", "fire"] as const).map((el) => (
              <div
                key={el}
                className="w-10 h-10 rounded-full bg-gray-700/50 animate-pulse flex items-center justify-center"
              >
                <img
                  src={ELEMENT_DATA[el].icon}
                  alt={el}
                  className="w-6 h-6 opacity-50"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-xl bg-gray-900/95 border border-amber-500/30 p-8 shadow-2xl max-w-lg">
        <h2 className="text-2xl font-bold text-amber-400 mb-2 text-center">
          {pending.siteName}
        </h2>
        <p className="text-gray-300 text-center mb-6">
          Choose an element. This site will provide that threshold permanently.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {(["air", "water", "earth", "fire"] as const).map((element) => {
            const data = ELEMENT_DATA[element];
            return (
              <button
                key={element}
                onClick={() => handleChoice(element)}
                className={`
                  group relative flex flex-col items-center justify-center
                  p-6 rounded-xl border-2 border-transparent
                  bg-gradient-to-br ${data.bgClass}
                  hover:border-white/50 hover:scale-105
                  transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-amber-400
                `}
              >
                <img
                  src={data.icon}
                  alt={data.label}
                  className="w-16 h-16 mb-2 drop-shadow-lg group-hover:scale-110 transition-transform"
                />
                <span
                  className="text-xl font-bold"
                  style={{ color: data.color }}
                >
                  {data.label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-gray-500 text-sm text-center mt-4">
          Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded">Esc</kbd> to
          cancel
        </p>
      </div>
    </div>
  );
}
