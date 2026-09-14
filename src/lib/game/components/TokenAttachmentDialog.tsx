"use client";

import { useEffect } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
    from: "tokens" | "spellbook" | "atlas" | "graveyard" | "collection";
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
      <div className="rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-4 font-rc-sans text-rc-fg shadow-rc-panel pointer-events-auto">
        <div className="mb-3 font-rc-display text-[18px] leading-tight text-rc-fg-strong">
          Attach {token.name} to {targetPermanent.card.name}?
        </div>
        <div className="flex gap-2">
          <RcButton size="sm" onClick={onConfirm}>
            Attach
          </RcButton>
          <RcButton variant="outline" size="sm" onClick={onCancel}>
            Play Separately
          </RcButton>
        </div>
      </div>
    </div>
  );
}
