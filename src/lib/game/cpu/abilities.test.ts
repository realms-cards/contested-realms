import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import { applySpellChoice } from "@/lib/game/cpu/applySpellChoice";
import { recordAirCast } from "@/lib/game/cpu/castHistory";
import cards from "@/lib/game/cpu/cards.json";
import { getSpellChoices, isWater } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, owner: 1 | 2 = 1): PermanentItem => ({owner,card:card(name),instanceId:name,tapped:false});
function setup() {
  const store = createGameStore();
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,
    board:{size:{w:5,h:4},sites:{"2,3":{owner:1,card:card("Autumn River")},"2,2":{owner:2,card:card("Spring River")}}},permanents:{},
    avatars:{p1:{card:card("Flamecaller"),pos:[0,3],tapped:false},p2:{card:card("Geomancer"),pos:[4,0],tapped:false}},
  } as Partial<GameState>);
  return store;
}
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());

describe("CPU activated abilities", () => {
  it("lets the CPU choose its better Lucky Charm outcome without a human prompt", async () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Mountain Giant"),{...unit("Lucky Charm",2),attachedTo:{at:"2,3",index:2},isCarried:true},unit("Diluvian Kraken",2)]},matchId:"cpu-lucky",transport:new LocalTransport()});
    const rng = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.9);
    applySpellChoice(store.setState,store.getState,{key:"random-cpu",label:"Random damage",caster:{kind:"avatar",seat:"p2"},target:null,score:0,operations:[{kind:"damage",targets:[{kind:"permanent",at:"2,3",index:0,instanceId:"Mountain Giant"},{kind:"permanent",at:"2,3",index:2,instanceId:"Diluvian Kraken"}],amount:3,random:true}]},rng);
    for (let i=0;i<5;i++) await Promise.resolve();
    expect(store.getState().permanents["2,3"][0].damage).toBe(3);
    expect(store.getState().permanents["2,3"][2].damage || 0).toBe(0);
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("does not grant Lucky Charm's replacement while the artifact is uncarried", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Mountain Giant"),unit("Lucky Charm")]}});
    const rng = vi.fn().mockReturnValue(0);
    expect(applySpellChoice(store.setState,store.getState,{key:"uncontrolled-charm",label:"Random damage",caster:{kind:"avatar",seat:"p1"},target:null,score:0,operations:[{kind:"damage",targets:[{kind:"permanent",at:"2,3",index:0,instanceId:"Mountain Giant"}],amount:3,random:true}]},rng)).toBe(true);
    expect(rng).toHaveBeenCalledTimes(1);
    expect(store.getState().permanents["2,3"][0].damage).toBe(3);
  });
  it("records a committed human spell cast once, not realm updates or site cards", () => {
    const store = setup(), spell = card("Apprentice Wizard");
    store.setState({avatars:{...store.getState().avatars,p1:{card:card("Sparkmage"),pos:[2,3],tapped:false}},
      board:{...store.getState().board,sites:{"2,3":{owner:1,card:card("Lone Tower")}}},
      players:{...store.getState().players,p1:{...store.getState().players.p1,mana:10}},
      zones:{...store.getState().zones,p1:{...store.getState().zones.p1,hand:[spell]}},selectedCard:{who:"p1",index:0,card:spell}});
    store.getState().playSelectedTo(2,3);
    expect(store.getState().avatars.p1.cpuAirCast).toEqual({turn:"3:1",air:1});
    store.setState({permanents:{...store.getState().permanents}});
    expect(store.getState().avatars.p1.cpuAirCast?.air).toBe(1);
    expect(recordAirCast(store.getState(),"p1",card("Lone Tower"))).toBeNull();
    expect(recordAirCast(store.getState(),"p1",card("Nimbus Jinn"))?.air).toBe(1+cards["Nimbus Jinn"].thresholds.air);
    store.setState({turn:4});
    expect(recordAirCast(store.getState(),"p1",spell)).toEqual({turn:"4:1",air:1});
  });
  it("uses Sparkmage's current-turn air total and excludes itself and other regions", () => {
    const store = setup();
    store.setState({avatars:{...store.getState().avatars,p1:{card:card("Sparkmage"),pos:[2,3],tapped:false,cpuAirCast:{turn:"3:1",air:3}}},
      permanents:{"2,3":[unit("Mountain Giant",2)],"2,2":[unit("Diluvian Kraken",2)]}});
    store.getState().setPermanentPosition("Diluvian Kraken",{permanentId:"Diluvian Kraken",state:"submerged",position:{x:2,y:-0.15,z:2}});
    const choices = abilityChoices(store.getState(),"p1").filter(choice => choice.key.startsWith("sparkmage/"));
    expect(choices).toHaveLength(1);
    store.getState().activateCpuAbility(choices[0].key);
    expect(store.getState().permanents["2,3"][0].damage).toBe(3);
    expect(store.getState().permanents["2,2"][0].damage || 0).toBe(0);
    store.setState({turn:4,avatars:{...store.getState().avatars,p1:{...store.getState().avatars.p1,tapped:false}}});
    expect(abilityChoices(store.getState(),"p1")).toHaveLength(0);
  });
  it("samples Lucky Charm outcomes once, lets the human choose, then resumes the effect", async () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Mountain Giant"),{...unit("Lucky Charm"),attachedTo:{at:"2,3",index:0},isCarried:true}],"2,2":[unit("Diluvian Kraken",2)]},matchId:"lucky",transport:new LocalTransport()});
    const rng = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0.9);
    const choice = {key:"random-test",label:"Random damage",caster:{kind:"avatar" as const,seat:"p1" as const},target:null,score:0,operations:[{kind:"damage" as const,targets:[{kind:"permanent" as const,at:"2,3",index:0,instanceId:"Mountain Giant"},{kind:"permanent" as const,at:"2,2",index:0,instanceId:"Diluvian Kraken"}],amount:3,random:true}]};
    expect(applySpellChoice(store.setState,store.getState,choice,rng)).toBe(false);
    await Promise.resolve();
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("randomChoice");
    expect(getSpellChoices(store.getState(),"p1","Lucky Charm")).toHaveLength(2);
    expect(getSpellChoices(store.getState(),"p1","Lucky Charm")[1].label).toContain("Diluvian Kraken");
    expect(rng).toHaveBeenCalledTimes(2);
    store.getState().setCpuMagicChoice("random/1");
    store.getState().resolveMagic();
    for (let i=0;i<4;i++) await Promise.resolve();
    expect(store.getState().permanents["2,3"][0].damage || 0).toBe(0);
    expect(store.getState().permanents["2,2"][0].damage).toBe(3);
    expect(store.getState().cpuEffectContinuations).toHaveLength(0);
  });
  it("drags Pudge's victim one location at a time, then offers an optional simultaneous fight", async () => {
    const store = setup();
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"2,1":{owner:2,card:card("Red Desert")}}},
      permanents:{"2,3":[unit("Pudge Butcher")],"2,1":[unit("Ogre Goons",2)]},matchId:"pudge",transport:new LocalTransport()});
    const visited: string[] = [];
    const unsubscribe = store.subscribe(state => {
      const at = Object.entries(state.permanents).find(([,items]) => items.some(item => item.card.name === "Ogre Goons"))?.[0];
      if (at && visited[visited.length-1] !== at) visited.push(at);
    });
    const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.startsWith("pudge/"));
    if (!choice) throw new Error("Missing Pudge shot");
    store.getState().activateCpuAbility(choice.key);
    await Promise.resolve();
    expect(visited).toEqual(["2,1","2,2","2,3"]);
    expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("fightChoice");
    expect(store.getState().permanents["2,3"][1].damage || 0).toBe(0);
    store.getState().setCpuMagicChoice("fight/accept");
    store.getState().resolveMagic();
    for (let i=0;i<4;i++) await Promise.resolve();
    expect(store.getState().zones.p2.graveyard.map(card => card.name)).toContain("Ogre Goons");
    expect(store.getState().permanents["2,3"][0].damage).toBe(cards["Ogre Goons"].attack);
    expect(store.getState().cpuEffectContinuations).toHaveLength(0);
    unsubscribe();
  });
  it("allows declining Pudge's fight without damaging either unit", async () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Pudge Butcher")],"2,2":[unit("Mountain Giant",2)]},matchId:"pudge-decline",transport:new LocalTransport()});
    const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.startsWith("pudge/"));
    if (!choice) throw new Error("Missing Pudge shot");
    store.getState().activateCpuAbility(choice.key);
    await Promise.resolve();
    store.getState().setCpuMagicChoice("fight/decline");
    store.getState().resolveMagic();
    for (let i=0;i<4;i++) await Promise.resolve();
    expect(store.getState().permanents["2,3"].every(item => !item.damage)).toBe(true);
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("does not fight a Pudge victim that disappears during its drag", async () => {
    const store = setup();
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"2,1":{owner:2,card:card("Red Desert")}}},
      permanents:{"2,3":[unit("Pudge Butcher")],"2,1":[unit("Ogre Goons",2)]},matchId:"pudge-lost",transport:new LocalTransport()});
    let removed = false;
    const unsubscribe = store.subscribe(state => {
      const index = state.permanents["2,2"]?.findIndex(item => item.card.name === "Ogre Goons") ?? -1;
      if (!removed && index>=0) { removed=true; state.movePermanentToZone("2,2",index,"graveyard"); }
    });
    const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.startsWith("pudge/"));
    if (!choice) throw new Error("Missing Pudge shot");
    store.getState().activateCpuAbility(choice.key);
    await Promise.resolve();
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().permanents["2,3"]).toHaveLength(1);
    expect(store.getState().cpuEffectContinuations || []).toHaveLength(0);
    unsubscribe();
  });
  it("floods diagonal sites near Waveshaper's occupied body and freezes only minions lacking Submerge", () => {
    const store = setup();
    store.setState({avatars:{...store.getState().avatars,p1:{card:card("Waveshaper"),pos:[2,3],tapped:false}},
      board:{...store.getState().board,sites:{"2,3":{owner:1,card:card("Autumn River")},"1,2":{owner:2,card:card("Red Desert")},"4,0":{owner:1,card:card("Spring River")},"4,1":{owner:2,card:card("Red Desert","remote")}}},
      permanents:{"1,2":[unit("Ogre Goons",2),unit("Diluvian Kraken",2)]}});
    const choices = abilityChoices(store.getState(),"p1");
    expect(choices.some(choice => choice.key.endsWith("/4,1"))).toBe(false);
    const choice = choices.find(choice => choice.key.endsWith("/1,2"));
    if (!choice) throw new Error("Missing diagonal flood");
    store.getState().activateCpuAbility(choice.key);
    expect(isWater(store.getState(),"1,2")).toBe(true);
    expect(store.getState().permanents["1,2"][0]).toMatchObject({tapped:true,skipNextUntap:true});
    expect(store.getState().permanents["1,2"][1].tapped).toBe(false);
  });
  it("moves only Waveshaper's own prior flood and still freezes minions on Bedrock", () => {
    const store = setup();
    store.setState({avatars:{...store.getState().avatars,p1:{card:card("Waveshaper"),pos:[2,3],tapped:false}},
      board:{...store.getState().board,sites:{"2,3":{owner:1,card:card("Autumn River")},"1,2":{owner:2,card:card("Red Desert")},"3,2":{owner:2,card:card("Red Desert","second")},"2,2":{owner:2,card:card("Bedrock")}}},
      permanents:{"2,2":[unit("Ogre Goons",2)]}});
    const activate = (at: string) => {
      store.setState({avatars:{...store.getState().avatars,p1:{...store.getState().avatars.p1,tapped:false}}});
      const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.endsWith(`/${at}`));
      if (!choice) throw new Error("Missing flood target");
      store.getState().activateCpuAbility(choice.key);
    };
    activate("1,2");
    activate("3,2");
    expect(isWater(store.getState(),"1,2")).toBe(false);
    expect(isWater(store.getState(),"3,2")).toBe(true);
    activate("2,2");
    expect(isWater(store.getState(),"2,2")).toBe(false);
    expect(isWater(store.getState(),"3,2")).toBe(true);
    expect(store.getState().permanents["2,2"][0].skipNextUntap).toBe(true);
  });
  it("interrupts a Boulder roll before impact and rechecks the remaining path after the trigger", async () => {
    const store = setup();
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"2,2":{owner:1,card:card("Red Desert")},"2,1":{owner:2,card:card("Autumn River","next")}}},
      permanents:{"2,3":[unit("Mountain Giant"),unit("Rolling Boulder")],"2,2":[unit("Diluvian Kraken",2)]},
      matchId:"boulder-interrupt",transport:new LocalTransport()});
    let interrupted = false;
    const unsubscribe = store.subscribe(state => {
      if (interrupted || !state.permanents["2,2"]?.some(item => item.card.name === "Rolling Boulder")) return;
      interrupted = true;
      store.setState({cpuGenesisRequests:[{at:"2,2",id:"test-enter-location"}]});
    });
    const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.endsWith("/Rolling Boulder/N"));
    if (!choice) throw new Error("Missing Boulder push");
    store.getState().activateCpuAbility(choice.key);
    await Promise.resolve();
    expect(store.getState().pendingMagic?.spell.card.name).toBe("Red Desert");
    expect(store.getState().permanents["2,2"][0].damage || 0).toBe(0);
    expect(store.getState().cpuEffectContinuations).toHaveLength(1);
    const sites = {...store.getState().board.sites};
    delete sites["2,1"];
    store.setState({board:{...store.getState().board,sites}});
    const trigger = getSpellChoices(store.getState(),"p1","Red Desert")[0];
    store.getState().setCpuMagicChoice(trigger.key);
    store.getState().resolveMagic();
    for (let i=0;i<4;i++) await Promise.resolve();
    expect(store.getState().permanents["2,2"][0].damage).toBe(4);
    expect(store.getState().permanents["2,2"].some(item => item.card.name === "Rolling Boulder")).toBe(true);
    expect(store.getState().cpuEffectContinuations).toHaveLength(0);
    unsubscribe();
  });
  it("banishes only dead fire minions and lets Flamecaller choose among the first projectile impacts", () => {
    const store = setup();
    store.setState({avatars:{...store.getState().avatars,p1:{...store.getState().avatars.p1,pos:[2,3]}},
      permanents:{"2,3":[{...unit("Mountain Giant"),instanceId:"friendly-giant"}],"2,2":[unit("Ogre Goons",2),unit("Mountain Giant",2)]},
      zones:{...store.getState().zones,p1:{...store.getState().zones.p1,graveyard:[card("Askelon Phoenix"),card("Ogre Goons"),card("Drown"),card("Mountain Giant")]}}});
    const choices = abilityChoices(store.getState(),"p1").filter(choice => choice.key.startsWith("flamecaller/"));
    expect(choices).toHaveLength(2);
    const choice = choices.find(choice => choice.key.endsWith("Mountain Giant"));
    if (!choice) throw new Error("Missing Flamecaller impact choice");
    store.getState().activateCpuAbility(choice.key);
    const amount = cards["Askelon Phoenix"].thresholds.fire+cards["Ogre Goons"].thresholds.fire;
    expect(store.getState().permanents["2,2"][1].damage).toBe(amount);
    expect(store.getState().permanents["2,3"][0].damage || 0).toBe(0);
    expect(store.getState().zones.p1.banished.map(card => card.name)).toEqual(["Askelon Phoenix","Ogre Goons"]);
    expect(store.getState().zones.p1.graveyard.map(card => card.name)).toEqual(["Drown","Mountain Giant"]);
    expect(store.getState().avatars.p1.tapped).toBe(true);
  });
  it("does not shoot Flamecaller's projectile across a void gap", () => {
    const store = setup();
    store.setState({avatars:{...store.getState().avatars,p1:{...store.getState().avatars.p1,pos:[2,3]}},
      board:{...store.getState().board,sites:{"2,3":{owner:1,card:card("Red Desert")},"2,1":{owner:2,card:card("Red Desert","far")}}},
      permanents:{"2,1":[unit("Mountain Giant",2)]},zones:{...store.getState().zones,p1:{...store.getState().zones.p1,graveyard:[card("Askelon Phoenix")]}}});
    expect(abilityChoices(store.getState(),"p1")).toHaveLength(0);
  });
  it("replaces only adjacent Rubble with Geomancer's top atlas site", () => {
    const store = setup();
    store.setState({avatars:{...store.getState().avatars,p1:{card:card("Geomancer"),pos:[2,3],tapped:false}},
      board:{...store.getState().board,sites:{"2,2":{owner:2,cpuNeutral:true,card:{cardId:2,name:"Rubble",type:"Token"}},"1,2":{owner:2,cpuNeutral:true,card:{cardId:2,name:"Rubble",type:"Token"}}}},
      zones:{...store.getState().zones,p1:{...store.getState().zones.p1,atlas:[card("Red Desert"),card("Autumn River")]}}});
    const choices = abilityChoices(store.getState(),"p1");
    expect(choices).toHaveLength(1);
    store.getState().activateCpuAbility(choices[0].key);
    expect(store.getState().board.sites["2,2"]).toEqual({owner:1,card:card("Red Desert")});
    expect(store.getState().zones.p1.atlas.map(card => card.name)).toEqual(["Autumn River"]);
    expect(store.getState().avatars.p1.tapped).toBe(true);
  });
  it("rolls Boulder through each location, damages allies too, and stops before void", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Mountain Giant"),{...unit("Rolling Boulder"),attachedTo:{at:"2,3",index:0},isCarried:true}],"2,2":[unit("Diluvian Kraken",2)]}});
    const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.endsWith("/Rolling Boulder/N"));
    if (!choice) throw new Error("Missing Boulder push");
    store.getState().activateCpuAbility(choice.key);
    expect(store.getState().permanents["2,3"][0].damage).toBe(4);
    expect(store.getState().permanents["2,3"][0].tapped).toBe(true);
    expect(store.getState().permanents["2,2"][0].damage).toBe(4);
    expect(store.getState().permanents["2,2"][1].card.name).toBe("Rolling Boulder");
    expect(store.getState().permanents["2,2"][1].attachedTo).toBeUndefined();
    expect(store.getState().permanents["2,2"][1].isCarried).toBe(false);
  });
  it("uses the current board and current power for a deferred Kraken strike", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Diluvian Kraken")],"2,2":[unit("Mountain Giant",2)]}});
    store.getState().setPermanentPosition("Diluvian Kraken",{permanentId:"Diluvian Kraken",state:"submerged",position:{x:2,y:-0.15,z:3}});
    const choice = abilityChoices(store.getState(),"p1")[0];
    applySpellChoice(store.setState,store.getState,{...choice,operations:choice.operations.slice(0,2)});
    store.setState({permanents:{...store.getState().permanents,"2,2":[unit("Askelon Phoenix",2)]}});
    applySpellChoice(store.setState,store.getState,{...choice,operations:choice.operations.slice(2)});
    expect(store.getState().zones.p2.graveyard.map(card => card.name)).toContain("Askelon Phoenix");
    expect(store.getState().permanents["2,2"]).toHaveLength(0);
  });
  it("sacrifices Sinkhole after destroying its target and never reuses neutral Rubble", () => {
    const store = setup();
    store.setState({board:{...store.getState().board,sites:{"2,3":{owner:1,card:card("Sinkhole")},"2,2":{owner:2,card:card("Red Desert")}}}});
    const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.endsWith("/2,2"));
    if (!choice) throw new Error("Missing Sinkhole target");
    store.getState().activateCpuAbility(choice.key);
    expect(store.getState().board.sites["2,2"].cpuNeutral).toBe(true);
    expect(store.getState().board.sites["2,3"].cpuNeutral).toBe(true);
    expect(store.getState().zones.p1.graveyard.map(card => card.name)).toContain("Sinkhole");
    expect(abilityChoices(store.getState(),"p1")).toHaveLength(0);
  });
  it("requires three fire affinity for Vesuvius without spending it", () => {
    const store = setup();
    store.setState({board:{...store.getState().board,sites:{"2,3":{owner:1,card:card("Vesuvius")}}},permanents:{"2,3":[unit("Mountain Giant",2)]}});
    expect(abilityChoices(store.getState(),"p1")).toHaveLength(0);
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"1,3":{owner:1,card:card("Red Desert","fire1")},"3,3":{owner:1,card:card("Red Desert","fire2")}}}});
    const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.startsWith("vesuvius/"));
    if (!choice) throw new Error("Missing Vesuvius ability");
    store.getState().activateCpuAbility(choice.key);
    expect(store.getState().permanents["2,3"][0].damage).toBe(3);
    expect(store.getState().players.p1.mana).toBe(0);
    expect(store.getState().board.sites["2,3"].cpuNeutral).toBe(true);
  });
  it("uses Trebuchet's discarded cost and three-step area, including friendly units", () => {
    const store = setup();
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"2,0":{owner:2,card:card("Autumn River")}}},
      permanents:{"2,3":[unit("Ogre Goons"),unit("Raal Dromedary"),{...unit("Payload Trebuchet"),attachedTo:{at:"2,3",index:0},isCarried:true}],"2,0":[unit("Mountain Giant",2),unit("Diluvian Kraken")]},
      zones:{...store.getState().zones,p1:{...store.getState().zones.p1,hand:[card("Blaze"),card("Autumn River")]}}});
    const choices = abilityChoices(store.getState(),"p1");
    const choice = choices.find(choice => choice.key.endsWith("/Blaze/2,0"));
    if (!choice) throw new Error("Missing three-step Trebuchet choice");
    expect(choices.some(choice => choice.key.endsWith("/Autumn River/2,0"))).toBe(true);
    store.getState().activateCpuAbility(choice.key);
    expect(store.getState().zones.p1.hand.map(card => card.name)).toEqual(["Autumn River"]);
    expect(store.getState().permanents["2,0"].map(unit => unit.damage)).toEqual([cards.Blaze.cost,cards.Blaze.cost]);
    expect(store.getState().permanents["2,3"].slice(0,2).every(unit => unit.tapped)).toBe(true);
  });
  it("lets a summoning-sick Jinn discard a spell, not a site, and ignores duplicate requests", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[{...unit("Nimbus Jinn"),summonedThisTurn:true},unit("Mountain Giant",2)]},
      zones:{...store.getState().zones,p1:{...store.getState().zones.p1,hand:[card("Blaze"),card("Drown"),card("Autumn River")]}}});
    const choices = abilityChoices(store.getState(),"p1");
    expect(choices).toHaveLength(2);
    store.getState().activateCpuAbility(choices[0].key,"p1","request-1");
    expect(store.getState().zones.p1.hand).toHaveLength(2);
    expect(store.getState().permanents["2,3"][1].damage).toBe(3);
    expect(store.getState().permanents["2,3"][0].tapped).toBe(false);
    store.getState().activateCpuAbility(abilityChoices(store.getState(),"p1")[0].key,"p1","request-1");
    expect(store.getState().zones.p1.hand).toHaveLength(2);
  });
  it("requires Kraken to be submerged and ready, then surfaces and strikes nearby surface units", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Diluvian Kraken")],"2,2":[unit("Mountain Giant",2)]}});
    expect(abilityChoices(store.getState(),"p1")).toHaveLength(0);
    store.getState().setPermanentPosition("Diluvian Kraken",{permanentId:"Diluvian Kraken",state:"submerged",position:{x:2,y:-0.15,z:3}});
    const choices = abilityChoices(store.getState(),"p1");
    expect(choices).toHaveLength(1);
    store.getState().activateCpuAbility(choices[0].key);
    expect(store.getState().permanentPositions["Diluvian Kraken"].state).toBe("surface");
    expect(store.getState().permanents["2,3"][0].tapped).toBe(true);
    expect(store.getState().permanents["2,2"]).toHaveLength(0);
    expect(store.getState().zones.p2.graveyard.map(card => card.name)).toContain("Mountain Giant");
  });
  it("requires two ready allied units for a carried Ballista and pays both tap costs", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Ogre Goons"),unit("Raal Dromedary"),{...unit("Siege Ballista"),attachedTo:{at:"2,3",index:0},isCarried:true}],"2,2":[unit("Mountain Giant",2)]}});
    const choice = abilityChoices(store.getState(),"p1").find(choice => choice.key.endsWith("Mountain Giant"));
    if (!choice) throw new Error("Missing Ballista target");
    store.getState().activateCpuAbility(choice.key);
    expect(store.getState().permanents["2,3"].slice(0,2).every(unit => unit.tapped)).toBe(true);
    expect(store.getState().permanents["2,2"][0].damage).toBe(3);
    expect(abilityChoices(store.getState(),"p1")).toHaveLength(0);
  });
  it("rejects out-of-turn and summoning-sick tap costs", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[{...unit("Ogre Goons"),summonedThisTurn:true},unit("Raal Dromedary"),{...unit("Siege Ballista"),attachedTo:{at:"2,3",index:0},isCarried:true}],"2,2":[unit("Mountain Giant",2)]}});
    expect(abilityChoices(store.getState(),"p1")).toHaveLength(0);
    expect(abilityChoices(store.getState(),"p2")).toHaveLength(0);
  });
  it("blocks a new activation while a triggered effect is queued", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Nimbus Jinn"),unit("Mountain Giant",2)]},
      zones:{...store.getState().zones,p1:{...store.getState().zones.p1,hand:[card("Blaze")]}}});
    const key = abilityChoices(store.getState(),"p1")[0].key;
    store.setState({matchId:"queued-trigger",transport:new LocalTransport()});
    store.setState({permanents:{...store.getState().permanents,"2,2":[unit("Apprentice Wizard")]}});
    expect(store.getState().cpuPendingTriggerCount).toBe(1);
    store.getState().activateCpuAbility(key);
    expect(store.getState().zones.p1.hand).toHaveLength(1);
    expect(store.getState().permanents["2,3"][1].damage || 0).toBe(0);
  });
});
