"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSound } from "@/lib/contexts/SoundContext";
import { useGameStore } from "@/lib/game/store";

type TurnStartOverlayProps = {
  /** For online play: pass true when game board becomes visible (after mulligan + seer + portal phases) */
  gameStarted?: boolean;
};

/**
 * Glorious turn-start overlay that announces "Turn X" and "Draw a card"
 * with a fade-in/fade-out animation and the turn gong sound.
 * Displayed for 2 seconds when the turn changes to the local player.
 */
export default function TurnStartOverlay({ gameStarted }: TurnStartOverlayProps = {}) {
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const turn = useGameStore((s) => s.turn);
  const phase = useGameStore((s) => s.phase);
  const hasDrawnThisTurn = useGameStore((s) => s.hasDrawnThisTurn);
  const actorKey = useGameStore((s) => s.actorKey);
  const setTurnOverlayActive = useGameStore((s) => s.setTurnOverlayActive);
  const { playTurnGong } = useSound();

  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState<"in" | "out" | null>(null);
  const [displayTurn, setDisplayTurn] = useState(1);
  const [showDrawReminder, setShowDrawReminder] = useState(false);
  const mountedRef = useRef(false);
  const prevPhaseRef = useRef<string | null>(null);
  const prevPlayerRef = useRef<number | null>(null);
  const prevGameStartedRef = useRef<boolean | undefined>(undefined);
  const shownForTurnRef = useRef<number>(0); // Track which turn we've shown for
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip initial mount to prevent triggering on page load/reload
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevPhaseRef.current = phase;
      prevPlayerRef.current = currentPlayer;
      prevGameStartedRef.current = gameStarted;
      return;
    }

    // Only show when it's my turn
    const isMyTurn =
      !actorKey ||
      (actorKey === "p1" && currentPlayer === 1) ||
      (actorKey === "p2" && currentPlayer === 2);

    // Don't show if we've already shown for this turn
    const alreadyShownForThisTurn = shownForTurnRef.current >= turn;

    // For turn 1: trigger when gameStarted prop changes to true (mulligan/seer/portal complete)
    const turn1JustStarted =
      turn === 1 &&
      gameStarted === true &&
      prevGameStartedRef.current !== true &&
      !alreadyShownForThisTurn;

    // For subsequent turns: trigger when currentPlayer changes AND we're in Start phase
    const turnChanged =
      turn > 1 &&
      prevPlayerRef.current !== null &&
      prevPlayerRef.current !== currentPlayer &&
      phase === "Start" &&
      !alreadyShownForThisTurn;

    const shouldShow =
      isMyTurn && (turn1JustStarted || turnChanged);

    if (shouldShow) {
      shownForTurnRef.current = turn;
      setDisplayTurn(turn);
      // First turn: first player does NOT draw, so no reminder
      // Subsequent turns: show draw reminder
      setShowDrawReminder(turn > 1);
      setVisible(true);
      setFading("in");
      setTurnOverlayActive(true);

      try {
        playTurnGong();
      } catch {
        // Sound may fail silently
      }

      // Clear any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Start fade-out after 1.5s, then hide at 2s
      timerRef.current = setTimeout(() => {
        setFading("out");
        timerRef.current = setTimeout(() => {
          setVisible(false);
          setFading(null);
          setTurnOverlayActive(false);
        }, 500);
      }, 1500);
    }

    prevPhaseRef.current = phase;
    prevPlayerRef.current = currentPlayer;
    prevGameStartedRef.current = gameStarted;

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [currentPlayer, turn, phase, actorKey, gameStarted, playTurnGong, setTurnOverlayActive]);

  // Hide immediately once the player draws their card
  useEffect(() => {
    if (!hasDrawnThisTurn || !visible) return;
    setFading("out");
    const t = setTimeout(() => {
      setVisible(false);
      setFading(null);
      setTurnOverlayActive(false);
    }, 300);
    return () => clearTimeout(t);
  }, [hasDrawnThisTurn, visible, setTurnOverlayActive]);

  // Dismiss overlay on click
  const handleDismiss = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setFading("out");
    setTimeout(() => {
      setVisible(false);
      setFading(null);
      setTurnOverlayActive(false);
    }, 300);
  };

  if (!visible || typeof window === "undefined") return null;

  const content = (
    <div
      className="fixed inset-0 z-[9998] cursor-pointer flex items-center justify-center"
      onClick={handleDismiss}
      style={{
        opacity: fading === "in" ? 1 : fading === "out" ? 0 : 1,
        transition: "opacity 0.4s ease-in-out",
      }}
    >
      {/* Subtle dark vignette behind text */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 50%, transparent 80%)",
        }}
      />

      {/* Main content */}
      <div className="relative flex flex-col items-center gap-2">
        {/* Turn number */}
        <div
          className="text-6xl sm:text-7xl md:text-8xl font-bold tracking-wider"
          style={{
            color: "#f5f0e1",
            textShadow:
              "0 0 40px rgba(212,175,55,0.8), 0 0 80px rgba(212,175,55,0.4), 0 2px 4px rgba(0,0,0,0.8)",
            fontFamily: "serif",
            transform: fading === "in" ? "scale(1)" : "scale(0.95)",
            transition: "transform 0.4s ease-out",
          }}
        >
          Turn {displayTurn}
        </div>

        {/* Draw reminder */}
        {showDrawReminder && (
          <div
            className="text-xl sm:text-2xl md:text-3xl tracking-wide"
            style={{
              color: "#d4af37",
              textShadow:
                "0 0 20px rgba(212,175,55,0.6), 0 1px 3px rgba(0,0,0,0.8)",
              fontFamily: "serif",
              fontStyle: "italic",
              opacity: fading === "in" ? 1 : 0,
              transform:
                fading === "in" ? "translateY(0)" : "translateY(8px)",
              transition: "opacity 0.5s ease-out 0.2s, transform 0.5s ease-out 0.2s",
            }}
          >
            Draw a card
          </div>
        )}

        {/* Decorative line */}
        <div
          className="mt-1"
          style={{
            width: fading === "in" ? "200px" : "0px",
            height: "2px",
            background:
              "linear-gradient(90deg, transparent, rgba(212,175,55,0.8), transparent)",
            transition: "width 0.6s ease-out 0.1s",
          }}
        />
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
