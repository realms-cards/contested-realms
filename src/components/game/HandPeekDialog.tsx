"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import type { CardRef } from "@/lib/game/store";
import { useGameStore } from "@/lib/game/store";

export interface HandPeekDialogProps {
  title?: string;
  cards: CardRef[];
  onClose: () => void;
}

const GRID_CARD_WIDTH = CARD_SHORT * 0.55;
const GRID_CARD_HEIGHT = CARD_LONG * 0.55;

export default function HandPeekDialog({ title = "Opponent Hand", cards, onClose }: HandPeekDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cardsToRender = useMemo(() => cards ?? [], [cards]);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    // Clear global preview when dialog mounts/unmounts or card set changes
    setPreviewCard(null);
    return () => setPreviewCard(null);
  }, [setPreviewCard]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={dialogRef}
        className="bg-zinc-900/95 backdrop-blur rounded-2xl ring-1 ring-white/10 shadow-2xl p-4 w-auto max-w-[80vw] min-w-[20rem] max-h-[80vh] text-white flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">✕</button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {cardsToRender.length === 0 ? (
            <div className="text-center text-zinc-400 py-10">No cards available</div>
          ) : (
            <div
              className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2"
              onMouseLeave={() => setPreviewCard(null)}
            >
              {cardsToRender.map((card, idx) => {
                const key = `${card.slug ?? "card"}-${card.cardId ?? idx}-${idx}`;
                const isSite = typeof card.type === "string" && card.type.toLowerCase().includes("site");
                const rotationZ = isSite ? -Math.PI / 2 : 0;
                const slug = card.slug ?? "";

                return (
                  <button
                    key={key}
                    type="button"
                    className="relative rounded-md bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors"
                    onMouseEnter={() => setPreviewCard(card)}
                    onFocus={() => setPreviewCard(card)}
                    onBlur={() => setPreviewCard(null)}
                  >
                    <div className="relative w-[120px] aspect-[3/4]">
                      <Canvas
                        orthographic
                        camera={{ position: [0, 0, 5], zoom: 260 }}
                        gl={{ alpha: true, antialias: true }}
                        className="absolute inset-0"
                      >
                        <ambientLight intensity={1} />
                        <CardPlane
                          slug={slug}
                          width={GRID_CARD_WIDTH}
                          height={GRID_CARD_HEIGHT}
                          rotationZ={rotationZ}
                          upright
                          depthWrite={false}
                          interactive={false}
                          preferRaster
                        />
                      </Canvas>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-zinc-800 flex justify-end">
          <button
            className="px-3 py-1.5 text-sm font-medium text-zinc-200 bg-zinc-700/60 hover:bg-zinc-600/70 rounded-lg transition-colors"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
