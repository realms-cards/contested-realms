"use client";

import { Star } from "lucide-react";
import { useGameStore } from "@/lib/game/store";

interface StatusBarProps {
  dragFromHand: boolean;
}

export default function StatusBar({ dragFromHand }: StatusBarProps) {
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const phase = useGameStore((s) => s.phase);
  const endTurn = useGameStore((s) => s.endTurn);
  const undo = useGameStore((s) => s.undo);
  const history = useGameStore((s) => s.history);
  // D20 Setup phase
  const d20Rolls = useGameStore((s) => s.d20Rolls);
  const setupWinner = useGameStore((s) => s.setupWinner);
  const rollD20 = useGameStore((s) => s.rollD20);
  const choosePlayerOrder = useGameStore((s) => s.choosePlayerOrder);

  return (
    <div
      className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } select-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-3 rounded-full bg-black/60 backdrop-blur px-4 py-1.5 text-sm text-white shadow-lg ring-1 ring-white/10">
        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
        
        {phase === "Setup" ? (
          <>
            {!setupWinner ? (
              <>
                <span className="opacity-80">Roll D20 to determine starting player</span>
                <div className="flex items-center gap-2">
                  {d20Rolls.p1 !== null && (
                    <span className="text-blue-400">P1: {d20Rolls.p1}</span>
                  )}
                  {d20Rolls.p2 !== null && (
                    <span className="text-red-400">P2: {d20Rolls.p2}</span>
                  )}
                </div>
                <span className="text-sm opacity-70">Click the dice on the board to roll!</span>
              </>
            ) : (
              <>
                <span className="opacity-80">
                  Player {setupWinner === "p1" ? "1" : "2"} won the roll! Choose turn order:
                </span>
                <button
                  className="rounded-full bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1"
                  onClick={() => choosePlayerOrder(setupWinner, true)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  Go First
                </button>
                <button
                  className="rounded-full bg-amber-600/90 hover:bg-amber-500 text-white px-3 py-1"
                  onClick={() => choosePlayerOrder(setupWinner, false)}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  Go Second
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <span className="opacity-80">Player {currentPlayer}&apos;s Turn</span>
            
            <button
              className="rounded-full bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1"
              onClick={() => endTurn()}
              onContextMenu={(e) => e.preventDefault()}
            >
              End Turn
            </button>
            
            <button
              className="rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1 disabled:opacity-40"
              onClick={() => undo()}
              disabled={!history.length}
              onContextMenu={(e) => e.preventDefault()}
            >
              Undo
            </button>
          </>
        )}
      </div>
    </div>
  );
}