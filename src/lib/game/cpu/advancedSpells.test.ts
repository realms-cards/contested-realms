import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cpuTurnCleanup } from "../../../../server/modules/cpu-turn-cleanup";
import { applySpellChoice } from "@/lib/game/cpu/applySpellChoice";
import cards from "@/lib/game/cpu/cards.json";
import { getSpellChoices, getSpellChoice, isWater, projectileKey, supportsSpell, unitsInRealm } from "@/lib/game/cpu/spells";
import { reachableCells } from "@/lib/game/cpu/movement";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, id: string, owner: 1 | 2 = 2): PermanentItem => ({owner,card:card(name,id),instanceId:id,tapped:false});
function setup() {
  const store = createGameStore();
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,
    board:{size:{w:5,h:4},sites:Object.fromEntries(Array.from({length:20},(_,i) => [`${i%5},${Math.floor(i/5)}`,{owner:Math.floor(i/5) === 3 ? 1 : 2,card:card("Lone Tower",`site${i}`)}]))},
    avatars:{p1:{card:card("Flamecaller"),pos:[2,3],tapped:false},p2:{card:card("Geomancer"),pos:[4,0],tapped:false}},permanents:{},
  } as Partial<GameState>);
  return store;
}
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); vi.spyOn(console,"log").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("precon damage grids", () => {
  it("has an explicit shared resolver for every precon Magic", () => {
    const magic = Object.values(cards).filter(card => card.type === "Magic");
    expect(magic).toHaveLength(26);
    expect(magic.filter(card => !supportsSpell(card.name))).toEqual([]);
  });
  it("uses Cone of Flame's 5 / 3 / 1 wedge and can rotate it", () => {
    const store = setup();
    store.setState({permanents:{"2,2":[unit("Ogre Goons","near")],"1,1":[unit("Ogre Goons","middle")],"0,0":[unit("Ogre Goons","far")],"3,3":[unit("Ogre Goons","east")]}});
    const choices = getSpellChoices(store.getState(),"p1","Cone of Flame");
    const north = choices.find(c => c.key === "p1/N")!.operations[0];
    expect(north).toMatchObject({kind:"damageEvent",hits:expect.arrayContaining([
      {target:expect.objectContaining({instanceId:"near"}),amount:5,element:"fire"},
      {target:expect.objectContaining({instanceId:"middle"}),amount:3,element:"fire"},
      {target:expect.objectContaining({instanceId:"far"}),amount:1,element:"fire"},
    ])});
    expect(choices.find(c => c.key === "p1/E")!.operations[0]).toMatchObject({hits:expect.arrayContaining([{target:expect.objectContaining({instanceId:"east"}),amount:5,element:"fire"}])});
  });
  it("uses Major Explosion's center, edges and corners without targeting beyond two steps", () => {
    const store = setup();
    store.setState({permanents:{"2,2":[unit("Mountain Giant","center")],"1,2":[unit("Mountain Giant","edge")],"1,1":[unit("Mountain Giant","corner")]}});
    const choices = getSpellChoices(store.getState(),"p1","Major Explosion");
    expect(choices.some(c => c.target?.kind === "location" && c.target.at === "2,0")).toBe(false);
    const op = choices.find(c => c.key === "p1/2,2")!.operations[0];
    if (op.kind !== "damageEvent") throw new Error("Expected damage grid");
    expect(op.hits.filter(h => h.target.kind === "permanent").map(h => h.amount)).toEqual([7,5,3]);
  });
  it("requires Craterize's site discard and leaves neutral Rubble", () => {
    const store = setup();
    expect(getSpellChoices(store.getState(),"p1","Craterize")).toHaveLength(0);
    store.setState({zones:{...store.getState().zones,p1:{...store.getState().zones.p1,hand:[card("Bedrock","cost")]}}});
    const choice = getSpellChoices(store.getState(),"p1","Craterize").find(c => c.target?.kind === "location" && c.target.at === "0,0")!;
    applySpellChoice(store.setState,store.getState,choice);
    expect(store.getState().zones.p1.hand).toHaveLength(0);
    expect(store.getState().zones.p1.graveyard[0].instanceId).toBe("cost");
    expect(store.getState().board.sites["0,0"]).toMatchObject({cpuNeutral:true,card:{name:"Rubble"}});
    expect(store.getState().zones.p2.graveyard[0].name).toBe("Lone Tower");
  });
});

describe("paid chains and movement", () => {
  it("bounds Chain Lightning by available mana, never repeats targets, and allows stopping", () => {
    const store = setup();
    store.setState({players:{...store.getState().players,p1:{...store.getState().players.p1,mana:-1}},
      permanents:{"2,2":[unit("Ogre Goons","first")],"2,1":[unit("Ogre Goons","second")],"2,0":[unit("Ogre Goons","third")]}});
    const choice = getSpellChoice(store.getState(),"p1","Chain Lightning",projectileKey("p1/chain:first",["second","third"]))!;
    expect(choice.operations[0]).toMatchObject({kind:"spend",amount:4});
    const hits = choice.operations[1];
    if (hits.kind !== "damageEvent") throw new Error("Expected chain damage");
    expect(hits.hits).toHaveLength(3);
    const stopped = getSpellChoice(store.getState(),"p1","Chain Lightning",projectileKey("p1/chain:first",["stop"]))!;
    expect(stopped.operations[0]).toMatchObject({amount:0});
    applySpellChoice(store.setState,store.getState,choice);
    expect(store.getState().players.p1.mana).toBe(-5);
    expect(store.getState().permanents["2,0"][0].damage).toBe(2);
  });
  it("applies Blaze along the chosen route, not just the destination, without replaying echoes", async () => {
    const store = setup();
    const transport = Object.assign(new LocalTransport(),{sendMessage:vi.fn(),sendAction:vi.fn()});
    store.setState({matchId:"blaze-test",transport,permanents:{"2,3":[unit("Raal Dromedary","runner",1)],"2,2":[unit("Ogre Goons","victim")]}});
    const blaze = getSpellChoices(store.getState(),"p1","Blaze").find(c => c.target?.kind === "permanent")!;
    applySpellChoice(store.setState,store.getState,blaze);
    const runner = store.getState().permanents["2,3"][0];
    expect(reachableCells(store.getState(),"2,3",runner)).toContain("2,0");
    store.setState({permanents:{...store.getState().permanents,"2,3":[],"2,1":[runner]}});
    await Promise.resolve();
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("blazeTrail");
    store.getState().setCpuMagicChoice("blaze-trail");
    store.getState().resolveMagic();
    expect(store.getState().permanents["2,2"][0].damage).toBe(2);
    expect(store.getState().players.p1.life).toBe(18);
    expect(store.getState().permanents["2,1"][0].damage || 0).toBe(0);
    store.setState({permanents:{...store.getState().permanents}});
    await Promise.resolve();
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("enforces forward/sideways movement and Polar Bears' edge connection", () => {
    const store = setup();
    expect(reachableCells(store.getState(),"2,2",unit("Dalcean Phalanx","forward",1)).sort()).toEqual(["2,1","2,2"]);
    expect(reachableCells(store.getState(),"2,2",unit("Sedge Crabs","sideways",1)).sort()).toEqual(["1,2","2,2","3,2"]);
    expect(reachableCells(store.getState(),"2,3",unit("Polar Bears","wrap",1))).toContain("2,0");
  });
  it("blocks ground entry to an occupied Mountain Pass but allows Airborne entry", () => {
    const store = setup();
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"2,2":{owner:2,card:card("Mountain Pass")}}},permanents:{"2,2":[unit("Ogre Goons","guard")]}});
    expect(reachableCells(store.getState(),"2,3",unit("Raal Dromedary","ground",1))).not.toContain("2,2");
    expect(reachableCells(store.getState(),"2,3",unit("Cloud Spirit","flyer",1))).toContain("2,2");
  });
});

describe("precon summoning and flooding", () => {
  it("summons one usable Foot Soldier on each bordering allied site", () => {
    const store = setup();
    const choice = getSpellChoices(store.getState(),"p1","Border Militia")[0];
    applySpellChoice(store.setState,store.getState,choice);
    const soldiers = unitsInRealm(store.getState()).filter(u => u.card.name === "Foot Soldier");
    expect(soldiers).toHaveLength(5);
    expect(new Set(soldiers.map(u => u.target.kind === "permanent" ? u.target.instanceId : null)).size).toBe(5);
    expect(store.getState().permanents["0,3"][0].summonedThisTurn).toBe(true);
  });
  it("expands water once, respects Bedrock, drowns vulnerable minions, and expires flooding", () => {
    const store = setup();
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"2,2":{owner:2,card:card("Spring River")},"2,1":{owner:2,card:card("Bedrock")}}},
      permanents:{"1,2":[unit("Ogre Goons","drowned")],"3,2":[unit("Swan Maidens","survivor")]}});
    applySpellChoice(store.setState,store.getState,getSpellChoices(store.getState(),"p1","Wrath of the Sea")[0]);
    expect(isWater(store.getState(),"1,2")).toBe(true);
    expect(isWater(store.getState(),"0,2")).toBe(false);
    expect(isWater(store.getState(),"2,1")).toBe(false);
    expect(store.getState().permanents["1,2"]).toHaveLength(0);
    expect(store.getState().permanentPositions.survivor.state).toBe("submerged");
    const cleanup = cpuTurnCleanup(store.getState());
    expect(cleanup.board?.sites["1,2"]).toMatchObject({cpuFloodedUntil:null,card:{thresholds:{water:0}}});
  });
  it("reveals Raise Dead's random result once, then lets the human choose an enemy site", () => {
    const store = setup();
    store.setState({zones:{...store.getState().zones,p2:{...store.getState().zones.p2,graveyard:[card("Ogre Goons","dead")]}}});
    store.getState().beginMagicCast({tile:{x:2,y:3},spell:{at:"2,3",index:-1,owner:1,card:card("Raise Dead"),instanceId:"spell"}});
    store.getState().setCpuMagicChoice(getSpellChoices(store.getState(),"p1","Raise Dead")[0].key);
    store.getState().resolveMagic();
    expect(store.getState().pendingMagic?.cpuRandomMinion?.card.name).toBe("Ogre Goons");
    store.getState().cancelMagic();
    expect(store.getState().pendingMagic).not.toBeNull();
    const choice = getSpellChoices(store.getState(),"p1","Raise Dead").find(c => c.key === "p1/1,0/surface")!;
    store.getState().setCpuMagicChoice(choice.key);
    store.getState().resolveMagic();
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().permanents["1,0"][0]).toMatchObject({owner:1,summonedThisTurn:true,card:{name:"Ogre Goons"}});
    expect(store.getState().zones.p2.graveyard).toHaveLength(0);
  });
  it("lets Lucky Charm choose between sampled Raise Dead results without rerolling previews", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Mountain Giant","bearer",1),{...unit("Lucky Charm","charm",1),attachedTo:{at:"2,3",index:0},isCarried:true}]},
      zones:{...store.getState().zones,p2:{...store.getState().zones.p2,graveyard:[card("Ogre Goons","dead-ogre"),card("Diluvian Kraken","dead-kraken")]}}});
    store.getState().beginMagicCast({tile:{x:2,y:3},spell:{at:"2,3",index:-1,owner:1,card:card("Raise Dead"),instanceId:"spell"}});
    store.getState().setCpuMagicChoice(getSpellChoices(store.getState(),"p1","Raise Dead")[0].key);
    const random = vi.spyOn(Math,"random").mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValue(0.5);
    store.getState().resolveMagic();
    expect(store.getState().pendingMagic?.cpuRandomMinionOptions?.map(option => option.card.name)).toEqual(["Ogre Goons","Diluvian Kraken"]);
    const samples = random.mock.calls.length;
    getSpellChoices(store.getState(),"p1","Raise Dead");
    const choice = getSpellChoices(store.getState(),"p1","Raise Dead").find(choice => choice.key === "p1/outcome-1/1,0/surface");
    expect(random).toHaveBeenCalledTimes(samples);
    if (!choice) throw new Error("Missing second sampled result");
    store.getState().setCpuMagicChoice(choice.key);
    store.getState().resolveMagic();
    expect(store.getState().permanents["1,0"][0].card.name).toBe("Diluvian Kraken");
    expect(store.getState().zones.p2.graveyard.map(card => card.name)).toEqual(["Ogre Goons"]);
  });
});
