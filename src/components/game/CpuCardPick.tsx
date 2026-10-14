"use client";

import { X } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { cardImage } from "@/components/game/CpuPlayReveal";
import type { CardRef } from "@/lib/game/store/types";
import { getCardImageUrl } from "@/lib/utils/cdnUrl";

/** The card fields a pick row needs; a choice's `card` (spellTypes) and a trigger option's card both fit. */
export type PickCard = Pick<CardRef, "name"> & Partial<Pick<CardRef, "slug" | "cardId" | "instanceId" | "type">>;
export type CardPickItem = {
  id: string; card: PickCard; badge?: string;
  /** Accessible name; defaults to "<card name>, <badge>". */
  label?: string;
  /** A card the viewer may not see (another seat's hand or deck): drawn face down, nameless. */
  hidden?: boolean;
  /** Shown but inert (greyed, not pickable); `reason` says why, as its tooltip. */
  disabled?: boolean;
  reason?: string;
};

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring";

/** Art for a card: a printed card from the CDN (as the board and the hand load it, the image API its fallback), a token's own texture, else by card id, else nothing (a named placeholder). */
function art(card: PickCard) {
  const {src,landscape} = cardImage(card);
  if (card.slug && !card.slug.startsWith("token:")) return {src:getCardImageUrl(card.slug),landscape};
  return {src:src ?? (card.cardId ? `/api/images/${card.cardId}` : null),landscape};
}

/** A row of cards to choose one from, by its art: click (or Enter/Space) picks it; the picked card wears the selected ring. */
export default function CpuCardPick({title,items,selected,selectedIds,onPick,onClose,fill = false,strip = false,children}: {
  title: string; items: CardPickItem[]; selected?: string | null;
  /** Several picked cards at once (a multi-select such as a mulligan); each wears the selected ring. */
  selectedIds?: readonly string[];
  onPick: (id: string) => void;
  /** Adds a close button to the header (e.g. keep the listed order). */
  onClose?: () => void;
  /** Fill the box it is placed in (as tall as that, scrolling inside) on an opaque ground, rather than a translucent panel capped at 45vh. */
  fill?: boolean;
  /** Small cards for a dock, where a large preview beside them shows the card read in full: they wrap, but inside a phone's dock (`data-dock-fill`, no height to spare) they keep to one row that scrolls sideways. */
  strip?: boolean;
  children?: ReactNode;
}) {
  const size = strip ? "w-[3.75rem]" : "w-24 sm:w-28", wideSize = strip ? "w-20" : "w-32 sm:w-36";
  return <section aria-label={title} className={strip ? "pointer-events-auto w-full font-rc-sans text-rc-fg" : `thin-scrollbar pointer-events-auto w-full overflow-y-auto rounded-rc-lg border border-rc-line/18 ${fill ? "max-h-full bg-[rgb(9,13,25)]" : "max-h-[45vh] bg-[rgba(9,13,25,0.95)]"} p-3 font-rc-sans text-rc-fg shadow-rc-panel`}>
    <div className={`${strip ? "sr-only" : ""} mb-2 flex items-center justify-between gap-2 px-1 font-rc-mono text-xs tracking-[0.08em] text-rc-fg-subtle`}>
      <span className="truncate">{title}</span>
      {onClose && <button type="button" aria-label={`Close ${title}`} className={`cursor-pointer rounded-rc-md p-1 text-rc-fg-muted hover:bg-rc-line/6 hover:text-rc-fg-strong ${FOCUS}`} onClick={onClose}><X className="h-3.5 w-3.5" /></button>}
    </div>
    <ul className={strip ? "thin-scrollbar flex flex-wrap items-start gap-2 pb-1 [[data-dock-fill]_&]:flex-nowrap [[data-dock-fill]_&]:overflow-x-auto [[data-dock-fill]_&]:overscroll-x-contain" : "flex flex-wrap items-start justify-center gap-3"}>
      {items.map(item => {
        const {card,badge,hidden,disabled,reason} = item, picked = item.id === selected || (selectedIds?.includes(item.id) ?? false);
        const name = hidden ? "Hidden card" : card.name;
        const {src,landscape} = hidden ? {src:null,landscape:false} : art(card);
        return <li key={item.id} className={`flex flex-col items-center ${strip ? "flex-none gap-1" : "gap-1.5"}`}>
          <button type="button" aria-pressed={picked} aria-disabled={disabled || undefined} aria-label={item.label ?? (badge ? `${name}, ${badge}` : name) + (disabled && reason ? ` (${reason})` : "")} title={disabled && reason ? `${name} — ${reason}` : name} onClick={() => { if (!disabled) onPick(item.id); }}
            className={`relative overflow-hidden rounded-rc-md border shadow-rc-md ring-1 ring-rc-line/25 transition-colors ${landscape ? `aspect-[4/3] ${wideSize}` : `aspect-[63/88] ${size}`} ${FOCUS} ${disabled ? "cursor-not-allowed border-rc-line/12 bg-black/30 opacity-70 grayscale" : picked ? "cursor-pointer border-rc-accent bg-rc-accent/12 shadow-[0_0_14px_rgba(243,207,106,0.25)]" : "cursor-pointer border-rc-line/18 bg-black/30 hover:border-rc-accent/60 hover:bg-rc-accent/8"}`}>
            {src ? <Image src={src} alt="" fill unoptimized sizes="144px" draggable={false} className={`${landscape ? "rotate-90 scale-[1.333] origin-center object-contain" : "object-cover"} object-center`} />
              : <span aria-hidden className="absolute inset-0 flex items-center justify-center p-2 text-center font-rc-display text-xs text-rc-fg-muted">{name}</span>}
          </button>
          {/* a strip leaves the name to the art and the preview beside it: the dock has no height to spare */}
          {!strip && <span className={`max-w-32 truncate font-rc-display text-xs ${disabled ? "text-rc-fg-subtle" : "text-rc-fg-strong"}`}>{name}</span>}
          {badge && <span className="max-w-32 truncate font-rc-mono text-[11px] uppercase tracking-[0.08em] text-rc-fg-subtle" title={badge}>{badge}</span>}
        </li>;
      })}
    </ul>
    {children}
  </section>;
}
