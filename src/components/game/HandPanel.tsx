"use client";

import Image from "next/image";
import { useSound } from "@/lib/contexts/SoundContext";
import { useGameStore } from "@/lib/game/store";

interface HandPanelProps {
  dragFromHand: boolean;
}

export default function HandPanel({ dragFromHand }: HandPanelProps) {
  const zones = useGameStore((s) => s.zones);
  const selected = useGameStore((s) => s.selectedCard);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const closeContextMenu = useGameStore((s) => s.closeContextMenu);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const { playCardSelect } = useSound();

  return (
    <div className="absolute inset-x-0 bottom-20 z-10 pointer-events-none overflow-visible">
      <div
        className={`${
          dragFromHand ? "pointer-events-none" : "pointer-events-auto"
        } mx-auto max-w-5xl px-3 py-2 text-sm text-rc-fg overflow-visible`}
        onClick={() => {
          // Clear hand card selection but preserve avatar selection
          useGameStore.setState({
            selectedCard: null,
            selectedPermanent: null,
          });
          closeContextMenu();
          setPreviewCard(null);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          // Clear hand card selection but preserve avatar selection
          useGameStore.setState({
            selectedCard: null,
            selectedPermanent: null,
          });
          closeContextMenu();
          setPreviewCard(null);
        }}
      >
        <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pt-16">
          {(zones.p1.hand || []).map((c, i) => {
            const isSel =
              selected && selected.who === "p1" && selected.index === i;
            const isSite = (c.type || "").toLowerCase().includes("site");

            return (
              <button
                key={`${c.cardId}-${i}`}
                className={`relative shrink-0 rounded-rc-md border transition-transform duration-150 origin-bottom hover:scale-[1.5] hover:-translate-y-6 hover:z-50 ${
                  isSite ? "px-1 py-0.5" : "p-1"
                } ${
                  isSel
                    ? "border-rc-accent-ring bg-rc-accent/20"
                    : "border-rc-line/18 bg-black/35 hover:border-rc-accent/50 hover:bg-black/45"
                }`}
                title={c.name}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSel) {
                    // Clear hand card selection but preserve avatar selection
                    useGameStore.setState({
                      selectedCard: null,
                      selectedPermanent: null,
                    });
                  } else {
                    selectHandCard("p1", i);
                    playCardSelect();
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  // Start drag only if this card is already selected
                  if (
                    selected &&
                    selected.who === "p1" &&
                    selected.index === i
                  ) {
                    setDragFromHand(true);
                  }
                }}
                onDragStart={(e) => e.preventDefault()}
              >
                {c.slug ? (
                  <div
                    className={`relative ${
                      isSite ? "aspect-[4/3] w-28" : "aspect-[3/4] h-28"
                    } rounded-rc-sm overflow-visible bg-black/30`}
                  >
                    <Image
                      src={`/api/images/${c.slug}`}
                      alt={c.name}
                      fill
                      sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                      className={`${
                        isSite ? "object-contain rotate-90" : "object-cover"
                      }`}
                      draggable={false}
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-24 h-32 grid place-items-center rounded-rc-sm bg-black/35 text-xs text-rc-fg-muted">
                    {c.name}
                  </div>
                )}
                <div className="text-[10px] mt-1 max-w-24 truncate text-rc-fg-muted">
                  {c.name}
                </div>
              </button>
            );
          })}
          {zones.p1.hand.length === 0 && (
            <div className="font-rc-mono tracking-[0.1em] text-rc-fg-dim">
              Hand is empty
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
