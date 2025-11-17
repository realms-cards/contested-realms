"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import D20Dice from "@/lib/game/components/D20Dice";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";

interface OnlineD20ScreenProps {
  myPlayerKey: PlayerKey;
  playerNames: { p1: string; p2: string };
  onRollingComplete: () => void;
}

export default function OnlineD20Screen({
  myPlayerKey,
  playerNames,
  onRollingComplete,
}: OnlineD20ScreenProps) {
  const { updateScreenType } = useVideoOverlay();
  const d20Rolls = useGameStore((s) => s.d20Rolls);
  const rollD20 = useGameStore((s) => s.rollD20);
  const setupWinner = useGameStore((s) => s.setupWinner);
  const choosePlayerOrder = useGameStore((s) => s.choosePlayerOrder);
  const phase = useGameStore((s) => s.phase);
  const avatars = useGameStore((s) => s.avatars);

  // Set screen type for video overlay
  useEffect(() => {
    updateScreenType("game");
    return undefined;
  }, [updateScreenType]);

  const myRoll = d20Rolls[myPlayerKey];
  const opponentKey: PlayerKey = myPlayerKey === "p1" ? "p2" : "p1";
  const opponentRoll = d20Rolls[opponentKey];
  const opponentName = playerNames[opponentKey];
  const myAvatarName = avatars[myPlayerKey]?.card?.name || null;
  const opponentAvatarName = avatars[opponentKey]?.card?.name || null;

  // Debug logging for d20 state
  useEffect(() => {
    console.log("[OnlineD20Screen] State update:", {
      myPlayerKey,
      myRoll,
      opponentKey,
      opponentRoll,
      d20Rolls,
      setupWinner,
      phase,
    });
  }, [
    myPlayerKey,
    myRoll,
    opponentKey,
    opponentRoll,
    d20Rolls,
    setupWinner,
    phase,
  ]);

  const bothRolled = myRoll !== null && opponentRoll !== null;
  const canChoose = setupWinner === myPlayerKey;
  const isTie =
    bothRolled &&
    d20Rolls.p1 !== null &&
    d20Rolls.p2 !== null &&
    Number(d20Rolls.p1) === Number(d20Rolls.p2);

  // Track when both dice have completed their roll animations
  const [myDiceComplete, setMyDiceComplete] = useState(false);
  const [opponentDiceComplete, setOpponentDiceComplete] = useState(false);
  const bothDiceComplete = myDiceComplete && opponentDiceComplete;

  // Track when choice was made and add delay to show the selection
  const [choiceMade, setChoiceMade] = useState(false);

  // Monitor for when choice is made (phase changes to Start) and advance both players
  useEffect(() => {
    console.log(
      "useEffect triggered - Phase:",
      phase,
      "SetupWinner:",
      setupWinner,
      "ChoiceMade:",
      choiceMade
    );
    if (phase === "Start" && setupWinner && !choiceMade) {
      console.log(
        "CONDITIONS MET! Setting choiceMade=true and starting 2s timeout"
      );
      setChoiceMade(true);
      // Show choice confirmation for 2 seconds, then advance
      setTimeout(() => {
        console.log("2s timeout complete - calling onRollingComplete");
        onRollingComplete();
      }, 2000);
    }
  }, [phase, setupWinner, choiceMade, onRollingComplete]);

  // Reset dice completion when rolls are reset (for ties)
  useEffect(() => {
    if (myRoll === null) {
      setMyDiceComplete(false);
    }
    if (opponentRoll === null) {
      setOpponentDiceComplete(false);
    }
    // Reset choice state when dice are reset
    if (myRoll === null && opponentRoll === null) {
      setChoiceMade(false);
    }
  }, [myRoll, opponentRoll]);

  const handleRoll = () => {
    if (myRoll === null) {
      rollD20(myPlayerKey);
    }
  };

  const handleMyDiceComplete = () => {
    setMyDiceComplete(true);
  };

  const handleOpponentDiceComplete = () => {
    setOpponentDiceComplete(true);
  };

  const handleChoose = (chosenSeat: "p1" | "p2") => {
    if (canChoose && !choiceMade) {
      // For now, use the existing choosePlayerOrder function
      // chosenSeat "p1" means go first (true), "p2" means go second (false)
      const wantsToGoFirst = chosenSeat === "p1";
      choosePlayerOrder(myPlayerKey, wantsToGoFirst);

      // Don't call onRollingComplete here - let the useEffect handle it when phase changes
    }
  };

  return (
    <div className="w-full max-w-[92vw] sm:max-w-4xl bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-4 sm:p-6">
      <div className="mb-6 text-center">
        <div className="text-base sm:text-lg font-semibold mb-1 font-fantaisie sm:text-xl">
          Roll D20
        </div>
        <div className="text-sm opacity-80">
          Playing as:{" "}
          <span
            className={`font-medium font-fantaisie ${
              myPlayerKey === "p1" ? "bg-blue-500" : "bg-red-500"
            }`}
          >
            {playerNames[myPlayerKey]}
          </span>
        </div>
        {(myAvatarName || opponentAvatarName) && (
          <div className="mt-2 text-xs opacity-75 space-y-0.5">
            {myAvatarName && (
              <div>
                Your Avatar:{" "}
                <span className="font-fantaisie">{myAvatarName}</span>
              </div>
            )}
            {opponentAvatarName && (
              <div>
                Opponent Avatar:{" "}
                <span className="font-fantaisie">{opponentAvatarName}</span>
              </div>
            )}
          </div>
        )}
        <div className="text-xs opacity-60 mt-2">
          Click your die to roll. Highest roll gets to choose player order.
        </div>
      </div>

      {/* 3D Canvas for dice rolling */}
      <div className="bg-black/30 rounded-xl ring-1 ring-white/10 mb-6 h-[42vh] min-h-[240px] sm:h-[300px]">
        <Canvas camera={{ position: [0, 0, 4], fov: 60 }}>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 5, 5]} intensity={0.8} />

          {/* Player 1 die - left side */}
          <D20Dice
            playerName={playerNames.p1}
            player="p1"
            position={[-2, 0, 0]}
            roll={d20Rolls.p1}
            isRolling={d20Rolls.p1 !== null}
            onRoll={myPlayerKey === "p1" ? handleRoll : undefined}
            onRollComplete={
              myPlayerKey === "p1"
                ? handleMyDiceComplete
                : handleOpponentDiceComplete
            }
          />

          {/* Player 2 die - right side */}
          <D20Dice
            playerName={playerNames.p2}
            player="p2"
            position={[2, 0, 0]}
            roll={d20Rolls.p2}
            isRolling={d20Rolls.p2 !== null}
            onRoll={myPlayerKey === "p2" ? handleRoll : undefined}
            onRollComplete={
              myPlayerKey === "p2"
                ? handleMyDiceComplete
                : handleOpponentDiceComplete
            }
          />
        </Canvas>
      </div>

      {/* Status and controls */}
      <div className="space-y-4">
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                myPlayerKey === "p1" ? "bg-blue-500" : "bg-gray-500"
              }`}
            />
            <span>{playerNames.p1}</span>
            <span className="font-fantaisie">{d20Rolls.p1 ?? "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                myPlayerKey === "p2" ? "bg-red-500" : "bg-gray-500"
              }`}
            />
            <span>{playerNames.p2}</span>
            <span className="font-fantaisie">{d20Rolls.p2 ?? "—"}</span>
          </div>
        </div>

        {!bothRolled && (
          <div className="text-center text-sm opacity-70">
            {myRoll === null
              ? "Click your die to roll!"
              : `Waiting for ${opponentName} to roll...`}
          </div>
        )}

        {bothRolled && bothDiceComplete && isTie && (
          <div className="text-center text-sm opacity-70 font-fantaisie text-xl">
            Tied! Rolling again...
          </div>
        )}

        {bothRolled && bothDiceComplete && !setupWinner && !isTie && (
          <div className="text-center text-sm opacity-70 font-fantaisie text-xl">
            Waiting for server to confirm winner…
          </div>
        )}

        {bothRolled && bothDiceComplete && setupWinner && !choiceMade && (
          <div className="text-center space-y-3">
            <div className="text-yellow-400 font-fantaisie text-xl">
              {playerNames[setupWinner]} wins the roll! (rolled{" "}
              {setupWinner === "p1" ? d20Rolls.p1 : d20Rolls.p2})
            </div>

            {canChoose && (
              <>
                <div className="text-sm text-green-400 font-medium">
                  Choose your seat:
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                  <button
                    className="bg-green-600 hover:bg-green-700 rounded px-4 py-2 sm:px-6 text-sm font-medium transition-colors"
                    onClick={() => handleChoose("p1")}
                  >
                    Take Player 1 Seat (Goes First)
                  </button>
                  <button
                    className="bg-blue-600 hover:bg-blue-700 rounded px-4 py-2 sm:px-6 text-sm font-medium transition-colors"
                    onClick={() => handleChoose("p2")}
                  >
                    Take Player 2 Seat (Goes Second)
                  </button>
                </div>
              </>
            )}

            {!canChoose && (
              <div className="text-sm opacity-70">
                Waiting for {playerNames[setupWinner]} to choose their seat...
              </div>
            )}
          </div>
        )}
        {choiceMade && setupWinner && (
          <div className="text-center text-sm text-green-400">
            {playerNames[setupWinner]} chose{" "}
            {phase === "Start" ? "their seat" : "to make a choice"}. Starting
            game...
          </div>
        )}
      </div>
    </div>
  );
}
