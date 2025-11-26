"use client";

import { Skull, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useGameStore } from "@/lib/game/store";
import type { LifeState, PlayerKey } from "@/lib/game/store";

interface LifeCountersProps {
  dragFromHand: boolean;
}

function formatLifeDisplay(life: number, lifeState: LifeState): string {
  if (lifeState === "dead") return "D";
  if (lifeState === "dd") return "DD";
  return life.toString();
}

function getLifeStateColor(lifeState: LifeState): string {
  switch (lifeState) {
    case "alive":
      return "text-white";
    case "dd":
      return "text-orange-400";
    case "dead":
      return "text-red-400";
  }
}

function getLifeStateIcon(lifeState: LifeState) {
  switch (lifeState) {
    case "alive":
      return null; // No icon for alive state, just show numbers
    case "dd":
      return <AlertTriangle className="w-4 h-4 text-orange-400" />;
    case "dead":
      return <Skull className="w-4 h-4 text-red-400" />;
  }
}

interface LifeCounterProps {
  player: PlayerKey;
  playerName: string;
  dragFromHand: boolean;
}

function LifeCounter({
  player,
  playerName,
  dragFromHand,
  showNameAbove,
}: LifeCounterProps & { showNameAbove: boolean }) {
  const playerState = useGameStore((s) => s.players[player]);
  const addLife = useGameStore((s) => s.addLife);
  const [showDeathConfirm, setShowDeathConfirm] = useState(false);

  const { life, lifeState } = playerState;
  const lifeDisplay = formatLifeDisplay(life, lifeState);
  const colorClass = getLifeStateColor(lifeState);
  const canIncrease = lifeState !== "dead" && life < 20;
  const canDecrease = lifeState !== "dead";

  return (
    <div
      className="flex flex-col items-center gap-2 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Player name above counter (for upper player) */}
      {showNameAbove && (
        <div
          className="text-xs font-medium px-2 py-1 rounded-full bg-gray-500/20 text-gray-300"
          onContextMenu={(e) => e.preventDefault()}
        >
          {playerName}
        </div>
      )}

      {/* Main counter row */}
      <div
        className="flex items-center gap-2"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Life counter */}
        <div
          className={`w-16 h-16 grid place-items-center rounded-xl bg-black/70 shadow-lg ring-1 ring-white/10 ${
            lifeState === "dd"
              ? "ring-orange-400/50 bg-orange-900/20"
              : lifeState === "dead"
              ? "ring-red-400/50 bg-red-900/20"
              : "ring-white/10"
          }`}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center justify-center gap-0.5">
            {getLifeStateIcon(lifeState)}
            <span
              className={`${
                lifeState === "alive" ? "text-2xl" : "text-xl"
              } font-bold ${colorClass}`}
            >
              {lifeDisplay}
            </span>
          </div>
        </div>

        {/* Life modification buttons */}
        <div
          className="flex flex-col gap-1"
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            onClick={() => addLife(player, +1)}
            disabled={dragFromHand || !canIncrease}
            title={
              !canIncrease
                ? "Cannot increase life (max 20 or player is dead)"
                : "Increase life"
            }
            onContextMenu={(e) => e.preventDefault()}
          >
            +
          </button>
          <button
            className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            onClick={() => {
              if (lifeState === "dd") {
                setShowDeathConfirm(true);
              } else {
                addLife(player, -1);
              }
            }}
            disabled={dragFromHand || !canDecrease}
            title={!canDecrease ? "Player is dead" : "Decrease life"}
            onContextMenu={(e) => e.preventDefault()}
          >
            -
          </button>
        </div>
      </div>

      {/* Player name below counter (for lower player) */}
      {!showNameAbove && (
        <div
          className="text-xs font-medium px-2 py-1 rounded-full bg-gray-500/20 text-gray-300"
          onContextMenu={(e) => e.preventDefault()}
        >
          {playerName}
        </div>
      )}

      {showDeathConfirm &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
            onMouseDown={() => setShowDeathConfirm(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="death-confirm-title"
              className="bg-slate-900/95 text-white rounded-xl border border-slate-700 shadow-2xl w-full max-w-sm p-5"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2
                id="death-confirm-title"
                className="text-lg font-semibold mb-2"
              >
                Declare your DEATH?
              </h2>
              <p className="text-sm text-slate-300 mb-4">
                This action is irreversible.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeathConfirm(false)}
                  className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-200 hover:bg-slate-700/70"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addLife(player, -1);
                    setShowDeathConfirm(false);
                  }}
                  className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function LifeCounters({ dragFromHand }: LifeCountersProps) {
  return (
    <div
      className={`fixed left-3 top-1/2 -translate-y-1/2 z-[100] flex flex-col gap-4 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-white select-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* P1 Life - name above */}
      <LifeCounter
        player="p1"
        playerName="Player 1"
        dragFromHand={dragFromHand}
        showNameAbove={true}
      />

      {/* P2 Life - name below */}
      <LifeCounter
        player="p2"
        playerName="Player 2"
        dragFromHand={dragFromHand}
        showNameAbove={false}
      />
    </div>
  );
}
