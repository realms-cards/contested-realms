"use client";

import Image from "next/image";
import { useGameStore } from "@/lib/game/store";

interface HandPanelProps {
  dragFromHand: boolean;
}

export default function HandPanel({ dragFromHand }: HandPanelProps) {
  const zones = useGameStore((s) => s.zones);
  const selected = useGameStore((s) => s.selectedCard);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const closeContextMenu = useGameStore((s) => s.closeContextMenu);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);

  return (
    <div className="absolute inset-x-0 bottom-20 z-10 pointer-events-none overflow-visible">
      <div
        className={`${
          dragFromHand ? "pointer-events-none" : "pointer-events-auto"
        } mx-auto max-w-5xl px-3 py-2 text-sm text-white overflow-visible`}
        onClick={() => {
          clearSelection();
          closeContextMenu();
          setPreviewCard(null);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          clearSelection();
          closeContextMenu();
          setPreviewCard(null);
        }}
      >
        <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pt-16">
          {(zones.p1.hand || []).map((c, i) => {
            const isSel = selected && selected.who === "p1" && selected.index === i;
            const isSite = (c.type || "").toLowerCase().includes("site");
            
            return (
              <button
                key={`${c.cardId}-${i}`}
                className={`relative shrink-0 rounded border transition-transform duration-150 origin-bottom hover:scale-[1.5] hover:-translate-y-6 hover:z-50 ${
                  isSite ? "px-1 py-0.5" : "p-1"
                } ${
                  isSel
                    ? "border-emerald-400 bg-emerald-500/20"
                    : "border-white/15 bg-white/10 hover:bg-white/20"
                }`}
                title={c.name}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSel) {
                    clearSelection();
                  } else {
                    selectHandCard("p1", i);
                  }
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  // Start drag only if this card is already selected
                  if (selected && selected.who === "p1" && selected.index === i) {
                    setDragFromHand(true);
                  }
                }}
                onDragStart={(e) => e.preventDefault()}
              >
                {c.slug ? (
                  <div
                    className={`relative ${
                      isSite ? "aspect-[4/3] w-28" : "aspect-[3/4] h-28"
                    } rounded overflow-visible bg-muted/40`}
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
                    />
                  </div>
                ) : (
                  <div className="w-24 h-32 grid place-items-center rounded bg-white/10 text-xs opacity-80">
                    {c.name}
                  </div>
                )}
                <div className="text-[10px] mt-1 max-w-24 truncate opacity-90">
                  {c.name}
                </div>
              </button>
            );
          })}
          {zones.p1.hand.length === 0 && (
            <div className="opacity-60">Hand is empty</div>
          )}
        </div>
      </div>
    </div>
  );
}