"use client";

import {
  Eye,
  EyeOff,
  Grid3X3,
  Hand,
  MoreHorizontal,
  Mouse,
  Search,
  Settings,
  Smartphone,
  Star,
  Users,
  X,
} from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import AudioControls from "@/components/game/AudioControls";
import { EndTurnConfirmDialog } from "@/components/game/EndTurnConfirmDialog";
import { FEATURE_UNDO } from "@/lib/config/features";
import { useColorBlind } from "@/lib/contexts/ColorBlindContext";
import { useGameStore } from "@/lib/game/store";
import { useSmallScreen, useTouchOverride } from "@/lib/hooks/useTouchDevice";

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
  const requestEndTurn = useGameStore((s) => s.requestEndTurn);
  const undo = useGameStore((s) => s.undo);
  const history = useGameStore((s) => s.history);
  const matchEnded = useGameStore((s) => s.matchEnded);
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
  const { isNativeTouch, effectiveMode, toggleOverride } = useTouchOverride();
  const isMobileScreen = useSmallScreen();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close overflow menu on outside click
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
      setMoreOpen(false);
    }
  }, []);
  useEffect(() => {
    if (!moreOpen) return;
    document.addEventListener("pointerdown", handleClickOutside);
    return () =>
      document.removeEventListener("pointerdown", handleClickOutside);
  }, [moreOpen, handleClickOutside]);

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
        className={`flex items-center ${isMobileScreen ? "gap-1 px-2 py-0.5 text-[11px]" : "gap-3 px-4 py-1.5 text-sm"} rounded-full bg-black/60 backdrop-blur text-white shadow-lg ring-1 ring-white/10`}
      >
        {/* === ESSENTIAL CONTROLS (always visible) === */}

        {/* Game Status */}
        <Star
          className={
            isMobileScreen
              ? "w-3 h-3 " +
                (isMyTurn
                  ? colorBlindEnabled
                    ? "fill-sky-400 text-sky-400"
                    : "fill-green-400 text-green-400"
                  : "fill-yellow-400 text-yellow-400")
              : starClass
          }
        />
        <span
          className={`opacity-80 truncate ${isMobileScreen ? "max-w-[5rem]" : "max-w-none text-sm"}`}
        >
          {currentPlayerName}&apos;s Turn
        </span>

        {/* Turn Controls - Only for current player and not read-only */}
        {canControlTurn && (
          <button
            className={
              endTurnButtonClass +
              (isMobileScreen
                ? " text-[10px] px-2 py-0.5 whitespace-nowrap"
                : " text-sm whitespace-nowrap")
            }
            onClick={() => requestEndTurn()}
            onContextMenu={(e) => e.preventDefault()}
          >
            End Turn
          </button>
        )}

        {/* UI visibility toggle - surfaced on mobile for quick access */}
        {isMobileScreen && (
          <button
            className={`rounded-full p-1 transition-colors ${
              uiHidden
                ? "bg-amber-600/80 hover:bg-amber-500"
                : "bg-white/10 hover:bg-white/20"
            }`}
            onClick={toggleUiHidden}
            title={`UI ${uiHidden ? "Hidden" : "Visible"} (U)`}
          >
            {uiHidden ? (
              <EyeOff className="w-3 h-3" />
            ) : (
              <Eye className="w-3 h-3" />
            )}
          </button>
        )}

        {/* Hand visibility indicator - shows red when hand is hidden (Space key) */}
        {handVisibilityMode === "hidden" && (
          <button
            className={`rounded-full ${isMobileScreen ? "p-1" : "p-1.5"} transition-colors bg-red-600/80 hover:bg-red-500`}
            onClick={toggleHandVisibility}
            title="Show Hand (Space)"
          >
            <Hand className={isMobileScreen ? "w-3 h-3" : "w-4 h-4"} />
          </button>
        )}

        {/* Match Info Button - icon-only on mobile */}
        <button
          className={`rounded-full bg-white/15 hover:bg-white/25 text-white ${isMobileScreen ? "p-1" : "p-1.5 md:px-3 md:py-1"} flex items-center gap-1.5`}
          onClick={onOpenMatchInfo}
          title="Match Info & Settings"
          onContextMenu={(e) => e.preventDefault()}
        >
          <Settings className={isMobileScreen ? "w-3 h-3" : "w-3.5 h-3.5"} />
          <span className="hidden md:inline">Info</span>
        </button>

        {/* === DESKTOP-ONLY CONTROLS (hidden on mobile, shown in overflow) === */}
        {!isMobileScreen && (
          <>
            <div className="w-px h-4 bg-white/20" />

            {/* UI visibility toggle (keyboard: U) */}
            <button
              className={`rounded-full p-1.5 transition-colors ${
                uiHidden
                  ? "bg-amber-600/80 hover:bg-amber-500"
                  : "bg-white/10 hover:bg-white/20"
              }`}
              onClick={toggleUiHidden}
              title={`UI ${uiHidden ? "Hidden" : "Visible"} (U)`}
            >
              {uiHidden ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>

            {/* Card Previews toggle (keyboard: P) */}
            <button
              className={`rounded-full p-1.5 transition-colors ${
                cardPreviewsEnabled
                  ? "bg-cyan-600/80 hover:bg-cyan-500"
                  : "bg-white/10 hover:bg-white/20"
              }`}
              onClick={toggleCardPreviews}
              title={`Card Previews ${cardPreviewsEnabled ? "On" : "Off"} (P)`}
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Playmat/Grid toggle */}
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
                  {myPlayerKey === "p1" ? "P1" : "P2"}:{" "}
                  {playerNames[myPlayerKey]}
                </span>
                <div className="w-px h-4 bg-white/20" />
              </>
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

            {/* Spectator presence chip */}
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

            {/* Touch/Mouse Mode Toggle */}
            {isNativeTouch && (
              <>
                <div className="w-px h-4 bg-white/20" />
                <button
                  className={`rounded-full p-1.5 transition-colors ${
                    effectiveMode === "touch"
                      ? "bg-cyan-600/80 hover:bg-cyan-500"
                      : "bg-white/10 hover:bg-white/20"
                  }`}
                  onClick={toggleOverride}
                  title={
                    effectiveMode === "touch"
                      ? "Switch to mouse controls"
                      : "Switch to touch controls"
                  }
                >
                  {effectiveMode === "touch" ? (
                    <Smartphone className="w-4 h-4" />
                  ) : (
                    <Mouse className="w-4 h-4" />
                  )}
                </button>
              </>
            )}

            {/* Audio Controls */}
            <div className="w-px h-4 bg-white/20" />
            <AudioControls enableMusic={!inDraftMode} />
          </>
        )}

        {/* === MOBILE OVERFLOW MENU TRIGGER === */}
        {isMobileScreen && (
          <div className="relative" ref={moreRef}>
            <button
              className={`rounded-full p-1.5 transition-colors ${
                moreOpen ? "bg-white/25" : "bg-white/10 hover:bg-white/20"
              }`}
              onClick={() => setMoreOpen((v) => !v)}
              title="More options"
            >
              {moreOpen ? (
                <X className="w-4 h-4" />
              ) : (
                <MoreHorizontal className="w-4 h-4" />
              )}
            </button>

            {/* Dropdown */}
            {moreOpen && (
              <div className="absolute top-full right-0 mt-2 bg-black/90 backdrop-blur rounded-xl ring-1 ring-white/15 shadow-xl p-2 min-w-[200px] flex flex-col gap-1 z-50">
                {/* Playing as indicator */}
                {myPlayerKey && !readOnly && (
                  <div className="px-3 py-1.5 text-xs opacity-80">
                    Playing as{" "}
                    <span
                      className={`font-medium font-fantaisie px-1.5 py-0.5 rounded text-white ${
                        myPlayerKey === "p1"
                          ? colorBlindEnabled
                            ? "bg-sky-600"
                            : "bg-blue-600"
                          : colorBlindEnabled
                            ? "bg-amber-600"
                            : "bg-red-600"
                      }`}
                    >
                      {myPlayerKey === "p1" ? "P1" : "P2"}:{" "}
                      {playerNames[myPlayerKey]}
                    </span>
                  </div>
                )}

                {/* UI visibility toggle */}
                <button
                  className="flex items-center gap-2 w-full text-left rounded px-3 py-1.5 text-xs hover:bg-white/10 transition-colors"
                  onClick={() => {
                    toggleUiHidden();
                    setMoreOpen(false);
                  }}
                >
                  {uiHidden ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  UI {uiHidden ? "Hidden" : "Visible"}
                </button>

                {/* Card Previews toggle */}
                <button
                  className="flex items-center gap-2 w-full text-left rounded px-3 py-1.5 text-xs hover:bg-white/10 transition-colors"
                  onClick={() => {
                    toggleCardPreviews();
                    setMoreOpen(false);
                  }}
                >
                  <Search className="w-3.5 h-3.5" />
                  Previews {cardPreviewsEnabled ? "On" : "Off"}
                </button>

                {/* Playmat/Grid toggle */}
                <button
                  className="flex items-center gap-2 w-full text-left rounded px-3 py-1.5 text-xs hover:bg-white/10 transition-colors"
                  onClick={() => {
                    togglePlaymatOverlay();
                    togglePlaymat();
                    setMoreOpen(false);
                  }}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  {showPlaymatOverlay ? "Show Playmat" : "Show Grid"}
                </button>

                {/* Undo */}
                {FEATURE_UNDO && (
                  <button
                    className="flex items-center gap-2 w-full text-left rounded px-3 py-1.5 text-xs hover:bg-white/10 transition-colors disabled:opacity-40"
                    onClick={() => {
                      undo();
                      setMoreOpen(false);
                    }}
                    disabled={!history.length || !canControlTurn}
                  >
                    ↩ Undo
                  </button>
                )}

                {/* Touch/Mouse Mode Toggle */}
                {isNativeTouch && (
                  <button
                    className="flex items-center gap-2 w-full text-left rounded px-3 py-1.5 text-xs hover:bg-white/10 transition-colors"
                    onClick={() => {
                      toggleOverride();
                      setMoreOpen(false);
                    }}
                  >
                    {effectiveMode === "touch" ? (
                      <Smartphone className="w-3.5 h-3.5" />
                    ) : (
                      <Mouse className="w-3.5 h-3.5" />
                    )}
                    {effectiveMode === "touch" ? "Touch Mode" : "Mouse Mode"}
                  </button>
                )}

                {/* Spectator count */}
                {typeof spectatorCount === "number" && (
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs opacity-70">
                    <Users className="w-3.5 h-3.5" />
                    {spectatorCount} spectator{spectatorCount !== 1 ? "s" : ""}
                  </div>
                )}

                {/* Audio Controls */}
                <div className="border-t border-white/10 pt-1 mt-1 px-3 py-1.5">
                  <AudioControls enableMusic={!inDraftMode} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* End Turn Confirmation Dialog */}
      <EndTurnConfirmDialog />
    </div>
  );
}
