"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import type { ChaosTwisterAccuracy } from "@/lib/game/store/types";
import { getCellNumber } from "@/lib/game/store/utils/boardHelpers";
import type { GameTransport } from "@/lib/net/transport";

// Minigame constants
const BASE_SLIDER_SPEED = 1.3125; // base pixels per frame (+5% from 1.25)
const SPEED_VARIANCE = 0.5; // random variance added/subtracted on each bounce
const GREEN_ZONE_SIZE = 15; // percentage of total bar (more forgiving)
const YELLOW_ZONE_SIZE = 12; // percentage on each side of green
const GREEN_ZONE_CENTER = 50; // center of the green zone
const SLIDER_SYNC_INTERVAL = 50; // ms between slider position broadcasts

type ChaosTwisterOverlayProps = {
  transport?: GameTransport | null;
};

export default function ChaosTwisterOverlay({
  transport,
}: ChaosTwisterOverlayProps) {
  const pending = useGameStore((s) => s.pendingChaosTwister);
  const actorKey = useGameStore((s) => s.actorKey);
  const board = useGameStore((s) => s.board);

  const completeChaosTwisterMinigame = useGameStore(
    (s) => s.completeChaosTwisterMinigame,
  );
  const resolveChaosTwister = useGameStore((s) => s.resolveChaosTwister);
  const cancelChaosTwister = useGameStore((s) => s.cancelChaosTwister);

  // Minigame state
  const [sliderPosition, setSliderPosition] = useState(0);
  const [sliderDirection, setSliderDirection] = useState(1); // 1 = right, -1 = left
  const [isRunning, setIsRunning] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(BASE_SLIDER_SPEED);
  const animationRef = useRef<number | null>(null);
  const sliderPositionRef = useRef(0); // Ref for broadcasting current position

  // Start the minigame animation when entering minigame phase
  useEffect(() => {
    if (
      pending?.phase === "minigame" &&
      (!actorKey || pending.casterSeat === actorKey)
    ) {
      setIsRunning(true);
      setSliderPosition(0);
      setSliderDirection(1);
      // Randomize initial speed
      setCurrentSpeed(
        BASE_SLIDER_SPEED + (Math.random() * 2 - 1) * SPEED_VARIANCE,
      );
    } else {
      setIsRunning(false);
    }
  }, [pending?.phase, pending?.casterSeat, actorKey]);

  // Animation loop for the slider
  useEffect(() => {
    if (!isRunning) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = () => {
      setSliderPosition((prev) => {
        let next = prev + currentSpeed * sliderDirection;
        if (next >= 100) {
          next = 100;
          setSliderDirection(-1);
          // Randomize speed on bounce
          setCurrentSpeed(
            BASE_SLIDER_SPEED + (Math.random() * 2 - 1) * SPEED_VARIANCE,
          );
        } else if (next <= 0) {
          next = 0;
          setSliderDirection(1);
          // Randomize speed on bounce
          setCurrentSpeed(
            BASE_SLIDER_SPEED + (Math.random() * 2 - 1) * SPEED_VARIANCE,
          );
        }
        // Update ref for broadcasting
        sliderPositionRef.current = next;
        return next;
      });
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isRunning, sliderDirection, currentSpeed]);

  // Determine if current user is the caster (needed before handleStop)
  // In hotseat mode (actorKey is null), always treat as caster since both players share the screen
  const isCaster = !actorKey || pending?.casterSeat === actorKey;

  // Handle stop button click
  const handleStop = useCallback(() => {
    setIsRunning(false);

    // Determine accuracy based on position
    const greenStart = GREEN_ZONE_CENTER - GREEN_ZONE_SIZE / 2;
    const greenEnd = GREEN_ZONE_CENTER + GREEN_ZONE_SIZE / 2;
    const yellowStart = greenStart - YELLOW_ZONE_SIZE;
    const yellowEnd = greenEnd + YELLOW_ZONE_SIZE;

    let accuracy: ChaosTwisterAccuracy;
    if (sliderPosition >= greenStart && sliderPosition <= greenEnd) {
      accuracy = "green";
    } else if (
      (sliderPosition >= yellowStart && sliderPosition < greenStart) ||
      (sliderPosition > greenEnd && sliderPosition <= yellowEnd)
    ) {
      accuracy = "yellow";
    } else {
      accuracy = "red";
    }

    completeChaosTwisterMinigame({
      accuracy,
      hitPosition: sliderPosition,
    });
  }, [sliderPosition, completeChaosTwisterMinigame]);

  // Handle spacebar to stop the slider
  useEffect(() => {
    if (!isRunning || !isCaster) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        handleStop();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRunning, isCaster, handleStop]);

  // Broadcast slider position to opponent periodically
  useEffect(() => {
    if (!isRunning || !isCaster || !pending) {
      return;
    }
    if (!transport?.sendMessage) {
      console.log("[ChaosTwister] No transport available for slider sync");
      return;
    }

    console.log("[ChaosTwister] Starting slider position broadcast");
    const intervalId = setInterval(() => {
      // Use ref to get current position (avoids stale closure)
      transport.sendMessage?.({
        type: "chaosTwisterSliderPosition",
        id: pending.id,
        position: sliderPositionRef.current,
      });
    }, SLIDER_SYNC_INTERVAL);

    return () => {
      console.log("[ChaosTwister] Stopping slider position broadcast");
      clearInterval(intervalId);
    };
  }, [isRunning, isCaster, transport, pending]); // Removed sliderPosition from deps

  if (!pending) return null;
  const phase = pending.phase;

  // Use synced slider position for opponent, local position for caster
  const displaySliderPosition = isCaster
    ? sliderPosition
    : (pending.sliderPosition ?? 0);

  // Calculate zone positions for display
  const greenStart = GREEN_ZONE_CENTER - GREEN_ZONE_SIZE / 2;
  const greenEnd = GREEN_ZONE_CENTER + GREEN_ZONE_SIZE / 2;
  const yellowLeftStart = greenStart - YELLOW_ZONE_SIZE;
  const yellowRightEnd = greenEnd + YELLOW_ZONE_SIZE;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      {/* Top bar with status */}
      <div className="fixed inset-x-0 top-6 z-[201] pointer-events-none flex justify-center">
        <div className="pointer-events-auto px-5 py-3 rounded-full border border-rc-line/22 bg-[rgba(7,10,20,0.9)] font-rc-sans text-rc-fg shadow-rc-panel text-lg md:text-xl flex items-center gap-3 select-none">
          <span className="font-rc-display text-rc-accent-link">
            Chaos Twister
          </span>
          <span className="text-rc-fg-muted">
            {phase === "selectingMinion" &&
              (isCaster
                ? "Select a minion to blow"
                : `${pending.casterSeat.toUpperCase()} is selecting a minion...`)}
            {phase === "selectingSite" &&
              (isCaster
                ? "Select a target site"
                : `${pending.casterSeat.toUpperCase()} is selecting a site...`)}
            {phase === "minigame" &&
              (isCaster
                ? "Stop the slider in the green zone!"
                : "Waiting for dexterity test...")}
            {phase === "resolving" && "Resolving..."}
          </span>
          {isCaster &&
            (phase === "selectingMinion" || phase === "selectingSite") && (
              <RcButton
                variant="outline"
                size="xs"
                className="mx-1"
                onClick={() => cancelChaosTwister()}
              >
                Cancel
              </RcButton>
            )}
        </div>
      </div>

      {/* Selection phases - show info bar for both players */}
      {(phase === "selectingMinion" || phase === "selectingSite") &&
        pending.targetMinion && (
          <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
            <div className="rc-toast pointer-events-auto">
              Selected:{" "}
              <span className="font-rc-display text-rc-accent-link">
                {pending.targetMinion.card.name}
              </span>
              <span className="font-rc-mono tabular-nums text-rc-fg-subtle ml-2">
                (Power: {pending.targetMinion.power})
              </span>
            </div>
          </div>
        )}

      {/* Minigame phase - the dexterity slider */}
      {phase === "minigame" && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-auto bg-[rgba(6,10,20,0.7)]">
          <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-8 max-w-lg w-full font-rc-sans text-rc-fg shadow-rc-panel">
            <h2 className="mb-2 text-center font-rc-display text-[26px] leading-tight text-rc-fg-strong">
              Dexterity Test!
            </h2>
            <p className="text-rc-fg-muted text-sm mb-6 text-center">
              {isCaster
                ? "Stop the slider in the GREEN zone for a perfect landing!"
                : `Waiting for ${pending.casterSeat.toUpperCase()} to complete the test...`}
            </p>

            {/* Info about selected targets */}
            <div className="mb-6 p-3 rounded-rc-md border border-rc-line/12 bg-black/30 text-sm">
              <div className="flex justify-between">
                <span className="text-rc-fg-subtle">Minion:</span>
                <span className="text-rc-fg-strong">
                  {pending.targetMinion?.card.name} (Power:{" "}
                  {pending.targetMinion?.power})
                </span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-rc-fg-subtle">Target Site:</span>
                <span className="font-rc-mono tabular-nums text-rc-fg-strong">
                  #
                  {pending.targetSite
                    ? getCellNumber(
                        pending.targetSite.x,
                        pending.targetSite.y,
                        board.size.w,
                        board.size.h,
                      )
                    : "?"}
                </span>
              </div>
            </div>

            {/* The slider bar */}
            <div className="relative h-16 rounded-rc-md overflow-hidden mb-6">
              {/* Red zones (left and right) */}
              <div
                className="absolute inset-y-0 left-0 bg-red-600/80"
                style={{ width: `${yellowLeftStart}%` }}
              />
              <div
                className="absolute inset-y-0 right-0 bg-red-600/80"
                style={{ width: `${100 - yellowRightEnd}%` }}
              />

              {/* Yellow zones */}
              <div
                className="absolute inset-y-0 bg-yellow-500/80"
                style={{
                  left: `${yellowLeftStart}%`,
                  width: `${YELLOW_ZONE_SIZE}%`,
                }}
              />
              <div
                className="absolute inset-y-0 bg-yellow-500/80"
                style={{
                  left: `${greenEnd}%`,
                  width: `${YELLOW_ZONE_SIZE}%`,
                }}
              />

              {/* Green zone (center) */}
              <div
                className="absolute inset-y-0 bg-green-500/90"
                style={{
                  left: `${greenStart}%`,
                  width: `${GREEN_ZONE_SIZE}%`,
                }}
              />

              {/* The moving slider indicator */}
              <div
                className="absolute top-0 bottom-0 w-2 bg-white shadow-lg shadow-white/50 rounded-full"
                style={{
                  left: `${displaySliderPosition}%`,
                  transform: "translateX(-50%)",
                  transition: isCaster ? "none" : "left 60ms linear",
                }}
              />

              {/* Zone labels */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-rc-fg-strong/70 font-bold text-xs">
                  GREEN = Perfect • YELLOW = 1 tile off • RED = 2 tiles off
                </span>
              </div>
            </div>

            {/* Stop button (only for caster) */}
            {isCaster && isRunning && (
              <RcButton
                size="lg"
                className="w-full h-auto py-4 font-bold text-xl"
                onClick={handleStop}
              >
                STOP!{" "}
                <span className="text-sm text-rc-accent-fg/70">
                  (or press Space)
                </span>
              </RcButton>
            )}
          </div>
        </div>
      )}

      {/* Resolving phase - minimal floating result bar */}
      {phase === "resolving" && pending.minigameResult && (
        <div className="fixed bottom-24 inset-x-0 z-[201] pointer-events-none flex justify-center">
          <div
            className={`pointer-events-auto px-6 py-3 rounded-full border bg-[rgba(7,10,20,0.9)] font-rc-sans shadow-rc-panel flex items-center gap-4 ${
              pending.minigameResult.accuracy === "green"
                ? "border-green-500/50"
                : pending.minigameResult.accuracy === "yellow"
                  ? "border-yellow-500/50"
                  : "border-red-500/50"
            }`}
          >
            <span
              className={`font-rc-display text-lg ${
                pending.minigameResult.accuracy === "green"
                  ? "text-green-400"
                  : pending.minigameResult.accuracy === "yellow"
                    ? "text-yellow-400"
                    : "text-red-400"
              }`}
            >
              {pending.minigameResult.accuracy === "green"
                ? "Perfect!"
                : pending.minigameResult.accuracy === "yellow"
                  ? "Close!"
                  : "Missed!"}
            </span>
            <span className="text-rc-fg-muted text-sm">
              <span className="font-rc-mono font-bold tabular-nums text-rc-danger">
                {pending.targetMinion?.power} dmg
              </span>{" "}
              → Site #
              {pending.landingSite
                ? getCellNumber(
                    pending.landingSite.x,
                    pending.landingSite.y,
                    board.size.w,
                    board.size.h,
                  )
                : "?"}
            </span>
            {isCaster && (
              <RcButton
                size="xs"
                className="ml-2"
                onClick={() => resolveChaosTwister()}
              >
                Resolve
              </RcButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
