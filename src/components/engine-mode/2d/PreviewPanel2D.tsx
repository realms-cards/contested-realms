"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { cardImage } from "@/components/game/CpuPlayReveal";
import { cardRefFor, loadCardIndex } from "@/lib/engine-mode/cardIndex";
import { useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";
import { TOKEN_BY_NAME, tokenSlug } from "@/lib/game/tokens";
import { getCardImageUrl } from "@/lib/utils/cdnUrl";
import { useActionFeed } from "./ActionFeed2D";
import { useChosenSource } from "./PickGuide2D";
import { entrySummary, latestEntry } from "./actionFeed";

/** A printed card's proportions. */
const CARD_RATIO = 63 / 88;

/** The largest box of the card's shape that fits `maxW` x `maxH`. */
export function previewBox(landscape: boolean, maxW: number, maxH: number): { w: number; h: number } {
  const ratio = landscape ? 1 / CARD_RATIO : CARD_RATIO; // width / height
  const w = Math.max(0, Math.min(maxW, maxH * ratio));
  return { w: Math.floor(w), h: Math.floor(w / ratio) };
}

/** The compact caption's line: 11px type, its icon and the gap above it. */
const COMPACT_CAPTION_H = 18;

const PREVIEW_IN = "@keyframes rc-preview-in{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}";

/**
 * The card itself, as large as its box allows and with no frame of any kind: the art is the
 * preview. A site is stored upright and shown on its side, like the board lays it; tokens use
 * their own art. The CDN first, the image API as the fallback.
 */
function CardFace({ card: given, w, h, landscape, dim }: { card: CardRef; w: number; h: number; landscape: boolean; dim: boolean }) {
  const card = useCardWithArt(given);
  const { src: apiSrc } = cardImage(card);
  const slug = card.slug ?? "";
  const cdn = slug && !slug.startsWith("token:") ? getCardImageUrl(slug) : null;
  const [failed, setFailed] = useState<string | null>(null);
  const src = cdn && failed !== cdn ? cdn : apiSrc;
  return (
    <div
      className="relative flex-none motion-safe:[animation:rc-preview-in_.18s_ease-out]"
      style={{
        width: w,
        height: h,
        opacity: dim ? 0.42 : 1,
        filter: `drop-shadow(0 14px 28px rgba(0,0,0,0.6))${dim ? " saturate(0.6)" : ""}`,
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[4%/3%]">
        {src ? (
          landscape ? (
            // stored upright: a box of the swapped shape, centred and turned onto its side
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90" style={{ width: h, height: w }}>
              <Image
                src={src}
                alt={card.name}
                fill
                unoptimized
                sizes={`${Math.ceil(h)}px`}
                draggable={false}
                onError={() => setFailed(src)}
                className="object-cover"
              />
            </div>
          ) : (
            <Image
              src={src}
              alt={card.name}
              fill
              unoptimized
              sizes={`${Math.ceil(w)}px`}
              draggable={false}
              onError={() => setFailed(src)}
              className="object-cover"
            />
          )
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-3 text-center font-fantaisie text-xl text-rc-fg">{card.name}</span>
        )}
      </div>
    </div>
  );
}

const isLandscape = (card: CardRef) => cardImage(card).landscape;

/**
 * The card with something to draw: a ref built before the card index loaded (the opening hand)
 * or a token the projection named but did not stamp carries no slug, and the preview showed only
 * its name in an empty box. Tokens get their texture by name; printed cards their printing's
 * slug, once the index is in (it re-renders when that happens).
 */
export function withArt(card: CardRef): CardRef {
  if (card.slug) return card;
  const token = TOKEN_BY_NAME[card.name.toLowerCase()];
  if (token) return { ...card, slug: tokenSlug(token) };
  const slug = cardRefFor(card.name).slug;
  return slug ? { ...card, slug } : card;
}

/** withArt, loading the card index first when the card needs it. */
export function useCardWithArt(card: CardRef): CardRef {
  const resolved = withArt(card);
  const [, setLoaded] = useState(0);
  const missing = !resolved.slug;
  useEffect(() => {
    if (!missing) return;
    let live = true;
    void loadCardIndex()
      .then(() => {
        if (live) setLoaded((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [missing, card.name]);
  return resolved;
}

/**
 * The element's content box, kept current. A callback ref, so a different element taking the
 * ref (the figure switching between its compact and full shapes on a rotation) is measured too.
 */
function useSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return { ref: setEl, size };
}

/**
 * The inspector's top: whichever card is being looked at (hovered or tapped on the board, in
 * the hand or in the feed), shown as large as the section allows and borderless — unless the
 * opponent has acted since: their newest play takes the panel the moment it happens, even
 * while the pointer rests on a card (resting is not looking; moving to another card is, and
 * takes it back). It is never a blank box: with nothing previewed it shows the opponent's
 * latest play (dimmed once it is your turn), with a caption saying what it did, or — before
 * they have played anything — your own avatar.
 *
 * It fills the box its parent gives it (the sidebar shares the column's height between it and
 * the feed, and both give way when a prompt docks between them). `quiet={false}` (a phone's
 * landscape column, where height is precious) renders nothing at all until a card is
 * previewed, so the parent can collapse. `compact` (a portrait phone's half of the dock row,
 * the action feed right beside it) keeps the caption to one short line, so the card keeps
 * the height: the feed already says what the move did.
 */
export default function PreviewPanel2D({ quiet = true, compact = false }: { quiet?: boolean; compact?: boolean }) {
  const previewCard = useGameStore((s) => s.previewCard);
  const enabled = useGameStore((s) => s.cardPreviewsEnabled);
  const avatar = useGameStore((s) => s.avatars.p1?.card ?? null);
  const them = useEngineSession((s) => s.game?.players[1].name ?? "Computer");
  const theirTurn = useEngineSession((s) => s.game?.activePlayer === 1);
  const turns = useActionFeed();
  const last = useMemo(() => latestEntry(turns, "p2", true), [turns]);
  const lastRef = useMemo(() => (last?.card ? (cardRefFor(last.card) as CardRef) : null), [last]);

  // which came last: the pointer moving to a card, or the opponent's newest play
  const [order, setOrder] = useState({ looked: 0, played: 0 });
  const tick = useRef(0);
  useEffect(() => {
    if (previewCard) setOrder((o) => ({ ...o, looked: ++tick.current }));
  }, [previewCard]);
  // a play already made when the panel mounts is not news
  const lastId = last?.id ?? null;
  const seenId = useRef(lastId);
  useEffect(() => {
    if (lastId === null || lastId === seenId.current) return;
    seenId.current = lastId;
    setOrder((o) => ({ ...o, played: ++tick.current }));
  }, [lastId]);

  // the card you are playing or moving right now: it stays up while you choose where, even
  // after the pointer has left it. Picking it is looking at it: it replaces whatever an earlier
  // tap left in the preview, and a card looked at after that (a hover) takes over again.
  const chosen = useChosenSource();
  const chosenKey = chosen ? `${chosen.instanceId ?? ""}:${chosen.name}` : null;
  const [chosenAt, setChosenAt] = useState(0);
  useEffect(() => {
    if (chosenKey) setChosenAt(++tick.current);
  }, [chosenKey]);
  const chosenFirst = !!chosen && (!previewCard || chosenAt > order.looked);
  const looking = !enabled ? null : chosenFirst ? chosen : (previewCard ?? chosen);
  const theirsFirst = quiet && !!lastRef && order.played > order.looked && !chosen;
  const live = theirsFirst ? null : looking;
  const card = live ?? (quiet ? (lastRef ?? avatar) : null);
  if (!card) return null;
  const caption = live ? null : last && lastRef === card ? { them, text: entrySummary(last), now: theirTurn } : "hint";
  return <PreviewFigure card={card} live={!!live || (caption !== "hint" && !!caption?.now)} caption={caption} compact={compact} />;
}

function PreviewFigure({
  card,
  live,
  caption,
  compact,
}: {
  card: CardRef;
  live: boolean;
  caption: { them: string; text: string; now: boolean } | "hint" | null;
  compact: boolean;
}) {
  // the card gets what the caption leaves: the caption is never cut to make room for the art
  const { ref, size } = useSize<HTMLDivElement>();
  const { ref: compactRef, size: compactSize } = useSize<HTMLElement>();
  const landscape = isLandscape(card);
  const box = previewBox(landscape, Math.max(0, size.w - 4), Math.max(0, size.h - 4));
  if (compact) {
    const theirs = caption && caption !== "hint" ? caption : null;
    // the card and its caption as one centred group: the caption sits right under the art
    // (a landscape site in a tall box left a wide gap between them when only the art centred)
    const art = previewBox(landscape, Math.max(0, compactSize.w - 4), Math.max(0, compactSize.h - 4 - (caption ? COMPACT_CAPTION_H : 0)));
    return (
      <figure
        ref={compactRef}
        aria-label={theirs ? `${theirs.them}'s ${theirs.now ? "move" : "last move"}: ${card.name}` : `Preview: ${card.name}`}
        className="m-0 flex h-full w-full flex-col items-center justify-center overflow-hidden"
      >
        <style>{PREVIEW_IN}</style>
        <div className="flex w-full flex-none items-center justify-center" style={{ height: art.h }}>
          {art.w > 0 && art.h > 0 && (
            <CardFace key={`${card.name}:${card.slug ?? ""}`} card={card} w={art.w} h={art.h} landscape={landscape} dim={!live} />
          )}
        </div>
        {caption && (
          <figcaption
            className="flex w-full max-w-full flex-none items-center justify-center gap-1 truncate pt-0.5 text-[11px] leading-tight text-rc-fg-muted"
            title={theirs ? `${theirs.them}: ${theirs.text}` : undefined}
          >
            <Icon
              icon={theirs ? "game-icons:eye-target" : "game-icons:magnifying-glass"}
              aria-hidden
              className="h-3 w-3 flex-none"
              style={theirs ? { color: PLAYER_COLORS.p2 } : undefined}
            />
            <span className="min-w-0 truncate" style={theirs ? { color: PLAYER_COLORS.p2 } : undefined}>
              {/* the half-width column is narrow: the figure's label carries the full wording */}
              {theirs ? (theirs.now ? "Their move" : "Their last move") : "Tap a card to see it"}
            </span>
          </figcaption>
        )}
      </figure>
    );
  }
  return (
    <figure
      aria-label={caption && caption !== "hint" ? `${caption.them}'s ${caption.now ? "move" : "last move"}: ${card.name}` : `Preview: ${card.name}`}
      className="m-0 flex h-full w-full flex-col items-center overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(120,140,190,0.10) 0%, rgba(0,0,0,0) 65%)" }}
    >
      <style>{PREVIEW_IN}</style>
      <div ref={ref} className="flex min-h-0 w-full flex-1 items-center justify-center">
        {box.w > 0 && box.h > 0 && (
          <CardFace key={`${card.name}:${card.slug ?? ""}`} card={card} w={box.w} h={box.h} landscape={landscape} dim={!live} />
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 flex w-full max-w-full flex-none items-start gap-1.5 px-1 text-[12px] leading-snug text-rc-fg-muted">
          {caption !== "hint" ? (
            <>
              <Icon icon="game-icons:eye-target" aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" style={{ color: PLAYER_COLORS.p2 }} />
              <span className={`min-w-0 ${caption.now ? "text-rc-fg" : ""}`}>
                <span style={{ color: PLAYER_COLORS.p2 }}>
                  {caption.them}&apos;s {caption.now ? "move" : "last move"}.
                </span>{" "}
                {caption.text}
              </span>
            </>
          ) : (
            <>
              <Icon icon="game-icons:magnifying-glass" aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" />
              <span className="min-w-0">Point at or tap any card to see it here.</span>
            </>
          )}
        </figcaption>
      )}
    </figure>
  );
}
