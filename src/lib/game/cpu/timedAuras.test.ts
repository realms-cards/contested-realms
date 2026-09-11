import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cpuEndPhasePatch } from "../../../../server/modules/cpu-end-phase";
import cards from "@/lib/game/cpu/cards.json";
import { reachableCells } from "@/lib/game/cpu/movement";
import { getSpellChoices, hasAirborne, unitsInRealm } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";

const card = (name: keyof typeof cards): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:name});
const item = (name: keyof typeof cards, owner: 1 | 2 = 1): PermanentItem => ({owner,card:card(name),instanceId:name,tapped:false});
function setup(permanents: GameState["permanents"]) {
  const store = createGameStore();
  const transport = Object.assign(new LocalTransport(),{sendAction:vi.fn(),sendMessage:vi.fn()});
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,matchId:"timed",transport,
    board:{size:{w:5,h:4},sites:{"1,1":{owner:1,card:card("Humble Village")},"2,1":{owner:2,card:card("Red Desert")}}},permanents,
    avatars:{p1:{card:card("Flamecaller"),pos:[0,3],tapped:false},p2:{card:card("Geomancer"),pos:[4,0],tapped:false}},
  } as Partial<GameState>);
  return {store,transport};
}
async function resolveFirst(store: ReturnType<typeof setup>["store"]) {
  const pending = store.getState().pendingMagic;
  if (!pending) throw new Error("No pending trigger");
  const choice = getSpellChoices(store.getState(),pending.spell.owner === 1 ? "p1" : "p2",pending.spell.card.name)[0];
  if (!choice) throw new Error("No legal effect");
  store.getState().setCpuMagicChoice(choice.key);
  store.getState().resolveMagic();
  await Promise.resolve();
}
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());

describe("CPU End phase", () => {
  it("does not replay an Aura effect already recorded in an End-phase snapshot", async () => {
    const {store,transport} = setup({"1,1":[{...item("Thunderstorm"),cpuAuraTicks:1,cpuAuraLastEnd:{effect:"3:1",counter:"3:1"}},item("Mountain Giant",2)]});
    store.setState({phase:"End"});
    await Promise.resolve();
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().cpuTriggerOptions || []).toHaveLength(0);
    expect(store.getState().permanents["1,1"][0].cpuAuraTicks).toBe(1);
    expect(store.getState().permanents["1,1"][1].damage || 0).toBe(0);
    expect(transport.sendAction).toHaveBeenLastCalledWith({currentPlayer:2,phase:"Start",cpuEndResolved:"3:1"});
  });
  it("resolves non-active CPU triggers before offering the human's triggers", async () => {
    const {store} = setup({"1,1":[item("Thunderstorm"),item("Wildfire",2)]});
    store.setState({phase:"End"});
    await Promise.resolve();
    await Promise.resolve();
    const wildfire = Object.values(store.getState().permanents).flat().find(item => item.card.name === "Wildfire");
    expect(wildfire?.cpuAuraVisited).toHaveLength(2);
    expect(store.getState().cpuTriggerOptions).toHaveLength(2);
    expect(store.getState().cpuTriggerOptions?.every(option => option.label.startsWith("Thunderstorm"))).toBe(true);
  });
  it("does not increment a silenced duration counter", async () => {
    const {store} = setup({"1,1":[{...item("Entangle Terrain"),cpuAuraTicks:2},{owner:1,card:{cardId:2,name:"Silenced",type:"Token"},attachedTo:{at:"1,1",index:0}}]});
    store.setState({phase:"End"});
    await Promise.resolve();
    await resolveFirst(store);
    expect(store.getState().permanents["1,1"][0].cpuAuraTicks).toBe(2);
  });
  it("interposes End before a bot pass and rejects retries until human resolution", () => {
    const game = {turn:3,currentPlayer:2,phase:"Main",permanents:{"1,1":[item("Wildfire")]}};
    const patch = cpuEndPhasePatch(game,{currentPlayer:1,phase:"Start"},false);
    expect(patch).toEqual({phase:"End",cpuEndPending:true});
    const pending = {...game,...patch};
    expect(cpuEndPhasePatch(pending,{currentPlayer:1,phase:"Start"},false)).toEqual({});
    expect(cpuEndPhasePatch(pending,{currentPlayer:1,phase:"Start",cpuEndResolved:"2:2"},true)).toEqual({});
    expect(cpuEndPhasePatch(pending,{currentPlayer:1,phase:"Start",cpuEndResolved:"3:2"},true)).toMatchObject({currentPlayer:1,cpuEndPending:false});
  });
  it("applies Wildfire damage before cleanup and keeps its visited trail", async () => {
    const {store,transport} = setup({"1,1":[item("Wildfire"),{...item("Mountain Giant",2),damage:5}]});
    store.getState().endTurn();
    expect(store.getState().permanents["1,1"][1].damage).toBe(5);
    expect(transport.sendAction).toHaveBeenCalledWith({currentPlayer:2,phase:"Start"});
    store.setState({phase:"End"});
    await Promise.resolve();
    await resolveFirst(store);
    expect(store.getState().zones.p2.graveyard.map(card => card.name)).toContain("Mountain Giant");
    const wildfire = Object.values(store.getState().permanents).flat().find(item => item.card.name === "Wildfire");
    expect(wildfire?.cpuAuraVisited).toContain("1,1");
    expect(transport.sendAction).toHaveBeenLastCalledWith({currentPlayer:2,phase:"Start",cpuEndResolved:"3:1"});
  });
  it("lets the owner order Thunderstorm's third counter before its damage trigger", async () => {
    const {store} = setup({"1,1":[{...item("Thunderstorm"),cpuAuraTicks:2},item("Mountain Giant",2)]});
    store.setState({phase:"End"});
    await Promise.resolve();
    expect(store.getState().cpuTriggerOptions).toHaveLength(2);
    const counter = store.getState().cpuTriggerOptions?.find(option => option.id.endsWith("_counter"));
    if (!counter) throw new Error("Missing counter choice");
    store.getState().chooseCpuTrigger(counter.id);
    await Promise.resolve();
    await resolveFirst(store);
    await resolveFirst(store); // Source is gone, so the remaining effect fizzles.
    expect(store.getState().zones.p1.graveyard.map(card => card.name)).toContain("Thunderstorm");
    expect(store.getState().permanents["1,1"][0].damage || 0).toBe(0);
  });
  it("counts Entangle only on its owner's end phases and restores movement on expiry", async () => {
    const {store} = setup({"1,1":[item("Entangle Terrain"),item("Nimbus Jinn")]});
    const jinn = () => unitsInRealm(store.getState()).find(unit => unit.card.name === "Nimbus Jinn");
    expect(reachableCells(store.getState(),"1,1",store.getState().permanents["1,1"][1])).toEqual(["1,1"]);
    const located = jinn();
    if (!located) throw new Error("Missing Jinn");
    expect(hasAirborne(store.getState(),located)).toBe(false);
    for (let turn=3;turn<=7;turn++) {
      store.setState({phase:"Main",turn,currentPlayer:turn%2 === 1 ? 1 : 2});
      store.setState({phase:"End"});
      await Promise.resolve();
      if (turn%2 === 1) await resolveFirst(store);
      else expect(store.getState().pendingMagic).toBeNull();
    }
    expect(store.getState().zones.p1.graveyard.map(card => card.name)).toContain("Entangle Terrain");
    const freed = jinn();
    if (!freed) throw new Error("Missing Jinn");
    expect(hasAirborne(store.getState(),freed)).toBe(true);
  });
});
