"use client";

import { Star, Settings } from "lucide-react";
import AudioControls from "@/components/game/AudioControls";
import { FEATURE_UNDO } from "@/lib/config/features";
import { useGameStore } from "@/lib/game/store";

interface OnlineStatusBarProps {
  dragFromHand: boolean;
  myPlayerNumber: number | null;
  playerNames: { p1: string; p2: string };
  onOpenMatchInfo: () => void;
}

export default function OnlineStatusBar({
  dragFromHand,
  myPlayerNumber,
  playerNames,
  onOpenMatchInfo,
}: OnlineStatusBarProps) {
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const endTurn = useGameStore((s) => s.endTurn);
  const undo = useGameStore((s) => s.undo);
  const history = useGameStore((s) => s.history);
  const matchEnded = useGameStore((s) => s.matchEnded);

  // Check if this player can control the current turn
  const canControlTurn = myPlayerNumber === currentPlayer && !matchEnded;
  const currentPlayerName = currentPlayer === 1 ? playerNames.p1 : playerNames.p2;
  const isMyTurn = myPlayerNumber === currentPlayer;

  return (
    <div
      className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } select-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-3 rounded-full bg-black/60 backdrop-blur px-4 py-1.5 text-sm text-white shadow-lg ring-1 ring-white/10">
        {/* Match Info Button */}
        <button
          className="rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1 flex items-center gap-1.5"
          onClick={onOpenMatchInfo}
          title="Match Info & Settings"
          onContextMenu={(e) => e.preventDefault()}
        >
          <Settings className="w-3.5 h-3.5" />
          Info
        </button>
        <div className="w-px h-4 bg-white/20" />

        {/* Game Status */}
        <Star className={`w-4 h-4 ${isMyTurn ? 'fill-green-400 text-green-400' : 'fill-yellow-400 text-yellow-400'}`} />
        <span className="opacity-80">{currentPlayerName}&apos;s Turn</span>

        {/* Turn Controls - Only for current player */}
        {canControlTurn && (
          <button
            className="rounded-full bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1 transition-colors"
            onClick={() => endTurn()}
            onContextMenu={(e) => e.preventDefault()}
          >
            End Turn
          </button>
        )}

        
        
        {FEATURE_UNDO && (
          <>
            <div className="w-px h-4 bg-white/20" />
            <button
              className="rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1 disabled:opacity-40 transition-colors"
              onClick={() => undo()}
              disabled={!history.length || !canControlTurn}
              title={canControlTurn ? "Undo last action" : "Only current player can undo"}
              onContextMenu={(e) => e.preventDefault()}
            >
              Undo
            </button>
          </>
        )}

        {/* Audio Controls (Music + Sound) */}
        <div className="w-px h-4 bg-white/20" />
        <AudioControls />
      </div>
    </div>
  );
}
