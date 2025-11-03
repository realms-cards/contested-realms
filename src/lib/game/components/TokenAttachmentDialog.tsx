"use client";

import { useEffect } from "react";
import type { CardRef } from "@/lib/game/store";

interface TokenAttachmentDialogProps {
  token: CardRef;
  targetPermanent: { at: string; index: number; card: CardRef };
  onConfirm: () => void;
  onCancel: () => void;
  // Optional fields tolerated by callers; not used here
  dropCoords?: { x: number; y: number };
  fromPile?: boolean;
  pileInfo?: {
    who: "p1" | "p2";
    from: "tokens" | "spellbook" | "atlas" | "graveyard";
    card: CardRef;
  } | null;
}

export default function TokenAttachmentDialog({
  token,
  targetPermanent,
  onConfirm,
  onCancel,
}: TokenAttachmentDialogProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="bg-zinc-900 border border-white/20 rounded-lg p-4 shadow-xl pointer-events-auto">
        <div className="text-sm font-medium mb-3">
          Attach {token.name} to {targetPermanent.card.name}?
        </div>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm"
          >
            Attach
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
          >
            Play Separately
          </button>
        </div>
      </div>
    </div>
  );
}