"use client";

import { Skull, AlertTriangle, Users } from "lucide-react";
import { useGameStore } from "@/lib/game/store";
import type { LifeState, PlayerKey } from "@/lib/game/store";
import { generateInteractionRequestId } from "@/lib/net/interactions";

interface OnlineLifeCountersProps {
  dragFromHand: boolean;
  myPlayerKey: PlayerKey | null;
  playerNames: { p1: string; p2: string };
  myPlayerId?: string | null;
  opponentPlayerId?: string | null;
  matchId?: string | null;
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
  canModify: boolean;
  dragFromHand: boolean;
  isMe: boolean;
}

function LifeCounter({
  player,
  playerName,
  canModify,
  dragFromHand,
  isMe,
  showNameAbove,
}: LifeCounterProps & { showNameAbove: boolean }) {
  const playerState = useGameStore((s) => s.players[player]);
  const addLife = useGameStore((s) => s.addLife);

  const { life, lifeState } = playerState;
  const lifeDisplay = formatLifeDisplay(life, lifeState);
  const colorClass = getLifeStateColor(lifeState);
  // Only allow modifying your own life
  const canModifyThisPlayer = canModify && isMe;
  const canIncrease = canModifyThisPlayer && lifeState !== "dead" && life < 20;
  const canDecrease = canModifyThisPlayer && lifeState !== "dead";

  return (
    <div
      className="flex flex-col items-center gap-2 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Player name above counter (for upper player) */}
      {showNameAbove && (
        <div
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            isMe
              ? "bg-green-500/20 text-green-400"
              : "bg-gray-500/20 text-gray-400"
          }`}
          onContextMenu={(e) => e.preventDefault()}
        >
          {playerName}
          {isMe && " (You)"}
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
        {canModify && (
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
                  ? isMe
                    ? "Cannot increase life (max 20 or dead)"
                    : "Can only modify your own life"
                  : "Increase life"
              }
              onContextMenu={(e) => e.preventDefault()}
            >
              +
            </button>
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              onClick={() => addLife(player, -1)}
              disabled={dragFromHand || !canDecrease}
              title={
                !canDecrease
                  ? isMe
                    ? "Cannot decrease life (dead)"
                    : "Can only modify your own life"
                  : "Decrease life"
              }
              onContextMenu={(e) => e.preventDefault()}
            >
              -
            </button>
          </div>
        )}
      </div>

      {/* Player name below counter (for lower player) */}
      {!showNameAbove && (
        <div
          className={`text-xs font-medium px-2 py-1 rounded-full ${
            isMe
              ? "bg-green-500/20 text-green-400"
              : "bg-gray-500/20 text-gray-400"
          }`}
          onContextMenu={(e) => e.preventDefault()}
        >
          {playerName}
          {isMe && " (You)"}
        </div>
      )}
    </div>
  );
}

export default function OnlineLifeCounters({
  dragFromHand,
  myPlayerKey,
  playerNames,
  myPlayerId = null,
  opponentPlayerId = null,
  matchId = null,
}: OnlineLifeCountersProps) {
  // In online multiplayer, both players can modify life totals
  const canModifyLife = !!myPlayerKey;
  const p1LifeState = useGameStore((s) => s.players.p1.lifeState);
  const p2LifeState = useGameStore((s) => s.players.p2.lifeState);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const tieGame = useGameStore((s) => s.tieGame);
  const sendInteractionRequest = useGameStore((s) => s.sendInteractionRequest);

  const isOnline = !!myPlayerId && !!opponentPlayerId && !!matchId;
  const showTie =
    !!myPlayerKey &&
    p1LifeState === "dd" &&
    p2LifeState === "dd" &&
    !matchEnded;

  const requestTie = () => {
    if (isOnline) {
      const requestId = generateInteractionRequestId("tie");
      sendInteractionRequest({
        requestId,
        from: myPlayerId as string,
        to: opponentPlayerId as string,
        matchId: matchId as string,
        kind: "tieGame",
        note: "Declare tie: both avatars reached Death in the same move",
      });
    } else {
      // Hotseat/offline fallback
      tieGame();
    }
  };

  return (
    <div
      className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-4 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-white select-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* P1 Life - name above */}
      <LifeCounter
        player="p1"
        playerName={playerNames.p1}
        canModify={canModifyLife}
        dragFromHand={dragFromHand}
        isMe={myPlayerKey === "p1"}
        showNameAbove={true}
      />

      {/* P2 Life - name below */}
      <LifeCounter
        player="p2"
        playerName={playerNames.p2}
        canModify={canModifyLife}
        dragFromHand={dragFromHand}
        isMe={myPlayerKey === "p2"}
        showNameAbove={false}
      />

      {/* Tie button shown between/under life counters */}
      {showTie && (
        <button
          className="mt-1 px-3 py-1 rounded bg-amber-600/90 hover:bg-amber-500 text-white text-sm flex items-center gap-1.5 self-start"
          onClick={() => {
            const ok = window.confirm(
              "Declare a tie? This ends the match as a draw."
            );
            if (ok) requestTie();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Users className="w-3.5 h-3.5" />
          Tie Game
        </button>
      )}
    </div>
  );
}
