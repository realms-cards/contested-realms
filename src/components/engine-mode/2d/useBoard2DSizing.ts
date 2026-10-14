"use client";

import { useEffect, useState, type RefObject } from "react";

/** `wide` is the landscape arrangement scaled up for a desktop or tablet window. */
export type Layout2D = "portrait" | "landscape" | "wide";

/**
 * How SeatBar2D packs a seat's state into its box:
 * - `full`: one line with labels and the avatar's name (a bar at least SEAT_BAR_FULL_MIN_W wide)
 * - `tight`: one slim line for a phone-width bar; no labels, thresholds as a 2 x 2 block
 * - `column`: a narrow vertical stack for the wide rail; the four pile chips stacked one per line
 * - `columnTight`: the same stack for a phone's landscape rail, the pile chips 2 x 2 so both
 *   seats fit one short column
 */
export type SeatBarDensity = "full" | "tight" | "column" | "columnTight";

/** A box in px, relative to the usable area's top-left corner (inside the safe-area insets). */
export interface Box2D {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The areas every layout has. */
export type CoreArea2D = "oppBar" | "board" | "myBar" | "hand";
/**
 * Portrait's own boxes: the row between the board and your bar is split in two — the card
 * preview on the left (`preview`, as large as a card fits) and the prompt dock on the right
 * (`dock`, which also holds the status line at its top and the action feed under any prompt)
 * — and the actions get a row of their own. `status` is never placed by the sizing any more —
 * a reserved status row left an empty band over the board whenever the line was silent — and
 * stays in the type only so the boxes keep one shape.
 */
export type PortraitArea2D = "status" | "preview" | "dock" | "actions";
export type Area2D = CoreArea2D | PortraitArea2D | "side";

/**
 * Where each area lands. Portrait gives the dock, status line and actions their own boxes;
 * landscape and wide give them one `side` column instead (the inspector: prompt dock, action
 * feed, status, actions, and on a phone the card preview), which stacks its pieces in the page
 * flow because how tall a prompt is depends on its text. Wide places the card preview in the
 * left column, between the seats, as `preview`.
 */
export type Boxes2D = Record<CoreArea2D, Box2D> & Partial<Record<PortraitArea2D | "side", Box2D>>;

export interface Board2DSizing {
  layout: Layout2D;
  /** how the seat bars pack their chips into `boxes.oppBar` / `boxes.myBar` */
  seatBar: SeatBarDensity;
  /** the smaller of a tile's two edges; the board is 5 x 4 tiles */
  tile: number;
  /** a tile's width and height: tiles stretch to fill the board's box, so they need not be square */
  tileW: number;
  tileH: number;
  /** height of an upright hand card (Hand2D's `cardHeight`) */
  handCardH: number;
  /** outer padding of the grid, px */
  padX: number;
  padY: number;
  /** CSS grid tracks, in px, matching `boxes` exactly */
  columns: string;
  rows: string;
  /** where each area lands; the page places them with the same numbers */
  boxes: Boxes2D;
}

export const GAP = 4;
const PAD_X = 8;
const PAD_Y = 4;
/** SeatBar2D's slim single row: 24px chips + padding + border. */
const SEAT_BAR = 32;
/** ActionBar2D's ≥44px slots plus a little room. */
const ACTIONS = 48;
/** The prompt dock never shrinks below a docked banner's title + hint. */
const DOCK_MIN = 64;
/** ...and is given title, a two-line hint and one row of buttons (the commit CTA) before the hand grows
 *  past HAND_FLOOR, so a Confirm / Keep never sits below the fold of a short phone — and the
 *  preview beside it a card large enough to recognise. */
const DOCK_WANT = 136;
/** The portrait preview's share of the dock row's width, at most... */
const PREVIEW_SHARE = 0.45;
/** ...and never wider than this many times the row's height (a short row keeps a narrow
 *  preview, so the prompt beside it keeps the width its text needs). */
const PREVIEW_PER_H = 1.1;
/** ...and the prompt beside it keeps at least this width for its text. */
const PROMPT_MIN_W = 200;
/** Hand2D's strip around its cards: `cardHeight + 8` plus room for a thin scrollbar. */
const HAND_CHROME = 14;
/** Spells 62x87 at the minimum; a phone's portrait hand grows to HAND_MAX with spare height. */
const HAND_MIN = 87;
const HAND_MAX = 128;
/** Below this the hand gives way to the board, down to HAND_FLOOR. */
const TILE_COMFORT = 60;
const HAND_FLOOR = 64;
const TILE_MAX = 132;
/** A short phone's rows may squash to this share of square so the hand reaches HAND_GOOD. */
const TILE_SQUASH = 0.88;
const HAND_GOOD = 108;
/** A tablet-sized portrait window lifts the caps so the board fills its width. */
const PORTRAIT_LARGE_W = 600;
const TILE_MAX_LARGE = 200;
const HAND_MAX_LARGE = 160;
/** Narrowest seat bar that holds the `full` one-line layout (labels, avatar name, four thresholds). */
export const SEAT_BAR_FULL_MIN_W = 460;

/** Wide (desktop / tablet landscape) needs at least this usable area. */
const WIDE_MIN_W = 1000;
const WIDE_MIN_H = 600;

const px = (n: number) => `${n}px`;

/**
 * The 2D page's geometry for a usable area of `width` x `height` CSS px (the viewport minus
 * the safe-area insets). Pure, so the arithmetic that keeps the board and the hand apart is
 * tested at real phone sizes; the page feeds these exact numbers to its CSS grid.
 *
 * Portrait is one column, rows A–F: opponent bar, board, the dock row (the card preview on
 * the left, the prompt dock with the status line and the feed on the right), your bar, hand,
 * actions. The board takes the width; spare height goes to the dock (up to a button
 * row), then the hand, then the dock again (the feed under the prompt takes it).
 * Landscape is three columns: a slim seat rail on the left (the opponent's stack at the top,
 * yours at the bottom, the way the board puts their home row above yours), the board with the
 * hand under it in the middle, and the inspector column on the right (`boxes.side`: card
 * preview, prompt dock, action feed, status line, actions — stacked by the page). On a phone the
 * hand row runs on under the inspector as well, so a full hand needs no overlap; the inspector
 * then stops at the board's bottom edge. The hand row is sized first, as a share of the height,
 * so its cards stay large; the board takes what is left; the inspector takes the width a square
 * board leaves, up to a cap, and anything past the cap stretches the tiles (they need not be
 * square), so the composition always fills the window.
 * Wide is landscape for a desktop or tablet window (at least WIDE_MIN_W x WIDE_MIN_H): a left
 * column that grows with the window (the opponent's stats, the card preview, your stats), larger
 * tiles and hand cards, and a wider inspector (prompt, feed, status, actions).
 */
export function computeBoard2DSizing(width: number, height: number): Board2DSizing {
  const W = Math.max(0, Math.floor(width));
  const H = Math.max(0, Math.floor(height));
  const innerW = Math.max(0, W - 2 * PAD_X);
  const innerH = Math.max(0, H - 2 * PAD_Y);
  if (W <= H) return portrait(innerW, innerH);
  return innerW >= WIDE_MIN_W && innerH >= WIDE_MIN_H ? sideColumns(innerW, innerH, WIDE) : sideColumns(innerW, innerH, LANDSCAPE);
}

function portrait(innerW: number, innerH: number): Board2DSizing {
  const large = innerW >= PORTRAIT_LARGE_W;
  const tileMax = large ? TILE_MAX_LARGE : TILE_MAX;
  const handMax = large ? HAND_MAX_LARGE : HAND_MAX;
  const fixed = SEAT_BAR + DOCK_MIN + SEAT_BAR + ACTIONS + 5 * GAP;
  const byWidth = Math.floor(innerW / 5);
  const byHeight = (hand: number) => Math.floor((innerH - fixed - hand - HAND_CHROME) / 4);
  let hand = HAND_MIN;
  let tile = Math.min(byWidth, byHeight(hand), tileMax);
  if (tile < TILE_COMFORT) {
    hand = HAND_FLOOR;
    tile = Math.min(byWidth, byHeight(hand), tileMax);
  }
  tile = Math.max(1, tile);
  // Tiles need not be square: the board always spans the width, and a phone short of height
  // squashes its rows a little (to TILE_SQUASH of square at most) so the hand reaches HAND_GOOD
  // before the dock grows to its button row. Cards on the board fit the shorter edge.
  const tileW = Math.max(1, byWidth);
  let tileH = tile;
  const shareAt = (h: number) => Math.max(0, innerH - (fixed - DOCK_MIN) - HAND_CHROME - 4 * h);
  const squash = Math.min(tileH - Math.ceil(tileH * TILE_SQUASH), Math.ceil((HAND_GOOD + DOCK_WANT - shareAt(tileH)) / 4));
  if (squash > 0) tileH -= squash;
  // what the hand and the dock share once the board has its tiles: the dock's commit row
  // comes first (the hand gives way down to HAND_FLOOR for it), then the hand grows
  const shared = shareAt(tileH);
  const dockFirst = Math.max(DOCK_MIN, Math.min(DOCK_WANT, shared - HAND_FLOOR));
  hand = Math.max(Math.min(hand, HAND_FLOOR), Math.min(handMax, shared - dockFirst));
  const handRow = hand + HAND_CHROME;
  const dock = Math.max(dockFirst, shared - hand);

  const heights = [SEAT_BAR, 4 * tileH, dock, SEAT_BAR, handRow, ACTIONS];
  const names: Array<CoreArea2D | PortraitArea2D> = ["oppBar", "board", "dock", "myBar", "hand", "actions"];
  const boxes = {} as Record<CoreArea2D, Box2D> & Partial<Record<PortraitArea2D, Box2D>>;
  // the dock row: the preview on the left, the prompt (with the status line and the feed) right
  const previewW = Math.max(0, Math.min(Math.floor(innerW * PREVIEW_SHARE), Math.round(dock * PREVIEW_PER_H), innerW - GAP - PROMPT_MIN_W));
  let y = PAD_Y;
  names.forEach((name, i) => {
    const h = heights[i];
    // the board is centred in its row; everything else spans the width
    if (name === "board") boxes[name] = { x: PAD_X + Math.floor((innerW - 5 * tileW) / 2), y, w: 5 * tileW, h };
    else if (name === "dock") {
      boxes.preview = { x: PAD_X, y, w: previewW, h };
      boxes.dock = { x: PAD_X + previewW + GAP, y, w: Math.max(1, innerW - previewW - GAP), h };
    } else boxes[name] = { x: PAD_X, y, w: innerW, h };
    y += h + GAP;
  });
  return {
    layout: "portrait",
    seatBar: innerW >= SEAT_BAR_FULL_MIN_W ? "full" : "tight",
    tile: Math.min(tileW, tileH),
    tileW,
    tileH,
    handCardH: hand,
    padX: PAD_X,
    padY: PAD_Y,
    columns: px(innerW),
    rows: heights.map(px).join(" "),
    boxes,
  };
}

/** The numbers that make the three-column arrangement a phone's landscape or a desktop's wide view. */
interface SideColumnsSpec {
  layout: "landscape" | "wide";
  seatBar: SeatBarDensity;
  /** the left column's width: `rail` px, or (with `railShare`) that share of the width between `rail` and `railMax` */
  rail: number;
  railShare?: number;
  railMax?: number;
  /** the tallest a seat stack gets */
  seat: number;
  /**
   * the left column holds the card preview between the two seat stacks (a desktop); without
   * it the preview is part of the inspector column
   */
  previewLeft: boolean;
  /** the inspector column's width: never narrower than `sideMin`; the width a height-bound
   *  board leaves goes to it up to `sideMax`, and the rest stretches the board's tiles */
  sideMin: number;
  sideMax: number;
  tileMax: number;
  /** the hand row's share of the usable height before the board is sized (Hand2D makes its
   *  cards as large as the row allows, so the row is what decides how readable they are) */
  handShare: number;
  /** the hand's floor and cap */
  hand: number;
  handMax: number;
  /**
   * the hand row runs on under the inspector column too (a phone's landscape: the board alone
   * is too narrow a row for a hand of readable cards); the inspector then stops above it
   */
  handUnderSide: boolean;
}

const LANDSCAPE: SideColumnsSpec = {
  layout: "landscape",
  seatBar: "columnTight",
  rail: 72,
  // who, life, mana, a 2 x 2 of thresholds and a 2 x 2 of pile chips
  seat: 172,
  previewLeft: false,
  sideMin: 260,
  sideMax: 340,
  tileMax: TILE_MAX,
  handShare: 0.2,
  hand: 72,
  handMax: 112,
  handUnderSide: true,
};

const WIDE: SideColumnsSpec = {
  layout: "wide",
  seatBar: "column",
  rail: 200,
  railShare: 0.16,
  railMax: 300,
  // who, the avatar's name, life and mana side by side, the thresholds and a 2 x 2 of pile chips
  seat: 188,
  previewLeft: true,
  sideMin: 300,
  sideMax: 420,
  tileMax: 260,
  handShare: 0.21,
  hand: 132,
  handMax: 220,
  handUnderSide: false,
};

function sideColumns(innerW: number, innerH: number, spec: SideColumnsSpec): Board2DSizing {
  const rail = spec.railShare ? Math.max(spec.rail, Math.min(spec.railMax ?? spec.rail, Math.floor(innerW * spec.railShare))) : spec.rail;
  // the centre column the board may use once the rail and the narrowest inspector are placed
  const centreMax = Math.max(0, innerW - rail - spec.sideMin - 2 * GAP);
  const byWidth = Math.floor(centreMax / 5);
  const byHeight = (hand: number) => Math.floor((innerH - GAP - hand - HAND_CHROME) / 4);
  // the hand row first: a generous share of the height, so the cards read at a glance
  let hand = Math.max(spec.hand, Math.min(spec.handMax, Math.floor(innerH * spec.handShare) - HAND_CHROME));
  // the board's size as square tiles, which decides how wide the inspector gets
  let square = Math.max(1, Math.min(byWidth, byHeight(hand), spec.tileMax));
  // a width-bound board (a tall-ish window) leaves height: the hand takes it, up to its cap
  const spare = Math.max(0, innerH - GAP - hand - HAND_CHROME - 4 * square);
  hand = Math.min(spec.handMax, hand + spare);
  square = Math.max(1, Math.min(square, byHeight(hand)));
  const handRow = hand + HAND_CHROME;
  // the inspector takes what a square board leaves, up to its cap; past that the tiles stretch
  // (they need not be square), so the composition fills the window with no empty margins
  let side = Math.max(spec.sideMin, Math.min(spec.sideMax, innerW - rail - 5 * square - 2 * GAP));
  const tileW = Math.max(1, Math.floor((innerW - rail - side - 2 * GAP) / 5));
  side = Math.max(1, innerW - rail - 5 * tileW - 2 * GAP);
  const tileH = Math.max(1, byHeight(hand));
  const boardW = 5 * tileW;
  const boardH = 4 * tileH;

  const leftX = PAD_X;
  const boardX = leftX + rail + GAP;
  const sideX = boardX + boardW + GAP;
  const seat = Math.max(1, Math.min(spec.seat, Math.floor((innerH - GAP) / 2)));
  const handY = PAD_Y + boardH + GAP;
  const under = spec.handUnderSide;
  const boxes: Boxes2D = {
    oppBar: { x: leftX, y: PAD_Y, w: rail, h: seat },
    myBar: { x: leftX, y: PAD_Y + innerH - seat, w: rail, h: seat },
    board: { x: boardX, y: PAD_Y, w: boardW, h: boardH },
    hand: { x: boardX, y: handY, w: under ? boardW + GAP + side : boardW, h: handRow },
    side: { x: sideX, y: PAD_Y, w: side, h: under ? Math.max(1, handY - GAP - PAD_Y) : innerH },
  };
  // a desktop's card preview sits between the two seat stacks
  if (spec.previewLeft) boxes.preview = { x: leftX, y: PAD_Y + seat + GAP, w: rail, h: Math.max(1, innerH - 2 * seat - 2 * GAP) };
  return {
    layout: spec.layout,
    seatBar: spec.seatBar,
    tile: Math.min(tileW, tileH),
    tileW,
    tileH,
    handCardH: hand,
    padX: PAD_X,
    padY: PAD_Y,
    columns: [rail, boardW, side].map(px).join(" "),
    // centre column: the board, then the hand; the side columns span both rows
    rows: `${px(boardH)} ${px(handRow)}`,
    boxes,
  };
}

/**
 * `computeBoard2DSizing` for the element `ref` points at — a box filling the page's
 * safe-area-padded frame, so notches and the home indicator are already taken off. `null`
 * until first measured.
 */
export function useBoard2DSizing(ref: RefObject<HTMLElement | null>): Board2DSizing | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  if (!size) return null;
  return computeBoard2DSizing(size.w, size.h);
}
