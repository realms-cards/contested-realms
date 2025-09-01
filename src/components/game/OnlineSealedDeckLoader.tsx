"use client";

import { useState, useEffect, useCallback } from "react";
import { useOnline } from "@/app/online/layout";
import type { MatchInfo } from "@/lib/net/protocol";

interface OnlineSealedDeckLoaderProps {
  match: MatchInfo;
  myPlayerKey: "p1" | "p2";
  playerNames: { p1: string; p2: string };
  onPrepareComplete: () => void;
}

export default function OnlineSealedDeckLoader({
  match,
  myPlayerKey,
  playerNames,
  onPrepareComplete,
}: OnlineSealedDeckLoaderProps) {
  const { me } = useOnline();
  const [deckError, setDeckError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const loadSealedDecks = useCallback(async () => {
    if (!match?.playerDecks || !me) return;
    
    setLoading(true);
    setDeckError("");
    
    try {
      const { loadSealedDeckFor } = await import("@/lib/game/deckLoader");
      
      // Find my player's deck data and opponent's deck data
      const myDeckData = match.playerDecks[me.id];
      const opponentId = match.players.find(p => p.id !== me.id)?.id;
      const opponentDeckData = opponentId ? match.playerDecks[opponentId] : null;
      
      if (!myDeckData) {
        setDeckError("Your sealed deck not found");
        return;
      }
      
      if (!opponentDeckData) {
        setDeckError("Opponent's sealed deck not found");
        return;
      }
      
      // Load my deck
      const mySuccess = await loadSealedDeckFor(myPlayerKey, myDeckData, setDeckError);
      if (!mySuccess) return;
      
      // Load opponent's deck
      const opponentPlayerKey = myPlayerKey === "p1" ? "p2" : "p1";
      const opponentSuccess = await loadSealedDeckFor(opponentPlayerKey, opponentDeckData, setDeckError);
      if (!opponentSuccess) return;
      
      // Both decks loaded successfully
      onPrepareComplete();
      
    } catch (error) {
      console.error("Error loading sealed decks:", error);
      setDeckError("Error loading sealed decks");
    } finally {
      setLoading(false);
    }
  }, [match, me, myPlayerKey, onPrepareComplete]);

  useEffect(() => {
    if (!match || !me) return;
    // Auto-load sealed decks when component mounts
    loadSealedDecks();
  }, [match, me, loadSealedDecks]);

  return (
    <div className="w-full max-w-2xl mx-auto bg-slate-900/95 rounded-xl p-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Loading Sealed Decks</h2>
        
        <div className="space-y-4">
          <div className="text-slate-300">
            <div className="mb-2">Players:</div>
            <div className="text-white font-medium">
              {playerNames.p1} vs {playerNames.p2}
            </div>
          </div>
          
          {loading && (
            <div className="flex items-center justify-center gap-2 text-blue-400">
              <div className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin"></div>
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
          
          {!loading && !deckError && (
            <div className="text-green-400 font-medium">
              ✓ Sealed decks loaded successfully!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}