"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useOnline } from "@/app/online/online-context";
import type { MatchInfo } from "@/lib/net/protocol";

interface OnlineDraftDeckLoaderProps {
  match: MatchInfo;
  myPlayerKey: string;
  playerNames: Record<string, string>;
  onPrepareComplete: () => void;
  /** If true, begin loading immediately once mounted and prerequisites are met */
  autoStart?: boolean;
}

export default function OnlineDraftDeckLoader({
  match,
  myPlayerKey,
  playerNames,
  onPrepareComplete,
  autoStart,
}: OnlineDraftDeckLoaderProps) {
  const { me } = useOnline();
  const [deckError, setDeckError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [waitingForMe, setWaitingForMe] = useState(false);
  const initiatedRef = useRef(false);

  const loadDraftDecks = useCallback(async () => {
    if (!match?.playerDecks || !me) return;

    setLoading(true);
    setDeckError("");
    setWaitingForOpponent(false);
    setWaitingForMe(false);
    setCompleted(false);

    try {
      const { loadSealedDeckFor } = await import("@/lib/game/deckLoader");

      // Find my player's deck data and all other players' deck data
      const myDeckData = match.playerDecks?.[me.id];
      const otherPlayers = match.players.filter((p) => p.id !== me.id);
      const allPlayerDecksReady = otherPlayers.every(
        (p) => match.playerDecks?.[p.id]
      );

      // Determine submission states as reported by server
      const meSubmitted = !!match.deckSubmissions?.includes(me.id);
      const allOthersSubmitted = otherPlayers.every((p) =>
        match.deckSubmissions?.includes(p.id)
      );

      // Reflect accurate waiting state for multi-player scenario
      if (!myDeckData || !allPlayerDecksReady) {
        setWaitingForMe(!myDeckData && !meSubmitted);
        setWaitingForOpponent(!allPlayerDecksReady && !allOthersSubmitted);
        return;
      }

      // Load my deck
      const mySuccess = await loadSealedDeckFor(
        myPlayerKey as "p1" | "p2",
        myDeckData,
        setDeckError
      );
      if (!mySuccess) return;

      // Load all other players' decks
      const loadPromises = otherPlayers.map(async (player) => {
        const playerKey =
          Object.keys(playerNames).find(
            (key) => playerNames[key] === player.displayName
          ) || `p${match.players.findIndex((p) => p.id === player.id) + 1}`;
        const playerDeckData = match.playerDecks?.[player.id];
        return loadSealedDeckFor(
          playerKey as "p1" | "p2",
          playerDeckData,
          setDeckError
        );
      });

      const allResults = await Promise.all(loadPromises);
      if (!allResults.every(Boolean)) return; // If any deck failed to load

      // All decks loaded successfully
      setCompleted(true);
      onPrepareComplete();
    } catch (error) {
      console.error("Error loading draft decks:", error);
      setDeckError("Error loading draft decks");
    } finally {
      setLoading(false);
    }
  }, [match, me, myPlayerKey, onPrepareComplete, playerNames]);

  useEffect(() => {
    // Only auto-start if explicitly requested by parent and not already initiated
    if (!autoStart) return;
    if (!match || !me) return;
    if (initiatedRef.current) return;
    initiatedRef.current = true;
    void loadDraftDecks();
  }, [autoStart, match, me, loadDraftDecks]);

  // If we are auto-starting and were waiting for opponent, try again
  useEffect(() => {
    if (!autoStart) return;
    if (!initiatedRef.current) return;
    if (completed) return;
    if (loading) return;
    if (!match || !me || !match.playerDecks) return;
    const myDeckData = match.playerDecks[me.id];
    const opponentId = match.players.find((p) => p.id !== me.id)?.id;
    const opponentDeckData = opponentId ? match.playerDecks[opponentId] : null;
    if (myDeckData && opponentDeckData) {
      void loadDraftDecks();
    }
  }, [
    autoStart,
    completed,
    loading,
    match?.playerDecks,
    match,
    me,
    loadDraftDecks,
  ]);

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/95 rounded-xl p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-4">
          Loading Draft Decks
        </h2>

        <div className="space-y-4">
          <div className="text-slate-300">
            <div className="mb-2">Players:</div>
            <div className="text-white font-medium">
              {Object.values(playerNames).join(", ")}
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-blue-400">
              <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              Loading draft decks...
            </div>
          )}

          {deckError && (
            <div className="bg-red-900/50 border border-red-600/50 rounded-lg p-3 text-red-200">
              Error: {deckError}
              <button
                onClick={loadDraftDecks}
                className="ml-3 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                disabled={loading}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !deckError && waitingForMe && (
            <div className="flex items-center justify-center gap-2 text-slate-300">
              <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
              Waiting for your draft deck submission to be registered...
            </div>
          )}

          {!loading && !deckError && waitingForOpponent && (
            <div className="flex items-center justify-center gap-2 text-slate-300">
              <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
              Waiting for other players to submit their draft decks...
            </div>
          )}

          {!loading && !deckError && completed && (
            <div className="text-green-400 font-medium">
              ✓ Draft decks loaded successfully!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
