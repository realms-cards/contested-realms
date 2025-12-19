"use client";

import { Grid3X3, Star } from "lucide-react";
import AudioControls from "@/components/game/AudioControls";
import { FEATURE_UNDO } from "@/lib/config/features";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
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
  const choosePlayerOrder = useGameStore((s) => s.choosePlayerOrder);
  const showPlaymatOverlay = useGameStore((s) => s.showPlaymatOverlay);
  const togglePlaymatOverlay = useGameStore((s) => s.togglePlaymatOverlay);
  const togglePlaymat = useGameStore((s) => s.togglePlaymat);
  const { enabled: colorBlindEnabled } = useColorBlind();

  const primaryActionButtonClass =
    "rounded-full text-white px-3 py-1 " +
    (colorBlindEnabled
      ? "bg-sky-600/90 hover:bg-sky-500"
      : "bg-emerald-600/90 hover:bg-emerald-500");

  const p2RollClass = colorBlindEnabled ? "text-amber-300" : "text-red-400";

  return (
    <div
      className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } select-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-3 rounded-full bg-black/60 backdrop-blur px-4 py-1.5 text-sm text-white shadow-lg ring-1 ring-white/10">
        {/* Playmat/Grid toggle - toggles between playmat (no grid) and grid (no playmat) */}
        <button
          className={`rounded-full p-1.5 transition-colors ${
            showPlaymatOverlay
              ? "bg-blue-600/80 hover:bg-blue-500"
              : "bg-white/10 hover:bg-white/20"
          }`}
          onClick={() => {
            togglePlaymatOverlay();
            togglePlaymat();
          }}
          title={showPlaymatOverlay ? "Show playmat" : "Show grid"}
        >
          <Grid3X3 className="w-4 h-4" />
        </button>

        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />

        {phase === "Setup" ? (
          !setupWinner ? (
            <>
              <span className="opacity-80">
                Roll D20 to determine starting player
              </span>
              <div className="flex items-center gap-2">
                {d20Rolls.p1 !== null && (
                  <span className="text-blue-400">P1: {d20Rolls.p1}</span>
                )}
                {d20Rolls.p2 !== null && (
                  <span className={p2RollClass}>P2: {d20Rolls.p2}</span>
                )}
              </div>
              <span className="text-sm opacity-70">
                Click the dice on the board to roll!
              </span>
            </>
          ) : (
            <>
              <span className="opacity-80">
                Player {setupWinner === "p1" ? "1" : "2"} won the roll! Choose
                turn order:
              </span>
              <button
                className={primaryActionButtonClass}
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
          )
        ) : (
          <>
            <span className="opacity-80">
              Player {currentPlayer}&apos;s Turn
            </span>

            <button
              className={primaryActionButtonClass}
              onClick={() => endTurn()}
              onContextMenu={(e) => e.preventDefault()}
            >
              End Turn
            </button>

            {FEATURE_UNDO && (
              <button
                className="rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1 disabled:opacity-40"
                onClick={() => undo()}
                disabled={!history.length}
                onContextMenu={(e) => e.preventDefault()}
              >
                Undo
              </button>
            )}
          </>
        )}

        {/* Audio Controls (Music + Sound) */}
        <div className="w-px h-4 bg-white/20" />
        <AudioControls enableMusic />
      </div>
    </div>
  );
}
