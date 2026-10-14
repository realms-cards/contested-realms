"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { cardImage } from "@/components/game/CpuPlayReveal";
import { useGraphicsSettings, useVisualAid } from "@/hooks/useGraphicsSettings";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { toneColors, type FieldTone } from "@/lib/game/cpu/fieldTargets";
import { handPickFrom, selectHandPick, selectPilePick, type DeckPile } from "@/lib/game/cpu/handPilePicks";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";
import { getCardImageUrl } from "@/lib/utils/cdnUrl";
import { withArt } from "./PreviewPanel2D";
import { DRAW_COLORS, TipButton } from "./SeatBar2D";
import { fxPalette } from "./actions2d";
import { HAND_GROUP_GAP, HAND_RAIL_W, HAND_STRIP_PAD, layoutHand, type HandSlot } from "./handLayout";
import {
  HAND_MIN_VISIBLE,
  HAND_MIN_VISIBLE_GROUPED,
  handCardBox,
  handCardState,
  handFloor,
  pileActionLabel,
  pileChipState,
  SITE_ART_SCALE,
  sortHand,
} from "./handStrip";

const SEAT = "p1";
const LONG_PRESS_MS = 450;
/** finger travel that cancels a long-press */
const MOVE_CANCEL_PX = 10;
/** spacing between cards that do not overlap */
const CARD_GAP = 6;
/** The deck piles a draw can come from, as the hand's labelled draw buttons. */
const DRAW_PILES: readonly { deck: DeckPile; icon: string; short: string }[] = [
  { deck: "atlas", icon: "game-icons:treasure-map", short: "Draw site" },
  { deck: "spellbook", icon: "game-icons:open-book", short: "Draw spell" },
];

/** useLayoutEffect in the browser, a no-op effect on the server (no warning during SSR). */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface StripRoom {
  /** the card area's inner width and height, px */
  width: number;
  height: number;
  /** the window's width and height */
  viewport: number;
  viewportH: number;
}

/** Measure the card area's inner box, following resizes. */
function useStripRoom() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState<StripRoom | null>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = Math.max(0, el.clientWidth - HAND_STRIP_PAD * 2);
      const height = Math.max(0, el.clientHeight - HAND_STRIP_PAD * 2);
      const viewport = window.innerWidth;
      const viewportH = window.innerHeight;
      setRoom((prev) =>
        prev && prev.width === width && prev.height === height && prev.viewport === viewport && prev.viewportH === viewportH
          ? prev
          : { width, height, viewport, viewportH },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, room };
}

/** Art for a hand card: CDN for printed cards, the token texture for tokens. */
function handArt(given: CardRef): { src: string | null; landscape: boolean } {
  // a card projected before the card index loaded has no slug yet: find its printing by name
  const card = withArt(given);
  const { src, landscape } = cardImage(card);
  if (card.slug && !card.slug.startsWith("token:")) return { src: getCardImageUrl(card.slug), landscape };
  return { src: src ?? (card.cardId ? `/api/images/${card.cardId}` : null), landscape };
}

/** A clickable tone wears a solid ring; a merely-lit one a dashed ring, so the two differ without hue (monochrome). */
function ringStyle(tone: FieldTone | null, clickable: boolean, colors: Record<FieldTone, string>): CSSProperties | undefined {
  if (!tone) return undefined;
  const color = colors[tone];
  return {
    outline: `2px ${clickable ? "solid" : "dashed"} ${color}`,
    outlineOffset: 1,
    boxShadow: clickable ? `0 0 12px ${color}88` : undefined,
  };
}

interface PressState {
  key: string;
  x: number;
  y: number;
  timer: number | null;
  fired: boolean;
}

/**
 * Your hand, docked under the 2D board — it never overlaps a board row.
 *
 * Cards follow the hand-sort setting, sites lie on their side, and each card is lit from the
 * board picker exactly as Hand3D lights it (including the mulligan case: a card both clickable
 * and chosen reads green and stays clickable). Tap a lit card to pick it; tap any other card to
 * preview it (mouse: hover previews). Long-press or right-click opens the card menu (Examine).
 *
 * The cards never scroll and are as large as the box allows (layoutHand, size first), sites and
 * spells always kept apart. On a phone held upright the hand uses the whole box: the sites in a
 * column (or two) beside the spells, which take one to three rows. Landscape and wide keep one
 * row (or one row per kind on a tall strip) with a wider gap between the kinds. A hand too long
 * overlaps rather than shrinks, each covered card keeping HAND_MIN_VISIBLE of itself, with a
 * hovered, focused or pickable card raised to the front.
 *
 * While a draw is on offer a slim rail at the start holds the draw buttons (a cool accent, not
 * gold, with a tooltip naming the action). Mana and the hand's split live in your seat's stats.
 */
export default function Hand2D({
  cardHeight,
  orientation,
  layout,
}: {
  cardHeight: number;
  orientation: "row" | "column";
  /** the 2D page's arrangement; without it the window's shape decides (upright = portrait) */
  layout?: "portrait" | "landscape" | "wide";
}) {
  const hand = useGameStore((s) => s.zones[SEAT]?.hand);
  const previewCard = useGameStore((s) => s.previewCard);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const openContextMenu = useGameStore((s) => s.openContextMenu);
  useEngineSession((s) => s.rev);
  const { settings } = useGraphicsSettings();
  const aid = useVisualAid();
  const colors = toneColors(aid);
  const fx = fxPalette(aid);
  const handPickSelector = useMemo(() => selectHandPick(SEAT), []);
  const slice = useCpuBoardPicker(useShallow(handPickSelector));
  const sequence = useCpuBoardPicker((s) => s.sequence);
  const pick = useMemo(() => handPickFrom(slice), [slice]);
  const pileSelector = useMemo(() => selectPilePick(SEAT), []);
  const pileSlice = useCpuBoardPicker(useShallow(pileSelector));
  const pickRequest = useCpuBoardPicker((s) => s.request);
  const pickLabels = useCpuBoardPicker((s) => s.labels);
  const entries = useMemo(() => sortHand(hand ?? [], settings.handSortOrder), [hand, settings.handSortOrder]);

  const press = useRef<PressState | null>(null);
  /** the cards moved since the pointer last did (a card left or joined the hand) */
  const stale = useRef(false);
  const handKeys = entries.map((e) => e.key).join("|");
  useLayoutEffect(() => {
    stale.current = true;
  }, [handKeys]);
  const hoveredToken = useRef<string | null>(null);
  const lastPointer = useRef<string>("");

  // Drop our hover publication when the strip unmounts mid-hover.
  useEffect(() => () => {
    if (press.current?.timer) window.clearTimeout(press.current.timer);
    const picker = useCpuBoardPicker.getState();
    if (hoveredToken.current && picker.hovered === hoveredToken.current) picker.setHovered(null);
  }, []);

  const { ref: stripRef, room } = useStripRoom();
  const arts = useMemo(() => entries.map(({ card }) => handArt(card)), [entries]);
  const measured = !!room && room.width > 0 && room.height > 0;
  const grouped =
    orientation === "column" || (layout ? layout === "portrait" : !!room && room.viewportH >= room.viewport);
  const placed = useMemo(
    () =>
      measured && room
        ? layoutHand({
            width: room.width,
            height: room.height,
            landscape: arts.map((art) => art.landscape),
            mode: grouped ? "grouped" : "row",
            gap: CARD_GAP,
            groupGap: HAND_GROUP_GAP,
            floor: handFloor(room.viewport),
            // big cards that overlap beat small ones side by side: the box is for the cards
            minVisible: grouped ? HAND_MIN_VISIBLE_GROUPED : HAND_MIN_VISIBLE,
            // a tall strip takes a big hand on two lines (one per kind) rather than slivers
            maxRows: 2,
          })
        : null,
    [arts, grouped, measured, room],
  );

  // sites another card partly covers: their printed name sits on the hidden edge, so they wear
  // a caption on the part that shows
  const covered = useMemo(() => {
    const out = new Set<number>();
    const slots = placed?.slots ?? [];
    for (const a of slots) {
      if (!a.landscape) continue;
      const hit = slots.some(
        (b) => b !== a && b.index > a.index && b.x < a.x + a.w && a.x < b.x + b.w && b.y < a.y + a.h && a.y < b.y + b.h,
      );
      if (hit) out.add(a.index);
    }
    return out;
  }, [placed]);

  const examine = (card: CardRef, index: number, x: number, y: number) => {
    openContextMenu({ kind: "handCard", who: SEAT, index, card }, { x, y });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, key: string, card: CardRef, index: number) => {
    lastPointer.current = e.pointerType;
    if (e.pointerType === "mouse") return; // right-click covers the mouse
    if (press.current?.timer) window.clearTimeout(press.current.timer);
    const { clientX: x, clientY: y } = e;
    const state: PressState = { key, x, y, timer: null, fired: false };
    state.timer = window.setTimeout(() => {
      state.timer = null;
      state.fired = true;
      examine(card, index, x, y);
    }, LONG_PRESS_MS);
    press.current = state;
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>, card: CardRef, token: string | null) => {
    if (e.pointerType === "mouse" && stale.current) {
      // the pointer really moved: the card under it is looked at now
      stale.current = false;
      onEnter(e, card, token);
      return;
    }
    const state = press.current;
    if (!state?.timer) return;
    if (Math.hypot(e.clientX - state.x, e.clientY - state.y) > MOVE_CANCEL_PX) {
      window.clearTimeout(state.timer);
      press.current = null;
    }
  };
  const endPress = () => {
    if (press.current?.timer) {
      window.clearTimeout(press.current.timer);
      press.current.timer = null;
    }
  };

  const onClick = (e: ReactMouseEvent<HTMLButtonElement>, key: string, card: CardRef, token: string | null) => {
    // the long-press already answered this touch
    if (press.current?.key === key && press.current.fired) {
      press.current = null;
      return;
    }
    press.current = null;
    if (token) {
      // the card being played is the card to look at: the preview follows the pick
      setPreviewCard(card);
      useCpuBoardPicker.getState().select(token);
      return;
    }
    // A touch tap (or Enter/Space) previews, and the same tap again closes it; a mouse already previews on hover.
    if (lastPointer.current === "mouse" && e.detail > 0) return;
    const showing = previewCard === card || (!!card.instanceId && previewCard?.instanceId === card.instanceId);
    setPreviewCard(showing ? null : card);
  };

  const onEnter = (e: ReactPointerEvent<HTMLButtonElement>, card: CardRef, token: string | null) => {
    if (e.pointerType !== "mouse") return;
    // a card that slid in under a resting pointer (the one played just left the hand) is not
    // one the player pointed at: the preview keeps the card they chose until the mouse moves
    if (stale.current) return;
    setPreviewCard(card);
    if (token) {
      hoveredToken.current = token;
      useCpuBoardPicker.getState().setHovered(token);
    }
  };
  const onLeave = (e: ReactPointerEvent<HTMLButtonElement>) => {
    endPress();
    if (e.pointerType !== "mouse") return;
    setPreviewCard(null);
    const picker = useCpuBoardPicker.getState();
    if (hoveredToken.current && picker.hovered === hoveredToken.current) picker.setHovered(null);
    hoveredToken.current = null;
  };

  const avatarName = useGameStore((s) => s.avatars[SEAT]?.card?.name ?? null);
  const drawColor = DRAW_COLORS[aid] ?? DRAW_COLORS.none;
  const roomy = (room?.viewport ?? 0) >= 640;
  const railH = room ? room.height + HAND_STRIP_PAD * 2 : 0;
  const draws = DRAW_PILES.map((pile) => ({ ...pile, state: pileChipState(pileSlice, SEAT, pile.deck, sequence) })).filter(
    (pile) => pile.state.token !== null,
  );
  const short = railH > 0 && railH < 100;
  const labelled = roomy && railH >= 140;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row items-stretch gap-1.5 self-stretch" aria-label="Your hand" role="group">
      {draws.length > 0 && (
        /* While a draw is on offer, a slim rail at the start holds the draw buttons, so the cards
           keep the rest of the box. Mana and the hand's split are in your seat's stats only. */
        <div
          className="flex shrink-0 flex-col items-stretch gap-1 py-1"
          style={{ width: roomy ? HAND_RAIL_W.roomy : HAND_RAIL_W.phone }}
        >
          {/* drawing is a pile pick; say so beside the hand, not only on the small rail chip */}
          {draws.length > 0 && (
            <div className="flex min-h-0 flex-1 flex-col gap-1">
              {draws.map(({ deck, icon, short: text, state }) => {
                const selected = state.tone === "selected";
                const color = selected ? colors.selected : drawColor;
                const action = pileActionLabel(deck, pickRequest, pickLabels, SEAT, avatarName);
                return (
                  <TipButton
                    key={deck}
                    tip={action}
                    aria-label={action}
                    aria-pressed={selected}
                    onClick={() => state.token && useCpuBoardPicker.getState().select(state.token)}
                    className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-rc-md border bg-[rgba(7,10,20,0.9)] px-0.5 font-rc-sans text-[10px] font-semibold leading-tight text-rc-fg shadow-rc-md hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring ${
                      short ? "min-h-[26px]" : "min-h-[32px]"
                    }`}
                    style={{ borderColor: color, borderStyle: selected ? "double" : "solid" }}
                  >
                    <Icon icon={icon} width={16} height={16} className="shrink-0" style={{ color }} aria-hidden />
                    {labelled && <span className="text-center">{text}</span>}
                  </TipButton>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div ref={stripRef} className="relative min-h-0 min-w-0 flex-1" style={{ padding: HAND_STRIP_PAD }}>
        {entries.length === 0 && (
          <span className="flex h-full items-center px-2 font-rc-sans text-xs text-rc-fg-subtle">No cards in hand</span>
        )}
        {entries.length > 0 &&
          (placed ? (
            // every card at the place layoutHand gave it; DOM order stays the hand's order (tab order)
            <div className="absolute" style={{ inset: HAND_STRIP_PAD }}>
              {placed.slots.map((slot) => renderCard(slot.index, slot))}
            </div>
          ) : (
            // not measured yet (first paint, tests): a plain row at the layout's nominal size
            <div className="flex h-full flex-row items-center gap-1.5">{entries.map((_, i) => renderCard(i, null))}</div>
          ))}
      </div>
    </div>
  );

  function renderCard(i: number, slot: HandSlot | null) {
    const { card, index, key } = entries[i];
    const { src, landscape } = arts[i];
    const box = slot ? { w: slot.w, h: slot.h } : handCardBox(cardHeight, landscape);
    const state = handCardState(pick, SEAT, card.instanceId, sequence);
    const clickable = state.token !== null;
    const lock = card.sealedBy ? `Sealed while ${card.sealedBy} lives` : card.lockedTo ? `Only ${card.lockedTo} can cast this` : null;
    const label = [card.name, lock, state.marked ? "chosen" : null, clickable ? "tap to pick" : null].filter(Boolean).join(", ");
    return (
      <button
        key={key}
        type="button"
        aria-label={label}
        aria-pressed={clickable ? state.tone === "selected" || state.marked : undefined}
        title={lock ?? card.name}
        draggable={false}
        onPointerDown={(e) => onPointerDown(e, key, card, index)}
        onPointerMove={(e) => onPointerMove(e, card, state.token)}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onPointerEnter={(e) => onEnter(e, card, state.token)}
        onPointerLeave={onLeave}
        onClick={(e) => onClick(e, key, card, state.token)}
        onContextMenu={(e) => {
          e.preventDefault();
          // a touch long-press may raise both our timer and the browser's contextmenu: answer once
          if (press.current?.fired) return;
          endPress();
          if (press.current) press.current.fired = true;
          examine(card, index, e.clientX, e.clientY);
        }}
        className={`${slot ? "absolute" : "relative"} shrink-0 select-none overflow-hidden rounded-rc-md border bg-black/40 shadow-rc-md transition-[outline-color,box-shadow,transform] [-webkit-touch-callout:none] hover:z-30 focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring motion-reduce:transition-none ${
          state.tone ? "border-transparent" : "border-rc-line/25"
        } ${clickable ? "cursor-pointer" : "cursor-default"} ${
          // pickable / chosen cards stay in front of the cards overlapping them
          state.tone ? "z-20" : ""
        } ${
          // overlapped cards peek out: lift the one under the pointer so it reads whole
          slot?.lift === "up" ? "hover:-translate-y-1" : ""
        }`}
        style={{
          width: box.w,
          height: box.h,
          ...(slot ? { left: slot.x, top: slot.y } : null),
          touchAction: "manipulation",
          ...ringStyle(state.tone, clickable, colors),
        }}
      >
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            unoptimized
            draggable={false}
            sizes={`${Math.max(box.w, box.h)}px`}
            className={landscape ? "object-contain object-center" : "object-cover object-center"}
            style={landscape ? { transform: `rotate(90deg) scale(${SITE_ART_SCALE})` } : undefined}
          />
        ) : (
          <span aria-hidden className="absolute inset-0 flex items-center justify-center p-1 text-center font-rc-display text-[10px] leading-tight text-rc-fg-muted">
            {card.name}
          </span>
        )}
        {covered.has(i) && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 truncate bg-[rgba(7,10,20,0.78)] px-1 py-px text-left font-rc-sans text-[10px] leading-tight text-rc-fg"
          >
            {card.name}
          </span>
        )}
        {lock && (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-[rgba(7,10,20,0.85)]"
            // the visual-aid palette, and a border style too: hue never carries "sealed"
            // (a stolen card) vs "locked" (bonded to one caster) on its own
            style={{
              borderColor: card.sealedBy ? fx.damage : fx.caster,
              borderStyle: card.sealedBy ? "solid" : "dashed",
              color: card.sealedBy ? fx.damage : fx.caster,
            }}
          >
            <Icon icon="game-icons:padlock" width={12} height={12} />
          </span>
        )}
        {state.marked && (
          <span
            aria-hidden
            className="absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-[rgba(7,10,20,0.85)]"
            style={{ borderColor: colors.target, color: colors.target }}
          >
            <Icon icon="game-icons:check-mark" width={12} height={12} />
          </span>
        )}
      </button>
    );
  }
}
