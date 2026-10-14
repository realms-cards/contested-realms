"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import { useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { cardImage } from "@/components/game/CpuPlayReveal";
import type { FieldTone } from "@/lib/game/cpu/fieldTargets";
import type { CardRef } from "@/lib/game/store/types";
import { getCardImageUrl } from "@/lib/utils/cdnUrl";
import { cardTurn, isClickableTone, ownerGlow, type Attachment, type Placed, type StatusKind } from "./layout2d";
import { useLongPress, type PressInfo } from "./useLongPress";

const STATUS_ICONS: Record<StatusKind, string> = {
  stealth: "game-icons:hood",
  ward: "game-icons:magic-shield",
  disabled: "game-icons:manacles",
  silenced: "game-icons:silenced",
};
const STATUS_LABELS: Record<StatusKind, string> = {
  stealth: "Stealth",
  ward: "Ward",
  disabled: "Disabled",
  silenced: "Silenced",
};
const LAYER_ICONS = { burrowed: "game-icons:underground-cave", submerged: "game-icons:wave-crest" } as const;

/** Board art: the CDN for real cards (a whole board of images), token art from assets, the image API as the fallback. */
function cardArt(card: Pick<CardRef, "name"> & Partial<Pick<CardRef, "slug" | "type">>): {
  src: string | null;
  fallback: string | null;
  landscape: boolean;
} {
  const { src, landscape } = cardImage(card);
  const slug = card.slug || "";
  if (!src || slug.startsWith("token:")) return { src, fallback: null, landscape };
  return { src: getCardImageUrl(slug), fallback: src, landscape };
}

/** A card's art, falling back from the CDN to the image API, and to its name when there is no art at all. */
export function CardArt({ card, sizes, rotateLandscape = true }: { card: CardRef; sizes: string; rotateLandscape?: boolean }) {
  const art = cardArt(card);
  const [failed, setFailed] = useState<string | null>(null);
  const src = failed === art.src ? art.fallback : art.src;
  if (!src) {
    return (
      <span className="absolute inset-0 flex items-center justify-center p-0.5 text-center font-rc-display text-[9px] leading-tight text-rc-fg-muted">
        {card.name}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      fill
      unoptimized
      sizes={sizes}
      draggable={false}
      onError={() => setFailed(art.src)}
      className={`${art.landscape && rotateLandscape ? "rotate-90 scale-[1.41] object-contain" : "object-cover"} pointer-events-none object-center`}
    />
  );
}

/** A pick frame's offset from its card, per side (negative = outside the card). */
export interface FrameInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** How far the frame and its bracket arms reach past the card: the -3 px inset plus 2 px of arm. */
const FRAME_REACH = 5;

/**
 * The frame's inset per side, pulled in wherever the card sits closer than FRAME_REACH to the
 * board's edge — so a card on the edge row never draws its brackets over the hand or the bar
 * next to the board. `box` is the card's on-screen box in board px.
 */
export function frameInset(box: { left: number; top: number; width: number; height: number }, bounds: { w: number; h: number }): FrameInset {
  const side = (room: number) => 2 - Math.min(FRAME_REACH, Math.max(0, room));
  return {
    left: side(box.left),
    top: side(box.top),
    right: side(bounds.w - (box.left + box.width)),
    bottom: side(bounds.h - (box.top + box.height)),
  };
}

/** The pick frame: a clickable target wears corner brackets and breathes, a merely-lit one a plain box. */
function ToneFrame({ tone, color, inset = -3 }: { tone: FieldTone; color: string; inset?: number | FrameInset }) {
  const clickable = isClickableTone(tone);
  // the picks layer's rhythm (FieldTargets2D): a continuing choice breathes slower; reduced motion keeps it still
  const pulse = !clickable ? "" : tone === "continue" ? "motion-safe:animate-pulse motion-safe:[animation-duration:3.2s]" : "motion-safe:animate-pulse";
  const arm = "absolute h-[28%] w-[28%] max-h-3 max-w-3 min-h-1.5 min-w-1.5 border-current";
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute"
      style={typeof inset === "number" ? { inset, color } : { ...inset, color }}
    >
      <span
        className={`absolute inset-0 rounded-[5px] ${pulse}`}
        style={{
          border: `${tone === "selected" ? 3 : 2}px solid ${color}`,
          opacity: clickable ? 0.55 : 0.95,
          boxShadow: clickable ? `0 0 8px ${color}` : undefined,
        }}
      />
      {clickable && (
        <>
          <span className={`${arm} -left-0.5 -top-0.5 border-l-[3px] border-t-[3px]`} />
          <span className={`${arm} -right-0.5 -top-0.5 border-r-[3px] border-t-[3px]`} />
          <span className={`${arm} -bottom-0.5 -left-0.5 border-b-[3px] border-l-[3px]`} />
          <span className={`${arm} -bottom-0.5 -right-0.5 border-b-[3px] border-r-[3px]`} />
        </>
      )}
    </span>
  );
}

/** What an arranging press reports: the pointer's travel in px; "cancel" when it never moved. */
export type ArrangeDrag = (placed: Placed, phase: "move" | "end" | "cancel", dx: number, dy: number) => void;

/** px a pointer travels before an arranging press counts as a drag */
const ARRANGE_SLOP = 4;

export interface Card2DProps {
  placed: Placed;
  tone: FieldTone | null;
  /** the tone palette for the current visual aid (toneColors) */
  colors: Record<FieldTone, string>;
  /** how an attachment or status token is lit, by its pick token */
  toneOf?: (token: string) => FieldTone | null;
  onTap: (placed: Placed, info: PressInfo, attachment?: Attachment) => void;
  onLongPress: (placed: Placed, info: PressInfo, attachment?: Attachment) => void;
  /** mouse only: the pointer entered (true) or left (false) the card */
  onHover?: (placed: Placed, entering: boolean, attachment?: Attachment) => void;
  /** the board's size in px: keeps the pick frame from reaching past the board's edge */
  bounds?: { w: number; h: number };
  /**
   * Arranging (display only): a press that drags the card slides it within its tile instead of
   * tapping it — with Alt (Option) held, or every press while the phones' arrange mode is on,
   * when a tap does nothing at all. Absent for a card that keeps its place (an aura, a body).
   */
  arrange?: { mode: boolean; held: boolean; dragging: boolean; onDrag: ArrangeDrag };
}

const BADGE = "flex items-center justify-center gap-px rounded-full border font-rc-mono tabular-nums leading-none shadow-rc-sm";

/**
 * One card on the 2D board, absolutely placed in board pixels by layout2d. The opponent's cards
 * lie upside down, as played from across the table, with a faint glow in their colour; ours stand
 * upright with none (cardTurn, ownerGlow). Tapped cards turn a quarter from their owner's view.
 * Status tokens are icon badges and carried artifacts chips under the card, both outside the
 * rotation so they always read upright.
 */
export default function Card2D({ placed, tone, colors, toneOf, onTap, onLongPress, onHover, bounds, arrange }: Card2DProps) {
  const { card, owner, x, y, w, h, rotate, z, faded, badges, statuses, attachments } = placed;
  const press = useLongPress({
    onTap: (info) => onTap(placed, info),
    onLongPress: (info) => onLongPress(placed, info),
  });
  // an arranging press: captured, so the card follows the pointer even off its own box
  const drag = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const endDrag = (e: ReactPointerEvent, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return false;
    drag.current = null;
    arrange?.onDrag(placed, d.moved && !cancelled ? "end" : "cancel", e.clientX - d.x, e.clientY - d.y);
    return true;
  };
  const handlers = {
    ...press,
    onPointerDown: (e: ReactPointerEvent) => {
      swallowClick.current = false;
      if (arrange && e.button === 0 && e.isPrimary && (arrange.mode || e.altKey)) {
        e.preventDefault();
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // capture is a nicety: without it the drag still ends on the card
        }
        drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
        swallowClick.current = true;
        return;
      }
      press.onPointerDown(e);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const d = drag.current;
      if (!d || d.pointer !== e.pointerId) return press.onPointerMove(e);
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < ARRANGE_SLOP) return;
      d.moved = true;
      arrange?.onDrag(placed, "move", dx, dy);
    },
    onPointerUp: (e: ReactPointerEvent) => {
      if (!endDrag(e, false)) press.onPointerUp(e);
    },
    onPointerCancel: (e: ReactPointerEvent) => {
      if (!endDrag(e, true)) press.onPointerCancel(e);
    },
    onContextMenu: (e: ReactMouseEvent) => {
      // arrange mode owns every press, a finger's long press included
      if (arrange?.mode || drag.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      press.onContextMenu(e);
    },
    onClick: (e: ReactMouseEvent) => {
      if (swallowClick.current) {
        swallowClick.current = false;
        e.stopPropagation();
        return;
      }
      press.onClick(e);
    },
  };
  const grab = arrange ? (arrange.dragging ? "grabbing" : arrange.mode || arrange.held ? "grab" : undefined) : undefined;
  const turned = rotate === 90;
  // the rotated card's on-screen box, centred in the w x h slot
  const fw = turned ? h : w;
  const fh = turned ? w : h;
  const badge = Math.round(Math.max(11, Math.min(16, h * 0.26)));
  const badgeStyle: CSSProperties = { height: badge, minWidth: badge, fontSize: Math.max(8, badge - 4), paddingInline: 2 };
  const turn = cardTurn(placed);
  const label = [
    card.name,
    owner === "p1" ? "yours" : "opponent's",
    turned ? "tapped" : null,
    badges.damage ? `${badges.damage} damage` : null,
    ...statuses.map((s) => (s.status ? STATUS_LABELS[s.status] : null)),
    badges.layerState,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="pointer-events-none absolute" style={{ left: x - w / 2, top: y - h / 2, width: w, height: h, zIndex: z }}>
      <button
        type="button"
        {...handlers}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") onHover?.(placed, true);
        }}
        onPointerLeave={(e) => {
          if (!drag.current) press.onPointerLeave(e);
          if (e.pointerType === "mouse") onHover?.(placed, false);
        }}
        aria-label={label}
        title={card.name}
        className={`pointer-events-auto absolute inset-0 ${arrange?.mode ? "touch-none" : "touch-manipulation"} select-none overflow-hidden rounded-[4px] bg-rc-floor transition-transform duration-200 [-webkit-touch-callout:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rc-accent motion-reduce:transition-none`}
        style={{
          cursor: grab,
          transform: turn ? `rotate(${turn}deg)` : undefined,
          opacity: faded ? 0.45 : 1,
          // a neutral hairline keeps the card's edge off the site art; owner is the facing (+ glow), not a line
          border: "1px solid rgba(0,0,0,0.55)",
          boxShadow: ownerGlow(owner, h),
        }}
        data-owner={owner}
        data-turn={turn}
      >
        <CardArt card={card} sizes={`${Math.ceil(w)}px`} rotateLandscape={false} />
      </button>

      <div
        className="pointer-events-none absolute"
        style={{ left: (w - fw) / 2, top: (h - fh) / 2, width: fw, height: fh }}
      >
        {tone && (
          <ToneFrame
            tone={tone}
            color={colors[tone]}
            inset={bounds ? frameInset({ left: x - fw / 2, top: y - fh / 2, width: fw, height: fh }, bounds) : undefined}
          />
        )}

        {statuses.length > 0 && (
          <div className="absolute -left-1 -top-1 flex gap-px">
            {statuses.map((s) => {
              const statusTone = toneOf?.(s.token) ?? null;
              return (
                <span
                  key={s.key}
                  title={s.status ? STATUS_LABELS[s.status] : s.card.name}
                  className={`${BADGE} relative border-rc-line/30 bg-[rgba(7,10,20,0.9)] text-rc-fg-strong`}
                  style={badgeStyle}
                >
                  <Icon icon={s.status ? STATUS_ICONS[s.status] : "game-icons:token"} width={badge - 4} height={badge - 4} />
                  {statusTone && <ToneFrame tone={statusTone} color={colors[statusTone]} inset={-2} />}
                </span>
              );
            })}
          </div>
        )}

        {(badges.counters > 0 || badges.layerState) && (
          <div className="absolute -right-1 -top-1 flex gap-px">
            {badges.layerState && (
              <span
                title={badges.layerState === "burrowed" ? "Burrowed" : "Submerged"}
                className={`${BADGE} border-rc-line/30 bg-[rgba(7,10,20,0.9)] text-rc-info`}
                style={badgeStyle}
              >
                <Icon icon={LAYER_ICONS[badges.layerState]} width={badge - 4} height={badge - 4} />
              </span>
            )}
            {badges.counters > 0 && (
              <span title={`${badges.counters} counters`} className={`${BADGE} border-rc-line/30 bg-[rgba(7,10,20,0.9)] text-rc-fg-strong`} style={badgeStyle}>
                +{badges.counters}
              </span>
            )}
          </div>
        )}

        {badges.stats && (
          <span
            title={`Power ${badges.stats.atk}, life ${badges.stats.def}`}
            className={`${BADGE} absolute -bottom-1 -left-1 border-rc-line/30 bg-[rgba(7,10,20,0.92)] text-rc-fg-strong`}
            style={badgeStyle}
          >
            {badges.stats.atk}/{badges.stats.def}
          </span>
        )}

        {badges.damage > 0 && (
          <span
            title={`${badges.damage} damage`}
            className={`${BADGE} absolute -bottom-1 -right-1 border-rc-danger bg-rc-danger text-white`}
            style={badgeStyle}
          >
            <Icon icon="game-icons:sword-wound" width={badge - 5} height={badge - 5} />
            {badges.damage}
          </span>
        )}
      </div>

      {attachments.length > 0 && (
        <div
          className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-px"
          style={{ top: (h + fh) / 2 + 2 }}
        >
          {attachments.map((a) => (
            <AttachmentChip
              key={a.key}
              attachment={a}
              placed={placed}
              tone={toneOf?.(a.token) ?? null}
              colors={colors}
              height={Math.max(12, Math.min(16, h * 0.26))}
              onTap={onTap}
              onLongPress={onLongPress}
              onHover={onHover}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentChip({
  attachment,
  placed,
  tone,
  colors,
  height,
  onTap,
  onLongPress,
  onHover,
}: {
  attachment: Attachment;
  placed: Placed;
  tone: FieldTone | null;
  colors: Record<FieldTone, string>;
  height: number;
  onTap: Card2DProps["onTap"];
  onLongPress: Card2DProps["onLongPress"];
  onHover?: Card2DProps["onHover"];
}) {
  const press = useLongPress({
    onTap: (info) => onTap(placed, info, attachment),
    onLongPress: (info) => onLongPress(placed, info, attachment),
  });
  return (
    <button
      type="button"
      {...press}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onHover?.(placed, true, attachment);
      }}
      onPointerLeave={(e) => {
        press.onPointerLeave(e);
        if (e.pointerType === "mouse") onHover?.(placed, false, attachment);
      }}
      title={attachment.card.name}
      aria-label={`${attachment.card.name}, carried by ${placed.card.name}`}
      className="pointer-events-auto relative flex max-w-[5.5rem] touch-manipulation select-none items-center gap-0.5 rounded-full border border-rc-line/30 bg-[rgba(7,10,20,0.92)] px-1 font-rc-sans text-rc-fg shadow-rc-sm [-webkit-touch-callout:none]"
      style={{ height, fontSize: Math.max(8, height - 6) }}
    >
      <Icon icon="game-icons:swap-bag" width={height - 4} height={height - 4} className="shrink-0 text-rc-fg-muted" />
      <span className="truncate">{attachment.card.name}</span>
      {tone && <ToneFrame tone={tone} color={colors[tone]} inset={-2} />}
    </button>
  );
}
