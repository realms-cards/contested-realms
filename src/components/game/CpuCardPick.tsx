"use client";

import { X } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { cardImage } from "@/components/game/CpuPlayReveal";
import type { CardRef } from "@/lib/game/store/types";

/** The card fields a pick row needs; a choice's `card` (spellTypes) and a trigger option's card both fit. */
export type PickCard = Pick<CardRef, "name"> & Partial<Pick<CardRef, "slug" | "cardId" | "instanceId" | "type">>;
export type CardPickItem = {
  id: string; card: PickCard; badge?: string;
  /** Accessible name; defaults to "<card name>, <badge>". */
  label?: string;
  /** A card the viewer may not see (another seat's hand or deck): drawn face down, nameless. */
  hidden?: boolean;
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring";

/** Art for a card: the token/landscape-aware image, else by card id, else nothing (a named placeholder). */
function art(card: PickCard) {
  const {src,landscape} = cardImage(card);
  return {src:src ?? (card.cardId ? `/api/images/${card.cardId}` : null),landscape};
}

/** A row of cards to choose one from, by its art: click (or Enter/Space) picks it; the picked card wears the selected ring. */
export default function CpuCardPick({title,items,selected,onPick,onClose,children}: {
  title: string; items: CardPickItem[]; selected?: string | null; onPick: (id: string) => void;
  /** Adds a close button to the header (e.g. keep the listed order). */
  onClose?: () => void;
  children?: ReactNode;
}) {
  return <section aria-label={title} className="thin-scrollbar pointer-events-auto max-h-[45vh] w-full overflow-y-auto rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-3 font-rc-sans text-rc-fg shadow-rc-panel">
    <div className="mb-2 flex items-center justify-between gap-2 px-1 font-rc-mono text-xs tracking-[0.08em] text-rc-fg-subtle">
      <span className="truncate">{title}</span>
      {onClose && <button type="button" aria-label={`Close ${title}`} className={`cursor-pointer rounded-rc-md p-1 text-rc-fg-muted hover:bg-rc-line/6 hover:text-rc-fg-strong ${FOCUS}`} onClick={onClose}><X className="h-3.5 w-3.5" /></button>}
    </div>
    <ul className="flex flex-wrap items-start justify-center gap-3">
      {items.map(item => {
        const {card,badge,hidden} = item, picked = item.id === selected;
        const name = hidden ? "Hidden card" : card.name;
        const {src,landscape} = hidden ? {src:null,landscape:false} : art(card);
        return <li key={item.id} className="flex flex-col items-center gap-1.5">
          <button type="button" aria-pressed={picked} aria-label={item.label ?? (badge ? `${name}, ${badge}` : name)} title={name} onClick={() => onPick(item.id)}
            className={`relative overflow-hidden rounded-rc-md border shadow-rc-md ring-1 ring-rc-line/25 transition-colors ${landscape ? "aspect-[4/3] w-32 sm:w-36" : "aspect-[63/88] w-24 sm:w-28"} cursor-pointer ${FOCUS} ${picked ? "border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]" : "border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8"}`}>
            {src ? <Image src={src} alt="" fill unoptimized sizes="144px" draggable={false} className={`${landscape ? "rotate-90 scale-[1.333] origin-center object-contain" : "object-cover"} object-center`} />
              : <span aria-hidden className="absolute inset-0 flex items-center justify-center p-2 text-center font-rc-display text-xs text-rc-fg-muted">{name}</span>}
          </button>
          <span className="max-w-32 truncate font-rc-display text-xs text-rc-fg-strong">{name}</span>
          {badge && <span className="max-w-32 truncate font-rc-mono text-[11px] uppercase tracking-[0.08em] text-rc-fg-subtle" title={badge}>{badge}</span>}
        </li>;
      })}
    </ul>
    {children}
  </section>;
}
