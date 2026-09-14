"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useCpuReveals } from "@/lib/game/cpu/revealQueue";
import { cardText } from "@/lib/game/cpu/spells";
import type { CardRef } from "@/lib/game/store/types";
import { isTransformableSiteName } from "@/lib/game/store/utils/cardHelpers";
import { TOKEN_BY_KEY, tokenTextureUrl } from "@/lib/game/tokens";
import { useSmallScreen } from "@/lib/hooks/useTouchDevice";

const DRAIN = "@keyframes cpu-reveal-drain{from{transform:scaleX(1)}to{transform:scaleX(0)}}";
const rulesCache = new Map<string, string>();

/** Same image resolution as CardPreview: tokens from assets, everything else by slug. */
export function cardImage(card: Pick<CardRef, "name"> & Partial<Pick<CardRef, "slug" | "type">>): {src: string | null; landscape: boolean} {
  const slug = card.slug || "";
  const token = slug.startsWith("token:") ? TOKEN_BY_KEY[slug.split(":")[1]?.toLowerCase() || ""] : undefined;
  const landscape = (card.type || "").toLowerCase().includes("site") || isTransformableSiteName(card.name) || token?.siteReplacement === true;
  if (!slug) return {src:null,landscape};
  if (slug.startsWith("token:")) return {src:token ? tokenTextureUrl(token) : null,landscape};
  return {src:`/api/images/${slug}`,landscape};
}

/** Rules text from the bundled CPU card data or the card itself, else fetched once per name. */
function useRulesText(card: CardRef | null): string {
  const name = card?.name || "";
  const known = card ? String(cardText(card) || "") : "";
  const [fetched, setFetched] = useState<{name: string; text: string} | null>(null);
  useEffect(() => {
    if (!name || known || rulesCache.has(name) || typeof fetch !== "function") return;
    let live = true;
    void fetch(`/api/cards/rules?name=${encodeURIComponent(name)}`)
      .then(res => res.ok ? res.json() as Promise<{rulesText?: string | null}> : null)
      .then(data => { const text = data?.rulesText || ""; rulesCache.set(name,text); if (live) setFetched({name,text}); })
      .catch(() => undefined);
    return () => { live = false; };
  },[name,known]);
  return known || rulesCache.get(name) || (fetched?.name === name ? fetched.text : "");
}

/** Shows each CPU play large, one at a time; the CPU waits while any are up (see CpuBoardReady). */
export default function CpuPlayReveal() {
  const entry = useCpuReveals(state => state.queue[0] ?? null);
  const waiting = useCpuReveals(state => Math.max(0,state.queue.length-1));
  const timer = useCpuReveals(state => state.timer);
  const held = useCpuReveals(state => state.held);
  const hidden = useCpuReveals(state => state.hidden);
  const hold = useCpuReveals(state => state.hold);
  const dismiss = useCpuReveals(state => state.dismiss);
  const small = useSmallScreen();
  const rules = useRulesText(entry?.card ?? null);
  // An unmounted reveal can no longer be hovered: never leave it held.
  useEffect(() => () => useCpuReveals.getState().hold(false),[]);
  if (!entry) return null;
  const {card,seat} = entry;
  const color = PLAYER_COLORS[seat];
  const {src,landscape} = cardImage(card);
  const imageBox = landscape ? `aspect-[4/3] ${small ? "w-28" : "w-full"}` : `aspect-[3/4] ${small ? "w-20" : "mx-auto w-[min(15rem,34vh)]"}`;
  return (
    <div className={small
      ? "fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+5.75rem)] z-[95] flex justify-center pointer-events-none"
      : "fixed left-4 top-1/2 z-[95] -translate-y-1/2 pointer-events-none"}>
      <style>{DRAIN}</style>
      <section
        role="status"
        aria-live="polite"
        aria-label="CPU play"
        onPointerEnter={event => { if (event.pointerType !== "touch") hold(true); }}
        onPointerLeave={event => { if (event.pointerType !== "touch") hold(false); }}
        className={`pointer-events-auto relative overflow-hidden rounded-rc-lg border bg-[rgba(9,13,25,0.95)] font-rc-sans text-rc-fg shadow-rc-panel ${
          small ? "flex w-full max-w-md items-start gap-3 p-2.5" : "flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 p-3"}`}
        style={{borderColor:`${color}80`}}
      >
        {src ? (
          <div className={`relative shrink-0 overflow-hidden rounded-rc-md bg-black/30 shadow-rc-md ring-1 ring-rc-line/25 ${imageBox}`}>
            <Image
              src={src}
              alt={card.name}
              fill
              unoptimized
              sizes={small ? "112px" : "320px"}
              className={`${landscape ? "rotate-90 scale-[1.333] origin-center" : ""} object-contain object-center`}
            />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-rc-mono text-[11px] uppercase tracking-[0.14em]" style={{color}}>CPU {entry.action}</p>
              <h2 className={`font-rc-display leading-tight text-rc-accent-link ${small ? "text-base" : "text-[22px]"}`}>{card.name}</h2>
            </div>
            <RcButton variant="quiet" size="icon-xs" aria-label="Dismiss" onClick={() => dismiss(entry.id)}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </RcButton>
          </div>
          {entry.detail ? (
            <p className={`mt-1 text-rc-fg-strong ${small ? "text-xs" : "text-sm"}`}>{entry.detail}</p>
          ) : entry.kind === "spell" ? (
            <p className={`mt-1 text-rc-fg-muted ${small ? "text-xs" : "text-sm"}`}>Choosing…</p>
          ) : null}
          {rules ? (
            <p className={`mt-2 whitespace-pre-line leading-snug text-rc-fg-muted ${small ? "line-clamp-3 text-xs" : "thin-scrollbar max-h-[22vh] overflow-y-auto text-[13px]"}`}>{rules}</p>
          ) : null}
          {held || waiting ? (
            <p className="mt-2 font-rc-mono text-[11px] tabular-nums text-rc-fg-subtle">
              {held ? "Held while hovered" : ""}{held && waiting ? " · " : ""}{waiting ? `+${waiting} more` : ""}
            </p>
          ) : null}
        </div>
        {timer ? (
          <div
            key={timer.run}
            aria-hidden
            data-testid="cpu-reveal-timer"
            className="absolute inset-x-0 bottom-0 h-0.5 origin-left"
            style={{background:color,animation:`cpu-reveal-drain ${timer.ms}ms linear forwards`,animationPlayState:held || hidden ? "paused" : "running"}}
          />
        ) : null}
      </section>
    </div>
  );
}
