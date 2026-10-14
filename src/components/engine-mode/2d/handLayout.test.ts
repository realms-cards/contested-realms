import { describe, expect, it } from "vitest";
import { HAND_RAIL_W, HAND_STRIP_PAD, HAND_GROUP_GAP, layoutHand, packLine, type HandLayout, type HandLayoutInput } from "./handLayout";
import { fitHandRows, HAND_FLOOR_PHONE, HAND_MIN_SLICE, HAND_MIN_VISIBLE, HAND_MIN_VISIBLE_GROUPED } from "./handStrip";
import { computeBoard2DSizing } from "./useBoard2DSizing";

const GAP = 6;

/** The strip Hand2D lays the cards into on a phone held upright: the hand box minus its padding (and the slim draw rail while a draw is on offer). */
function portraitRoom(vw: number, vh: number, rail = false) {
  const sizing = computeBoard2DSizing(vw, vh);
  expect(sizing.layout).toBe("portrait");
  const box = sizing.boxes.hand;
  return { width: box.w - (rail ? HAND_RAIL_W.phone + GAP : 0) - 2 * HAND_STRIP_PAD, height: box.h - 2 * HAND_STRIP_PAD };
}

const hand = (sites: number, spells: number) => [...Array<boolean>(sites).fill(true), ...Array<boolean>(spells).fill(false)];

const input = (room: { width: number; height: number }, landscape: boolean[], over: Partial<HandLayoutInput> = {}): HandLayoutInput => ({
  ...room,
  landscape,
  mode: "grouped",
  gap: GAP,
  groupGap: HAND_GROUP_GAP,
  floor: HAND_FLOOR_PHONE,
  minVisible: HAND_MIN_VISIBLE,
  ...over,
});

const overlapArea = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Every card placed once, inside the box, sites never touching spells, each covered card still showing a slice. */
function expectSound(layout: HandLayout, landscape: readonly boolean[], width: number, height: number) {
  expect(layout.slots.map((s) => s.index).sort((a, b) => a - b)).toEqual(landscape.map((_, i) => i));
  for (const s of layout.slots) {
    expect(s.landscape).toBe(landscape[s.index]);
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.x + s.w).toBeLessThanOrEqual(width);
    expect(s.y + s.h).toBeLessThanOrEqual(height);
    // a site lies on its side, a spell stands upright
    if (s.landscape) expect(s.w).toBeGreaterThan(s.h);
    else expect(s.h).toBeGreaterThan(s.w);
  }
  for (const a of layout.slots) {
    for (const b of layout.slots) {
      if (a === b) continue;
      if (a.landscape !== b.landscape) expect(overlapArea(a, b)).toBe(0);
      // the later card covers the earlier: the earlier must keep a readable slice
      if (b.index > a.index && overlapArea(a, b) > 0) {
        const visible = a.w * a.h - overlapArea(a, b);
        expect(visible).toBeGreaterThanOrEqual(Math.min(a.w, a.h) * HAND_MIN_SLICE - 1);
      }
    }
  }
}

describe("packLine", () => {
  const step = () => 10;
  it("lays cards side by side when they fit, keeping the wider gap at a group boundary", () => {
    expect(packLine([50, 40, 40], [true, false], 200, 6, 12, step)).toEqual({ steps: [62, 46], span: 148, overlapping: false });
  });
  it("overlaps ordinary joints evenly once the gaps are gone, never the group boundary", () => {
    const packed = packLine([50, 40, 40, 40], [true, false, false], 140, 6, 12, step);
    expect(packed?.overlapping).toBe(true);
    expect(packed?.steps[0]).toBe(62);
    expect(packed?.span).toBeLessThanOrEqual(140);
  });
  it("refuses an overlap that would hide a card under its minimum slice", () => {
    expect(packLine([40, 40, 40], [], 60, 6, 12, () => 30)).toBeNull();
  });
});

describe("layoutHand: a phone held upright (grouped)", () => {
  for (const [vw, vh] of [
    [390, 844],
    [360, 640],
  ] as const) {
    const room = portraitRoom(vw, vh);
    it(`places every hand of 0-6 sites and 0-10 spells soundly at ${vw}x${vh}`, () => {
      for (let sites = 0; sites <= 6; sites += 1) {
        for (let spells = 0; spells <= 10; spells += 1) {
          const landscape = hand(sites, spells);
          const layout = layoutHand(input(room, landscape));
          expectSound(layout, landscape, room.width, room.height);
          // small and medium hands stay above the phone's readability floor
          if (sites + spells > 0 && sites <= 4 && spells <= 7) expect(layout.cardHeight).toBeGreaterThanOrEqual(HAND_FLOOR_PHONE);
        }
      }
    });

    it(`uses the box's height for a mixed hand at ${vw}x${vh}: sites in a column beside the spells, larger than one strict row`, () => {
      const landscape = hand(3, 5);
      const layout = layoutHand(input(room, landscape));
      const sites = layout.slots.filter((s) => s.landscape);
      const spells = layout.slots.filter((s) => !s.landscape);
      // the sites share one x (a column), stacked downwards, all left of the spells (sites first)
      expect(new Set(sites.map((s) => s.x)).size).toBeLessThan(sites.length);
      expect(Math.max(...sites.map((s) => s.x + s.w))).toBeLessThan(Math.min(...spells.map((s) => s.x)));
      const row = fitHandRows({ cardHeight: 100, cross: room.height, landscape, available: room.width, gap: GAP, floor: HAND_FLOOR_PHONE, minVisible: HAND_MIN_VISIBLE, maxRows: 2 });
      // the spells (what has to be read) come out larger than one strict row's cards
      expect(Math.min(...spells.map((s) => s.h))).toBeGreaterThan(Math.min(...row.map((r) => r.fit.cardHeight)));
    });

    it(`stacks the sites in ONE column and gives the spells the rest at ${vw}x${vh} (3 sites + 3 or 4 spells)`, () => {
      for (const spellCount of [3, 4]) {
        const landscape = hand(3, spellCount);
        const layout = layoutHand(input(room, landscape, { minVisible: HAND_MIN_VISIBLE_GROUPED }));
        expectSound(layout, landscape, room.width, room.height);
        const sites = layout.slots.filter((s) => s.landscape);
        const spells = layout.slots.filter((s) => !s.landscape);
        expect(new Set(sites.map((s) => s.x)).size).toBe(1);
        // the spells are the larger cards: taller than a site lying on its side is long
        expect(Math.min(...spells.map((s) => s.h))).toBeGreaterThan(sites[0].w);
        expect(Math.min(...spells.map((s) => s.h))).toBeGreaterThanOrEqual(vw === 390 ? 80 : 70);
      }
    });
  }

  it("puts the sites on the right when spells come first", () => {
    const room = portraitRoom(390, 844);
    const landscape = [false, false, false, true, true, true];
    const layout = layoutHand(input(room, landscape));
    const sites = layout.slots.filter((s) => s.landscape);
    const spells = layout.slots.filter((s) => !s.landscape);
    expect(Math.min(...sites.map((s) => s.x))).toBeGreaterThan(Math.max(...spells.map((s) => s.x + s.w)));
  });

  it("lays a spells-only hand side by side with big cards rather than overlapping it", () => {
    const room = portraitRoom(390, 844);
    const layout = layoutHand(input(room, hand(0, 4)));
    expect(layout.overlapping).toBe(false);
    expect(layout.cardHeight).toBeGreaterThanOrEqual(Math.floor(room.height * 0.8));
  });

  it("keeps a small mixed hand whole at 390x844 (2 sites + 3 spells, 1 + 3, 2 + 4): nothing covered", () => {
    const room = portraitRoom(390, 844);
    for (const [s, p] of [
      [2, 3],
      [1, 3],
      [2, 4],
    ] as const) {
      const landscape = hand(s, p);
      // as Hand2D asks for a phone held upright
      const layout = layoutHand(input(room, landscape, { minVisible: HAND_MIN_VISIBLE_GROUPED }));
      expectSound(layout, landscape, room.width, room.height);
      expect(layout.overlapping).toBe(false);
      expect(layout.cardHeight).toBeGreaterThanOrEqual(HAND_FLOOR_PHONE);
    }
  });
});

describe("layoutHand: landscape and wide (row)", () => {
  it("keeps one row, sites first, with a wider gap before the spells", () => {
    const landscape = hand(2, 3);
    const layout = layoutHand(input({ width: 900, height: 120 }, landscape, { mode: "row" }));
    expectSound(layout, landscape, 900, 120);
    const bySlot = [...layout.slots].sort((a, b) => a.index - b.index);
    expect(new Set(bySlot.map((s) => s.y + s.h / 2)).size).toBe(1);
    expect(bySlot[2].x - (bySlot[1].x + bySlot[1].w)).toBe(HAND_GROUP_GAP);
    expect(bySlot[1].x - (bySlot[0].x + bySlot[0].w)).toBe(GAP);
    // a small hand fills the row's height
    expect(layout.cardHeight).toBe(120);
  });

  it("overlaps a long hand within each group but never across the boundary", () => {
    const landscape = hand(4, 8);
    const layout = layoutHand(input({ width: 640, height: 78 }, landscape, { mode: "row", floor: 56 }));
    expectSound(layout, landscape, 640, 78);
    expect(layout.overlapping).toBe(true);
  });
});
