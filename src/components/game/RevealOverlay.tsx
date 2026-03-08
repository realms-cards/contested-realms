"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CardRef, PlayerKey } from "@/lib/game/store";
import { useGameStore } from "@/lib/game/store";

export interface RevealOverlayProps {
  title?: string;
  cards: CardRef[];
  revealedBy?: PlayerKey;
  onClose: () => void;
  autoCloseDelay?: number; // Auto close after X milliseconds, 0 = no auto close
  minimizeToSelector?: string; // CSS selector of element to animate toward on close
}

const MINIMIZE_DURATION_MS = 400;

export default function RevealOverlay({
  title = "Card Revealed",
  cards,
  revealedBy,
  onClose,
  autoCloseDelay = 5000,
  minimizeToSelector,
}: RevealOverlayProps) {
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const cardsToRender = useMemo(() => cards ?? [], [cards]);
  const actorKey = useGameStore((s) => s.actorKey);
  const [closing, setClosing] = useState(false);
  const [minimizeStyle, setMinimizeStyle] = useState<React.CSSProperties>({});

  // Determine if this reveal is for the current player
  const isOpponentReveal = revealedBy && actorKey !== revealedBy;

  const startClose = useCallback(() => {
    if (closing) return;

    // If we have a minimize target, animate toward it
    if (minimizeToSelector && cardContainerRef.current) {
      const target = document.querySelector(minimizeToSelector);
      if (target) {
        const targetRect = target.getBoundingClientRect();
        const cardRect = cardContainerRef.current.getBoundingClientRect();

        const dx =
          targetRect.left +
          targetRect.width / 2 -
          (cardRect.left + cardRect.width / 2);
        const dy =
          targetRect.top +
          targetRect.height / 2 -
          (cardRect.top + cardRect.height / 2);

        const targetScale = Math.min(
          targetRect.width / cardRect.width,
          targetRect.height / cardRect.height,
          0.15,
        );

        setMinimizeStyle({
          transform: `translate(${dx}px, ${dy}px) scale(${targetScale})`,
          opacity: 0,
          transition: `transform ${MINIMIZE_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${MINIMIZE_DURATION_MS}ms ease-in`,
        });

        setClosing(true);
        setTimeout(onClose, MINIMIZE_DURATION_MS);
        return;
      }
    }

    // No target — just close immediately
    onClose();
  }, [closing, minimizeToSelector, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        startClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [startClose]);

  // Auto close after delay
  useEffect(() => {
    if (autoCloseDelay <= 0) return;

    const timer = setTimeout(() => {
      startClose();
    }, autoCloseDelay);

    return () => clearTimeout(timer);
  }, [autoCloseDelay, startClose]);

  if (cardsToRender.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
      style={
        closing
          ? {
              opacity: 0,
              transition: `opacity ${MINIMIZE_DURATION_MS}ms ease-in`,
            }
          : undefined
      }
      onClick={startClose}
    >
      <div
        ref={cardContainerRef}
        className="flex flex-col items-center cursor-default"
        style={minimizeStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-fantaisie text-white mb-1">{title}</h2>
          {isOpponentReveal && revealedBy && (
            <p className="text-amber-300 text-sm">
              Your opponent revealed{" "}
              {cardsToRender.length === 1
                ? "a card"
                : `${cardsToRender.length} cards`}
            </p>
          )}
          <p className="text-white/50 text-xs mt-1">
            Click anywhere to dismiss
          </p>
        </div>

        {/* Cards Display */}
        <div
          className={`flex gap-4 justify-center items-center ${
            cardsToRender.length > 3 ? "flex-wrap max-w-[800px]" : ""
          }`}
        >
          {cardsToRender.map((card, index) => (
            <div
              key={`${card.cardId}-${index}`}
              className="relative w-48 aspect-[2.5/3.5] rounded-lg overflow-hidden ring-1 ring-white/20 shadow-2xl"
              style={{
                animation: `revealCardIn 0.3s ease-out ${index * 0.1}s both`,
              }}
            >
              <Image
                src={`/api/images/${card.slug || card.cardId}`}
                alt={card.name || "Card"}
                fill
                className="object-cover"
                unoptimized
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                <p className="text-white text-sm text-center font-medium truncate">
                  {card.name}
                </p>
              </div>
            </div>
          ))}
        </div>
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
