"use client";

import { useEffect, useMemo, useRef } from "react";
import CardPreview from "@/components/game/CardPreview";
import { cardRefToPreview } from "@/lib/game/card-preview.types";
import type { CardRef, PlayerKey } from "@/lib/game/store";
import { useGameStore } from "@/lib/game/store";
import { X } from "lucide-react";

export interface RevealOverlayProps {
  title?: string;
  cards: CardRef[];
  revealedBy?: PlayerKey;
  onClose: () => void;
  autoCloseDelay?: number; // Auto close after X milliseconds, 0 = no auto close
}

// Card dimensions for large display (in pixels)
const REVEAL_CARD_WIDTH = 280;
const REVEAL_CARD_HEIGHT = 392; // ~3:4 aspect ratio

export default function RevealOverlay({
  title = "Card Revealed",
  cards,
  revealedBy,
  onClose,
  autoCloseDelay = 5000, // Default 5 seconds auto close
}: RevealOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardsToRender = useMemo(() => cards ?? [], [cards]);
  const actorKey = useGameStore((s) => s.actorKey);

  // Determine if this reveal is for the current player (viewer is not the one who revealed)
  const isOpponentReveal = revealedBy && actorKey !== revealedBy;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Auto close after delay
  useEffect(() => {
    if (autoCloseDelay <= 0) return;

    const timer = setTimeout(() => {
      onClose();
    }, autoCloseDelay);

    return () => clearTimeout(timer);
  }, [autoCloseDelay, onClose]);

  if (cardsToRender.length === 0) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) {
          onClose();
        }
      }}
    >
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center">
        {/* Header */}
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
          {isOpponentReveal && revealedBy && (
            <p className="text-amber-300 text-lg">
              Your opponent revealed {cardsToRender.length === 1 ? "a card" : `${cardsToRender.length} cards`}
            </p>
          )}
          <p className="text-white/60 text-sm mt-2">
            Press Escape, Space, Enter, or click outside to close
            {autoCloseDelay > 0 && ` • Auto-closes in ${autoCloseDelay / 1000}s`}
          </p>
        </div>

        {/* Cards Display */}
        <div
          className={`flex gap-6 justify-center items-center ${
            cardsToRender.length > 3 ? "flex-wrap max-w-[1000px]" : ""
          }`}
        >
          {cardsToRender.map((card, index) => (
            <div
              key={`${card.cardId}-${index}`}
              className="relative"
              style={{
                width: REVEAL_CARD_WIDTH,
                height: REVEAL_CARD_HEIGHT,
                animation: `revealCardIn 0.3s ease-out ${index * 0.1}s both`,
              }}
            >
              <CardPreview
                card={cardRefToPreview(card)}
                width={REVEAL_CARD_WIDTH}
                height={REVEAL_CARD_HEIGHT}
                showCardActions={false}
              />
            </div>
          ))}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center transition-colors shadow-lg"
          aria-label="Close reveal overlay"
        >
          <X size={24} />
        </button>
      </div>

      {/* Animation styles */}
      <style jsx>{`
        @keyframes revealCardIn {
          from {
            opacity: 0;
            transform: scale(0.8) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
