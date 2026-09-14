"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
import type { CardRef } from "@/lib/game/store/types";

const ORDINALS = ["1st","2nd","3rd"];
const ordinal = (position: number) => ORDINALS[position] ?? `${position+1}th`;
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring";

/** Cards the player puts back in an order of their choosing, shown as card art in draw order.
 * Drag a card onto another position, click two cards to swap them, or use the arrows (touch and keyboard).
 * `order` lists indices into `cards`, first = drawn first. */
export default function CpuCardOrder({cards,order,onOrder,label,children}: {
  cards: CardRef[]; order: number[]; onOrder: (order: number[]) => void;
  /** Position caption; defaults to "1st from the top". */
  label?: (position: number) => string;
  children?: ReactNode;
}) {
  const [held,setHeld] = useState<number | null>(null);
  const [dragged,setDragged] = useState<number | null>(null);
  const caption = label ?? ((position: number) => `${ordinal(position)} from the top`);
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(from,1);
    next.splice(to,0,moved);
    onOrder(next);
  };
  const swap = (a: number, b: number) => {
    const next = [...order];
    [next[a],next[b]] = [next[b],next[a]];
    onOrder(next);
  };
  const clickCard = (position: number) => {
    if (held === null) { setHeld(position); return; }
    if (held !== position) swap(held,position);
    setHeld(null);
  };
  return <section aria-label="Card order" className="pointer-events-auto w-full rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-3 font-rc-sans text-rc-fg shadow-rc-panel">
    <ol className="flex flex-wrap items-start justify-center gap-3">
      {order.map((index,position) => {
        const card = cards[index];
        if (!card) return null;
        const text = caption(position), picked = held === position;
        return <li key={`${card.instanceId || card.name}-${index}`} className="flex flex-col items-center gap-1.5"
          onDragOver={event => { if (dragged !== null) event.preventDefault(); }}
          onDrop={event => { event.preventDefault(); if (dragged !== null) move(dragged,position); setDragged(null); }}>
          <span className="font-rc-mono text-[11px] uppercase tracking-[0.08em] text-rc-fg-subtle">{text}</span>
          <button type="button" draggable aria-pressed={picked} aria-label={`${card.name}, ${text}`} title={card.name}
            onDragStart={event => { event.dataTransfer.effectAllowed = "move"; setDragged(position); setHeld(null); }}
            onDragEnd={() => setDragged(null)}
            onClick={() => clickCard(position)}
            className={`relative aspect-[63/88] w-24 cursor-grab overflow-hidden rounded-rc-md border shadow-rc-md ring-1 ring-rc-line/25 transition-colors sm:w-28 ${FOCUS} ${picked ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]" : "border-rc-line/18 bg-black/30 hover:border-rc-accent/60"} ${dragged === position ? "opacity-50" : ""}`}>
            <Image src={`/api/images/${card.slug || card.cardId}`} alt="" fill sizes="112px" draggable={false} className="object-cover" unoptimized />
          </button>
          <span className="max-w-28 truncate font-rc-display text-xs text-rc-fg-strong">{card.name}</span>
          {order.length > 1 && <div className="flex gap-1">
            <RcButton variant="quiet" size="icon-xs" aria-label={`Move ${card.name} toward the top`} disabled={position === 0} onClick={() => move(position,position-1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </RcButton>
            <RcButton variant="quiet" size="icon-xs" aria-label={`Move ${card.name} toward the bottom`} disabled={position === order.length-1} onClick={() => move(position,position+1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </RcButton>
          </div>}
        </li>;
      })}
    </ol>
    {children}
  </section>;
}
