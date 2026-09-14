import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cards from "@/lib/game/cpu/cards.json";
import { getSpellChoices } from "@/lib/game/cpu/spells";
import { treasures } from "@/lib/game/cpu/treasure";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, owner: 1 | 2 = 1): PermanentItem => ({card:card(name),instanceId:name,owner,tapped:false});
function setup() {
  const store = createGameStore();
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,
    board:{size:{w:5,h:4},sites:{"2,3":{owner:1,card:card("Autumn River")},"2,2":{owner:2,card:card("Spring River")},"3,2":{owner:2,card:card("Autumn River","other")}}},
    permanents:{},avatars:{p1:{card:card("Waveshaper"),pos:[2,3],tapped:false},p2:{card:card("Flamecaller"),pos:[2,2],tapped:false}},
  } as Partial<GameState>);
  return store;
}
const settle = async () => { for (let i=0;i<6;i++) await Promise.resolve(); };
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());

describe("CPU Sunken Treasure", () => {
  it("does not award draws if Treasure leaves before its recovery event resolves", async () => {
    const store = setup();
    store.setState({matchId:"lost-treasure",transport:new LocalTransport(),permanents:{"2,3":[unit("Diluvian Kraken"),{...unit("Sunken Treasure"),attachedTo:{at:"2,3",index:0},isCarried:true}]},
      permanentPositions:{"Diluvian Kraken":{permanentId:"Diluvian Kraken",state:"submerged",position:{x:2,y:-0.15,z:3}}}});
    store.getState().setPermanentPosition("Diluvian Kraken",{permanentId:"Diluvian Kraken",state:"surface",position:{x:2,y:0,z:3}});
    // The recovery is queued; the Treasure leaves before it resolves.
    store.getState().movePermanentToZone("2,3",1,"banished");
    await settle();
    expect(store.getState().zones.p1.hand).toHaveLength(0);
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().cpuPendingTriggerCount).toBe(0);
  });
  it("leaves human-versus-human artifact handling unchanged", async () => {
    const store = setup(), treasure = card("Sunken Treasure");
    store.setState({opponentPlayerId:"human",matchId:"tabletop-treasure",transport:new LocalTransport(),zones:{...store.getState().zones,p2:{...store.getState().zones.p2,hand:[treasure]}}});
    store.setState({permanents:{"2,2":[unit("Sunken Treasure",2)]}});
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
    expect(treasures(store.getState())[0].region).toBe("surface");
  });
  it("asks the human opponent where the CPU's cast Treasure is conjured", async () => {
    const store = setup(), treasure = card("Sunken Treasure");
    store.setState({matchId:"treasure-place",transport:new LocalTransport(),zones:{...store.getState().zones,p2:{...store.getState().zones.p2,hand:[treasure]}}});
    store.setState({zones:{...store.getState().zones,p2:{...store.getState().zones.p2,hand:[]}},permanents:{"2,2":[unit("Sunken Treasure",2)]}});
    await settle();
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("treasurePlace");
    expect(store.getState().pendingMagic?.spell.owner).toBe(1);
    expect(getSpellChoices(store.getState(),"p1","Sunken Treasure").map(choice => choice.key)).toEqual(["treasure/place/2,2","treasure/place/3,2"]);
    store.getState().setCpuMagicChoice("treasure/place/3,2");
    store.getState().resolveMagic();
    await settle();
    expect(treasures(store.getState())[0]).toMatchObject({at:"3,2",region:"underwater",carried:false});
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("handles a real human cast, allowing the CPU to choose placement on the same tile", async () => {
    const store = setup(), treasure = card("Sunken Treasure");
    store.setState({matchId:"human-treasure",transport:new LocalTransport(),players:{...store.getState().players,p1:{...store.getState().players.p1,mana:10}},
      zones:{...store.getState().zones,p1:{...store.getState().zones.p1,hand:[treasure]}},selectedCard:{who:"p1",index:0,card:treasure}});
    store.getState().playSelectedTo(2,3);
    await settle();
    expect(treasures(store.getState())[0]).toMatchObject({at:"2,3",region:"underwater",carried:false});
    expect(store.getState().zones.p1.hand).toHaveLength(0);
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("awards a stolen Treasure's recovery to its carrier and draws both chosen cards simultaneously", async () => {
    const store = setup();
    store.setState({matchId:"recover-treasure",transport:new LocalTransport(),
      permanents:{"2,3":[unit("Diluvian Kraken"),{...unit("Sunken Treasure",2),card:{...card("Sunken Treasure"),owner:"p2",originalOwnerSeat:"p2"},attachedTo:{at:"2,3",index:0},isCarried:true}]},
      permanentPositions:{"Diluvian Kraken":{permanentId:"Diluvian Kraken",state:"submerged",position:{x:2,y:-0.15,z:3}}},
      zones:{...store.getState().zones,p1:{...store.getState().zones.p1,spellbook:[card("Drown")],atlas:[card("Red Desert")]}}});
    const sizes: number[] = [];
    const unsubscribe = store.subscribe(state => { if (sizes[sizes.length-1] !== state.zones.p1.hand.length) sizes.push(state.zones.p1.hand.length); });
    store.getState().setPermanentPosition("Diluvian Kraken",{permanentId:"Diluvian Kraken",state:"surface",position:{x:2,y:0,z:3}});
    await settle();
    // The recovery itself has a single choice and resolves unprompted for its carrier's owner.
    expect(treasures(store.getState())).toHaveLength(0);
    expect(store.getState().pendingMagic?.spell.owner).toBe(1);
    expect(store.getState().zones.p2.graveyard.map(card => card.name)).toContain("Sunken Treasure");
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("drawChoice");
    store.getState().setCpuMagicChoice("draw/1");
    store.getState().resolveMagic();
    await settle();
    expect(store.getState().zones.p1.hand.map(card => card.name)).toEqual(["Drown","Red Desert"]);
    expect(sizes).toEqual([0,2]);
    expect(store.getState().cpuEffectContinuations).toHaveLength(0);
    store.setState({permanents:{...store.getState().permanents}});
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
    unsubscribe();
  });
  it("does not trigger for an uncarried Treasure moved to the surface", async () => {
    const store = setup();
    store.setState({matchId:"uncarried-treasure",transport:new LocalTransport(),permanents:{"2,3":[unit("Sunken Treasure")]},permanentPositions:{"Sunken Treasure":{permanentId:"Sunken Treasure",state:"submerged",position:{x:2,y:-0.15,z:3}}}});
    store.getState().setPermanentPosition("Sunken Treasure",{permanentId:"Sunken Treasure",state:"surface",position:{x:2,y:0,z:3}});
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
    expect(treasures(store.getState())).toHaveLength(1);
  });
});
