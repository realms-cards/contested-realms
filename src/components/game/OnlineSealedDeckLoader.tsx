"use client";

import { useState, useEffect, useCallback } from "react";
import { useOnline } from "@/app/online/online-context";
import { RcButton } from "@/components/ui/rc-button";
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
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [waitingForMe, setWaitingForMe] = useState(false);

  const loadSealedDecks = useCallback(async () => {
    if (!match?.playerDecks || !me) return;

    setLoading(true);
    setDeckError("");
    setCompleted(false);
    setWaitingForOpponent(false);
    setWaitingForMe(false);

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
      const deckSubmissions = Array.isArray(match.deckSubmissions) ? match.deckSubmissions : [];
      const meSubmitted = me ? deckSubmissions.includes(me.id) : false;

      if (!myDeckData || !allPlayerDecksReady) {
        setWaitingForMe(!myDeckData && !meSubmitted);
        setWaitingForOpponent(!allPlayerDecksReady && meSubmitted);
        setLoading(false);
        return;
      }

      // Expand condensed tournament deck format if needed
      const expandDeckIfNeeded = async (rawDeck: unknown) => {
        if (!Array.isArray(rawDeck) || rawDeck.length === 0) return rawDeck;
        const firstCard = rawDeck[0] as Record<string, unknown>;
        const isCondensedFormat = 'quantity' in firstCard && !('type' in firstCard);
        
        if (!isCondensedFormat) return rawDeck;
        
        console.debug("[Sealed] Expanding condensed tournament deck format");
        const cardIds = Array.from(
          new Set(
            (rawDeck as Array<{ cardId: string; quantity: number }>)
              .map(entry => Number(entry.cardId))
              .filter(n => Number.isFinite(n) && n > 0)
          )
        );
        
        if (cardIds.length === 0) return rawDeck;
        
        const resMeta = await fetch(`/api/cards/by-id?ids=${encodeURIComponent(cardIds.join(","))}`);
        if (!resMeta.ok) return rawDeck;
        
        const metas = await resMeta.json() as Array<{
          cardId: number;
          name: string;
          slug: string;
          setName: string;
          type?: string | null;
        }>;
        
        const byId = new Map(metas.map(m => [m.cardId, m]));
        const expandedDeck: Array<Record<string, unknown>> = [];
        
        for (const entry of rawDeck as Array<{ cardId: string; quantity: number }>) {
          const idNum = Number(entry.cardId);
          const meta = byId.get(idNum);
          if (!meta) continue;
          const quantity = Math.max(1, Number(entry.quantity) || 0);
          for (let i = 0; i < quantity; i++) {
            expandedDeck.push({
              id: String(idNum),
              cardId: idNum,
              name: meta.name,
              slug: meta.slug,
              set: meta.setName,
              type: meta.type || "",
            });
          }
        }
        
        console.debug("[Sealed] Expanded deck to", expandedDeck.length, "cards");
        return expandedDeck;
      };

      // Load my deck
      tStep = mark("pre my load", tStep);
      const myExpandedDeck = await expandDeckIfNeeded(myDeckData);
      const mySuccess = await loadSealedDeckFor(
        myPlayerKey as "p1" | "p2",
        myExpandedDeck,
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
        const expandedPlayerDeck = await expandDeckIfNeeded(playerDeckData);
        const ok = await loadSealedDeckFor(
          playerKey as "p1" | "p2",
          expandedPlayerDeck,
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
    const handler = (msg: CustomMessage) => {
      if (!msg || msg.type !== "deckAccepted") return;
      const msgMatchId =
        typeof (msg as { matchId?: unknown }).matchId === "string"
          ? ((msg as { matchId?: string }).matchId as string)
          : typeof (msg as { match?: unknown }).match === "string"
            ? ((msg as { match?: string }).match as string)
            : null;
      if (match?.id && msgMatchId && msgMatchId !== match.id) return;
      try {
        console.debug("[Sealed] deckAccepted <=", msg);
      } catch {}
      if (completed || loading) return;
      void loadSealedDecks();
    };

    let off: (() => void) | undefined;
    try {
      off = transport?.on?.("message", handler) as (() => void) | undefined;
    } catch {}

    if (autoStart && match && me && !initiated) {
      setInitiated(true);
      void loadSealedDecks();
    }

    return () => {
      try {
        if (typeof off === "function") off();
      } catch {}
    };
  }, [
    autoStart,
    match,
    me,
    initiated,
    loadSealedDecks,
    transport,
    loading,
    completed,
  ]);

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
    <div className="mx-auto w-full max-w-2xl rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 text-rc-fg shadow-rc-panel">
      <div className="text-center">
        <h2 className="m-0 mb-4 font-rc-display text-[28px] leading-none text-rc-fg-strong">Loading Sealed Decks</h2>

        <div className="space-y-4">
          <div className="font-rc-sans text-sm text-rc-fg-muted">
            <div className="rc-eyebrow mb-2">Players:</div>
            <div className="font-rc-mono font-medium text-rc-fg-strong">
              {Object.values(playerNames).join(", ")}
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 font-rc-sans text-sm text-rc-accent-link">
              <div className="w-6 h-6 border-2 border-rc-accent/30 border-t-rc-accent rounded-full animate-spin" />
              Loading sealed decks...
            </div>
          )}

          {!loading && !deckError && waitingForMe && (
            <div className="flex items-center justify-center gap-2 font-rc-sans text-sm text-rc-fg-muted">
              <div className="w-4 h-4 border-2 border-rc-line/20 border-t-rc-fg-muted rounded-full animate-spin" />
              Waiting for your sealed deck submission to register...
            </div>
          )}

          {!loading && !deckError && waitingForOpponent && (
            <div className="flex items-center justify-center gap-2 font-rc-sans text-sm text-rc-fg-muted">
              <div className="w-4 h-4 border-2 border-rc-line/20 border-t-rc-fg-muted rounded-full animate-spin" />
              Waiting for other players to submit their sealed decks...
            </div>
          )}

          {deckError && (
            <div className="rc-alert" data-tone="danger">
              Error: {deckError}
              <RcButton
                variant="outline"
                size="sm"
                onClick={loadSealedDecks}
                className="ml-3"
                disabled={loading}
              >
                Retry
              </RcButton>
            </div>
          )}

          {!loading && !deckError && completed && (
            <div className="font-rc-sans font-medium text-rc-success">
              ✓ Sealed decks loaded successfully!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
