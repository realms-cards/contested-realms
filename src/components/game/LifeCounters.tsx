"use client";

import { useGameStore } from "@/lib/game/store";
import type { LifeState, PlayerKey } from "@/lib/game/store";
import { Heart, Skull, AlertTriangle } from "lucide-react";

interface LifeCountersProps {
  dragFromHand: boolean;
}

function formatLifeDisplay(life: number, lifeState: LifeState): string {
  if (lifeState === 'dead') return 'D';
  if (lifeState === 'dd') return 'DD';
  return life.toString();
}

function getLifeStateColor(lifeState: LifeState): string {
  switch (lifeState) {
    case 'alive': return 'text-white';
    case 'dd': return 'text-orange-400';
    case 'dead': return 'text-red-400';
  }
}

function getLifeStateIcon(lifeState: LifeState) {
  switch (lifeState) {
    case 'alive': return <Heart className="w-4 h-4" />;
    case 'dd': return <AlertTriangle className="w-4 h-4 text-orange-400" />;
    case 'dead': return <Skull className="w-4 h-4 text-red-400" />;
  }
}

interface LifeCounterProps {
  player: PlayerKey;
  playerName: string;
  dragFromHand: boolean;
}

function LifeCounter({ player, playerName, dragFromHand }: LifeCounterProps) {
  const playerState = useGameStore((s) => s.players[player]);
  const addLife = useGameStore((s) => s.addLife);
  
  const { life, lifeState } = playerState;
  const lifeDisplay = formatLifeDisplay(life, lifeState);
  const colorClass = getLifeStateColor(lifeState);
  const canIncrease = lifeState !== 'dead' && life < 20;
  const canDecrease = lifeState !== 'dead';

  return (
    <div className="flex items-center gap-2">
      {/* Player label */}
      <div className="text-xs font-medium px-2 py-1 rounded-full bg-gray-500/20 text-gray-300">
        {playerName}
      </div>
      
      {/* Life counter */}
      <div className={`w-16 h-16 grid place-items-center rounded-xl bg-black/70 shadow-lg ring-1 ring-white/10 ${
        lifeState === 'dd' ? 'ring-orange-400/50 bg-orange-900/20' : 
        lifeState === 'dead' ? 'ring-red-400/50 bg-red-900/20' : 
        'ring-white/10'
      }`}>
        <div className="flex flex-col items-center gap-0.5">
          {getLifeStateIcon(lifeState)}
          <span className={`text-xl font-bold ${colorClass}`}>
            {lifeDisplay}
          </span>
        </div>
      </div>
      
      {/* Life modification buttons */}
      <div className="flex flex-col gap-1">
        <button
          className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          onClick={() => addLife(player, +1)}
          disabled={dragFromHand || !canIncrease}
          title={!canIncrease ? 'Cannot increase life (max 20 or player is dead)' : 'Increase life'}
        >
          +
        </button>
        <button
          className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          onClick={() => addLife(player, -1)}
          disabled={dragFromHand || !canDecrease}
          title={!canDecrease ? 'Player is dead' : 'Decrease life'}
        >
          -
        </button>
      </div>
      
      {/* Life state description */}
      {lifeState !== 'alive' && (
        <div className="text-xs opacity-80">
          {lifeState === 'dd' && "Death's Door"}
          {lifeState === 'dead' && "Dead"}
        </div>
      )}
    </div>
  );
}

export default function LifeCounters({ dragFromHand }: LifeCountersProps) {
  return (
    <div
      className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-4 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-white`}
    >
      {/* P1 Life */}
      <LifeCounter
        player="p1"
        playerName="Player 1"
        dragFromHand={dragFromHand}
      />

      {/* P2 Life */}
      <LifeCounter
        player="p2"
        playerName="Player 2"
        dragFromHand={dragFromHand}
      />
    </div>
  );
}
