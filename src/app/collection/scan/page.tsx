"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  CardScannerView,
  type ScannerSet,
} from "@/components/scanner/CardScannerView";
import type { ScanResult } from "@/lib/scanner/card-scanner";

export default function ScanPage() {
  const router = useRouter();
  const [scannedCards, setScannedCards] = useState<
    Array<{ name: string; set: ScannerSet }>
  >([]);

  const handleCardDetected = useCallback((result: ScanResult) => {
    console.log("[Scan] Detected:", result.cardName, result.confidence);
  }, []);

  const handleAddToCollection = useCallback(
    (cardName: string, set: ScannerSet) => {
      console.log("[Scan] Adding to collection:", cardName, "set:", set);
      setScannedCards((prev) => [...prev, { name: cardName, set }]);
      // TODO: Integrate with collection API
      // POST /api/collection/add { cardName, set, quantity: 1 }
    },
    []
  );

  const handleClose = useCallback(() => {
    router.push("/collection");
  }, [router]);

  return (
    <div className="fixed inset-0 bg-black z-50">
      <CardScannerView
        onCardDetected={handleCardDetected}
        onAddToCollection={handleAddToCollection}
        onClose={handleClose}
      />

      {/* Scanned cards counter */}
      {scannedCards.length > 0 && (
        <div className="fixed top-4 right-16 bg-cyan-600 text-white px-3 py-1 rounded-full text-sm font-medium z-50">
          {scannedCards.length} scanned
        </div>
      )}
    </div>
  );
}
