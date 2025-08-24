"use client";

import { useState } from "react";
import { Dice6 } from "lucide-react";
import { useGameStore } from "@/lib/game/store";

interface ResourceBarProps {
  dragFromHand: boolean;
}

export default function ResourceBar({ dragFromHand }: ResourceBarProps) {
  const [die, setDie] = useState<number | null>(null);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const phase = useGameStore((s) => s.phase);
  const p1 = useGameStore((s) => s.players.p1);
  const p2 = useGameStore((s) => s.players.p2);
  const addMana = useGameStore((s) => s.addMana);
  
  const cur = currentPlayer === 1 ? p1 : p2;

  return (
    <div className="absolute inset-x-0 bottom-3 z-10 pointer-events-none">
      <div
        className={`${
          dragFromHand ? "pointer-events-none" : "pointer-events-auto"
        } mx-auto max-w-3xl rounded-xl bg-black/60 backdrop-blur px-4 py-2 text-sm text-white shadow-xl ring-1 ring-white/10 flex items-center justify-between`}
      >
        <div className="flex items-center gap-4">
          <span className="opacity-80">P{currentPlayer} Mana</span>
          <div className="flex items-center gap-2">
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() => addMana(currentPlayer === 1 ? "p1" : "p2", -1)}
            >
              -
            </button>
            <span className="w-6 text-center font-semibold">{cur.mana}</span>
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() => addMana(currentPlayer === 1 ? "p1" : "p2", +1)}
            >
              +
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="opacity-70">Turn</span>
          <span className="font-semibold">P{currentPlayer}</span>
          <span className="opacity-50">•</span>
          <span className="opacity-70">{phase}</span>
          <span className="opacity-50">|</span>
          <button
            className="flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1"
            onClick={() => setDie(1 + Math.floor(Math.random() * 6))}
          >
            <Dice6 className="w-4 h-4" />
            <span>Roll</span>
          </button>
          <div className="w-8 text-center font-mono">{die ?? "-"}</div>
        </div>
      </div>
    </div>
  );
}