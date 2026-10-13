import { createGame } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { areaFootprints, edgeFootprints, edgeToken, permutationPlacements, swapSlots } from "./areaPrompt";
import { engineCellKey } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";

function game(): EngineState {
  const deck = toEngineDeck(enginePrecons[0]);
  return createGame([deck, deck], ["You", "Computer"], 7, 0 as PlayerId);
}

describe("2x2 area anchors", () => {
  it("names all four squares an anchor covers, in board space", () => {
    const g = game();
    const areas = areaFootprints(g, [{ x: 1, y: 1 }]);
    const anchor = engineCellKey(1, 1);
    expect(Object.keys(areas)).toEqual([anchor]);
    expect(areas[anchor]).toHaveLength(4);
    // the anchor is one of its own four squares, so clicking it is clicking inside the area
    expect(areas[anchor]).toContain(anchor);
    expect(new Set(areas[anchor]).size, "four distinct squares").toBe(4);
    for (const cell of areas[anchor]) expect(cell).toMatch(/^[0-4],[0-3]$/);
  });

  it("clips at the board edge rather than naming squares off it", () => {
    const g = game();
    // the engine only offers in-bounds anchors, but Magellan Globe aside, an anchor on the last
    // row or column must never produce a cell outside the grid
    const areas = areaFootprints(g, [{ x: 4, y: 3 }]);
    const cells = areas[engineCellKey(4, 3)];
    for (const cell of cells) expect(cell).toMatch(/^[0-4],[0-3]$/);
    expect(cells.length).toBeLessThanOrEqual(4);
    expect(cells.length).toBeGreaterThan(0);
  });
});

describe("Earthquake's arrangement", () => {
  const slots = [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
  ];
  const identity = slots.map((_, i) => i);

  it("sends nothing at all when the player moved nothing", () => {
    // the engine reads an empty answer as "rearrange nothing" and goes straight to the burrow
    expect(permutationPlacements(slots, identity)).toEqual([]);
  });

  it("stays a bijection of exactly the area through any run of swaps", () => {
    // these are the engine's own checks in applyPermutation: same length as the area, distinct
    // destinations, distinct sources, and nothing outside the area
    let holders = swapSlots(identity, 0, 3);
    holders = swapSlots(holders, 1, 3);
    holders = swapSlots(holders, 0, 2);
    const placements = permutationPlacements(slots, holders);
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
    const area = new Set(slots.map(key));
    expect(placements).toHaveLength(slots.length);
    const dests = new Set(placements.map((p) => key(p)));
    const srcs = new Set(placements.map((p) => key({ x: p.sx, y: p.sy })));
    expect(dests.size).toBe(slots.length);
    expect(srcs.size).toBe(slots.length);
    for (const k of [...dests, ...srcs]) expect(area.has(k)).toBe(true);
  });

  it("trades exactly the two squares that were clicked", () => {
    const placements = permutationPlacements(slots, swapSlots(identity, 0, 2));
    // slot 0 receives slot 2's site and vice versa; the other two stay put
    expect(placements[0]).toEqual({ x: 1, y: 1, sx: 1, sy: 2 });
    expect(placements[2]).toEqual({ x: 1, y: 2, sx: 1, sy: 1 });
    expect(placements[1]).toEqual({ x: 2, y: 1, sx: 2, sy: 1 });
    expect(placements[3]).toEqual({ x: 2, y: 2, sx: 2, sy: 2 });
  });

  it("ignores a swap that names the same square or one off the end", () => {
    expect(swapSlots(identity, 1, 1)).toEqual(identity);
    expect(swapSlots(identity, 1, 9)).toEqual(identity);
    expect(swapSlots(identity, -1, 2)).toEqual(identity);
  });
});

describe("borders between squares", () => {
  it("puts each border under its own token, naming the two squares it divides", () => {
    const edges = [
      { a: { x: 1, y: 1 }, b: { x: 2, y: 1 }, key: "1,1|2,1" },
      { a: { x: 1, y: 1 }, b: { x: 1, y: 2 }, key: "1,1|1,2" },
    ];
    const areas = edgeFootprints(edges);
    expect(Object.keys(areas)).toEqual([edgeToken("1,1|2,1"), edgeToken("1,1|1,2")]);
    // two cells, not four: the marker lands on the midpoint, which is the border itself
    expect(areas[edgeToken("1,1|2,1")]).toEqual([engineCellKey(1, 1), engineCellKey(2, 1)]);
    expect(areas[edgeToken("1,1|1,2")]).toHaveLength(2);
    // namespaced, so no tile renderer mistakes a border for a square
    for (const token of Object.keys(areas)) expect(token).not.toMatch(/^[0-4],[0-3]$/);
  });

  it("skips a border the engine sent without a key, since nothing could answer it", () => {
    const areas = edgeFootprints([{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, key: "" }]);
    expect(areas).toEqual({});
  });
});

describe("what a board pick calls its own options", () => {
  // Regression: the banner hardcoded "squares", so "Draw from your spellbook or your atlas?"
  // — whose options are the two deck PILES — announced "2 squares".
  it("counts squares, cards and targets by what the tokens really are", async () => {
    const { pickNounForTest } = await import("@/components/engine-mode/promptNoun");
    expect(pickNounForTest(["1,1", "2,1"])).toEqual({ one: "square", many: "squares" });
    expect(pickNounForTest(["hand:p1:c1"])).toEqual({ one: "card", many: "cards" });
    expect(pickNounForTest(["unit:perm:u1", "unit:avatar:p2"])).toEqual({ one: "target", many: "targets" });
  });

  it("says nothing for piles, or for a mixed bag it cannot name", async () => {
    const { pickNounForTest } = await import("@/components/engine-mode/promptNoun");
    expect(pickNounForTest(["pile:p1:spellbook", "pile:p1:atlas"]), "the buttons already name these").toBeNull();
    expect(pickNounForTest(["1,1", "hand:p1:c1"]), "mixed kinds").toBeNull();
    expect(pickNounForTest([])).toBeNull();
  });
});
