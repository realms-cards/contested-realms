"use client";

import { useState, useEffect, useCallback } from "react";
import { useOnline } from "@/app/online/online-context";
import type { MatchInfo } from "@/lib/net/protocol";
import type { CustomMessage } from "@/lib/net/transport";

interface OnlineSealedDeckLoaderProps {
  match: MatchInfo;
  myPlayerKey: string;
  playerNames: Record<string, string>;
  onPrepareComplete: () => void;
  /** If true, begin loading immediately once mounted and prerequisites are met */
  autoStart?: boolean;
}

export default function OnlineSealedDeckLoader({
  match,
  myPlayerKey,
  playerNames,
  onPrepareComplete,
  autoStart,
}: OnlineSealedDeckLoaderProps) {
  const { me, transport } = useOnline();
  const [deckError, setDeckError] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [initiated, setInitiated] = useState(false);
  const [completed, setCompleted] = useState(false);

  const loadSealedDecks = useCallback(async () => {
    if (!match?.playerDecks || !me) return;

    setLoading(true);
    setDeckError("");
    setCompleted(false);

    try {
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      const mark = (label: string, tPrev?: number) => {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const dt = typeof tPrev === 'number' ? now - tPrev : now - t0;
        try { console.debug(`[Sealed][perf] ${label}: +${dt.toFixed(1)}ms`); } catch {}
        return now;
      };
      const { loadSealedDeckFor } = await import("@/lib/game/deckLoader");
      let tStep = mark("import deckLoader");

      // Find my player's deck data and all other players' deck data
      const myDeckData = match.playerDecks?.[me.id];
      const otherPlayers = match.players.filter(p => p.id !== me.id);
      const allPlayerDecksReady = otherPlayers.every(p => match.playerDecks?.[p.id]);

      if (!myDeckData || !allPlayerDecksReady) {
        setLoading(false);
        return;
      }

      // Load my deck
      tStep = mark("pre my load", tStep);
      const mySuccess = await loadSealedDeckFor(
        myPlayerKey as "p1" | "p2",
        myDeckData,
        setDeckError
      );
      tStep = mark("after my load", tStep);
      if (!mySuccess) {
        setLoading(false);
        return;
      }
      
      // Load all other players' decks
      const loadPromises = otherPlayers.map(async (player) => {
        const playerKey =
          Object.keys(playerNames).find(
            (key) => playerNames[key] === player.displayName
          ) || `p${match.players.findIndex((p) => p.id === player.id) + 1}`;
        const playerDeckData = match.playerDecks?.[player.id];
        const tStart =
          typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now();
        const ok = await loadSealedDeckFor(
          playerKey as "p1" | "p2",
          playerDeckData,
          setDeckError
        );
        const tEnd =
          typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now();
        try {
          console.debug(
            `[Sealed][perf] load other ${player.displayName}: ${(tEnd - tStart).toFixed(1)}ms`
          );
        } catch {}
        return ok;
      });

      const allResults = await Promise.all(loadPromises);
      tStep = mark("after others load", tStep);
      if (!allResults.every(Boolean)) {
        setLoading(false);
        return;
      }
      
      // All decks loaded successfully
      setCompleted(true);
      onPrepareComplete();
      mark("onPrepareComplete", tStep);
      
    } catch (error) {
      console.error("Error loading sealed decks:", error);
      setDeckError("Error loading sealed decks");
    } finally {
      setLoading(false);
    }
  }, [match, me, myPlayerKey, onPrepareComplete, playerNames]);

  useEffect(() => {
    // Immediate UI flip upon server ack
    const off = transport?.on?.("message", (msg: CustomMessage) => {
      if (!msg || msg.type !== 'deckAccepted') return;
      try { console.debug('[Sealed] deckAccepted <=', msg); } catch {}
      setCompleted(true);
    });
    // Only auto-start if explicitly requested by parent and not already initiated
    if (!autoStart) return;
    if (!match || !me) return;
    if (initiated) return;
    setInitiated(true);
    void loadSealedDecks();
    return () => { try { if (typeof off === 'function') off(); } catch {} };
  }, [autoStart, match, me, initiated, loadSealedDecks, transport]);

  // If we are auto-starting and were waiting for opponent, try again
  useEffect(() => {
    if (!autoStart) return;
    if (!initiated) return;
    if (completed) return;
    if (loading) return;
    if (!match || !me || !match.playerDecks) return;
    const myDeckData = match.playerDecks?.[me.id];
    const opponentId = match.players.find(p => p.id !== me.id)?.id;
    const opponentDeckData = opponentId ? match.playerDecks?.[opponentId] : null;
    if (myDeckData && opponentDeckData) {
      void loadSealedDecks();
    }
  }, [autoStart, initiated, completed, loading, match?.playerDecks, match, me, loadSealedDecks]);

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/95 rounded-xl p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Loading Sealed Decks</h2>
        
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
              Loading sealed decks...
            </div>
          )}
          
          {deckError && (
            <div className="bg-red-900/50 border border-red-600/50 rounded-lg p-3 text-red-200">
              Error: {deckError}
              <button
                onClick={loadSealedDecks}
                className="ml-3 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
                disabled={loading}
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !deckError && completed && (
            <div className="text-green-400 font-medium">
              ✓ Sealed decks loaded successfully!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}