"use client";

import { useState, useEffect, useRef } from "react";
import { useOnline } from "@/app/online/online-context";
import type { MatchInfo } from "@/lib/net/protocol";

interface Card {
  id: string;
  name: string;
  set: string;
  slug: string;
  type?: string | null;
  cost?: number | null;
  rarity: string;
}

interface SealedDeckBuilderProps {
  match: MatchInfo;
  myPlayerKey: string;
  playerNames: { p1: string; p2: string };
  onDeckSubmitted: () => void;
}

interface PackType {
  id: string;
  set: string;
  cards: Card[];
  opened: boolean;
}

export default function SealedDeckBuilder({
  match,
  onDeckSubmitted,
}: SealedDeckBuilderProps) {
  const { transport, me } = useOnline();
  const [packs, setPacks] = useState<PackType[]>([]);
  const [cardPool, setCardPool] = useState<Card[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [deckSubmitted, setDeckSubmitted] = useState(false);
  const openedByIdRef = useRef<Map<string, boolean>>(new Map());

  // Calculate time remaining
  useEffect(() => {
    if (!match?.sealedConfig?.constructionStartTime || !match?.sealedConfig?.timeLimit) return;

    const updateTimer = () => {
      const now = Date.now();
      const elapsed = now - (match.sealedConfig?.constructionStartTime || 0);
      const totalTime = (match.sealedConfig?.timeLimit || 40) * 60 * 1000; // Convert minutes to ms
      const remaining = Math.max(0, totalTime - elapsed);
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [match?.sealedConfig]);

  // Keep a ref of which packs are opened to preserve UI state on server updates
  useEffect(() => {
    openedByIdRef.current = new Map(packs.map((p) => [p.id, p.opened]));
  }, [packs]);

  // Load server-provided packs if available; otherwise fallback to local generation
  useEffect(() => {
    const sealedConfig = match?.sealedConfig;
    if (!sealedConfig) return;

    const myId = me?.id;
    const sealedPacks = match?.sealedPacks;

    if (myId && sealedPacks && sealedPacks[myId] && sealedPacks[myId].length) {
      // Preserve opened state if we already have some packs shown
      const openedById = openedByIdRef.current;
      const serverPacks = sealedPacks[myId].map((p) => ({
        id: p.id,
        set: p.set,
        cards: p.cards as Card[],
        opened: openedById.get(p.id) ?? false,
      }));
      setPacks(serverPacks);
      // Light debug
      if (typeof window !== 'undefined') {
        console.debug(`[SealedBuilder] Using server-provided packs for ${myId}:`, serverPacks.map(p => ({ id: p.id, set: p.set, count: p.cards.length })));
      }
      return; // Don't fall back if server packs exist
    }

    // Fallback: local mock generation (legacy)
    const { packCount, setMix, packCounts } = sealedConfig as typeof sealedConfig & { packCounts?: Record<string, number> };
    const generatedPacks: PackType[] = [];

    if (packCounts && Object.keys(packCounts).length > 0) {
      const sets: string[] = [];
      for (const [setName, count] of Object.entries(packCounts)) {
        const c = Math.max(0, Number(count) || 0);
        for (let i = 0; i < c; i++) sets.push(setName);
      }
      for (let i = sets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sets[i], sets[j]] = [sets[j], sets[i]];
      }
      sets.forEach((setName, i) => {
        generatedPacks.push({
          id: `pack_${i}`,
          set: setName,
          cards: generateBoosterPack(setName),
          opened: false,
        });
      });
    } else {
      for (let i = 0; i < packCount; i++) {
        const randomSet = setMix[Math.floor(Math.random() * setMix.length)];
        generatedPacks.push({
          id: `pack_${i}`,
          set: randomSet,
          cards: generateBoosterPack(randomSet),
          opened: false,
        });
      }
    }

    setPacks(generatedPacks);
  }, [match, match?.sealedPacks, me?.id]);

  // Format time display
  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Generate a mock booster pack
  const generateBoosterPack = (setName: string): Card[] => {
    // This is a simplified pack generation - in a real implementation,
    // you'd fetch actual card data and use proper rarity distributions
    const mockCards = [];
    for (let i = 0; i < 15; i++) {
      mockCards.push({
        id: `${setName}_card_${i}`,
        name: `Card ${i + 1}`,
        set: setName,
        slug: `mock-card-${i}`,
        type: i % 5 === 0 ? "Site" : "Spell",
        cost: Math.floor(Math.random() * 6) + 1,
        rarity: i < 10 ? "Common" : i < 13 ? "Uncommon" : "Rare"
      });
    }
    return mockCards;
  };

  const openPack = (packId: string) => {
    setPacks(prev => prev.map(pack => {
      if (pack.id === packId && !pack.opened) {
        setCardPool(pool => [...pool, ...pack.cards]);
        return { ...pack, opened: true };
      }
      return pack;
    }));
  };

  const addToDeck = (card: Card) => {
    if (deck.length >= 60) return; // Max deck size
    setDeck(prev => [...prev, card]);
    setCardPool(prev => prev.filter(c => c.id !== card.id));
  };

  const removeFromDeck = (card: Card) => {
    setDeck(prev => prev.filter(c => c.id !== card.id));
    setCardPool(prev => [...prev, card]);
  };

  const submitDeck = () => {
    if (deck.length < 40) {
      alert("Deck must contain at least 40 cards.");
      return;
    }

    if (transport) {
      transport.submitDeck(deck);
      setDeckSubmitted(true);
      onDeckSubmitted();
    }
  };

  const isTimeWarning = timeRemaining <= 5 * 60 * 1000; // 5 minutes
  const isFinalWarning = timeRemaining <= 60 * 1000; // 1 minute

  const otherPlayerSubmitted = (match?.deckSubmissions?.length || 0) > 0 && 
    (match?.deckSubmissions || []).some((playerId: string) => playerId !== me?.id);

  return (
    <div className="w-full max-w-6xl mx-auto bg-slate-900/95 rounded-xl p-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Sealed Deck Construction</h2>
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-300">Time Remaining:</span>
            <span className={`font-mono text-lg ${
              isFinalWarning ? "text-red-400 animate-pulse" : 
              isTimeWarning ? "text-yellow-400" : "text-green-400"
            }`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-300">Deck Size:</span>
            <span className={`font-mono ${deck.length >= 40 ? "text-green-400" : "text-yellow-400"}`}>
              {deck.length}/60
            </span>
          </div>
        </div>
        {otherPlayerSubmitted && (
          <div className="mt-2 text-yellow-400 text-sm">
            Your opponent has submitted their deck!
          </div>
        )}
      </div>

      {isFinalWarning && (
        <div className="bg-red-900/50 border border-red-600/50 rounded-lg p-3 mb-4 text-center">
          <p className="text-red-200 font-semibold">⚠️ Final Warning: Less than 1 minute remaining!</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Packs Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Booster Packs</h3>
          <div className="space-y-2">
            {packs.map(pack => (
              <div key={pack.id} className="bg-slate-800/60 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">{pack.set}</div>
                    <div className="text-slate-400 text-sm">
                      {pack.opened ? `${pack.cards.length} cards opened` : "Unopened"}
                    </div>
                  </div>
                  {!pack.opened && (
                    <button
                      onClick={() => openPack(pack.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                    >
                      Open Pack
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card Pool */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Card Pool ({cardPool.length})</h3>
          <div className="bg-slate-800/40 rounded-lg p-4 h-96 overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              {cardPool.map(card => (
                <div 
                  key={card.id}
                  className="bg-slate-700/60 rounded p-2 cursor-pointer hover:bg-slate-600/60 transition-colors"
                  onClick={() => addToDeck(card)}
                >
                  <div className="text-white text-xs font-medium">{card.name}</div>
                  <div className="text-slate-400 text-xs">{card.type}</div>
                  <div className="text-slate-300 text-xs">{card.set}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Deck */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">Deck ({deck.length})</h3>
          <div className="bg-slate-800/40 rounded-lg p-4 h-96 overflow-y-auto">
            <div className="space-y-1">
              {deck.map((card, index) => (
                <div 
                  key={`${card.id}_${index}`}
                  className="bg-slate-700/60 rounded p-2 cursor-pointer hover:bg-slate-600/60 transition-colors flex items-center justify-between"
                  onClick={() => removeFromDeck(card)}
                >
                  <div>
                    <div className="text-white text-xs font-medium">{card.name}</div>
                    <div className="text-slate-400 text-xs">{card.type}</div>
                  </div>
                  <div className="text-slate-300 text-xs">{card.cost}</div>
                </div>
              ))}
            </div>
          </div>
          
          <button
            onClick={submitDeck}
            disabled={deck.length < 40 || deckSubmitted}
            className={`w-full py-3 rounded-lg font-semibold transition-colors ${
              deck.length >= 40 && !deckSubmitted
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-slate-600 text-slate-400 cursor-not-allowed"
            }`}
          >
            {deckSubmitted ? "Deck Submitted!" : 
             deck.length < 40 ? `Need ${40 - deck.length} more cards` : 
             "Submit Deck"}
          </button>
        </div>
      </div>
    </div>
  );
}
