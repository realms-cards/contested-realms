import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  addDraw,
  drawTotal,
  EMPTY_TALLY,
  handCardTone,
  handPickFrom,
  matchDraw,
  NO_HAND_PICK,
  parseDrawSplits,
  pileCanTake,
  pileGlow,
  pilePicks,
  resetTally,
  selectHandPick,
  selectPilePick,
  tallyFor,
  useDrawTally,
  type PickerFields,
} from "@/lib/game/cpu/handPilePicks";
import { drawToken, handToken, pileToken } from "@/lib/game/cpu/pickTokens";

const picker = (fields: Partial<PickerFields>): PickerFields => ({ request: "r1", tiles: [], selected: null, glow: [], sources: [], ...fields });
const SPLITS = parseDrawSplits([drawToken("p1", 2, 0), drawToken("p1", 1, 1), drawToken("p1", 0, 2)], "p1");

describe("hand picks", () => {
  it("lights only this seat's hand tokens", () => {
    const slice = selectHandPick("p1")(picker({
      tiles: [handToken("p1", "a"), handToken("p2", "b"), "2,1", pileToken("p1", "atlas"), handToken("p1", "c")],
      selected: handToken("p1", "c"),
      glow: [handToken("p1", "g"), handToken("p2", "h")],
    }));
    const pick = handPickFrom(slice);
    expect(pick.active).toBe(true);
    expect([...pick.candidates]).toEqual(["a", "c"]);
    expect(pick.selected).toBe("c");
    expect(handCardTone(pick, "c")).toBe("selected");
    expect(handCardTone(pick, "a")).toBe("candidate");
    expect(handCardTone(pick, "g")).toBe("target");
    expect(handCardTone(pick, "b")).toBeNull();
    expect(handCardTone(pick, undefined)).toBeNull();
  });

  it("is inactive without hand tokens for the seat, and keeps ids that contain colons", () => {
    expect(handPickFrom(selectHandPick("p1")(picker({ tiles: [handToken("p2", "x"), "1,1"] })))).toBe(NO_HAND_PICK);
    const pick = handPickFrom(selectHandPick("p2")(picker({ tiles: [handToken("p2", "inst:7")] })));
    expect([...pick.candidates]).toEqual(["inst:7"]);
  });

  it("returns equal primitive slices for unrelated picker changes", () => {
    const select = selectHandPick("p1");
    expect(select(picker({ tiles: ["0,0"], request: "a" }))).toEqual(select(picker({ tiles: ["3,2"], request: "b" })));
  });
});

describe("pile picks", () => {
  it("reads pile, glow and draw tokens of this seat only", () => {
    const slice = selectPilePick("p2")(picker({
      tiles: [pileToken("p2", "atlas"), pileToken("p1", "spellbook"), drawToken("p2", 1, 0), drawToken("p1", 0, 1), "draw:p2:x-y"],
      selected: pileToken("p2", "atlas"),
      glow: [pileToken("p2", "spellbook")],
    }));
    expect(pilePicks(slice)).toEqual(["atlas"]);
    expect(pileGlow(slice)).toEqual(["spellbook"]);
    expect(parseDrawSplits(slice.draws, "p2")).toEqual([{ token: "draw:p2:1-0", spells: 1, sites: 0 }]);
    expect(slice.selected).toBe("pile:p2:atlas");
    expect(slice.request).toBe("r1");
    expect(selectPilePick("p2")(picker({ selected: pileToken("p1", "atlas") })).selected).toBe("");
  });

  it("only tracks the request while draw splits are offered", () => {
    expect(selectPilePick("p1")(picker({ tiles: [pileToken("p1", "atlas")] })).request).toBe("");
  });
});

describe("draw tally", () => {
  it("takes the total from the candidates", () => {
    expect(drawTotal(SPLITS)).toBe(2);
    expect(drawTotal(parseDrawSplits([drawToken("p1", 3, 0), drawToken("p1", 2, 1)], "p1"))).toBe(3);
    expect(drawTotal([])).toBe(0);
  });

  it("resolves a split once the clicks match it", () => {
    let tally = addDraw(EMPTY_TALLY, "r1", SPLITS, "atlas");
    expect(tally).toEqual({ request: "r1", spells: 0, sites: 1 });
    expect(matchDraw(SPLITS, tally)).toBeNull();
    tally = addDraw(tally, "r1", SPLITS, "spellbook");
    expect(matchDraw(SPLITS, tally)?.token).toBe("draw:p1:1-1");
  });

  it("ignores clicks no candidate allows and restarts after a finished split", () => {
    const onlyMixed = parseDrawSplits([drawToken("p1", 1, 1)], "p1");
    const one = addDraw(EMPTY_TALLY, "r1", onlyMixed, "spellbook");
    expect(pileCanTake(onlyMixed, one, "spellbook")).toBe(false);
    expect(addDraw(one, "r1", onlyMixed, "spellbook")).toEqual(one);
    const done = addDraw(one, "r1", onlyMixed, "atlas");
    expect(matchDraw(onlyMixed, done)?.token).toBe("draw:p1:1-1");
    expect(addDraw(done, "r1", onlyMixed, "atlas")).toEqual({ request: "r1", spells: 0, sites: 1 });
  });

  it("clears on reset and when the request changes", () => {
    const tally = addDraw(EMPTY_TALLY, "r1", SPLITS, "spellbook");
    expect(tallyFor(tally, "r2", SPLITS)).toEqual({ request: "r2", spells: 0, sites: 0 });
    expect(tallyFor(resetTally("r1"), "r1", SPLITS)).toEqual({ request: "r1", spells: 0, sites: 0 });
    expect(addDraw(tally, "r2", SPLITS, "atlas")).toEqual({ request: "r2", spells: 0, sites: 1 });
  });

  it("drops a tally the current candidates can no longer reach", () => {
    const tally = addDraw(addDraw(EMPTY_TALLY, "r1", SPLITS, "spellbook"), "r1", SPLITS, "spellbook");
    expect(tallyFor(tally, "r1", parseDrawSplits([drawToken("p1", 0, 2)], "p1"))).toEqual({ request: "r1", spells: 0, sites: 0 });
  });
});

describe("useDrawTally", () => {
  it("selects the matching token, resets, and starts over for a new request", () => {
    const onMatch = vi.fn();
    const { result, rerender } = renderHook(({ request }) => useDrawTally(request, SPLITS, onMatch), { initialProps: { request: "r1" } });
    expect(result.current.total).toBe(2);
    act(() => result.current.add("spellbook"));
    expect(result.current.tally).toMatchObject({ spells: 1, sites: 0 });
    act(() => result.current.reset());
    expect(result.current.tally).toMatchObject({ spells: 0, sites: 0 });
    act(() => result.current.add("atlas"));
    act(() => result.current.add("atlas"));
    expect(onMatch).toHaveBeenCalledTimes(1);
    expect(onMatch).toHaveBeenCalledWith("draw:p1:0-2");
    expect(result.current.matched?.token).toBe("draw:p1:0-2");
    rerender({ request: "r2" });
    expect(result.current.tally).toEqual({ request: "r2", spells: 0, sites: 0 });
    expect(result.current.matched).toBeNull();
  });
});
