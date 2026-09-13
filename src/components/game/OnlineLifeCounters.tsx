"use client";

import { Skull, AlertTriangle, Users } from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useGraphicsSettings } from "@/hooks/useGraphicsSettings";
import { useGameStore } from "@/lib/game/store";
import type { LifeState, PlayerKey } from "@/lib/game/store";
import { useGamepadControls } from "@/lib/hooks/useGamepadControls";
import {
  useGamepadConnected,
  useSmallScreen,
  useTouchDevice,
} from "@/lib/hooks/useTouchDevice";
import { generateInteractionRequestId } from "@/lib/net/interactions";

interface OnlineLifeCountersProps {
  dragFromHand: boolean;
  myPlayerKey: PlayerKey | null;
  playerNames: { p1: string; p2: string };
  myPlayerId?: string | null;
  opponentPlayerId?: string | null;
  matchId?: string | null;
  showYouLabels?: boolean;
  readOnly?: boolean;
  spectatorMode?: boolean;
}

function formatLifeDisplay(life: number, lifeState: LifeState): string {
  if (lifeState === "dead") return "D";
  if (lifeState === "dd") return "DD";
  return life.toString();
}

function getLifeStateColor(lifeState: LifeState): string {
  switch (lifeState) {
    case "alive":
      return "text-rc-fg-strong";
    case "dd":
      return "text-rc-ember";
    case "dead":
      return "text-rc-danger";
  }
}

function getLifeStateIcon(lifeState: LifeState) {
  switch (lifeState) {
    case "alive":
      return null; // No icon for alive state, just show numbers
    case "dd":
      return <AlertTriangle className="w-4 h-4 text-rc-ember" />;
    case "dead":
      return <Skull className="w-4 h-4 text-rc-danger" />;
  }
}

interface LifeCounterProps {
  player: PlayerKey;
  playerName: string;
  canModify: boolean;
  dragFromHand: boolean;
  isMe: boolean;
  /** Seat label shown on the chip ("P1" / "P2"); the name is the tooltip. */
  label: string;
}

function LifeCounter({
  player,
  playerName,
  label,
  canModify,
  dragFromHand,
  isMe,
  showNameAbove,
  showYou,
  spectatorMode,
  isHotseatMode,
  compact = false,
}: LifeCounterProps & {
  showNameAbove: boolean;
  showYou: boolean;
  spectatorMode?: boolean;
  isHotseatMode?: boolean;
  compact?: boolean;
}) {
  const playerState = useGameStore((s) => s.players?.[player]);
  const addLife = useGameStore((s) => s.addLife);
  const [showDeathConfirm, setShowDeathConfirm] = useState(false);
  const isTouchDevice = useTouchDevice();

  const life = playerState?.life ?? 20;
  const lifeState = playerState?.lifeState ?? "alive";
  const lifeDisplay = formatLifeDisplay(life, lifeState);
  const colorClass = getLifeStateColor(lifeState);
  // In hotseat mode, allow modifying both players. In online mode, only your own life
  const canModifyThisPlayer = canModify && (isHotseatMode ? true : isMe);
  const canIncrease = canModifyThisPlayer && lifeState !== "dead" && life < 20;
  const canDecrease = canModifyThisPlayer && lifeState !== "dead";

  // Compact (mobile) sizing
  const counterSize = compact ? "w-7 h-7" : "w-16 h-16";
  const textSize = compact
    ? lifeState === "alive"
      ? "text-sm"
      : "text-xs"
    : lifeState === "alive"
      ? "text-2xl"
      : "text-xl";
  const iconSize = compact ? "w-2.5 h-2.5" : "w-4 h-4";

  return (
    <div
      className={`flex flex-col items-center ${compact ? "gap-0.5" : "gap-2"} select-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Player name above counter (for upper player) */}
      {showNameAbove && (
        <div
          className={`font-rc-mono font-medium tracking-[0.14em] ${
            compact ? "text-[7px] leading-none" : "text-[11px]"
          } ${isMe ? "text-rc-success" : "text-rc-fg-muted"}`}
          title={playerName}
          onContextMenu={(e) => e.preventDefault()}
        >
          {compact ? (
            label
          ) : (
            <span className="inline-flex items-center gap-1">
              {label}
              {spectatorMode && isMe
                ? " (Watching)"
                : showYou && isMe
                  ? " (You)"
                  : ""}
            </span>
          )}
        </div>
      )}

      {/* Main counter row - group for hover effect, relative for absolute buttons */}
      <div className="group relative" onContextMenu={(e) => e.preventDefault()}>
        {/* Life counter */}
        <div
          className={`${counterSize} grid place-items-center rounded-rc-lg bg-[rgba(9,13,25,0.82)] shadow-rc-panel ring-1 ring-rc-line/18 ${
            lifeState === "dd"
              ? "ring-rc-ember/55 bg-rc-ember/12"
              : lifeState === "dead"
                ? "ring-rc-danger/55 bg-rc-danger/14"
                : "ring-rc-line/18"
          }`}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center justify-center gap-0.5">
            {compact ? null : getLifeStateIcon(lifeState)}
            {compact && lifeState !== "alive" && (
              <span className={iconSize}>
                {lifeState === "dd" ? (
                  <AlertTriangle className={iconSize + " text-rc-ember"} />
                ) : (
                  <Skull className={iconSize + " text-rc-danger"} />
                )}
              </span>
            )}
            <span
              className={`${textSize} font-rc-mono font-semibold tabular-nums ${colorClass}`}
            >
              {lifeDisplay}
            </span>
          </div>
        </div>

        {/* Life modification buttons */}
        {/* On compact/mobile: show below the counter inline */}
        {/* On desktop: absolute positioned to the right, shown on hover */}
        {compact ? (
          canModifyThisPlayer && (
            <div
              className="flex gap-1 mt-0.5 justify-center"
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                className="w-6 h-6 flex items-center justify-center rounded-rc-sm bg-black/35 text-rc-fg-muted ring-1 ring-rc-line/22 transition-colors hover:text-rc-accent-ring hover:ring-rc-accent disabled:opacity-30 text-[10px] font-bold"
                onClick={() => addLife(player, +1)}
                disabled={dragFromHand || !canIncrease || !canModify}
                onContextMenu={(e) => e.preventDefault()}
              >
                +
              </button>
              <button
                className="w-6 h-6 flex items-center justify-center rounded-rc-sm bg-black/35 text-rc-fg-muted ring-1 ring-rc-line/22 transition-colors hover:text-rc-accent-ring hover:ring-rc-accent disabled:opacity-30 text-[10px] font-bold"
                onClick={() => {
                  if (lifeState === "dd") {
                    setShowDeathConfirm(true);
                  } else {
                    addLife(player, -1);
                  }
                }}
                disabled={dragFromHand || !canDecrease || !canModify}
                onContextMenu={(e) => e.preventDefault()}
              >
                -
              </button>
            </div>
          )
        ) : (
          <div
            className={`absolute left-full top-1/2 -translate-y-1/2 ml-2 flex flex-col gap-1 transition-opacity ${
              canModifyThisPlayer
                ? isTouchDevice
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100"
                : "opacity-0 pointer-events-none"
            }`}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              className="px-2 py-0.5 rounded-rc-sm bg-black/35 text-rc-fg-muted ring-1 ring-rc-line/22 transition-colors hover:text-rc-accent-ring hover:ring-rc-accent disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => addLife(player, +1)}
              disabled={dragFromHand || !canIncrease || !canModify}
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
              className="px-2 py-0.5 rounded-rc-sm bg-black/35 text-rc-fg-muted ring-1 ring-rc-line/22 transition-colors hover:text-rc-accent-ring hover:ring-rc-accent disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => {
                if (lifeState === "dd") {
                  setShowDeathConfirm(true);
                } else {
                  addLife(player, -1);
                }
              }}
              disabled={dragFromHand || !canDecrease || !canModify}
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
          className={`font-rc-mono font-medium tracking-[0.14em] ${
            compact ? "text-[7px] leading-none" : "text-[11px]"
          } ${isMe ? "text-rc-success" : "text-rc-fg-muted"}`}
          title={playerName}
          onContextMenu={(e) => e.preventDefault()}
        >
          {compact ? (
            label
          ) : (
            <span className="inline-flex items-center gap-1">
              {label}
              {spectatorMode && isMe
                ? " (Watching)"
                : showYou && isMe
                  ? " (You)"
                  : ""}
            </span>
          )}
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
              className="bg-[rgba(9,13,25,0.95)] text-rc-fg rounded-rc-lg border border-rc-line/18 shadow-rc-panel w-full max-w-sm p-5"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2
                id="death-confirm-title"
                className="font-rc-display text-lg text-rc-fg-strong mb-2"
              >
                Declare your DEATH?
              </h2>
              <p className="text-sm text-rc-fg-muted mb-4">
                This action is irreversible.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeathConfirm(false)}
                  className="px-3 py-1.5 rounded-rc-md border border-rc-line/22 font-rc-mono uppercase tracking-[0.14em] text-rc-fg-muted transition-colors hover:border-rc-accent hover:text-rc-accent-ring"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    addLife(player, -1);
                    setShowDeathConfirm(false);
                  }}
                  className="px-3 py-1.5 rounded-rc-md bg-rc-danger hover:bg-rc-danger-hover font-rc-mono uppercase tracking-[0.14em] text-rc-fg-strong transition-colors"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>,
          document.body,
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
  showYouLabels = false,
  readOnly = false,
}: OnlineLifeCountersProps) {
  // Detect iPhone for notch compensation
  const [isIPhone, setIsIPhone] = useState(false);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      // Detect iPhone (not iPad) for notch compensation
      // MSStream check excludes IE11 which had iPhone in UA
      const win = window as Window & { MSStream?: unknown };
      const isIOSPhone = /iPhone/.test(navigator.userAgent) && !win.MSStream;
      setIsIPhone(isIOSPhone);
    }
  }, []);

  // In online multiplayer, both players can modify life totals
  const matchEnded = useGameStore((s) => s.matchEnded);
  const isHotseatMode = !myPlayerId && !opponentPlayerId && !matchId;
  const canModifyLife = !readOnly && !!myPlayerKey && !matchEnded;
  const p1LifeState = useGameStore((s) => s.players?.p1?.lifeState ?? "alive");
  const p2LifeState = useGameStore((s) => s.players?.p2?.lifeState ?? "alive");
  const myLife = useGameStore((s) =>
    myPlayerKey ? (s.players?.[myPlayerKey]?.life ?? 0) : 0,
  );
  const myLifeState = useGameStore((s) =>
    myPlayerKey ? (s.players?.[myPlayerKey]?.lifeState ?? "alive") : "alive",
  );
  const addLife = useGameStore((s) => s.addLife);
  const tieGame = useGameStore((s) => s.tieGame);
  const sendInteractionRequest = useGameStore((s) => s.sendInteractionRequest);
  const hasGamepad = useGamepadConnected();
  const { settings: graphicsSettings } = useGraphicsSettings();
  const gamepadLifeEnabled = graphicsSettings.gamepadLifeControls;

  // Gamepad controls: LB = decrease life, RB = increase life
  // Only active when the setting is enabled
  useGamepadControls(
    {
      onLB: () => {
        if (canModifyLife && myPlayerKey && myLifeState !== "dead") {
          // Skip death confirmation for gamepad - just decrease
          // (DD -> dead transition still works)
          addLife(myPlayerKey, -1);
        }
      },
      onRB: () => {
        if (
          canModifyLife &&
          myPlayerKey &&
          myLifeState !== "dead" &&
          myLife < 20
        ) {
          addLife(myPlayerKey, +1);
        }
      },
    },
    canModifyLife && gamepadLifeEnabled,
  );

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

  const isMobileScreen = useSmallScreen();

  // iPhone notch compensation: use safe-area-inset-left plus extra padding
  const leftPosition = isIPhone
    ? isMobileScreen
      ? "left-[max(0.25rem,calc(env(safe-area-inset-left)+0.25rem))]"
      : "left-[max(0.75rem,calc(env(safe-area-inset-left)+0.5rem))]"
    : isMobileScreen
      ? "left-0.5"
      : "left-3";

  // Your own seat is always the lower tile, the opponent the upper one, so the
  // gauges never swap places when you sit in the other seat. Hotseat has no
  // fixed "you" - its seat flips every turn - and a spectator has no seat at
  // all, so both keep the natural P1-over-P2 order.
  const hasOwnSeat = !!myPlayerKey && !isHotseatMode && !readOnly;
  const topSeat: PlayerKey =
    hasOwnSeat && myPlayerKey === "p1" ? "p2" : "p1";
  const seatOrder: PlayerKey[] = [topSeat, topSeat === "p1" ? "p2" : "p1"];

  return (
    <div
      className={`absolute ${leftPosition} top-1/2 -translate-y-1/2 z-10 flex flex-col ${
        isMobileScreen
          ? // Portrait phones: the board only spans the middle of the screen,
            // so park the counters in the free space above it instead of on
            // top of the outer columns.
            "gap-1 portrait:top-[calc(env(safe-area-inset-top,0px)+3.5rem)] portrait:translate-y-0"
          : "gap-4"
      } ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-rc-fg select-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Opponent on top, your own life at the bottom - always, whichever
          seat you hold. Spectators keep the natural P1-over-P2 order. */}
      {seatOrder.map((seat, index) => (
        <LifeCounter
          key={seat}
          player={seat}
          playerName={playerNames[seat]}
          label={seat === "p1" ? "P1" : "P2"}
          canModify={canModifyLife}
          dragFromHand={dragFromHand}
          isMe={myPlayerKey === seat}
          showNameAbove={index === 0}
          showYou={showYouLabels || hasOwnSeat}
          spectatorMode={readOnly}
          isHotseatMode={isHotseatMode}
          compact={isMobileScreen}
        />
      ))}

      {/* Gamepad hint - show when gamepad connected, setting enabled, and can modify life */}
      {hasGamepad && gamepadLifeEnabled && canModifyLife && !isMobileScreen && (
        <div
          className="text-[10px] font-rc-mono tracking-[0.1em] text-rc-fg-dim text-center px-1"
          title="Use gamepad shoulder buttons to adjust your life"
        >
          LB/RB: Life
        </div>
      )}

      {/* Tie button shown between/under life counters */}
      {showTie && (
        <button
          className={`mt-1 ${isMobileScreen ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"} rounded-rc-md bg-rc-warning hover:bg-rc-accent-hover font-rc-mono uppercase tracking-[0.14em] text-rc-accent-fg transition-colors flex items-center gap-1.5 self-start`}
          onClick={() => {
            const ok = window.confirm(
              "Declare a tie? This ends the match as a draw.",
            );
            if (ok) requestTie();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Users className={isMobileScreen ? "w-3 h-3" : "w-3.5 h-3.5"} />
          Tie
        </button>
      )}
    </div>
  );
}
