"use client";

import { Grid3X3, Settings, Star, Users } from "lucide-react";
import AudioControls from "@/components/game/AudioControls";
import { FEATURE_UNDO } from "@/lib/config/features";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
import { useGameStore } from "@/lib/game/store";

interface OnlineStatusBarProps {
  dragFromHand: boolean;
  myPlayerNumber: number | null;
  playerNames: { p1: string; p2: string };
  onOpenMatchInfo: () => void;
  /** Whether we're in draft mode (disables music) */
  inDraftMode?: boolean;
  /** If true, disables turn controls (spectator mode) */
  readOnly?: boolean;
  /** Number of spectators to display (optional) */
  spectatorCount?: number | null;
  /** Player key for "Playing as" indicator */
  myPlayerKey?: "p1" | "p2" | null;
}

export default function OnlineStatusBar({
  dragFromHand,
  myPlayerNumber,
  playerNames,
  onOpenMatchInfo,
  inDraftMode = false,
  readOnly = false,
  spectatorCount = null,
  myPlayerKey = null,
}: OnlineStatusBarProps) {
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const endTurn = useGameStore((s) => s.endTurn);
  const undo = useGameStore((s) => s.undo);
  const history = useGameStore((s) => s.history);
  const matchEnded = useGameStore((s) => s.matchEnded);
  const showPlaymatOverlay = useGameStore((s) => s.showPlaymatOverlay);
  const togglePlaymatOverlay = useGameStore((s) => s.togglePlaymatOverlay);
  const togglePlaymat = useGameStore((s) => s.togglePlaymat);
  const { enabled: colorBlindEnabled } = useColorBlind();

  // Check if this player can control the current turn
  const canControlTurn =
    !readOnly && myPlayerNumber === currentPlayer && !matchEnded;
  const currentPlayerName =
    currentPlayer === 1 ? playerNames.p1 : playerNames.p2;
  const isMyTurn = myPlayerNumber === currentPlayer;

  const starClass = isMyTurn
    ? colorBlindEnabled
      ? "w-4 h-4 fill-sky-400 text-sky-400"
      : "w-4 h-4 fill-green-400 text-green-400"
    : "w-4 h-4 fill-yellow-400 text-yellow-400";

  const endTurnButtonClass =
    "rounded-full text-white px-3 py-1 transition-colors " +
    (colorBlindEnabled
      ? "bg-sky-600/90 hover:bg-sky-500"
      : "bg-emerald-600/90 hover:bg-emerald-500");

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

        {/* Playing as indicator */}
        {myPlayerKey && !readOnly && (
          <>
            <span
              className={`font-medium font-fantaisie px-2 py-0.5 rounded text-white ${
                myPlayerKey === "p1"
                  ? colorBlindEnabled
                    ? "bg-sky-600"
                    : "bg-blue-600"
                  : colorBlindEnabled
                  ? "bg-amber-600"
                  : "bg-red-600"
              }`}
            >
              {myPlayerKey === "p1" ? "P1" : "P2"}: {playerNames[myPlayerKey]}
            </span>
            <div className="w-px h-4 bg-white/20" />
          </>
        )}

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
        <Star className={starClass} />
        <span className="opacity-80">{currentPlayerName}&apos;s Turn</span>

        {/* Turn Controls - Only for current player and not read-only */}
        {canControlTurn && (
          <button
            className={endTurnButtonClass}
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
              title={
                canControlTurn
                  ? "Undo last action"
                  : "Only current player can undo"
              }
              onContextMenu={(e) => e.preventDefault()}
            >
              Undo
            </button>
          </>
        )}

        {/* Spectator presence chip (player-facing) */}
        {typeof spectatorCount === "number" && (
          <>
            <div className="w-px h-4 bg-white/20" />
            <div
              className="rounded-full bg-white/10 text-white px-3 py-1 flex items-center gap-1.5"
              title="Spectator Count"
              aria-label="Spectator Count"
            >
              <Users className="w-3.5 h-3.5" />
              <span>{spectatorCount}</span>
            </div>
          </>
        )}

        {/* Audio Controls (Music + Sound) - Only enable music during actual matches */}
        <div className="w-px h-4 bg-white/20" />
        <AudioControls enableMusic={!inDraftMode} />
      </div>
    </div>
  );
}
