"use client";

import { Star, RotateCcw } from "lucide-react";
import { useGameStore } from "@/lib/game/store";

interface StatusBarProps {
  dragFromHand: boolean;
  onCameraReset?: () => void;
}

export default function StatusBar({ dragFromHand, onCameraReset }: StatusBarProps) {
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const phase = useGameStore((s) => s.phase);
  const nextPhase = useGameStore((s) => s.nextPhase);
  const endTurn = useGameStore((s) => s.endTurn);
  const undo = useGameStore((s) => s.undo);
  const history = useGameStore((s) => s.history);
  const showPlaymat = useGameStore((s) => s.showPlaymat);
  const togglePlaymat = useGameStore((s) => s.togglePlaymat);

  return (
    <div
      className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      }`}
    >
      <div className="flex items-center gap-3 rounded-full bg-black/60 backdrop-blur px-4 py-1.5 text-sm text-white shadow-lg ring-1 ring-white/10">
        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
        <span className="opacity-80">Player</span>
        <span className="font-semibold">{currentPlayer}</span>
        <span className="opacity-50">•</span>
        <span className="opacity-80">Phase</span>
        <span className="font-semibold">{phase}</span>
        
        <button
          className="rounded-full bg-blue-600/90 hover:bg-blue-500 text-white px-3 py-1"
          onClick={() => nextPhase()}
        >
          Next
        </button>
        
        <button
          className="ml-2 rounded-full bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1"
          onClick={() => endTurn()}
        >
          End Turn
        </button>
        
        <button
          className="rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1 disabled:opacity-40"
          onClick={() => undo()}
          disabled={!history.length}
        >
          Undo
        </button>
        
        {onCameraReset && (
          <button
            className="rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1 flex items-center gap-1.5"
            onClick={() => onCameraReset()}
            title="Reset Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Cam
          </button>
        )}
        
        <button
          className={`rounded-full px-3 py-1 ${
            showPlaymat
              ? "bg-indigo-500 text-white"
              : "bg-white/15 hover:bg-white/25"
          }`}
          onClick={() => togglePlaymat()}
        >
          {showPlaymat ? "Mat On" : "Mat Off"}
        </button>
      </div>
    </div>
  );
}