import { beforeEach, describe, expect, it } from "vitest";
import { useCpuBoardPicker } from "./boardPicker";
import { fieldTargets, toneColors, type FieldTone } from "./fieldTargets";

/**
 * Regression cover for the board-death bug.
 *
 * A pick used to be acknowledged by configuring the store under a throwaway `:ack:` request,
 * which hard-reset it to an empty token list. Re-arming then relied on the caller's React
 * state changing — but a REFUSED pick (the mulligan's 4th card, a chooseTargets past `count`)
 * returns the identical array, React bails out of the render, and nothing ever reconfigured.
 * The board was left permanently unclickable.
 */
describe("board picker", () => {
  beforeEach(() => useCpuBoardPicker.getState().clear(useCpuBoardPicker.getState().request));

  it("keeps the armed tokens when a pick is acknowledged", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("engine-mulligan:", ["hand:p1:a", "hand:p1:b", "hand:p1:c"]);
    picker.setGlow("engine-mulligan:", ["hand:p1:a"]);
    picker.select("hand:p1:b");
    expect(useCpuBoardPicker.getState().selected).toBe("hand:p1:b");

    useCpuBoardPicker.getState().deselect("engine-mulligan:");

    const after = useCpuBoardPicker.getState();
    expect(after.selected).toBeNull();
    // the whole point: the board is still live and still glowing
    expect(after.tiles).toEqual(["hand:p1:a", "hand:p1:b", "hand:p1:c"]);
    expect(after.glow).toEqual(["hand:p1:a"]);
    expect(after.request).toBe("engine-mulligan:");
  });

  it("lets the same token be picked again after a refused pick", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("req", ["t1", "t2"]);
    picker.select("t1");
    useCpuBoardPicker.getState().deselect("req");
    // the subscriber ignores a selection equal to the previous one, so clearing it is what
    // makes a second click on the SAME token observable
    useCpuBoardPicker.getState().select("t1");
    expect(useCpuBoardPicker.getState().selected).toBe("t1");
  });

  it("ignores a deselect aimed at someone else's request", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("mine", ["t1"]);
    picker.select("t1");
    useCpuBoardPicker.getState().deselect("someone-else");
    expect(useCpuBoardPicker.getState().selected).toBe("t1");
  });
});

describe("starting a choice versus continuing one", () => {
  it("starts out of sequence, so the first options read as fresh choices", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("engine:1", ["2,1", "3,1"]);
    expect(useCpuBoardPicker.getState().sequence).toBe(false);
  });

  it("marks the board as mid-sequence once a step has been taken", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("engine:1", ["2,1"]);
    picker.setSequence("engine:1", true);
    expect(useCpuBoardPicker.getState().sequence).toBe(true);
  });

  it("drops back out of sequence when a new choice is configured", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("engine:1", ["2,1"]);
    picker.setSequence("engine:1", true);
    picker.configure("engine:2", ["3,1"]);
    expect(useCpuBoardPicker.getState().sequence).toBe(false);
  });

  it("ignores a sequence flag aimed at someone else's request", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("mine", ["2,1"]);
    picker.setSequence("theirs", true);
    expect(useCpuBoardPicker.getState().sequence).toBe(false);
  });
});

describe("the footprint of a 2x2 anchor", () => {
  const AREAS = { "1,1": ["1,1", "2,1", "1,2", "2,2"], "3,1": ["3,1", "4,1", "3,2", "4,2"] };

  it("washes the hovered anchor's whole area and paints no anchor as a tile", () => {
    const targets = fieldTargets({
      tiles: ["1,1", "3,1"], glow: [], sources: [], selected: null, labels: {}, areas: AREAS, hovered: "1,1",
    });
    // An anchor is an INTERSECTION, drawn as a marker on the crossing — never as a tile, which
    // would read as "choose this square". All four covered squares show the same extent.
    for (const cell of AREAS["1,1"]) expect(targets.tiles.get(cell)).toBe("area");
    // the OTHER anchor is not previewed at all — only the one under the pointer
    expect(targets.tiles.get("3,1")).toBeUndefined();
    expect(targets.tiles.get("4,1")).toBeUndefined();
  });

  it("lights no tile at all until the pointer is on an anchor", () => {
    const targets = fieldTargets({
      tiles: ["1,1", "3,1"], glow: [], sources: [], selected: null, labels: {}, areas: AREAS, hovered: null,
    });
    // only the intersection markers are on screen; the board itself stays clean
    expect(targets.tiles.size).toBe(0);
  });

  it("never overpaints a square that already carries a sharper meaning", () => {
    const targets = fieldTargets({
      tiles: ["1,1"], glow: ["2,1"], sources: ["2,2"], selected: null, labels: {}, areas: AREAS, hovered: "1,1",
    });
    expect(targets.tiles.get("2,1"), "a chosen target stays a chosen target").toBe("target");
    expect(targets.tiles.get("2,2"), "the caster stays the caster").toBe("source");
    expect(targets.tiles.get("1,2")).toBe("area");
  });

  it("keeps the clicked area lit rather than following the pointer elsewhere", () => {
    const targets = fieldTargets({
      tiles: ["1,1", "3,1"], glow: [], sources: [], selected: "1,1", labels: {}, areas: AREAS, hovered: "3,1",
    });
    // a committed pick outranks whatever the pointer happens to be over; the marker itself
    // carries the "chosen" colour, so the tiles only need to show the footprint
    for (const cell of AREAS["1,1"]) expect(targets.tiles.get(cell)).toBe("area");
    expect(targets.tiles.get("4,1")).toBeUndefined();
  });

  it("resets the areas when a new choice is configured", () => {
    const picker = useCpuBoardPicker.getState();
    picker.configure("engine:1", ["1,1"]);
    picker.setAreas("engine:1", AREAS);
    expect(Object.keys(useCpuBoardPicker.getState().areas)).toHaveLength(2);
    picker.configure("engine:2", ["3,1"]);
    expect(useCpuBoardPicker.getState().areas).toEqual({});
  });
});

describe("the board's colour language under a visual aid", () => {
  /** What `filter: grayscale(1)` actually leaves of a colour. CSS uses Rec. 709 luma. */
  const luma = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  const TONES: FieldTone[] = ["candidate", "continue", "selected", "target", "source", "area"];

  it("keeps the ordinary board exactly as it was", () => {
    const colors = toneColors("none");
    expect(colors.candidate).toBe("#f59e0b");
    expect(colors.continue).toBe("#a78bfa");
    expect(colors.selected).toBe("#22c55e");
    expect(colors.source).toBe("#22d3ee");
  });

  it("gives every tone its own colour in each mode", () => {
    for (const aid of ["none", "colorblind", "monochrome"] as const) {
      const colors = toneColors(aid);
      for (const tone of TONES) expect(colors[tone], `${aid}/${tone}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    // `selected` and `target` share green on the default board by design (both mean "chosen"),
    // but a mode meant to aid reading must not merge anything else.
    const cb = toneColors("colorblind");
    expect(new Set(TONES.map((t) => cb[t])).size, "colour-blind tones are all distinct").toBe(TONES.length);
    const mono = toneColors("monochrome");
    expect(new Set(TONES.map((t) => mono[t])).size, "monochrome tones are all distinct").toBe(TONES.length);
  });

  it("separates the monochrome tones by luminance, which is all it has", () => {
    const mono = toneColors("monochrome");
    const steps = TONES.map((t) => luma(mono[t])).sort((a, b) => a - b);
    // every neighbouring pair clearly apart — the default palette's six all sit inside a
    // 22-step band once the grayscale filter has had them, which is what this replaces
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i] - steps[i - 1], `step ${i} of the ladder`).toBeGreaterThan(20);
    }
    expect(steps[steps.length - 1] - steps[0], "the ladder uses most of the range").toBeGreaterThan(140);
    // what you committed to is the brightest thing on the board
    expect(luma(mono.selected)).toBe(Math.max(...TONES.map((t) => luma(mono[t]))));
  });

  it("shows why the default palette needed replacing under grayscale", () => {
    const plain = toneColors("none");
    const band = TONES.map((t) => luma(plain[t]));
    expect(Math.max(...band) - Math.min(...band), "six tones inside one narrow band").toBeLessThan(30);
  });

  it("falls back to the ordinary board for an unknown mode", () => {
    const unknown = "something-else" as unknown as Parameters<typeof toneColors>[0];
    expect(toneColors(unknown)).toEqual(toneColors("none"));
  });
});
