import { describe, expect, it } from "vitest";
import { handPickFrom, selectHandPick, selectPilePick, type PickerFields } from "@/lib/game/cpu/handPilePicks";
import { handToken, pileToken } from "@/lib/game/cpu/pickTokens";
import type { CardRef } from "@/lib/game/store/types";
import {
  CARD_ASPECT,
  crossBoundHeight,
  fitHand,
  fitHandRows,
  HAND_FLOOR_DESKTOP,
  HAND_FLOOR_PHONE,
  HAND_MIN_SLICE,
  HAND_MIN_VISIBLE,
  handCardBox,
  handCardState,
  handFloor,
  handSplitOf,
  handSplitText,
  lifeText,
  pileActionLabel,
  pileChipState,
  readHandCounts,
  sortHand,
} from "./handStrip";

const card = (instanceId: string, type: string, cardId = 1): CardRef => ({ cardId, name: instanceId, type, instanceId });
const picker = (fields: Partial<PickerFields>): PickerFields => ({ request: "engine:1", tiles: [], selected: null, glow: [], sources: [], ...fields });
const handPick = (fields: Partial<PickerFields>) => handPickFrom(selectHandPick("p1")(picker(fields)));

describe("sortHand", () => {
  const hand = [card("s1", "Minion"), card("a", "Site"), card("s2", "Magic"), card("b", "Site")];

  it("puts sites first by default and keeps draw order within each group", () => {
    expect(sortHand(hand, "sitesFirst").map((e) => e.card.instanceId)).toEqual(["a", "b", "s1", "s2"]);
    expect(sortHand(hand, "spellsFirst").map((e) => e.card.instanceId)).toEqual(["s1", "s2", "a", "b"]);
  });

  it("keeps each card's zone index and gives duplicates without an id distinct keys", () => {
    const sorted = sortHand(hand, "sitesFirst");
    expect(sorted.map((e) => e.index)).toEqual([1, 3, 0, 2]);
    const dupes = sortHand([{ cardId: 9, name: "X", type: "Magic" }, { cardId: 9, name: "X", type: "Magic" }], "sitesFirst");
    expect(dupes.map((e) => e.key)).toEqual(["c:9#0", "c:9#1"]);
  });
});

describe("handCardState", () => {
  it("lights candidates and makes them tappable with their hand token", () => {
    const pick = handPick({ tiles: [handToken("p1", "a")] });
    expect(handCardState(pick, "p1", "a", false)).toEqual({ tone: "candidate", token: "hand:p1:a", marked: false });
    expect(handCardState(pick, "p1", "a", true).tone).toBe("continue");
    expect(handCardState(pick, "p1", "b", false)).toEqual({ tone: null, token: null, marked: false });
    expect(handCardState(pick, "p1", undefined, false).token).toBeNull();
  });

  it("reads a card that is both a candidate and in the glow as chosen but still clickable (mulligan marks)", () => {
    const pick = handPick({ tiles: [handToken("p1", "a")], glow: [handToken("p1", "a")] });
    expect(handCardState(pick, "p1", "a", false)).toEqual({ tone: "target", token: "hand:p1:a", marked: true });
  });

  it("leaves glow-only and source cards lit but inert, and the clicked card selected", () => {
    const pick = handPick({ tiles: [handToken("p1", "a")], selected: handToken("p1", "a"), glow: [handToken("p1", "g")], sources: [handToken("p1", "s")] });
    expect(handCardState(pick, "p1", "a", false)).toEqual({ tone: "selected", token: "hand:p1:a", marked: false });
    expect(handCardState(pick, "p1", "g", false)).toEqual({ tone: "target", token: null, marked: false });
    expect(handCardState(pick, "p1", "s", false)).toEqual({ tone: "source", token: null, marked: false });
  });
});

describe("fitHand", () => {
  const spells = (n: number) => Array.from({ length: n }, () => false);
  const mixed = (n: number) => Array.from({ length: n }, (_, i) => i % 3 === 0);
  const span = (landscape: readonly boolean[], fit: ReturnType<typeof fitHand>) =>
    landscape.reduce((sum, l) => sum + handCardBox(fit.cardHeight, l).w, 0) + fit.spacing * (landscape.length - 1);
  const minSlice = (landscape: readonly boolean[], fit: ReturnType<typeof fitHand>) =>
    Math.min(...landscape.slice(0, -1).map((l) => handCardBox(fit.cardHeight, l).w + Math.min(0, fit.spacing)));
  const fit = (landscape: readonly boolean[], available: number, floor = HAND_FLOOR_DESKTOP, cardHeight = 150) =>
    fitHand({ cardHeight, landscape, available, gap: 6, floor });

  it("keeps the nominal size when the hand fits", () => {
    expect(fit(spells(3), 1100)).toEqual({ cardHeight: 150, spacing: 6, overlapping: false });
    expect(fit(mixed(3), 1100)).toEqual({ cardHeight: 150, spacing: 6, overlapping: false });
  });

  it("shrinks a 7-card desktop hand to fill the strip exactly, sites costing more width", () => {
    const allSpells = fit(spells(7), 1100, HAND_FLOOR_DESKTOP, 220);
    const withSites = fit(mixed(7), 1100, HAND_FLOOR_DESKTOP, 220);
    expect(allSpells.cardHeight).toBeLessThan(220);
    expect(allSpells.overlapping).toBe(false);
    expect(withSites.overlapping).toBe(false);
    expect(withSites.cardHeight).toBeLessThan(allSpells.cardHeight);
    for (const [hand, f] of [[spells(7), allSpells], [mixed(7), withSites]] as const) {
      expect(span(hand, f)).toBeLessThanOrEqual(1100);
      // and a pixel taller would no longer fit
      expect(span(hand, { ...f, cardHeight: f.cardHeight + 1 })).toBeGreaterThan(1100);
    }
  });

  it("shrinks a 3-card phone hand without overlapping", () => {
    const f = fit(mixed(3), 360, HAND_FLOOR_PHONE, 120);
    expect(f.overlapping).toBe(false);
    expect(f.cardHeight).toBeGreaterThanOrEqual(HAND_FLOOR_PHONE);
    expect(span(mixed(3), f)).toBeLessThanOrEqual(360);
  });

  it("overlaps at the floor instead of shrinking further, keeping every card visible", () => {
    // seven spells still fit above the floor on a phone
    const sevenSpells = fit(spells(7), 360, HAND_FLOOR_PHONE, 120);
    expect(sevenSpells.overlapping).toBe(false);
    expect(span(spells(7), sevenSpells)).toBeLessThanOrEqual(360);
    // seven mixed cards just miss: the gaps close up first
    const sevenMixed = fit(mixed(7), 360, HAND_FLOOR_PHONE, 120);
    expect(sevenMixed).toMatchObject({ cardHeight: HAND_FLOOR_PHONE, overlapping: false });
    expect(sevenMixed.spacing).toBeLessThan(6);
    expect(span(mixed(7), sevenMixed)).toBeLessThanOrEqual(360);
    for (const hand of [mixed(9), spells(12), mixed(12)]) {
      const f = fit(hand, 360, HAND_FLOOR_PHONE, 120);
      expect(f.overlapping).toBe(true);
      expect(f.cardHeight).toBe(HAND_FLOOR_PHONE);
      expect(f.spacing).toBeLessThan(0);
      expect(span(hand, f)).toBeLessThanOrEqual(360);
      expect(minSlice(hand, f)).toBeGreaterThanOrEqual(HAND_MIN_SLICE);
    }
    const big = fit(mixed(12), 1100);
    expect(big.cardHeight).toBeGreaterThanOrEqual(HAND_FLOOR_DESKTOP);
    expect(span(mixed(12), big)).toBeLessThanOrEqual(1100);
  });

  it("drops below the floor only when even the tightest overlap cannot fit", () => {
    const f = fit(spells(24), 360, HAND_FLOOR_PHONE, 120);
    expect(f.cardHeight).toBeLessThan(HAND_FLOOR_PHONE);
    expect(span(spells(24), f)).toBeLessThanOrEqual(360);
    expect(minSlice(spells(24), f)).toBeGreaterThanOrEqual(HAND_MIN_SLICE);
  });

  it("never grows past the nominal height and clamps the floor to it", () => {
    expect(fit(spells(1), 1100, HAND_FLOOR_DESKTOP, 60)).toEqual({ cardHeight: 60, spacing: 6, overlapping: false });
    const f = fit(spells(12), 360, HAND_FLOOR_DESKTOP, 60);
    expect(f.cardHeight).toBe(60);
    expect(span(spells(12), f)).toBeLessThanOrEqual(360);
  });

  it("leaves an empty or unmeasured strip at its nominal size", () => {
    expect(fit([], 360)).toEqual({ cardHeight: 150, spacing: 6, overlapping: false });
    expect(fit(spells(5), 0)).toEqual({ cardHeight: 150, spacing: 6, overlapping: false });
  });

  it("fits along the height for a column strip", () => {
    const hand = mixed(7);
    const f = fitHand({ cardHeight: 150, landscape: hand, available: 500, gap: 6, floor: HAND_FLOOR_DESKTOP, axis: "column" });
    const height = hand.reduce((sum, l) => sum + handCardBox(f.cardHeight, l).h, 0) + f.spacing * (hand.length - 1);
    expect(height).toBeLessThanOrEqual(500);
  });

  it("picks the phone floor on narrow viewports", () => {
    expect(handFloor(390)).toBe(HAND_FLOOR_PHONE);
    expect(handFloor(1512)).toBe(HAND_FLOOR_DESKTOP);
  });
});

describe("pileChipState", () => {
  it("rings a pickable pile, marks the clicked one and leaves glow-only piles inert", () => {
    const slice = selectPilePick("p1")(picker({ tiles: [pileToken("p1", "atlas")], glow: [pileToken("p1", "spellbook")] }));
    expect(pileChipState(slice, "p1", "atlas", false)).toEqual({ tone: "candidate", token: "pile:p1:atlas" });
    expect(pileChipState(slice, "p1", "atlas", true).tone).toBe("continue");
    expect(pileChipState(slice, "p1", "spellbook", false)).toEqual({ tone: "target", token: null });
    const picked = selectPilePick("p1")(picker({ tiles: [pileToken("p1", "atlas")], selected: pileToken("p1", "atlas") }));
    expect(pileChipState(picked, "p1", "atlas", false).tone).toBe("selected");
  });

  it("ignores the other seat's piles", () => {
    const slice = selectPilePick("p1")(picker({ tiles: [pileToken("p2", "atlas")] }));
    expect(pileChipState(slice, "p1", "atlas", false)).toEqual({ tone: null, token: null });
  });
});

describe("sizes and labels", () => {
  it("lays sites on their side at the same size as an upright spell", () => {
    expect(handCardBox(88, false)).toEqual({ w: 63, h: 88 });
    expect(handCardBox(88, true)).toEqual({ w: 88, h: 63 });
  });

  it("names Death's Door and defeat instead of a number", () => {
    expect(lifeText(12, "alive")).toBe("12");
    expect(lifeText(0, "dd")).toBe("Death's Door");
    expect(lifeText(0, "dead")).toBe("Defeated");
  });
});

describe("fitHand from the measured strip box", () => {
  const spells = (n: number) => Array.from({ length: n }, () => false);
  const mixed = (n: number) => Array.from({ length: n }, (_, i) => i % 3 === 0);
  const span = (landscape: readonly boolean[], f: ReturnType<typeof fitHand>) =>
    landscape.reduce((sum, l) => sum + handCardBox(f.cardHeight, l).w, 0) + f.spacing * (landscape.length - 1);
  const tallest = (landscape: readonly boolean[], f: ReturnType<typeof fitHand>) => Math.max(...landscape.map((l) => handCardBox(f.cardHeight, l).h));
  // `cardHeight` is a stale layout number: with `cross` the box alone decides
  const fit = (landscape: readonly boolean[], available: number, cross: number, floor = HAND_FLOOR_DESKTOP) =>
    fitHand({ cardHeight: 40, cross, landscape, available, gap: 6, floor });

  it("a small hand takes the full row height, whatever the layout's nominal number", () => {
    for (const cross of [72, 120, 180]) {
      for (const width of [360, 1100]) {
        const f = fit(spells(3), width, cross, handFloor(width));
        if (span(spells(3), { ...f, cardHeight: cross }) <= width) expect(f.cardHeight).toBe(cross);
        expect(tallest(spells(3), f)).toBeLessThanOrEqual(cross);
      }
    }
    // 3 cards on a wide desktop row: full height
    expect(fit(mixed(3), 1100, 180).cardHeight).toBe(180);
  });

  it("is always the largest height that fits both the width and the row height", () => {
    for (const n of [3, 7, 12]) {
      for (const make of [spells, mixed]) {
        const hand = make(n);
        for (const width of [360, 1100]) {
          for (const cross of [64, 100, 160, 220]) {
            const f = fit(hand, width, cross, handFloor(width));
            expect(tallest(hand, f)).toBeLessThanOrEqual(cross);
            expect(span(hand, f)).toBeLessThanOrEqual(width);
            if (!f.overlapping && f.spacing === 6) {
              // either the row height binds, or one more pixel would no longer fit the width
              const bigger = { ...f, cardHeight: f.cardHeight + 1 };
              expect(tallest(hand, bigger) > cross || span(hand, bigger) > width).toBe(true);
            }
          }
        }
      }
    }
  });

  it("fills the row end to end once the width binds (no dead gap past a card's width)", () => {
    for (const n of [7, 12]) {
      const hand = mixed(n);
      const f = fit(hand, 1100, 400);
      expect(1100 - span(hand, f)).toBeLessThan(handCardBox(f.cardHeight, true).w);
      expect(1100 - span(hand, f)).toBeLessThanOrEqual(n);
    }
  });

  it("overlaps only below the readability floor", () => {
    const f = fit(mixed(12), 360, 120, HAND_FLOOR_PHONE);
    expect(f.overlapping).toBe(true);
    expect(f.cardHeight).toBe(HAND_FLOOR_PHONE);
    expect(fit(mixed(7), 1100, 160).overlapping).toBe(false);
  });

  it("lets a hand of only sites grow until their short edge fills the row", () => {
    const h = crossBoundHeight([true, true], 100);
    expect(handCardBox(h, true).h).toBeLessThanOrEqual(100);
    expect(handCardBox(h + 1, true).h).toBeGreaterThan(100);
    expect(h).toBeGreaterThan(100);
    expect(crossBoundHeight([true, false], 100)).toBe(100);
    expect(crossBoundHeight([], 100)).toBe(100);
    // down a column the width binds: an upright spell's short edge, a site's long one
    const upright = crossBoundHeight([false], 63, "column");
    expect(handCardBox(upright, false).w).toBeLessThanOrEqual(63);
    expect(handCardBox(upright + 1, false).w).toBeGreaterThan(63);
    expect(upright).toBeGreaterThanOrEqual(Math.floor(63 / CARD_ASPECT));
    expect(crossBoundHeight([true], 63, "column")).toBe(63);
  });
});

describe("fitHand, size first (minVisible)", () => {
  // 5 spells and 3 sites, as in a turn-8 hand
  const hand = [true, true, true, false, false, false, false, false];
  const fit = (available: number, cross: number, floor = HAND_FLOOR_DESKTOP) =>
    fitHand({ cardHeight: 40, cross, landscape: hand, available, gap: 6, floor, minVisible: HAND_MIN_VISIBLE });
  const span = (f: ReturnType<typeof fitHand>) => hand.reduce((sum, l) => sum + handCardBox(f.cardHeight, l).w, 0) + f.spacing * (hand.length - 1);
  const slice = (f: ReturnType<typeof fitHand>) => Math.min(...hand.slice(0, -1).map((l) => handCardBox(f.cardHeight, l).w + Math.min(0, f.spacing)));

  it("keeps a desktop hand at the full row height and overlaps it instead of shrinking it", () => {
    // 1512x906: an ~800 px strip, ~166 px of row height
    const f = fit(800, 166);
    expect(f.cardHeight).toBe(166);
    expect(f.overlapping).toBe(true);
    expect(span(f)).toBeLessThanOrEqual(800);
    expect(slice(f)).toBeGreaterThanOrEqual(Math.floor(HAND_MIN_VISIBLE * handCardBox(166, false).w));
    // the old shrink-only fit was far smaller
    expect(fitHand({ cardHeight: 40, cross: 166, landscape: hand, available: 800, gap: 6, floor: HAND_FLOOR_DESKTOP }).cardHeight).toBeLessThan(120);
  });

  it("on a narrow phone strip shrinks only until each covered card keeps its visible share", () => {
    const f = fit(316, 120, HAND_FLOOR_PHONE);
    expect(span(f)).toBeLessThanOrEqual(316);
    expect(slice(f)).toBeGreaterThanOrEqual(Math.floor(HAND_MIN_VISIBLE * handCardBox(f.cardHeight, false).w) - 1);
    expect(f.cardHeight).toBeGreaterThan(60);
    expect(f.cardHeight).toBeLessThan(120);
  });

  it("never overlaps a hand that fits side by side", () => {
    expect(fit(2000, 166)).toEqual({ cardHeight: 166, spacing: 6, overlapping: false });
  });
});

describe("hand split", () => {
  it("counts your own hand by card type", () => {
    expect(handSplitOf([card("a", "Site"), card("b", "Minion"), card("c", "Magic")])).toEqual({ spells: 2, sites: 1, mixed: false });
    expect(handSplitOf([])).toEqual({ spells: 0, sites: 0, mixed: false });
  });

  it("reads the engine view's handCounts, checking the untyped record", () => {
    expect(readHandCounts({ handCounts: { sites: 2, spells: 4 } })).toEqual({ spells: 4, sites: 2, mixed: false });
    expect(readHandCounts({ handCounts: { sites: 0, spells: 6, mixed: true } })).toEqual({ spells: 6, sites: 0, mixed: true });
    expect(readHandCounts({ handCounts: { sites: "2", spells: 4 } })).toBeNull();
    expect(readHandCounts({})).toBeNull();
    expect(readHandCounts(undefined)).toBeNull();
  });

  it("says the split in words, and only the total for a Magician", () => {
    expect(handSplitText({ spells: 1, sites: 2, mixed: false })).toBe("1 spell, 2 sites in hand");
    expect(handSplitText({ spells: 5, sites: 0, mixed: true })).toMatch(/^5 cards in hand/);
  });
});

describe("pileActionLabel", () => {
  it("prefers the picker's own label for the pile token", () => {
    expect(pileActionLabel("atlas", "engine:3", { [pileToken("p1", "atlas")]: "Use Sorcerer: draw a site" })).toBe("Use Sorcerer: draw a site");
  });

  it("names the draw prompt's choices and the avatar's draw-a-site ability", () => {
    expect(pileActionLabel("atlas", "engine-prompt:7", {})).toBe("Draw a site from your atlas");
    expect(pileActionLabel("spellbook", "engine-prompt:7", {})).toBe("Draw a spell from your spellbook");
    expect(pileActionLabel("atlas", "engine:12", {})).toBe("Draw a site: avatar ability, taps your avatar");
  });

  it("says the avatar's draw-a-site taps the avatar, by name when known", () => {
    const labels = { [pileToken("p1", "atlas")]: "Draw a site" };
    expect(pileActionLabel("atlas", "engine:12", labels, "p1", "Flamecaller")).toBe("Draw a site: avatar ability, taps Flamecaller");
    // a prompt's draw is not the ability
    expect(pileActionLabel("atlas", "engine-prompt:3", labels, "p1", "Flamecaller")).toBe("Draw a site");
  });
});

describe("fitHandRows", () => {
  const nine = [true, true, true, false, false, false, false, false, false];
  it("a tall phone strip takes a big hand on two lines, sites apart from spells, none overlapping", () => {
    const rows = fitHandRows({ cardHeight: 74, cross: 134, landscape: nine, available: 312, gap: 6, floor: 56, minVisible: HAND_MIN_VISIBLE, maxRows: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0].indices).toEqual([0, 1, 2]);
    expect(rows[1].indices).toEqual([3, 4, 5, 6, 7, 8]);
    for (const row of rows) expect(row.fit.overlapping).toBe(false);
    // the spells stand upright in half the strip, larger than the single row's overlapped slivers
    expect(rows[1].fit.cardHeight).toBeGreaterThanOrEqual(60);
    const single = fitHandRows({ cardHeight: 74, cross: 134, landscape: nine, available: 312, gap: 6, floor: 56, minVisible: HAND_MIN_VISIBLE });
    expect(single).toHaveLength(1);
    expect(single[0].fit.overlapping).toBe(true);
  });
  it("a short desktop-wide row keeps one line of big cards", () => {
    const rows = fitHandRows({ cardHeight: 180, cross: 180, landscape: nine, available: 1000, gap: 6, floor: 72, minVisible: HAND_MIN_VISIBLE, maxRows: 2 });
    expect(rows).toHaveLength(1);
  });
  it("a small hand never splits", () => {
    const rows = fitHandRows({ cardHeight: 74, cross: 134, landscape: [false, true, false], available: 312, gap: 6, floor: 56, maxRows: 2 });
    expect(rows).toHaveLength(1);
    expect(rows[0].indices).toEqual([0, 1, 2]);
  });
});
