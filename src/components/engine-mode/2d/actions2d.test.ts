import { describe, expect, it } from "vitest";
import type { BoardReveal } from "@/lib/engine-mode/projection";
import {
  FX_RING_STYLE,
  fxCardBox,
  fxLayout,
  fxPalette,
  hiddenTotal,
  layerToggle,
  numberKeyframes,
  pickGuide,
  primaryAction,
  rollLabel,
  statusLine,
} from "./actions2d";

const reveal = (over: Partial<BoardReveal>): BoardReveal => ({
  seq: 1,
  hits: [],
  sites: [],
  caster: null,
  name: "",
  element: "",
  card: null,
  ...over,
});

describe("action bar", () => {
  it("sums hidden units over every cell and kind", () => {
    expect(hiddenTotal({})).toBe(0);
    expect(
      hiddenTotal({ "1,1": { underground: 1, underwater: 2, surface: 0 }, "2,2": { underground: 0, underwater: 0, surface: 3 } }),
    ).toBe(6);
  });

  it("names the layer a tap switches to, with the hidden count", () => {
    const hidden = { "0,0": { underground: 2, underwater: 0, surface: 0 } };
    expect(layerToggle("surface", hidden)).toMatchObject({ label: "Below", count: 2 });
    expect(layerToggle("surface", hidden).title).toContain("2 burrowed or submerged");
    expect(layerToggle("subsurface", {})).toMatchObject({ label: "Surface", count: 0 });
  });

  it("gold goes only to the one commit action", () => {
    const base = { over: false, myMain: true, confirmable: false, picking: false, active: true };
    // other moves remain: End turn is offered but not recommended
    expect(primaryAction(base)).toEqual({ kind: "endTurn", label: "End turn", enabled: true, commit: false });
    // nothing else to do: End turn is the obvious step
    expect(primaryAction({ ...base, active: false }).commit).toBe(true);
    // a half-picked action that can be taken as is
    expect(primaryAction({ ...base, picking: true, confirmable: true })).toMatchObject({ kind: "confirm", commit: true });
    // mid-pick without a confirmable action: End turn is unavailable, never gold
    expect(primaryAction({ ...base, picking: true })).toMatchObject({ kind: "endTurn", enabled: false, commit: false });
    // not our main phase
    expect(primaryAction({ ...base, myMain: false, active: false })).toMatchObject({ enabled: false, commit: false });
    expect(primaryAction({ ...base, over: true })).toMatchObject({ kind: "restart", enabled: true, commit: true });
  });
});

describe("status line", () => {
  const labels = { "2,1": "Move here", "unit:perm:u3": "  " };
  it("prefers the hovered token's label, then narration, then thinking", () => {
    expect(statusLine({ hovered: "2,1", labels, narration: "Computer plays X", botThinking: true })).toEqual({
      text: "Move here",
      kind: "hint",
    });
    expect(statusLine({ hovered: "unit:perm:u3", labels, narration: "Computer plays X", botThinking: false })).toEqual({
      text: "Computer plays X",
      kind: "cpu",
    });
    expect(statusLine({ hovered: null, labels, narration: null, botThinking: true })?.kind).toBe("thinking");
    expect(statusLine({ hovered: "3,3", labels, narration: " ", botThinking: false })).toBeNull();
  });
});

describe("event effects layout", () => {
  it("places rings, numbers and the caption on board cells", () => {
    const layout = fxLayout(
      reveal({ hits: [{ at: "2,1", dmg: 3 }], sites: ["3,1"], caster: "1,1", name: " Lightning Bolt " }),
      { w: 80, h: 80 },
    );
    expect(layout.rings.map((r) => r.key)).toEqual(["caster:1,1", "affected:3,1", "damage:2,1"]);
    expect(layout.rings[2]).toMatchObject({ x: 160, y: 80, w: 80, h: 80 });
    expect(layout.numbers).toEqual([{ key: "hit:2,1", x: 200, y: 120, text: "−3" }]);
    expect(layout.caption).toEqual({ text: "Lightning Bolt", x: 200, y: 80, align: "center", below: false });
    expect(layout.cardCell).toBeNull();
  });

  it("skips the caster ring on the first hit and drops off-board cells", () => {
    const layout = fxLayout(reveal({ hits: [{ at: "0,0", dmg: 1 }, { at: "9,9", dmg: 2 }], caster: "0,0", name: "Shot" }), { w: 50, h: 50 });
    expect(layout.rings.map((r) => r.key)).toEqual(["damage:0,0"]);
    expect(layout.numbers).toHaveLength(1);
    // top-left corner: pinned to the left edge and dropped below the cell
    expect(layout.caption).toMatchObject({ x: 0, y: 50, align: "start", below: true });
  });

  it("pins a right-edge caption to the board's right side", () => {
    const layout = fxLayout(reveal({ sites: ["4,2"], name: "Flood" }), { w: 60, h: 60 });
    expect(layout.caption).toMatchObject({ x: 300, y: 120, align: "end", below: false });
  });

  it("a named card replaces the caption and lies on the caster's cell", () => {
    const card = { cardId: 1, name: "Fireball", slug: "fireball", type: "Magic" };
    const layout = fxLayout(reveal({ card, caster: "3,2", hits: [{ at: "1,1", dmg: 4 }], name: "Fireball" }), { w: 70, h: 70 });
    expect(layout.caption).toBeNull();
    expect(layout.cardCell).toBe("3,2");
    expect(fxLayout(reveal({ card, hits: [{ at: "1,1", dmg: 4 }] }), { w: 70, h: 70 }).cardCell).toBe("1,1");
  });

  it("keeps the cast card inside the board", () => {
    const corner = fxCardBox("0,0", { w: 80, h: 80 }, false);
    expect(corner).not.toBeNull();
    expect(corner!.x).toBe(0);
    expect(corner!.y).toBe(0);
    expect(corner!.h).toBeCloseTo(120);
    expect(corner!.w).toBeCloseTo(120 * (63 / 88));
    const far = fxCardBox("4,3", { w: 80, h: 80 }, true)!;
    expect(far.x + far.w).toBeCloseTo(400);
    expect(far.y + far.h).toBeCloseTo(320);
    expect(far.w).toBeGreaterThan(far.h);
    expect(fxCardBox("nope", { w: 80, h: 80 }, false)).toBeNull();
  });

  it("lays rings on a stretched tile and keeps the cast card's shape, sized to the smaller edge", () => {
    const tile = { w: 100, h: 60 };
    const layout = fxLayout(reveal({ hits: [{ at: "2,1", dmg: 3 }], name: "Bolt" }), tile);
    expect(layout.rings[0]).toMatchObject({ x: 200, y: 60, w: 100, h: 60 });
    expect(layout.numbers[0]).toMatchObject({ x: 250, y: 90 });
    const box = fxCardBox("2,1", tile, false)!;
    expect(box.h).toBeCloseTo(90);
    expect(box.w / box.h).toBeCloseTo(63 / 88);
  });

  it("every visual aid keeps a distinct colour and ring style per kind", () => {
    for (const aid of ["none", "colorblind", "monochrome"] as const) {
      const p = fxPalette(aid);
      expect(new Set([p.damage, p.affected, p.caster]).size).toBe(3);
    }
    expect(new Set(Object.values(FX_RING_STYLE)).size).toBe(3);
  });

  it("reduced motion keeps only the fade", () => {
    expect(numberKeyframes(1, true).every((k) => k.transform === undefined)).toBe(true);
    expect(numberKeyframes(2, false)[3].transform).toBe("translateY(-68px) scale(1.5)");
  });
});

describe("table tools", () => {
  it("rolls within 1..max", () => {
    expect(rollLabel("d20", 20, () => 0)).toBe("d20: 1");
    expect(rollLabel("d20", 20, () => 0.9999)).toBe("d20: 20");
    expect(rollLabel("coin", 2, () => 1)).toBe("coin: 2");
  });
});

describe("pickGuide", () => {
  it("names the action and asks for the tile once a hand card is chosen", () => {
    const guide = pickGuide({ next: ["1,2", "2,2"], labels: { "1,2": "Summon Sacred Scarabs", "2,2": "Summon Sacred Scarabs" }, source: "Sacred Scarabs" });
    expect(guide).toEqual({ title: "Summon Sacred Scarabs", ask: "Tap a highlighted tile." });
  });
  it("a unit with moves and attacks says both", () => {
    const guide = pickGuide({
      next: ["1,2", "unit:perm:9"],
      labels: { "1,2": "Move Pit Vipers", "unit:perm:9": "Pit Vipers attacks" },
      source: "Pit Vipers",
    });
    expect(guide).toEqual({ title: "Move Pit Vipers or attack", ask: "Tap a highlighted tile or unit." });
  });
  it("gives region options a question", () => {
    const guide = pickGuide({
      next: ["opt:2,1:region-surface", "opt:2,1:region-under"],
      labels: { "opt:2,1:region-surface": "On the surface", "opt:2,1:region-under": "Burrowed" },
      source: "Pit Vipers",
    });
    expect(guide?.title).toBe("Where does Pit Vipers go?");
    const attack = pickGuide({
      next: ["opt:2,1:move", "opt:2,1:site"],
      labels: { "opt:2,1:move": "Move here", "opt:2,1:site": "Attack the site" },
      source: "Pit Vipers",
    });
    expect(attack?.title).toBe("Move Pit Vipers or attack?");
  });
  it("is silent with nothing to ask", () => {
    expect(pickGuide({ next: [], labels: {}, source: null })).toBeNull();
  });
});
