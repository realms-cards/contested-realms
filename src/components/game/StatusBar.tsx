"use client";

import { Eye, EyeOff, Grid3X3, Hand, Search, Star } from "lucide-react";
import AudioControls from "@/components/game/AudioControls";
import { EndTurnConfirmDialog } from "@/components/game/EndTurnConfirmDialog";
import { FEATURE_UNDO } from "@/lib/config/features";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
import { useGameStore } from "@/lib/game/store";
import { useSmallScreen } from "@/lib/hooks/useTouchDevice";

interface StatusBarProps {
  dragFromHand: boolean;
}

export default function StatusBar({ dragFromHand }: StatusBarProps) {
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const phase = useGameStore((s) => s.phase);
  const requestEndTurn = useGameStore((s) => s.requestEndTurn);
  const undo = useGameStore((s) => s.undo);
  const history = useGameStore((s) => s.history);
  // D20 Setup phase
  const d20Rolls = useGameStore((s) => s.d20Rolls);
  const setupWinner = useGameStore((s) => s.setupWinner);
  const choosePlayerOrder = useGameStore((s) => s.choosePlayerOrder);
  const showPlaymatOverlay = useGameStore((s) => s.showPlaymatOverlay);
  const togglePlaymatOverlay = useGameStore((s) => s.togglePlaymatOverlay);
  const togglePlaymat = useGameStore((s) => s.togglePlaymat);
  const cardPreviewsEnabled = useGameStore((s) => s.cardPreviewsEnabled);
  const toggleCardPreviews = useGameStore((s) => s.toggleCardPreviews);
  const uiHidden = useGameStore((s) => s.uiHidden);
  const toggleUiHidden = useGameStore((s) => s.toggleUiHidden);
  const handVisibilityMode = useGameStore((s) => s.handVisibilityMode);
  const toggleHandVisibility = useGameStore((s) => s.toggleHandVisibility);
  const { enabled: colorBlindEnabled } = useColorBlind();
  const isMobileScreen = useSmallScreen();

  const primaryActionButtonClass =
    "rounded-full text-white " +
    (isMobileScreen ? "px-2 py-0.5 text-[10px] " : "px-3 py-1 ") +
    (colorBlindEnabled
      ? "bg-sky-600/90 hover:bg-sky-500"
      : "bg-emerald-600/90 hover:bg-emerald-500");

  const p2RollClass = colorBlindEnabled ? "text-amber-300" : "text-red-400";
  const iconSize = isMobileScreen ? "w-3 h-3" : "w-4 h-4";
  const btnPad = isMobileScreen ? "p-1" : "p-1.5";

  return (
    <div
      className={`absolute ${isMobileScreen ? "top-1" : "top-3"} left-1/2 -translate-x-1/2 z-10 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } select-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`flex items-center ${isMobileScreen ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-3 px-4 py-1.5 text-sm"} rounded-full bg-black/60 backdrop-blur text-white shadow-lg ring-1 ring-white/10`}
      >
        {/* Playmat/Grid toggle - hidden on mobile to save space */}
        {!isMobileScreen && (
          <button
            className={`rounded-full ${btnPad} transition-colors ${
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
            <Grid3X3 className={iconSize} />
          </button>
        )}

        {/* UI visibility toggle (keyboard: U) */}
        <button
          className={`rounded-full ${btnPad} transition-colors ${
            uiHidden
              ? "bg-amber-600/80 hover:bg-amber-500"
              : "bg-white/10 hover:bg-white/20"
          }`}
          onClick={toggleUiHidden}
          title={`UI ${uiHidden ? "Hidden" : "Visible"} (U)`}
        >
          {uiHidden ? (
            <EyeOff className={iconSize} />
          ) : (
            <Eye className={iconSize} />
          )}
        </button>

        {/* Card Previews toggle (keyboard: P) - hidden on mobile */}
        {!isMobileScreen && (
          <button
            className={`rounded-full ${btnPad} transition-colors ${
              cardPreviewsEnabled
                ? "bg-cyan-600/80 hover:bg-cyan-500"
                : "bg-white/10 hover:bg-white/20"
            }`}
            onClick={toggleCardPreviews}
            title={`Card Previews ${cardPreviewsEnabled ? "On" : "Off"} (P)`}
          >
            <Search className={iconSize} />
          </button>
        )}

        {/* Hand visibility indicator - shows red when hand is hidden (Space key) */}
        {handVisibilityMode === "hidden" && (
          <button
            className={`rounded-full ${btnPad} transition-colors bg-red-600/80 hover:bg-red-500`}
            onClick={toggleHandVisibility}
            title="Show Hand (Space)"
          >
            <Hand className={iconSize} />
          </button>
        )}

        <Star
          className={`${isMobileScreen ? "w-3 h-3" : "w-4 h-4"} fill-yellow-400 text-yellow-400`}
        />

        {phase === "Setup" ? (
          !setupWinner ? (
            <>
              <span
                className={`opacity-80 ${isMobileScreen ? "truncate max-w-[6rem]" : ""}`}
              >
                Roll D20
              </span>
              <div className="flex items-center gap-2">
                {d20Rolls.p1 !== null && (
                  <span className="text-blue-400">P1: {d20Rolls.p1}</span>
                )}
                {d20Rolls.p2 !== null && (
                  <span className={p2RollClass}>P2: {d20Rolls.p2}</span>
                )}
              </div>
              {!isMobileScreen && (
                <span className="text-sm opacity-70">
                  Click the dice on the board to roll!
                </span>
              )}
            </>
          ) : (
            <>
              <span
                className={`opacity-80 ${isMobileScreen ? "truncate max-w-[5rem]" : ""}`}
              >
                {isMobileScreen
                  ? `P${setupWinner === "p1" ? "1" : "2"} won!`
                  : `Player ${setupWinner === "p1" ? "1" : "2"} won the roll! Choose turn order:`}
              </span>
              <button
                className={primaryActionButtonClass}
                onClick={() => choosePlayerOrder(setupWinner, true)}
                onContextMenu={(e) => e.preventDefault()}
              >
                Go First
              </button>
              <button
                className={`rounded-full bg-amber-600/90 hover:bg-amber-500 text-white ${isMobileScreen ? "px-2 py-0.5 text-[10px]" : "px-3 py-1"}`}
                onClick={() => choosePlayerOrder(setupWinner, false)}
                onContextMenu={(e) => e.preventDefault()}
              >
                Go Second
              </button>
            </>
          )
        ) : (
          <>
            <span
              className={`opacity-80 ${isMobileScreen ? "truncate max-w-[5rem]" : ""}`}
            >
              P{currentPlayer}&apos;s Turn
            </span>

            <button
              className={primaryActionButtonClass}
              onClick={() => requestEndTurn()}
              onContextMenu={(e) => e.preventDefault()}
            >
              End Turn
            </button>

            {FEATURE_UNDO && !isMobileScreen && (
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

        {/* Audio Controls (Music + Sound) - hidden on mobile */}
        {!isMobileScreen && (
          <>
            <div className="w-px h-4 bg-white/20" />
            <AudioControls enableMusic />
          </>
        )}
      </div>

      {/* End Turn Confirmation Dialog */}
      <EndTurnConfirmDialog />
    </div>
  );
}
