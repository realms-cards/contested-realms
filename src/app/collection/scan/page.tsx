"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
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
  added: boolean;
  error?: string;
}

export default function ScanPage() {
  const router = useRouter();
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);

  const handleCardDetected = useCallback((result: ScanResult) => {
    console.log("[Scan] Detected:", result.cardName, result.confidence);
  }, []);

  const handleAddToCollection = useCallback(
    async (cardName: string, set: ScannerSet) => {
      console.log("[Scan] Adding to collection:", cardName, "set:", set);

      // Add to local state first (optimistic)
      const tempCard: ScannedCard = { name: cardName, set, added: false };
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

        // Add to collection
        const addRes = await fetch("/api/collection", {
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
          throw new Error(err.error || "Failed to add to collection");
        }

        // Update local state with success
        setScannedCards((prev) =>
          prev.map((c) =>
            c.name === cardName && !c.added
              ? { ...c, cardId: cardInfo.id, added: true }
              : c
          )
        );
      } catch (e) {
        console.error("[Scan] Add error:", e);
        // Update local state with error
        setScannedCards((prev) =>
          prev.map((c) =>
            c.name === cardName && !c.added
              ? {
                  ...c,
                  error: e instanceof Error ? e.message : "Failed to add",
                }
              : c
          )
        );
      }
    },
    []
  );

  const handleClose = useCallback(() => {
    router.push("/collection");
  }, [router]);

  const successCount = scannedCards.filter((c) => c.added).length;
  const errorCount = scannedCards.filter((c) => c.error).length;
  const pendingCount = scannedCards.filter((c) => !c.added && !c.error).length;

  return (
    <div className="fixed inset-0 bg-black z-50">
      <CardScannerView
        onCardDetected={handleCardDetected}
        onAddToCollection={handleAddToCollection}
        onClose={handleClose}
      />

      {/* Scanned cards counter */}
      {scannedCards.length > 0 && (
        <div className="fixed top-4 right-16 flex items-center gap-2 z-50">
          {successCount > 0 && (
            <div className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-medium">
              ✓ {successCount} added
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
