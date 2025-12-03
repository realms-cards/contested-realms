"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  CardScannerView,
  type ScannerSet,
} from "@/components/scanner/CardScannerView";
import type { ScanResult } from "@/lib/scanner/card-scanner";

interface ScannedCard {
  name: string;
  set: ScannerSet;
  cardId?: number;
  variantId?: number;
  setId?: number;
  addedToList: boolean;
  error?: string;
}

export default function ListScanPage() {
  const params = useParams();
  const router = useRouter();
  const listId = (params?.id as string) || "";

  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [listName, setListName] = useState<string>("");
  const [showSummary, setShowSummary] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);

  // Fetch list name
  useEffect(() => {
    if (!listId) return;
    fetch(`/api/lists/${listId}`)
      .then((res) => res.json())
      .then((data) => setListName(data.name || "List"))
      .catch(() => setListName("List"));
  }, [listId]);

  const handleCardDetected = useCallback((result: ScanResult) => {
    console.log("[ListScan] Detected:", result.cardName, result.confidence);
  }, []);

  const handleAddToList = useCallback(
    async (cardName: string, set: ScannerSet) => {
      console.log("[ListScan] Adding to list:", cardName, "set:", set);

      // Add to local state first (optimistic)
      const tempCard: ScannedCard = { name: cardName, set, addedToList: false };
      setScannedCards((prev) => [...prev, tempCard]);

      try {
        // Look up the card ID by name
        const lookupRes = await fetch("/api/cards/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ names: [cardName] }),
        });

        if (!lookupRes.ok) {
          throw new Error("Failed to look up card");
        }

        const lookupData = await lookupRes.json();
        const cardInfo = lookupData.cards?.[0];

        if (!cardInfo) {
          throw new Error("Card not found in database");
        }

        // Add to list
        const addRes = await fetch(`/api/lists/${listId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cards: [
              {
                cardId: cardInfo.id,
                variantId: cardInfo.variantId,
                setId: cardInfo.setId,
                finish: "Standard",
                quantity: 1,
              },
            ],
          }),
        });

        if (!addRes.ok) {
          const err = await addRes.json();
          throw new Error(err.error || "Failed to add to list");
        }

        // Update local state with success
        setScannedCards((prev) =>
          prev.map((c) =>
            c.name === cardName && !c.addedToList
              ? {
                  ...c,
                  cardId: cardInfo.id,
                  variantId: cardInfo.variantId,
                  setId: cardInfo.setId,
                  addedToList: true,
                }
              : c
          )
        );
      } catch (e) {
        console.error("[ListScan] Add error:", e);
        // Update local state with error
        setScannedCards((prev) =>
          prev.map((c) =>
            c.name === cardName && !c.addedToList
              ? {
                  ...c,
                  error: e instanceof Error ? e.message : "Failed to add",
                }
              : c
          )
        );
      }
    },
    [listId]
  );

  const handleClose = useCallback(() => {
    if (scannedCards.length > 0) {
      setShowSummary(true);
    } else {
      router.push(`/collection/lists/${listId}`);
    }
  }, [router, listId, scannedCards.length]);

  const handleAddAllToCollection = useCallback(async () => {
    const cardsToAdd = scannedCards.filter((c) => c.addedToList && c.cardId);
    if (cardsToAdd.length === 0) return;

    setAddingToCollection(true);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: cardsToAdd.map((c) => ({
            cardId: c.cardId,
            variantId: c.variantId,
            setId: c.setId,
            finish: "Standard",
            quantity: 1,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add to collection");
      }

      const result = await res.json();
      alert(
        `Added ${result.added?.length || 0} cards, updated ${
          result.updated?.length || 0
        } cards in your collection!`
      );
      router.push(`/collection/lists/${listId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add to collection");
    } finally {
      setAddingToCollection(false);
    }
  }, [scannedCards, router, listId]);

  const successCount = scannedCards.filter((c) => c.addedToList).length;
  const errorCount = scannedCards.filter((c) => c.error).length;
  const pendingCount = scannedCards.filter(
    (c) => !c.addedToList && !c.error
  ).length;

  // Summary view after scanning
  if (showSummary) {
    return (
      <div className="min-h-screen bg-gray-900 p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Scan Complete</h1>
          <p className="text-gray-400 mb-6">
            Added {successCount} cards to &quot;{listName}&quot;
          </p>

          {/* Scanned cards list */}
          <div className="bg-gray-800 rounded-lg divide-y divide-gray-700 mb-6">
            {scannedCards.map((card, i) => (
              <div key={i} className="flex items-center justify-between p-3">
                <span className={card.error ? "text-red-400" : "text-white"}>
                  {card.name}
                </span>
                {card.addedToList && (
                  <span className="text-green-400 text-sm">✓ In list</span>
                )}
                {card.error && (
                  <span className="text-red-400 text-sm">{card.error}</span>
                )}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {successCount > 0 && (
              <button
                onClick={handleAddAllToCollection}
                disabled={addingToCollection}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium transition-colors"
              >
                {addingToCollection
                  ? "Adding..."
                  : `Add All ${successCount} Cards to Collection`}
              </button>
            )}
            <button
              onClick={() => router.push(`/collection/lists/${listId}`)}
              className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Back to List
            </button>
            <button
              onClick={() => setShowSummary(false)}
              className="w-full py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors"
            >
              Continue Scanning
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50">
      <CardScannerView
        onCardDetected={handleCardDetected}
        onAddToCollection={handleAddToList}
        onClose={handleClose}
      />

      {/* List name badge */}
      <div className="fixed top-4 left-16 bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-medium z-50">
        📋 {listName}
      </div>

      {/* Scanned cards counter */}
      {scannedCards.length > 0 && (
        <div className="fixed top-4 right-16 flex items-center gap-2 z-50">
          {successCount > 0 && (
            <div className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              ✓ {successCount} in list
            </div>
          )}
          {pendingCount > 0 && (
            <div className="bg-cyan-600 text-white px-3 py-1 rounded-full text-sm font-medium animate-pulse">
              ⏳ {pendingCount}
            </div>
          )}
          {errorCount > 0 && (
            <div className="bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              ✗ {errorCount}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
