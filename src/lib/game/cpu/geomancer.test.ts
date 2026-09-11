import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import cards from "@/lib/game/cpu/cards.json";
import { getSpellChoices } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
function setup() {
  const store = createGameStore();
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,
    board:{size:{w:5,h:4},sites:{"2,3":{owner:1,card:card("Autumn River")}}},permanents:{},
    avatars:{p1:{card:card("Geomancer"),pos:[2,3],tapped:false},p2:{card:card("Geomancer"),pos:[2,0],tapped:false}},
  } as Partial<GameState>);
  return store;
}
const settle = async () => { for (let i=0;i<6;i++) await Promise.resolve(); };
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());

describe("CPU Geomancer site-play bonus", () => {
  it("finishes site Genesis before offering adjacent voids, without the tabletop resolver", async () => {
    const store = setup(), site = card("Humble Village");
    const legacy = vi.fn();
    store.setState({matchId:"geomancer-human",transport:new LocalTransport(),beginGeomancerFill:legacy,
      zones:{...store.getState().zones,p1:{...store.getState().zones.p1,hand:[site]}},selectedCard:{who:"p1",index:0,card:site}});
    store.getState().playSelectedTo(2,2);
    await settle();
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("genesis");
    expect(store.getState().cpuTriggerOptions || []).toHaveLength(0);
    store.getState().setCpuMagicChoice("genesis/decline");
    store.getState().resolveMagic();
    await settle();
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("geomancerFill");
    expect(getSpellChoices(store.getState(),"p1","Geomancer").map(choice => choice.key).sort()).toEqual(["geomancer/fill/1,3","geomancer/fill/3,3"]);
    store.getState().setCpuMagicChoice("geomancer/fill/1,3");
    store.getState().resolveMagic();
    await settle();
    expect(store.getState().board.sites["1,3"]).toMatchObject({cpuNeutral:true,card:{name:"Rubble",thresholds:{}}});
    expect(legacy).not.toHaveBeenCalled();
    expect(store.getState().pendingMagic).toBeNull();
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites}}});
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("lets the CPU automatically place neutral Rubble after playing an earth site", async () => {
    const store = setup(), site = card("Holy Ground");
    store.setState({matchId:"geomancer-cpu",transport:new LocalTransport(),currentPlayer:2,zones:{...store.getState().zones,p2:{...store.getState().zones.p2,hand:[site]}}});
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"2,0":{owner:2,card:site}}},zones:{...store.getState().zones,p2:{...store.getState().zones.p2,hand:[]}},avatars:{...store.getState().avatars,p2:{...store.getState().avatars.p2,tapped:true}}});
    await settle();
    const rubble = Object.entries(store.getState().board.sites).filter(([,tile]) => tile.card?.name === "Rubble");
    expect(rubble).toHaveLength(1);
    expect(rubble[0][1].cpuNeutral).toBe(true);
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("does not grant the bonus when replacing Rubble with an earth site from the atlas", async () => {
    const store = setup();
    store.setState({matchId:"geomancer-replace",transport:new LocalTransport(),board:{...store.getState().board,sites:{...store.getState().board.sites,"1,3":{owner:1,cpuNeutral:true,card:{cardId:2,name:"Rubble",type:"Token"}}}},zones:{...store.getState().zones,p1:{...store.getState().zones.p1,atlas:[card("Holy Ground")]}}});
    const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.startsWith("geomancer/"));
    if (!choice) throw new Error("Missing atlas replacement");
    store.getState().activateCpuAbility(choice.key);
    await settle();
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("genesis");
    store.getState().setCpuMagicChoice("genesis/heal");
    store.getState().resolveMagic();
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
    expect(Object.values(store.getState().board.sites).some(tile => tile.card?.name === "Rubble")).toBe(false);
  });
  it("uses the latest board and completes without a choice if no adjacent void remains", () => {
    const store = setup();
    store.setState({pendingMagic:{id:"fill",tile:{x:2,y:3},spell:{at:"2,3",index:-1,owner:1,card:card("Geomancer")},cpuEvent:{kind:"geomancerFill",seat:"p1"},status:"choosingTarget",createdAt:0},board:{...store.getState().board,sites:{...store.getState().board.sites,"1,3":{owner:2,card:card("Red Desert")},"3,3":{owner:2,card:card("Red Desert","other")},"2,2":{owner:2,card:card("Red Desert","third")}}}});
    const choices = getSpellChoices(store.getState(),"p1","Geomancer");
    expect(choices.map(choice => choice.key)).toEqual(["geomancer/no-void"]);
    store.getState().setCpuMagicChoice(choices[0].key);
    store.getState().resolveMagic();
    expect(store.getState().pendingMagic).toBeNull();
  });
});
