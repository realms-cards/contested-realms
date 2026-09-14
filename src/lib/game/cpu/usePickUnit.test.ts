import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STACK_LAYER_LIFT } from "@/lib/game/boardShared";
import { CARD_SHORT, TILE_SIZE } from "@/lib/game/constants";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { parsePickToken } from "@/lib/game/cpu/pickTokens";
import {
  parseUnitPickSignature,
  permanentUnitToken,
  pickUnit,
  registerUnitPickPulse,
  tileUnitTokens,
  UNIT_PICK_FILL,
  UNIT_PICK_PRIORITY_HEIGHT,
  unitPickDistance,
  unitPickLayout,
  unitPickPulseActive,
  unitPickSignature,
  unitPickState,
  useUnitPicks,
  type UnitPickState,
} from "@/lib/game/cpu/usePickUnit";

const empty = {tiles:[],glow:[],sources:[],selected:null};
const reset = () => useCpuBoardPicker.setState({request:"",tiles:[],selected:null,glow:[],sources:[],labels:{}});

describe("unit pick tokens", () => {
  it("derive the rules' tokens for permanents (instance id, else slot) and avatars standing on the tile", () => {
    expect(permanentUnitToken("2,1",0,{instanceId:"ogre"})).toBe("unit:perm:ogre");
    expect(permanentUnitToken("2,1",3,{})).toBe("unit:slot:2,1:3");
    // Like unitsInRealm: an item without its own id falls back to its card instance id.
    expect(permanentUnitToken("2,1",1,{card:{instanceId:"card-only"}})).toBe("unit:perm:card-only");
    expect(parsePickToken(permanentUnitToken("2,1",3,{}))).toEqual({kind:"unit",at:"2,1",index:3});
    const tokens = tileUnitTokens("2,1",[{instanceId:"a"},{instanceId:"lance",attachedTo:{at:"2,1",index:0}},{instanceId:null}],
      {p1:{pos:[0,3]},p2:{pos:[2,1]}});
    // Avatars first (they tuck under the stack), attachments are not separate cards, slot index stays the array index.
    expect(tokens).toEqual(["unit:avatar:p2","unit:perm:a","unit:slot:2,1:2"]);
    expect(tileUnitTokens("4,0",[],{p1:{pos:null},p2:undefined})).toEqual([]);
  });
});

describe("per-card pick state", () => {
  const picker = {tiles:["unit:perm:a","unit:perm:b","2,1"],glow:["unit:perm:c"],sources:["unit:avatar:p1","unit:perm:a"],selected:"unit:perm:b"};
  it("ranks a clickable candidate over a chosen target over a source, like the tile layer", () => {
    expect(unitPickState(picker,"unit:perm:a")).toBe("candidate");
    expect(unitPickState(picker,"unit:perm:b")).toBe("selected");
    expect(unitPickState(picker,"unit:perm:c")).toBe("target");
    expect(unitPickState(picker,"unit:avatar:p1")).toBe("source");
    expect(unitPickState(picker,"unit:perm:z")).toBeNull();
  });
  it("snapshots only the tile's own cards as a primitive, empty when none of them is involved", () => {
    expect(unitPickSignature(empty,["unit:perm:a"])).toBe("");
    expect(unitPickSignature(picker,["unit:perm:x","unit:perm:y"])).toBe("");
    const tokens = ["unit:perm:x","unit:perm:a","unit:perm:c"];
    const signature = unitPickSignature(picker,tokens);
    expect(signature).toBe("|candidate|target");
    expect([...parseUnitPickSignature(signature,tokens)]).toEqual([["unit:perm:a","candidate"],["unit:perm:c","target"]]);
  });
});

describe("useUnitPicks", () => {
  beforeEach(reset);
  it("re-renders a stack only when one of its own cards changes tone", () => {
    let renders = 0;
    const tokens = ["unit:perm:a","unit:perm:b"];
    const {result} = renderHook(() => { renders++; return useUnitPicks(tokens); });
    const before = renders;
    act(() => { useCpuBoardPicker.getState().configure("elsewhere",["3,3","unit:perm:other"]); });
    expect(renders).toBe(before);
    expect(result.current.size).toBe(0);
    act(() => { useCpuBoardPicker.getState().configure("combat",["unit:perm:a","unit:perm:b"]); });
    expect([...result.current]).toEqual([["unit:perm:a","candidate"],["unit:perm:b","candidate"]]);
    const afterConfigure = renders;
    act(() => { useCpuBoardPicker.getState().setGlow("combat",[],["unit:avatar:p1"]); });
    expect(renders).toBe(afterConfigure);
    act(() => { pickUnit("unit:perm:b"); });
    expect(result.current.get("unit:perm:b")).toBe("selected");
    act(() => { pickUnit("unit:perm:nope"); });
    expect(useCpuBoardPicker.getState().selected).toBe("unit:perm:b");
    act(() => { useCpuBoardPicker.getState().clear("combat"); });
    expect(result.current.size).toBe(0);
  });
});

describe("spread layout", () => {
  const picks = (entries: [string, UnitPickState][]) => new Map(entries);
  it("leaves a lone card alone, and only lifts a lone candidate over the other cards on its tile", () => {
    expect(unitPickLayout(["unit:perm:a"],picks([["unit:perm:a","candidate"]])).size).toBe(0);
    const lifted = unitPickLayout(["unit:perm:a","unit:perm:b"],picks([["unit:perm:a","candidate"],["unit:perm:b","source"]]));
    expect([...lifted]).toEqual([["unit:perm:a",{x:0,lift:STACK_LAYER_LIFT*3}]]);
  });
  it("fans N candidates symmetrically, a little apart, inside the tile, stacked in order", () => {
    for (const count of [2,3,4,6]) {
      const tokens = Array.from({length:count+1},(_,i) => `unit:perm:${i}`);
      const layout = unitPickLayout(tokens,picks(tokens.slice(1).map(token => [token,"candidate"])));
      const xs = tokens.slice(1).map(token => layout.get(token)!.x);
      expect(layout.has(tokens[0])).toBe(false);
      expect(xs.reduce((sum,x) => sum+x,0)).toBeCloseTo(0);
      const step = xs[1]-xs[0];
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThanOrEqual(CARD_SHORT*0.7+1e-9);
      // The outer card edges stay within the tile.
      expect(xs[xs.length-1]+CARD_SHORT/2).toBeLessThanOrEqual(TILE_SIZE/2);
      const lifts = tokens.slice(1).map(token => layout.get(token)!.lift);
      expect(lifts).toEqual([...lifts].sort((a,b) => a-b));
    }
    const two = unitPickLayout(["a","b"],picks([["a","candidate"],["b","selected"]]));
    expect(two.get("a")!.x).toBeCloseTo(-CARD_SHORT*0.35);
    expect(two.get("b")!.x).toBeCloseTo(CARD_SHORT*0.35);
  });
});

describe("raycast priority", () => {
  it("brings a candidate card in front of the lifted tile click planes without reordering cards on one ray", () => {
    const down = -0.8;
    expect(unitPickDistance(10,down)).toBeCloseTo(10-UNIT_PICK_PRIORITY_HEIGHT/0.8);
    // Tile planes sit 0.3 above the board: a card 0.3 lower along a straight-down ray still wins.
    expect(unitPickDistance(10.3,-1)).toBeLessThan(10);
    expect(unitPickDistance(10,down)-unitPickDistance(10.01,down)).toBeCloseTo(-0.01);
    expect(unitPickDistance(5,0.2)).toBe(5);
  });
});

describe("shared pulse", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  it("runs one throttled timer while any candidate is mounted and stops with the last one", () => {
    const frame = vi.fn();
    const first = {opacity:UNIT_PICK_FILL.opacity}, second = {opacity:UNIT_PICK_FILL.opacity};
    const stopFirst = registerUnitPickPulse(first,frame);
    const stopSecond = registerUnitPickPulse(second,frame);
    expect(unitPickPulseActive()).toBe(true);
    vi.advanceTimersByTime(800);
    expect(frame.mock.calls.length).toBe(10);
    expect(first.opacity).toBe(second.opacity);
    expect(Math.abs(first.opacity-UNIT_PICK_FILL.opacity)).toBeLessThanOrEqual(UNIT_PICK_FILL.pulse+1e-9);
    stopFirst();
    expect(unitPickPulseActive()).toBe(true);
    stopSecond();
    expect(unitPickPulseActive()).toBe(false);
    vi.advanceTimersByTime(800);
    expect(frame.mock.calls.length).toBe(10);
  });
});
