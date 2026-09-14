"use client";

import { Eye, EyeOff, Grid3X3, Hand, Search, Star } from "lucide-react";
import AudioControls from "@/components/game/AudioControls";
import { EndTurnConfirmDialog } from "@/components/game/EndTurnConfirmDialog";
import { RcButton } from "@/components/ui/rc-button";
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

  // Pill text buttons (End Turn / Go First primary, Go Second / Undo quiet).
  const pillButtonClass =
    "rounded-full font-rc-mono uppercase tracking-[0.1em] " +
    (isMobileScreen ? "h-5 px-2 text-[10px]" : "h-6 px-3 text-[11px]");

  const p2RollClass = colorBlindEnabled ? "text-rc-warning" : "text-rc-danger";
  const iconSize = isMobileScreen ? "w-3 h-3" : "w-4 h-4";
  // Keep a usable tap target on phones even though the icons shrink.
  const iconToggleClass = isMobileScreen
    ? "rounded-full h-6 w-6"
    : "rounded-full";

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-10 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } select-none`}
      style={{
        top: isMobileScreen
          ? "max(0.25rem, env(safe-area-inset-top, 0.25rem))"
          : "0.75rem",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`flex items-center ${isMobileScreen ? "gap-1 px-2 py-0.5 text-[10px]" : "gap-2.5 px-3.5 py-1.5 text-xs"} rounded-full bg-[rgba(9,13,25,0.82)] backdrop-blur text-rc-fg shadow-rc-panel ring-1 ring-rc-line/18`}
      >
        {/* Playmat/Grid toggle - hidden on mobile to save space */}
        {!isMobileScreen && (
          <RcButton
            variant="quiet"
            size="icon-xs"
            tone="info"
            className={iconToggleClass}
            aria-pressed={showPlaymatOverlay}
            onClick={() => {
              togglePlaymatOverlay();
              togglePlaymat();
            }}
            title={showPlaymatOverlay ? "Show playmat" : "Show grid"}
          >
            <Grid3X3 className={iconSize} />
          </RcButton>
        )}

        {/* UI visibility toggle (keyboard: U) */}
        <RcButton
          variant="quiet"
          size="icon-xs"
          tone="warning"
          className={iconToggleClass}
          aria-pressed={uiHidden}
          onClick={toggleUiHidden}
          title={`UI ${uiHidden ? "Hidden" : "Visible"} (U)`}
        >
          {uiHidden ? (
            <EyeOff className={iconSize} />
          ) : (
            <Eye className={iconSize} />
          )}
        </RcButton>

        {/* Card Previews toggle (keyboard: P) - hidden on mobile */}
        {!isMobileScreen && (
          <RcButton
            variant="quiet"
            size="icon-xs"
            tone="info"
            className={iconToggleClass}
            aria-pressed={cardPreviewsEnabled}
            onClick={toggleCardPreviews}
            title={`Card Previews ${cardPreviewsEnabled ? "On" : "Off"} (P)`}
          >
            <Search className={iconSize} />
          </RcButton>
        )}

        {/* Hand visibility indicator - shows red when hand is hidden (Space key) */}
        {handVisibilityMode === "hidden" && (
          <button
            className={`rounded-full p-1.5 transition-colors bg-rc-danger text-rc-fg-strong hover:bg-rc-danger-hover`}
            onClick={toggleHandVisibility}
            title="Show Hand (Space)"
          >
            <Hand className={iconSize} />
          </button>
        )}

        <Star
          className={`${isMobileScreen ? "w-3 h-3" : "w-4 h-4"} fill-rc-warning text-rc-warning`}
        />

        {phase === "Setup" ? (
          !setupWinner ? (
            <>
              <span
                className={`font-rc-mono text-[11px] uppercase tracking-[0.08em] text-rc-fg-muted ${isMobileScreen ? "truncate max-w-[6rem]" : "truncate max-w-[14rem]"}`}
              >
                Roll D20
              </span>
              <div className="flex items-center gap-2">
                {d20Rolls.p1 !== null && (
                  <span className="font-rc-mono tabular-nums text-rc-info">
                    P1: {d20Rolls.p1}
                  </span>
                )}
                {d20Rolls.p2 !== null && (
                  <span className={`font-rc-mono tabular-nums ${p2RollClass}`}>
                    P2: {d20Rolls.p2}
                  </span>
                )}
              </div>
              {!isMobileScreen && (
                <span className="text-[11px] text-rc-fg-subtle">
                  Click the dice on the board to roll!
                </span>
              )}
            </>
          ) : (
            <>
              <span
                className={`font-rc-mono text-[11px] uppercase tracking-[0.08em] text-rc-fg-muted ${isMobileScreen ? "truncate max-w-[5rem]" : "truncate max-w-[14rem]"}`}
              >
                {isMobileScreen
                  ? `P${setupWinner === "p1" ? "1" : "2"} won!`
                  : `Player ${setupWinner === "p1" ? "1" : "2"} won the roll! Choose turn order:`}
              </span>
              <RcButton
                size="xs"
                className={pillButtonClass}
                onClick={() => choosePlayerOrder(setupWinner, true)}
                onContextMenu={(e) => e.preventDefault()}
              >
                Go First
              </RcButton>
              <RcButton
                variant="quiet"
                size="xs"
                className={`${pillButtonClass} ${isMobileScreen ? "" : "px-2.5"}`}
                onClick={() => choosePlayerOrder(setupWinner, false)}
                onContextMenu={(e) => e.preventDefault()}
              >
                Go Second
              </RcButton>
            </>
          )
        ) : (
          <>
            <span
              className={`font-rc-mono text-[11px] uppercase tracking-[0.08em] text-rc-fg-muted ${isMobileScreen ? "truncate max-w-[5rem]" : "truncate max-w-[14rem]"}`}
            >
              P{currentPlayer}&apos;s Turn
            </span>

            <RcButton
              size="xs"
              className={pillButtonClass}
              onClick={() => requestEndTurn()}
              onContextMenu={(e) => e.preventDefault()}
            >
              End Turn
            </RcButton>

            {FEATURE_UNDO && !isMobileScreen && (
              <RcButton
                variant="quiet"
                size="xs"
                className="h-6 rounded-full px-2.5 font-rc-mono text-[11px] uppercase tracking-[0.1em] disabled:opacity-40"
                onClick={() => undo()}
                disabled={!history.length}
                onContextMenu={(e) => e.preventDefault()}
              >
                Undo
              </RcButton>
            )}
          </>
        )}

        {/* Audio Controls (Music + Sound) - hidden on mobile */}
        {!isMobileScreen && (
          <>
            <div className="w-px h-4 bg-rc-line/22" />
            <AudioControls enableMusic />
          </>
        )}
      </div>

      {/* End Turn Confirmation Dialog */}
      <EndTurnConfirmDialog />
    </div>
  );
}
