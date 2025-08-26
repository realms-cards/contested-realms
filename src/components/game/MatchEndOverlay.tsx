"use client";

import { Trophy, Skull, Users } from "lucide-react";
import type { PlayerKey } from "@/lib/game/store";

interface MatchEndOverlayProps {
  isVisible: boolean;
  winner: PlayerKey | null;
  playerNames: { p1: string; p2: string };
  myPlayerKey: PlayerKey | null;
  onClose: () => void;
  onLeave?: () => void;
}

export default function MatchEndOverlay({
  isVisible,
  winner,
  playerNames,
  myPlayerKey,
  onClose,
  onLeave
}: MatchEndOverlayProps) {
  if (!isVisible) return null;

  const isDraw = winner === null;
  const didIWin = winner === myPlayerKey;
  const winnerName = winner ? playerNames[winner] : null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-zinc-900/95 text-white rounded-3xl ring-1 ring-white/20 shadow-2xl p-8 text-center max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="mb-6 flex justify-center">
          {isDraw ? (
            <Users className="w-16 h-16 text-yellow-400" />
          ) : didIWin ? (
            <Trophy className="w-16 h-16 text-yellow-400" />
          ) : (
            <Skull className="w-16 h-16 text-red-400" />
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold mb-4">
          {isDraw ? "Draw!" : didIWin ? "Victory!" : "Defeat"}
        </h1>

        {/* Result Description */}
        <div className="text-lg opacity-90 mb-6">
          {isDraw ? (
            <p>Both players died simultaneously</p>
          ) : (
            <p>
              <span className={`font-semibold ${didIWin ? 'text-green-400' : 'text-red-400'}`}>
                {winnerName}
              </span>
              {" wins the match!"}
            </p>
          )}
        </div>

        {/* Match Summary */}
        <div className="bg-black/30 rounded-xl p-4 mb-6 text-sm">
          <div className="text-xs opacity-70 mb-2">Final Result</div>
          <div className="space-y-1">
            <div className={`flex justify-between ${winner === 'p1' ? 'text-green-400' : winner === null ? 'text-yellow-400' : 'text-red-400'}`}>
              <span>{playerNames.p1} {myPlayerKey === 'p1' && '(You)'}</span>
              <span>{winner === 'p1' ? 'Winner' : 'Dead'}</span>
            </div>
            <div className={`flex justify-between ${winner === 'p2' ? 'text-green-400' : winner === null ? 'text-yellow-400' : 'text-red-400'}`}>
              <span>{playerNames.p2} {myPlayerKey === 'p2' && '(You)'}</span>
              <span>{winner === 'p2' ? 'Winner' : 'Dead'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={onClose}
            className="w-full bg-zinc-700 hover:bg-zinc-600 text-white rounded-xl px-6 py-3 font-medium transition-colors"
          >
            Continue Examining Board
          </button>
          
          {onLeave && (
            <button
              onClick={onLeave}
              className="w-full bg-red-700 hover:bg-red-600 text-white rounded-xl px-6 py-3 font-medium transition-colors"
            >
              Leave Match & Return to Lobby
            </button>
          )}
        </div>

        <div className="mt-4 text-xs opacity-60">
          The match has ended. Players can still examine the board.
        </div>
      </div>
    </div>
  );
}