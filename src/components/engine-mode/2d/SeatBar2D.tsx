"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { useVisualAid, type VisualAid } from "@/hooks/useGraphicsSettings";
import { engineSeatResources, manaColor, THRESHOLD_ELEMENTS } from "@/lib/engine-mode/resources";
import { BOT_SEAT, HUMAN_SEAT, useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { toneColors } from "@/lib/game/cpu/fieldTargets";
import { selectPilePick, type DeckPile } from "@/lib/game/cpu/handPilePicks";
import { useGameStore } from "@/lib/game/store";
import { viewFor } from "@sorcery/shared";
import { handSplitOf, handSplitText, lifeText, pileActionLabel, pileChipState, readHandCounts, type HandSplit } from "./handStrip";
import type { SeatBarDensity } from "./useBoard2DSizing";

type Seat = "p1" | "p2";
type PileFrom = "spellbook" | "atlas" | "graveyard";

const CHIP =
  "flex shrink-0 items-center rounded-rc-md border bg-black/30 font-rc-mono tabular-nums text-rc-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rc-accent-ring";

const PILES: readonly { from: PileFrom; deck: DeckPile | null; icon: string; label: string }[] = [
  { from: "spellbook", deck: "spellbook", icon: "game-icons:open-book", label: "Spellbook" },
  { from: "atlas", deck: "atlas", icon: "game-icons:treasure-map", label: "Atlas" },
  { from: "graveyard", deck: null, icon: "game-icons:tombstone", label: "Cemetery" },
];

/** useLayoutEffect in the browser, a no-op effect on the server (no warning during SSR). */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const TIP_LONG_PRESS_MS = 450;
/** how long a long-pressed tooltip stays up after the finger lifts */
const TIP_LINGER_MS = 1800;
const TIP_MAX_W = 220;

/**
 * "You can draw here": a cool, quiet accent rather than the board's amber pick tone, so the
 * only gold on screen stays the one commit button. It never carries the meaning alone — the
 * chip also lifts, pulses and gets a tooltip naming the action.
 */
export const DRAW_COLORS: Record<VisualAid, string> = {
  none: "#7dd3fc",
  colorblind: "#56b4e9",
  monochrome: "#e4e4e4",
};

/** A hand card's kind, as the split counts show it. */
export type CardKind = "site" | "spell";

/**
 * Sites vs spells, the same pair wherever a hand's split is shown: a terrain glyph and a casting
 * hand, each set in a little card frame of the card's own shape — a site's frame lies on its side,
 * a spell's stands upright — so the two read apart by silhouette alone (monochrome), not by hue.
 */
export const HAND_SITE_ICON = "game-icons:mountain-road";
export const HAND_SPELL_ICON = "game-icons:fire-spell-cast";

/** The frames' tints: earthy sites, arcane spells; the visual-aid palettes keep them apart for colour blindness. */
export const CARD_KIND_COLORS: Record<VisualAid, Record<CardKind, string>> = {
  none: { site: "#a9c47f", spell: "#b89cf5" },
  colorblind: { site: "#e69f00", spell: "#cc79a7" },
  monochrome: { site: "#d4d4d4", spell: "#d4d4d4" },
};

/** Long edge to short edge of a printed card. */
const KIND_ASPECT = 0.72;

/**
 * One kind glyph: `size` is the frame's long edge in px (the site's width, the spell's height).
 * Decorative: whatever shows it says the kind in its label.
 */
export function CardKindGlyph({ kind, size, aid }: { kind: CardKind; size: number; aid: VisualAid }) {
  const color = (CARD_KIND_COLORS[aid] ?? CARD_KIND_COLORS.none)[kind];
  const long = Math.max(8, Math.round(size));
  const short = Math.max(6, Math.round(long * KIND_ASPECT));
  const site = kind === "site";
  const inner = Math.max(4, short - 4);
  return (
    <span
      aria-hidden
      data-kind={kind}
      className="inline-flex shrink-0 items-center justify-center rounded-[2px] border-[1.5px] border-solid"
      style={{ width: site ? long : short, height: site ? short : long, borderColor: color, background: `${color}26`, color }}
    >
      <Icon icon={site ? HAND_SITE_ICON : HAND_SPELL_ICON} width={inner} height={inner} />
    </span>
  );
}

type TipButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  /** the tooltip text; null shows none */
  tip: string | null;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
};

/**
 * A button with an accessible tooltip (role="tooltip", aria-describedby) shown on mouse hover,
 * keyboard focus, and a touch long-press, which a phone has no hover for. The long-press only
 * shows the tip: the tap it would have been is swallowed, so reading never fires the action.
 * The tip is portalled to the body at fixed coordinates, because every 2D slot clips overflow.
 */
export function TipButton({ tip, onClick, children, onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, ...rest }: TipButtonProps) {
  const id = useId();
  const ref = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const press = useRef<{ timer: number | null; fired: boolean }>({ timer: null, fired: false });
  const linger = useRef<number | null>(null);

  const clearTimers = () => {
    if (press.current.timer) window.clearTimeout(press.current.timer);
    press.current.timer = null;
    if (linger.current) window.clearTimeout(linger.current);
    linger.current = null;
  };
  useEffect(() => clearTimers, []);

  useIsoLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const below = r.top < 56;
    const left = Math.max(8, Math.min(vw - TIP_MAX_W - 8, r.left + r.width / 2 - TIP_MAX_W / 2));
    setPos({ left, top: below ? r.bottom + 6 : r.top - 6, below });
  }, [open]);

  const show = tip !== null && open && pos !== null;
  return (
    <>
      <button
        ref={ref}
        type="button"
        // no native title: it would double the custom tip on hover (and never shows on touch)
        aria-describedby={tip ? id : undefined}
        {...rest}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          onPointerLeave?.(e);
          if (e.pointerType === "mouse") setOpen(false);
          if (press.current.timer) window.clearTimeout(press.current.timer);
          press.current.timer = null;
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onPointerDown={(e) => {
          onPointerDown?.(e);
          press.current.fired = false;
          if (e.pointerType === "mouse" || !tip) return;
          clearTimers();
          press.current.timer = window.setTimeout(() => {
            press.current.timer = null;
            press.current.fired = true;
            setOpen(true);
          }, TIP_LONG_PRESS_MS);
        }}
        onPointerUp={(e) => {
          onPointerUp?.(e);
          if (press.current.timer) window.clearTimeout(press.current.timer);
          press.current.timer = null;
          if (press.current.fired) linger.current = window.setTimeout(() => setOpen(false), TIP_LINGER_MS);
        }}
        onPointerCancel={(e) => {
          onPointerCancel?.(e);
          clearTimers();
          setOpen(false);
        }}
        onContextMenu={(e) => {
          // a touch long-press also raises the browser's menu: the tip already answered it
          if (press.current.fired || press.current.timer) e.preventDefault();
        }}
        onClick={(e) => {
          if (press.current.fired) {
            press.current.fired = false;
            return;
          }
          onClick(e);
        }}
      >
        {children}
      </button>
      {show &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[90] rounded-rc-md border border-rc-line/30 bg-[rgba(7,10,20,0.96)] px-2 py-1 font-rc-sans text-xs leading-snug text-rc-fg shadow-rc-panel"
            style={{ left: pos.left, top: pos.top, maxWidth: TIP_MAX_W, transform: pos.below ? undefined : "translateY(-100%)" }}
          >
            {tip}
          </span>,
          document.body,
        )}
      {/* the description must exist while closed too, for screen readers */}
      {tip && !show && (
        <span id={id} className="sr-only">
          {tip}
        </span>
      )}
    </>
  );
}

/** A pickable pile's ring: solid + pulsing for "tap me", dashed for lit only (no hue needed). */
export function PulseRing({ color, clickable }: { color: string; clickable: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -inset-[3px] rounded-rc-md border-2 ${clickable ? "motion-safe:animate-pulse" : ""}`}
      style={{ borderColor: color, borderStyle: clickable ? "solid" : "dashed", boxShadow: clickable ? `0 0 12px ${color}aa` : undefined }}
    />
  );
}

/** Spells and sites in a hand as two icon counts (or the total alone when only that is public). */
export function HandSplitCounts({ split, size, aid, className = "" }: { split: HandSplit; size: number; aid: VisualAid; className?: string }) {
  if (split.mixed) {
    return (
      <span className={`flex items-center gap-0.5 ${className}`}>
        <Icon icon="game-icons:hand" width={size} height={size} className="shrink-0 text-rc-fg-muted" />
        {split.spells}
      </span>
    );
  }
  return (
    <span className={`flex items-center ${className}`}>
      <span className="flex items-center gap-0.5">
        <CardKindGlyph kind="spell" size={size + 3} aid={aid} />
        {split.spells}
      </span>
      <span className="flex items-center gap-0.5">
        <CardKindGlyph kind="site" size={size + 3} aid={aid} />
        {split.sites}
      </span>
    </span>
  );
}

/**
 * One seat's public state for the 2D board: life (Death's Door named outright), mana,
 * thresholds, and hand / spellbook / atlas / cemetery counts. The numbers come from the
 * engine (engineSeatResources), the same source as the 3D panels.
 *
 * The deck pile chips are real targets: a pile pick ("draw a site") rings them and a tap
 * selects the pile token; otherwise a tap opens the pile's menu (browse the cemetery, count a
 * deck). The computer's bar also says when it is thinking.
 *
 * `density` (from computeBoard2DSizing) fits the bar to its box: `full` is one labelled line;
 * `tight` is one slim line for a phone's width, the thresholds as a 2 x 2 block so the
 * cemetery chip is never pushed off-screen; `column` and `columnTight` are vertical stacks for
 * the left column (who, life and mana — side by side in a desktop's wide column — thresholds
 * 2 x 2, then the pile chips 2 x 2). The chips there are icons and counts only; the title
 * and aria-label say what each one is.
 */
export default function SeatBar2D({ seat, density }: { seat: Seat; density: SeatBarDensity }) {
  const player = useGameStore((s) => s.players[seat]);
  const avatarName = useGameStore((s) => s.avatars[seat]?.card?.name ?? null);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const openContextMenu = useGameStore((s) => s.openContextMenu);
  const game = useEngineSession((s) => s.game);
  const rev = useEngineSession((s) => s.rev);
  const botThinking = useEngineSession((s) => s.botThinking);
  const aid = useVisualAid();
  const colors = toneColors(aid);
  const drawColor = DRAW_COLORS[aid] ?? DRAW_COLORS.none;
  const pileSelector = useMemo(() => selectPilePick(seat), [seat]);
  const pileSlice = useCpuBoardPicker(useShallow(pileSelector));
  const sequence = useCpuBoardPicker((s) => s.sequence);
  const pickRequest = useCpuBoardPicker((s) => s.request);
  const pickLabels = useCpuBoardPicker((s) => s.labels);
  const ownHand = useGameStore((s) => (seat === "p1" ? s.zones.p1?.hand : undefined));
  const engineSeat = seat === "p1" ? HUMAN_SEAT : BOT_SEAT;
  // Your split comes from the cards you hold; the computer's from what the engine shows you
  // (card backs differ, so the split is public — except a Magician's, which is the total only).
  const split = useMemo<HandSplit | null>(() => {
    if (seat === "p1") return handSplitOf(ownHand ?? []);
    if (!game) return null;
    // `rev` re-reads the engine state, which is mutated in place
    void rev;
    return readHandCounts(viewFor(game, HUMAN_SEAT).players[engineSeat]);
  }, [seat, ownHand, game, rev, engineSeat]);

  if (!game) return null;
  const resources = engineSeatResources(game, engineSeat);
  const you = seat === "p1";
  const seatColor = PLAYER_COLORS[seat];
  const active = currentPlayer === (seat === "p1" ? 1 : 2);
  const thinking = !you && botThinking;
  const column = density === "column" || density === "columnTight";
  const tight = density === "tight" || density === "columnTight";
  const lifeState = player?.lifeState ?? "alive";
  const life = player?.life ?? 0;
  const who = you ? "You" : "CPU";

  const tapPile = (e: ReactMouseEvent<HTMLButtonElement>, from: PileFrom, token: string | null) => {
    if (token) {
      useCpuBoardPicker.getState().select(token);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    openContextMenu({ kind: "pile", who: seat, from }, { x: rect.left, y: you ? rect.top - 120 : rect.bottom + 4 });
  };

  const icon = column ? (tight ? 11 : 14) : tight ? 11 : 12;
  const lifeTitle = lifeState === "dd" ? "Death's Door: the next damage to the avatar ends the game" : `Life ${life}`;
  const lifeIcon = (
    <Icon
      icon={lifeState === "alive" ? "game-icons:hearts" : "game-icons:death-skull"}
      width={icon + 1}
      height={icon + 1}
      className={`shrink-0 ${lifeState === "alive" ? "text-rc-danger" : "text-rc-danger-ink"}`}
    />
  );
  const manaTitle = `${resources.mana} available / ${resources.total} total mana`;
  const manaText = (
    <span className="font-rc-mono font-bold tabular-nums" style={{ color: manaColor(resources) }}>
      {resources.mana}/{resources.total}
    </span>
  );

  const thresholds = (
    <span
      className={`shrink-0 items-center ${tight || column ? "grid grid-cols-2 gap-x-1 leading-none" : "flex gap-1"} ${
        column ? (tight ? "justify-items-start gap-y-0.5" : "justify-items-start gap-y-1") : ""
      }`}
      aria-label="Thresholds"
    >
      {THRESHOLD_ELEMENTS.map((el) => {
        const n = resources.thresholds[el.key];
        const size = column ? (tight ? 10 : 13) : tight ? 9 : 12;
        return (
          <span key={el.key} className={`flex items-center gap-0.5 ${n > 0 ? "" : "opacity-40"}`} title={`${el.key} ${n}`} aria-label={`${el.key} ${n}`}>
            <Image src={el.icon} alt="" width={size} height={size} unoptimized />
            <span
              className={`font-rc-mono tabular-nums ${column && !tight ? "text-[12px]" : tight ? "text-[10px]" : "text-[11px]"}`}
              style={{ color: n > 0 ? el.color : undefined }}
            >
              {n}
            </span>
          </span>
        );
      })}
    </span>
  );

  // A quiet hourglass only: the status line is the one live region that says the computer is
  // thinking (two regions announced it twice, and showed it twice on a phone).
  const thinkingNode = !you && thinking && (
    <span className="flex shrink-0 items-center justify-center gap-1 text-[11px] text-rc-info-ink" title="Thinking">
      <Icon icon="game-icons:hourglass" width={13} height={13} className="motion-safe:animate-pulse" aria-hidden />
    </span>
  );

  const stackSplit = density === "columnTight" && !!split && !split.mixed;
  const handTitle = `Hand ${resources.handCount}${split ? `: ${handSplitText(split)}` : ""}`;

  /** Hand size (split into spells and sites) and the three piles; `chip` sizes them for the bar or the column. */
  const counts = (chip: string) => (
    <>
      {/* the hand: spells and sites — the computer's cards are hidden, but their backs are not */}
      <span className={`${CHIP} ${chip} border-rc-line/18`} title={handTitle} aria-label={handTitle}>
        {split ? (
          <HandSplitCounts
            split={split}
            aid={aid}
            size={stackSplit ? icon - 2 : icon}
            // a phone's 2 x 2 rail cell is too narrow for both counts side by side: stack them
            className={stackSplit ? "flex-col items-start gap-0 leading-none" : tight ? "gap-1" : "gap-1.5"}
          />
        ) : (
          <>
            <Icon icon="game-icons:hand" width={icon} height={icon} className="shrink-0 text-rc-fg-muted" />
            {resources.handCount}
          </>
        )}
      </span>
      {PILES.map((pile) => {
        const state = pile.deck ? pileChipState(pileSlice, seat, pile.deck, sequence) : { tone: null, token: null };
        const count = pile.from === "spellbook" ? resources.spellbook : pile.from === "atlas" ? resources.atlas : resources.cemetery;
        const clickable = state.token !== null;
        const action = clickable && pile.deck ? pileActionLabel(pile.deck, pickRequest, pickLabels, seat, avatarName) : null;
        // a drawable pile wears the draw accent; a clicked one the pick's own "selected" tone
        const ring = state.tone === "candidate" || state.tone === "continue" ? drawColor : state.tone ? colors[state.tone] : null;
        const lit = state.tone !== null;
        return (
          <TipButton
            key={pile.from}
            tip={action ? `${action} (${pile.label}: ${count})` : `${pile.label} (${count})`}
            onClick={(e) => tapPile(e, pile.from, state.token)}
            aria-label={`${pile.label} ${count}${action ? `: ${action}` : ""}`}
            aria-pressed={clickable ? state.tone === "selected" : undefined}
            data-pickable={clickable || undefined}
            className={`${CHIP} ${chip} relative cursor-pointer motion-safe:transition-transform ${
              lit ? "z-10 border-transparent" : "border-rc-line/18 hover:border-rc-accent/60"
            } ${clickable ? "-translate-y-0.5 bg-black/60 shadow-rc-md" : ""}`}
          >
            {ring && <PulseRing color={ring} clickable={clickable} />}
            <Icon icon={pile.icon} width={icon} height={icon} className={`shrink-0 ${clickable ? "text-rc-fg" : "text-rc-fg-muted"}`} />
            {count}
          </TipButton>
        );
      })}
    </>
  );

  if (column) {
    return (
      <div
        role="group"
        aria-label={you ? "Your status" : "Computer's status"}
        data-density={density}
        className={`flex w-full min-w-0 flex-col items-stretch gap-1 rounded-rc-md border bg-[rgba(7,10,20,0.85)] font-rc-sans text-rc-fg shadow-rc-panel ${
          tight ? "px-1 py-1" : "px-1.5 py-1.5"
        }`}
        style={{ borderColor: `${seatColor}55` }}
      >
        {/* who: seat colour, a filled dot on their turn; the avatar's name under it */}
        <span className="flex min-w-0 items-center justify-center gap-1" title={avatarName ? `${who}: ${avatarName}` : who}>
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full border"
            style={{ borderColor: seatColor, background: active ? seatColor : "transparent" }}
          />
          <span className={`truncate font-fantaisie leading-tight ${tight ? "text-[13px]" : "text-[15px]"}`} style={{ color: seatColor }}>
            {who}
          </span>
          {active && <span className="sr-only">, active turn</span>}
          {/* the hourglass rides on this line, so a thinking computer never grows the stack */}
          {thinkingNode}
        </span>
        {!tight && avatarName && (
          <span className="block truncate text-center font-fantaisie text-[11px] leading-tight text-rc-fg-muted" title={avatarName}>
            {avatarName}
          </span>
        )}

        {/* life and mana: stacked in a phone's slim rail, side by side in a desktop's wider column */}
        <span className={tight ? "contents" : "grid grid-cols-2 gap-1"}>
          {/* life, large; Death's Door is spelled out, never only coloured */}
          <span
            className={`${CHIP} justify-center gap-1 px-0.5 ${tight ? "min-h-[24px]" : "min-h-[34px]"} ${lifeState === "alive" ? "border-rc-line/22" : "border-rc-danger/70"}`}
            title={lifeTitle}
            aria-label={`Life ${lifeText(life, lifeState)}`}
          >
            {lifeIcon}
            <span
              className={
                lifeState === "alive"
                  ? `font-bold leading-none ${tight ? "text-base" : "text-xl"}`
                  : "whitespace-normal text-center text-[9px] font-bold uppercase leading-tight text-rc-danger-ink"
              }
            >
              {lifeText(life, lifeState)}
            </span>
          </span>

          {/* mana n/m, with a small label: a bare fraction says nothing */}
          <span
            className={`${CHIP} flex-col justify-center border-rc-line/22 px-0.5 leading-none ${tight ? "gap-px py-0.5" : "gap-0.5 py-1"}`}
            title={manaTitle}
            aria-label={`Mana ${resources.mana} of ${resources.total}`}
          >
            <span aria-hidden className={`font-rc-sans uppercase tracking-[0.08em] text-rc-fg-subtle ${tight ? "text-[8px]" : "text-[9px]"}`}>
              Mana
            </span>
            <span className={tight ? "text-[13px]" : "text-[15px]"}>{manaText}</span>
          </span>
        </span>

        <span className="flex justify-center">{thresholds}</span>

        {/* the counts, 2 x 2 */}
        <span className="grid grid-cols-2 gap-1">
          {counts(tight ? "min-h-[24px] min-w-0 justify-center gap-px px-0 text-[10px]" : "min-h-[26px] min-w-0 justify-center gap-1.5 px-1 text-[13px]")}
        </span>
      </div>
    );
  }

  const labels = density === "full";
  const chipPad = tight ? "gap-0.5 px-1" : "gap-1 px-1.5";
  const text = (label: string): ReactNode =>
    labels ? <span className="font-rc-sans text-[10px] uppercase tracking-[0.08em] text-rc-fg-subtle">{label}</span> : null;

  return (
    <div
      role="group"
      aria-label={you ? "Your status" : "Computer's status"}
      data-density={density}
      className={`thin-scrollbar flex min-w-0 flex-nowrap items-center overflow-x-auto rounded-rc-md border bg-[rgba(7,10,20,0.85)] py-0.5 font-rc-sans text-rc-fg shadow-rc-panel ${
        tight ? "gap-0.5 px-1" : "gap-1.5 px-2"
      }`}
      style={{ borderColor: `${seatColor}55` }}
    >
      {/* who: seat colour + the avatar's name; a filled dot marks whose turn it is */}
      <span className={`flex items-center gap-1.5 ${tight ? "shrink-0" : "min-w-0 shrink"}`} title={active ? "Their turn" : undefined}>
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full border"
          style={{ borderColor: seatColor, background: active ? seatColor : "transparent" }}
        />
        {/* a phone's slim bar keeps the (short) name whole rather than "C…" */}
        <span className={`font-rc-display text-xs ${tight ? "whitespace-nowrap" : "truncate"}`} style={{ color: seatColor }} title={who}>
          {who}
          {labels && avatarName ? <span className="text-rc-fg-muted"> · {avatarName}</span> : null}
        </span>
        {active && <span className="sr-only">, active turn</span>}
      </span>

      {/* life; Death's Door is spelled out, never only coloured */}
      <span
        className={`${CHIP} ${chipPad} min-h-[24px] ${lifeState === "alive" ? "border-rc-line/22" : "border-rc-danger/70"}`}
        title={lifeTitle}
        aria-label={`Life ${lifeText(life, lifeState)}`}
      >
        {lifeIcon}
        <span className={`font-bold ${lifeState === "alive" ? "text-sm" : "text-[11px] uppercase text-rc-danger-ink"}`}>{lifeText(life, lifeState)}</span>
      </span>

      {/* mana a/b */}
      <span className={`${CHIP} min-h-[24px] border-rc-line/22 ${chipPad}`} title={manaTitle} aria-label={`Mana ${resources.mana} of ${resources.total}`}>
        {text("Mana")}
        <span className="text-sm">{manaText}</span>
      </span>

      {/* tight: a 2 x 2 block, the height of one chip, so all four fit a phone-width line */}
      {thresholds}
      {thinkingNode}

      <span className={`ml-auto flex shrink-0 items-center ${tight ? "gap-0.5" : "gap-1"}`}>
        {counts(`min-h-[24px] text-[11px] ${tight ? "gap-0.5 px-1" : "gap-1 px-1.5"}`)}
      </span>
    </div>
  );
}
