import { describe, expect, it } from "vitest";
import cards from "@/lib/game/cpu/cards.json";
import { isWater } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, PermanentItem } from "@/lib/game/store/types";
import { computeThresholdTotals, resourceContextFromState } from "@/lib/game/store/utils/resourceHelpers";

const card = (name: keyof typeof cards): CardRef => ({cardId:1,...cards[name],instanceId:name});
const flood: PermanentItem = {owner:1,card:card("Flood"),instanceId:"Flood",tapped:false};
function setup() {
  const store = createGameStore();
  store.setState({board:{size:{w:5,h:4},sites:{
    "1,1":{owner:1,card:card("Humble Village")},"2,1":{owner:1,card:card("Bedrock")},
    "1,2":{owner:2,card:card("Red Desert")},"0,1":{owner:1,card:card("Humble Village")},
  }},permanents:{"1,1":[flood]}});
  return store;
}
describe("Flood aura", () => {
  it("floods its 2x2 footprint, not Bedrock, outside squares, or void", () => {
    const state = setup().getState();
    expect(isWater(state,"1,1")).toBe(true);
    expect(isWater(state,"1,2")).toBe(true);
    expect(isWater(state,"2,1")).toBe(false);
    expect(isWater(state,"0,1")).toBe(false);
    expect(isWater(state,"2,2")).toBe(false);
    expect(computeThresholdTotals(resourceContextFromState(state,"p1")).water).toBe(1);
    expect(computeThresholdTotals(resourceContextFromState(state,"p2")).water).toBe(1);
  });
  it("stops flooding when silenced or removed and preserves printed affinities", () => {
    const store = setup();
    const before = computeThresholdTotals(resourceContextFromState(store.getState(),"p2"));
    expect(before.fire).toBeGreaterThan(0);
    store.setState({permanents:{"1,1":[flood,{owner:1,card:{cardId:2,name:"Silenced",type:"Token"},attachedTo:{at:"1,1",index:0}}]}});
    expect(isWater(store.getState(),"1,2")).toBe(false);
    expect(computeThresholdTotals(resourceContextFromState(store.getState(),"p2")).water).toBe(0);
    store.setState({permanents:{}});
    expect(isWater(store.getState(),"1,1")).toBe(false);
    expect(computeThresholdTotals(resourceContextFromState(store.getState(),"p2")).fire).toBe(before.fire);
  });
});
