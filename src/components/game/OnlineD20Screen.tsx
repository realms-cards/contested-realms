"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import D20Dice from "@/lib/game/components/D20Dice";
import { useGameStore } from "@/lib/game/store";
import type { PlayerKey } from "@/lib/game/store";

interface OnlineD20ScreenProps {
  myPlayerKey: PlayerKey;
  playerNames: { p1: string; p2: string };
  onRollingComplete: () => void;
}

// Constants for retry/resync timing (exponential backoff)
const D20_RETRY_BASE_MS = 1500; // Initial retry delay 1.5s
const D20_RETRY_MAX_MS = 8000; // Max retry delay 8s
const D20_RESYNC_TIMEOUT_MS = 15000; // Request resync if waiting >15s for opponent
const D20_MAX_RETRIES = 7; // More retries with exponential backoff

// Calculate exponential backoff with jitter
function getRetryDelay(attempt: number): number {
  // Exponential backoff: 1.5s, 3s, 6s, 8s (capped)
  const exponentialDelay = Math.min(
    D20_RETRY_BASE_MS * Math.pow(2, attempt),
    D20_RETRY_MAX_MS
  );
  // Add jitter (±20%) to prevent thundering herd
  const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(exponentialDelay + jitter);
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
  const d20PendingRoll = useGameStore((s) => s.d20PendingRoll);
  const retryD20Roll = useGameStore((s) => s.retryD20Roll);
  const clearD20Pending = useGameStore((s) => s.clearD20Pending);
  const transport = useGameStore((s) => s.transport);

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

  // Use typeof check to ensure both are actual numbers (catches null and undefined)
  const bothRolled =
    typeof myRoll === "number" && typeof opponentRoll === "number";
  const canChoose = setupWinner === myPlayerKey;
  const isTie =
    bothRolled &&
    typeof d20Rolls.p1 === "number" &&
    typeof d20Rolls.p2 === "number" &&
    d20Rolls.p1 === d20Rolls.p2;

  // Track when both dice have completed their roll animations
  const [myDiceComplete, setMyDiceComplete] = useState(false);
  const [opponentDiceComplete, setOpponentDiceComplete] = useState(false);
  const bothDiceComplete = myDiceComplete && opponentDiceComplete;

  // Track when choice was made and add delay to show the selection
  const [choiceMade, setChoiceMade] = useState(false);

  // Track if we've initiated a roll to prevent double-clicking
  // This is a local guard that persists even if store state resets
  const hasInitiatedRollRef = useRef(false);

  // Track retry state for UI feedback
  const [retryCount, setRetryCount] = useState(0);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const waitStartRef = useRef<number | null>(null);

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
      setRetryCount(0);
      setWaitingForOpponent(false);
      waitStartRef.current = null;
    }
  }, [myRoll, opponentRoll]);

  // Retry logic: exponential backoff if we have a pending roll and haven't received acknowledgment
  useEffect(() => {
    if (!d20PendingRoll) {
      // No pending roll, clear retry state
      if (retryCount > 0) setRetryCount(0);
      return;
    }

    if (retryCount >= D20_MAX_RETRIES) {
      console.warn("[D20] Max retries reached, requesting resync");
      // Request resync via transport
      if (
        transport &&
        typeof (transport as { resync?: () => void }).resync === "function"
      ) {
        (transport as { resync: () => void }).resync();
      }
      return;
    }

    // Schedule next retry with exponential backoff
    const delay = getRetryDelay(retryCount);
    console.log(
      `[D20] Scheduling retry ${
        retryCount + 1
      }/${D20_MAX_RETRIES} in ${delay}ms`
    );

    const retryTimeout = setTimeout(() => {
      const didRetry = retryD20Roll();
      if (didRetry) {
        setRetryCount((c) => c + 1);
        console.log(
          `[D20] Retry attempt ${retryCount + 1}/${D20_MAX_RETRIES} sent`
        );
      }
    }, delay);

    return () => clearTimeout(retryTimeout);
  }, [d20PendingRoll, retryCount, retryD20Roll, transport]);

  // Resync trigger: if we've been waiting for opponent too long, request resync
  useEffect(() => {
    // Start waiting timer when we've rolled but opponent hasn't
    if (myRoll !== null && opponentRoll === null && !waitingForOpponent) {
      setWaitingForOpponent(true);
      waitStartRef.current = Date.now();
    }

    // Clear waiting state when opponent rolls
    if (opponentRoll !== null && waitingForOpponent) {
      setWaitingForOpponent(false);
      waitStartRef.current = null;
    }

    // Set up resync timeout
    if (!waitingForOpponent || !waitStartRef.current) return;

    const resyncTimeout = setTimeout(() => {
      console.warn("[D20] Waited too long for opponent, requesting resync");
      if (
        transport &&
        typeof (transport as { resync?: () => void }).resync === "function"
      ) {
        (transport as { resync: () => void }).resync();
      }
    }, D20_RESYNC_TIMEOUT_MS);

    return () => clearTimeout(resyncTimeout);
  }, [myRoll, opponentRoll, waitingForOpponent, transport]);

  // Clear pending roll when opponent's roll arrives (means server acknowledged ours)
  useEffect(() => {
    if (d20PendingRoll && opponentRoll !== null) {
      // Both rolls are in, clear pending state
      clearD20Pending();
    }
  }, [d20PendingRoll, opponentRoll, clearD20Pending]);

  // Listen for D20 acknowledgment from server
  useEffect(() => {
    if (!transport) return;

    const unsubscribe = transport.on("d20Ack", (payload) => {
      console.log("[D20] Received server acknowledgment:", payload);
      // If the ack is for our roll, clear pending state
      if (
        d20PendingRoll &&
        payload.seat === myPlayerKey &&
        payload.roll === d20PendingRoll.roll
      ) {
        console.log("[D20] Clearing pending state after server ack");
        clearD20Pending();
        setRetryCount(0);
      }
    });

    return unsubscribe;
  }, [transport, d20PendingRoll, myPlayerKey, clearD20Pending]);

  // Listen for server errors and handle "server_not_ready" by triggering retry
  useEffect(() => {
    if (!transport) return;

    const unsubscribe = transport.on("error", (payload) => {
      const errorPayload = payload as {
        code?: string;
        message?: string;
        retryable?: boolean;
      };
      if (errorPayload.code === "server_not_ready" && d20PendingRoll) {
        console.log("[D20] Server not ready, will retry automatically");
        // Force a retry by incrementing retry count if we haven't exceeded max
        if (retryCount < D20_MAX_RETRIES) {
          // Small delay before retry to give server time to warm up
          setTimeout(() => {
            setRetryCount((c) => c + 1);
          }, 500);
        }
      }
    });

    return unsubscribe;
  }, [transport, d20PendingRoll, retryCount]);

  const handleRoll = useCallback(() => {
    // Guard against double-clicking: check both local ref AND store roll value
    // The ref persists even if game state resets mid-flow
    if (myRoll == null && !hasInitiatedRollRef.current) {
      hasInitiatedRollRef.current = true;
      rollD20(myPlayerKey);
    }
  }, [myRoll, rollD20, myPlayerKey]);

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
            isRolling={typeof d20Rolls.p1 === "number"}
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
            isRolling={typeof d20Rolls.p2 === "number"}
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
            {/* Show retry indicator if we're retrying our roll */}
            {retryCount > 0 && d20PendingRoll && (
              <div className="text-yellow-500 text-xs mt-1">
                Retrying roll... ({retryCount}/{D20_MAX_RETRIES})
              </div>
            )}
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
