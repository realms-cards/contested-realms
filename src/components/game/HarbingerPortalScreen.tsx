"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useState, useCallback, useMemo } from "react";
import D20Dice from "@/lib/game/components/D20Dice";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";
import {
  findDuplicateIndices,
  hasNoDuplicateRolls,
} from "@/lib/game/store/portalState";

interface HarbingerPortalScreenProps {
  myPlayerKey: PlayerKey;
  playerNames: { p1: string; p2: string };
  onSetupComplete: () => void;
}

// Green color for Harbinger portal dice
const PORTAL_DICE_COLOR = "#22c55e"; // green-500

// Player colors (matching game conventions)
const PLAYER_COLORS = {
  p1: "text-blue-400",
  p2: "text-red-400",
} as const;

export default function HarbingerPortalScreen({
  myPlayerKey,
  playerNames,
  onSetupComplete,
}: HarbingerPortalScreenProps) {
  const portalState = useGameStore((s) => s.portalState);
  const rollPortalDie = useGameStore((s) => s.rollPortalDie);
  const rerollPortalDie = useGameStore((s) => s.rerollPortalDie);
  const finalizePortalRolls = useGameStore((s) => s.finalizePortalRolls);
  const completePortalSetup = useGameStore((s) => s.completePortalSetup);
  const avatars = useGameStore((s) => s.avatars);

  // Track dice animation completion
  const [diceComplete, setDiceComplete] = useState<boolean[]>([
    false,
    false,
    false,
  ]);

  // Track if we're in a completing state (to show transition message)
  const [isCompleting, setIsCompleting] = useState(false);

  // Current roller from portal state
  const currentRoller = portalState?.currentRoller ?? null;
  const isMyTurn = currentRoller === myPlayerKey;
  const setupComplete = portalState?.setupComplete ?? false;

  // Get the current player's portal state
  const myPortalState = portalState?.[myPlayerKey] ?? null;
  const currentRollerState = currentRoller
    ? portalState?.[currentRoller]
    : null;
  const rollPhase = currentRollerState?.rollPhase ?? "pending";

  // Memoize rolls to avoid useCallback dependency issues
  const rolls = useMemo(
    () => currentRollerState?.rolls ?? [],
    [currentRollerState?.rolls]
  );

  // Memoize duplicate indices calculation
  const duplicateIndices = useMemo(
    () => (rolls.length === 3 ? findDuplicateIndices(rolls) : []),
    [rolls]
  );

  const hasDuplicates = duplicateIndices.length > 0;
  const allRolled = rolls.length === 3 && rolls.every((r) => r !== undefined);
  const allUnique = allRolled && hasNoDuplicateRolls(rolls);

  // Avatar names for display
  const harbingerPlayerName = currentRoller ? playerNames[currentRoller] : "";
  const myAvatarName = avatars[myPlayerKey]?.card?.name ?? "Unknown";

  // Handle dice roll completion
  const handleDiceComplete = useCallback((index: number) => {
    setDiceComplete((prev) => {
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }, []);

  // Reset dice completion when rolls change
  useEffect(() => {
    if (rolls.length < 3) {
      setDiceComplete([false, false, false]);
    }
  }, [rolls.length]);

  // Handle rolling a die
  const handleRollDie = useCallback(
    (index: number) => {
      if (!isMyTurn || !currentRoller) return;

      // If this die already has a value and is a duplicate, it's a reroll
      if (rolls[index] !== undefined && duplicateIndices.includes(index)) {
        rerollPortalDie(currentRoller, index);
        setDiceComplete((prev) => {
          const next = [...prev];
          next[index] = false;
          return next;
        });
      } else if (rolls[index] === undefined) {
        // First roll for this die
        rollPortalDie(currentRoller, index);
      }
    },
    [
      isMyTurn,
      currentRoller,
      rolls,
      duplicateIndices,
      rollPortalDie,
      rerollPortalDie,
    ]
  );

  // Handle confirm button click
  const handleConfirmPortals = useCallback(() => {
    if (allUnique && currentRoller && isMyTurn && rollPhase !== "complete") {
      finalizePortalRolls(currentRoller);
    }
  }, [allUnique, currentRoller, isMyTurn, rollPhase, finalizePortalRolls]);

  // Check if all harbinger players have completed their rolls
  useEffect(() => {
    if (!portalState || setupComplete || isCompleting) return;

    const { harbingerSeats, p1, p2 } = portalState;
    const allComplete = harbingerSeats.every((seat) => {
      const state = seat === "p1" ? p1 : p2;
      return state?.rollPhase === "complete";
    });

    if (allComplete && !portalState.currentRoller) {
      setIsCompleting(true);
    }
  }, [portalState, setupComplete, isCompleting]);

  // When isCompleting becomes true, trigger completePortalSetup after delay
  useEffect(() => {
    if (!isCompleting || setupComplete) return;

    const timer = setTimeout(() => {
      completePortalSetup();
    }, 1500);
    return () => clearTimeout(timer);
  }, [isCompleting, setupComplete, completePortalSetup]);

  // Notify parent when setup is fully complete
  useEffect(() => {
    if (setupComplete) {
      const timer = setTimeout(() => {
        onSetupComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [setupComplete, onSetupComplete]);

  // Don't render if no portal state
  if (!portalState) {
    return null;
  }

  return (
    <div className="w-full max-w-[92vw] sm:max-w-4xl bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-4 sm:p-6">
      <div className="mb-6 text-center">
        <div className="text-base sm:text-lg font-semibold mb-1 font-fantaisie sm:text-xl text-green-400">
          Harbinger Portal Setup
        </div>
        <div className="text-sm opacity-80">
          {currentRoller && (
            <>
              <span
                className={`font-medium font-fantaisie ${PLAYER_COLORS[currentRoller]}`}
              >
                {harbingerPlayerName}
              </span>{" "}
              is rolling for portal locations
            </>
          )}
          {isCompleting && !setupComplete && (
            <span className="text-yellow-400">Finalizing portal setup...</span>
          )}
          {setupComplete && (
            <span className="text-green-400">Portals established!</span>
          )}
        </div>
        <div className="mt-2 text-xs opacity-75">
          Your Avatar: <span className="font-fantaisie">{myAvatarName}</span>
        </div>
        <div className="text-xs opacity-60 mt-2">
          {isMyTurn &&
            !allRolled &&
            "Click each die to roll for portal tile locations."}
          {isMyTurn &&
            hasDuplicates &&
            "Duplicate rolls! Click the highlighted dice to reroll."}
          {isMyTurn &&
            allUnique &&
            rollPhase !== "complete" &&
            "All unique! Click Confirm to set portals."}
          {isMyTurn && rollPhase === "complete" && "Portals confirmed!"}
          {!isMyTurn &&
            currentRoller &&
            `Watching ${harbingerPlayerName} roll...`}
          {!currentRoller && !setupComplete && "Waiting for next roller..."}
        </div>
      </div>

      {/* 3D Canvas for dice rolling */}
      <div className="bg-black/30 rounded-xl ring-1 ring-white/10 mb-6 h-[42vh] min-h-[240px] sm:h-[300px]">
        <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />

          {/* Three green dice in a row */}
          {[0, 1, 2].map((index) => {
            const xPos = (index - 1) * 2.5; // -2.5, 0, 2.5
            const roll = rolls[index] ?? null;
            const isDuplicate = duplicateIndices.includes(index);
            const canRoll = isMyTurn && (roll === null || isDuplicate);

            return (
              <D20Dice
                key={index}
                playerName={`Die ${index + 1}`}
                player={currentRoller ?? "p1"}
                position={[xPos, 0, 0]}
                roll={roll}
                isRolling={roll !== null}
                customColor={PORTAL_DICE_COLOR}
                isDuplicate={isDuplicate && diceComplete[index]}
                onRoll={canRoll ? () => handleRollDie(index) : undefined}
                onRollComplete={() => handleDiceComplete(index)}
              />
            );
          })}
        </Canvas>
      </div>

      {/* Status display */}
      <div className="space-y-4">
        {/* Roll results */}
        <div className="flex justify-center items-center gap-4 text-sm">
          {[0, 1, 2].map((index) => {
            const roll = rolls[index];
            const isDuplicate = duplicateIndices.includes(index);
            return (
              <div
                key={index}
                className={`flex items-center gap-2 px-3 py-1 rounded ${
                  isDuplicate
                    ? "bg-yellow-500/20 ring-1 ring-yellow-500"
                    : roll !== undefined
                    ? "bg-green-500/20"
                    : "bg-zinc-700/50"
                }`}
              >
                <span className="text-xs opacity-70">Die {index + 1}:</span>
                <span className="font-fantaisie text-lg">
                  {roll !== undefined ? roll : "—"}
                </span>
                {isDuplicate && (
                  <span className="text-xs text-yellow-400">(reroll)</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Portal tile preview */}
        {allUnique && (
          <div className="text-center text-sm">
            <span className="text-green-400">Portal Tiles: </span>
            <span className="font-fantaisie">
              {rolls.sort((a, b) => a - b).join(", ")}
            </span>
          </div>
        )}

        {/* Confirm button - shown when all dice are unique and it's my turn */}
        {isMyTurn && allUnique && rollPhase !== "complete" && (
          <div className="flex justify-center mt-4">
            <button
              onClick={handleConfirmPortals}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg transition-colors shadow-lg"
            >
              Confirm Portal Locations
            </button>
          </div>
        )}

        {/* Instructions */}
        {isMyTurn && !allRolled && (
          <div className="text-center text-sm opacity-70">
            Click each die to determine your portal locations (tiles 1-20)
          </div>
        )}

        {/* Waiting message for opponent */}
        {!isMyTurn && currentRoller && (
          <div className="text-center text-sm opacity-70">
            {harbingerPlayerName} is setting up their portals...
          </div>
        )}

        {/* Completion messages */}
        {myPortalState?.rollPhase === "complete" && !setupComplete && (
          <div className="text-center text-sm text-green-400">
            Your portals are set at tiles:{" "}
            <span className="font-fantaisie">
              {myPortalState.tileNumbers.join(", ")}
            </span>
          </div>
        )}

        {setupComplete && (
          <div className="text-center text-sm text-green-400 font-semibold">
            All portals established! Starting game...
          </div>
        )}
      </div>
    </div>
  );
}
