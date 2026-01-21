"use client";

/**
 * MusicGameSync Component
 *
 * Connects the game state to the music player for mood-based track selection.
 * Monitors player health and life states, updating the music player accordingly.
 *
 * Track selection logic:
 * - Critical: Either player has health < 5 or is at death's door
 * - Intense: Recent health change >= 5 (dramatic swings)
 * - Calm: Stable gameplay with little health change
 */

import { useEffect, useRef } from "react";
import { useMusicPlayer } from "@/hooks/useMusicPlayer";
import { useGameStore } from "@/lib/game/store";

interface MusicGameSyncProps {
  /** Which player's perspective we're viewing from (for determining "my" health) */
  myPlayerKey?: "p1" | "p2" | null;
}

export default function MusicGameSync({ myPlayerKey }: MusicGameSyncProps) {
  const [, musicControls] = useMusicPlayer();

  // Get player states from game store (with defaults for when players aren't initialized)
  const p1Life = useGameStore((s) => s.players.p1?.life ?? 20);
  const p2Life = useGameStore((s) => s.players.p2?.life ?? 20);
  const p1LifeState = useGameStore((s) => s.players.p1?.lifeState ?? "alive");
  const p2LifeState = useGameStore((s) => s.players.p2?.lifeState ?? "alive");
  const phase = useGameStore((s) => s.phase);
  const matchEnded = useGameStore((s) => s.matchEnded);

  // Track previous life values to calculate recent health change
  const prevP1LifeRef = useRef(p1Life);
  const prevP2LifeRef = useRef(p2Life);
  const recentHealthChangeRef = useRef(0);
  const hasInitializedRef = useRef(false);

  // Reset to starting track when a new match begins (Setup phase)
  useEffect(() => {
    if (phase === "Setup" && !hasInitializedRef.current) {
      musicControls.resetToStartingTrack();
      hasInitializedRef.current = true;
      prevP1LifeRef.current = 20;
      prevP2LifeRef.current = 20;
      recentHealthChangeRef.current = 0;
    }

    // Reset the flag when match ends so next match can initialize
    if (matchEnded) {
      hasInitializedRef.current = false;
    }
  }, [phase, matchEnded, musicControls]);

  // Update music player when health changes
  useEffect(() => {
    // Calculate health changes since last update
    const p1Change = Math.abs(p1Life - prevP1LifeRef.current);
    const p2Change = Math.abs(p2Life - prevP2LifeRef.current);
    const maxChange = Math.max(p1Change, p2Change);

    // Update recent health change (decay over time would be nice but keep simple)
    if (maxChange > 0) {
      recentHealthChangeRef.current = maxChange;
    }

    // Store current values for next comparison
    prevP1LifeRef.current = p1Life;
    prevP2LifeRef.current = p2Life;

    // Determine the "current health" to report (use the viewing player's health, or lowest)
    const currentHealth = myPlayerKey
      ? myPlayerKey === "p1"
        ? p1Life
        : p2Life
      : Math.min(p1Life, p2Life);

    // Check if either player is at death's door
    const isDeathsDoor = p1LifeState === "dd" || p2LifeState === "dd";

    // Update the music player's game state
    musicControls.updateGameState(
      currentHealth,
      isDeathsDoor,
      recentHealthChangeRef.current
    );

    // Decay the recent health change after a delay (so multiple hits count)
    const decayTimer = setTimeout(() => {
      recentHealthChangeRef.current = Math.max(
        0,
        recentHealthChangeRef.current - 2
      );
    }, 5000);

    return () => clearTimeout(decayTimer);
  }, [p1Life, p2Life, p1LifeState, p2LifeState, myPlayerKey, musicControls]);

  // This component doesn't render anything - it just syncs state
  return null;
}
