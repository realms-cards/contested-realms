import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySpellChoice } from "@/lib/game/cpu/applySpellChoice";
import cards from "@/lib/game/cpu/cards.json";
import { applyDamageEvent } from "@/lib/game/cpu/damage";
import { hasCpuGenesis } from "@/lib/game/cpu/genesis";
import type { SpellChoice } from "@/lib/game/cpu/spellTypes";
import { getSpellChoices, isDisabled, unitsInRealm } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, owner: 1 | 2 = 1): PermanentItem => ({owner,card:card(name),instanceId:name,tapped:false});
function setup() {
  const store = createGameStore();
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,
    board:{size:{w:5,h:4},sites:{"2,3":{owner:1,card:card("Humble Village")}}},permanents:{},
    avatars:{p1:{card:card("Flamecaller"),pos:[2,3],tapped:false},p2:{card:card("Geomancer"),pos:[2,0],tapped:false}},
  } as Partial<GameState>);
  return store;
}
type TestStore = ReturnType<typeof setup>;
function begin(store: TestStore, name: keyof typeof cards, owner: 1 | 2 = 1) {
  store.setState({pendingMagic:{id:"genesis-test",tile:{x:2,y:3},spell:{at:"2,3",index:-1,owner,instanceId:"event",card:card(name)},
    cpuEvent:{kind:"genesis",region:"surface",source:{kind:"permanent",at:"2,3",index:0,instanceId:name}},status:"choosingTarget",createdAt:0}});
  return getSpellChoices(store.getState(),owner === 1 ? "p1" : "p2",name);
}
const settle = async () => { for (let i=0;i<6;i++) await Promise.resolve(); };
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());

describe("precon Genesis", () => {
  it("skips a site's queued Genesis after that site is destroyed", async () => {
    const store = setup();
    store.setState({matchId:"destroyed-site-genesis",transport:new LocalTransport()});
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"2,2":{owner:1,card:card("Red Desert")}}}});
    await Promise.resolve();
    expect(store.getState().pendingMagic?.spell.card.name).toBe("Red Desert");
    applySpellChoice(store.setState,store.getState,{key:"destroy",label:"Destroy site",caster:{kind:"avatar",seat:"p1"},target:null,score:0,operations:[{kind:"destroySite",at:"2,2"}]});
    expect(getSpellChoices(store.getState(),"p1","Red Desert").map(choice => choice.key)).toEqual(["genesis/gone"]);
    store.getState().setCpuMagicChoice("genesis/gone");
    store.getState().resolveMagic();
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("uses a site's current location when its queued Genesis resolves after movement", async () => {
    const store = setup(), site = card("Holy Ground","moving-ground");
    store.setState({matchId:"moved-site-genesis",transport:new LocalTransport(),players:{...store.getState().players,p1:{...store.getState().players.p1,life:10}}});
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"0,0":{owner:1,card:site}}}});
    // The site moves while its Genesis is still queued: 0,0 is not near the avatar at 2,3, but 3,3 is.
    const sites = {...store.getState().board.sites};
    delete sites["0,0"];
    sites["3,3"] = {owner:1,card:site};
    store.setState({board:{...store.getState().board,sites}});
    expect(store.getState().cpuPendingTriggerCount).toBe(1);
    await settle();
    expect(store.getState().players.p1.life).toBe(13);
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().cpuPendingTriggerCount).toBe(0);
  });
  it("offers Harpies' optional strike after teleport, using current power and no retaliation", async () => {
    const store = setup();
    store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"2,2":{owner:2,card:card("Red Desert")}}},
      permanents:{"2,2":[unit("Raal Dromedary",2)],"2,3":[unit("Clamor of Harpies")]},matchId:"harpies-strike",transport:new LocalTransport()});
    const choices = begin(store,"Clamor of Harpies");
    const choice = choices.find(choice => choice.key.endsWith("Raal Dromedary/move"));
    if (!choice) throw new Error("Missing Harpies teleport");
    store.getState().setCpuMagicChoice(choice.key);
    store.getState().resolveMagic();
    await Promise.resolve();
    expect(store.getState().pendingMagic?.cpuEvent).toMatchObject({kind:"fightChoice",strikeOnly:true});
    expect(store.getState().permanents["2,3"][1].damage || 0).toBe(0);
    const items = [...store.getState().permanents["2,3"]];
    items[0] = {...items[0],cpuTurnEffect:{turn:"3:1",power:-2,movement:0}};
    store.setState({permanents:{...store.getState().permanents,"2,3":items}});
    store.getState().setCpuMagicChoice("fight/accept");
    store.getState().resolveMagic();
    for (let i=0;i<4;i++) await Promise.resolve();
    expect(store.getState().permanents["2,3"][1].damage).toBe(cards["Clamor of Harpies"].attack-2);
    expect(store.getState().permanents["2,3"][0].damage || 0).toBe(0);
    expect(store.getState().cpuEffectContinuations).toHaveLength(0);
  });
  it("skips a queued draw Genesis when its minion leaves before resolution", async () => {
    const store = setup();
    store.setState({matchId:"departed-genesis",transport:new LocalTransport(),zones:{...store.getState().zones,p1:{...store.getState().zones.p1,spellbook:[card("Blaze")]}}});
    store.setState({permanents:{"2,3":[unit("Apprentice Wizard")]}});
    // The Genesis is queued; the Wizard leaves before it resolves, so its lone choice is to skip.
    store.getState().movePermanentToZone("2,3",0,"graveyard");
    expect(store.getState().cpuPendingTriggerCount).toBe(1);
    await settle();
    expect(store.getState().zones.p1.hand).toHaveLength(0);
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().cpuPendingTriggerCount).toBe(0);
  });
  it("lets the human order simultaneous Genesis triggers, after the non-active CPU's triggers", async () => {
    const store = setup();
    const transport = Object.assign(new LocalTransport(),{sendMessage:vi.fn(),sendAction:vi.fn()});
    store.setState({matchId:"genesis-order",transport,zones:{...store.getState().zones,
      p1:{...store.getState().zones.p1,spellbook:[card("Blaze"),card("Drown")]},
      p2:{...store.getState().zones.p2,spellbook:[card("Bury")]}}});
    store.setState({permanents:{"2,3":[unit("Apprentice Wizard"),{...unit("Apprentice Wizard"),instanceId:"second-wizard"},{...unit("Apprentice Wizard",2),instanceId:"cpu-wizard"}]}});
    for (let i=0;i<4;i++) await Promise.resolve();
    expect(store.getState().zones.p2.hand.map(card => card.name)).toEqual(["Bury"]);
    expect(store.getState().zones.p1.hand).toHaveLength(0);
    expect(store.getState().cpuTriggerOptions).toHaveLength(2);
    const [other,selected] = store.getState().cpuTriggerOptions || [];
    if (!selected) throw new Error("Missing simultaneous trigger choice");
    store.getState().chooseCpuTrigger(selected.id);
    await settle();
    // Each draw has a single choice and resolves unprompted, in the chosen order.
    const begun = transport.sendMessage.mock.calls.map(([message]) => message).filter(message => message.type === "magicBegin").map(message => message.id);
    expect(begun.slice(-2)).toEqual([selected.id,other.id]);
    expect(store.getState().zones.p1.hand.map(card => card.name)).toEqual(["Blaze","Drown"]);
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("interrupts a multi-step effect for Genesis before drawing and completing the original spell", async () => {
    const store = setup();
    const transport = Object.assign(new LocalTransport(),{sendMessage:vi.fn(),sendAction:vi.fn()});
    store.setState({matchId:"interrupt",transport,board:{...store.getState().board,sites:{"2,3":{owner:1,card:card("Red Desert")}}},
      permanents:{"2,3":[unit("Blink")]},zones:{...store.getState().zones,p1:{...store.getState().zones.p1,spellbook:[card("Drown")]}}});
    const choice: SpellChoice = {key:"test",label:"Reactivate, then draw",caster:{kind:"avatar",seat:"p1"},target:null,score:0,
      operations:[{kind:"retriggerGenesis",ats:["2,3"]},{kind:"draw",seat:"p1",count:1}]};
    const pending = {id:"outer-spell",tile:{x:2,y:3},spell:{at:"2,3",index:0,owner:1 as const,instanceId:"Blink",card:card("Blink")},status:"confirm" as const,createdAt:0};
    expect(applySpellChoice(store.setState,store.getState,choice,Math.random,{pending,label:choice.label})).toBe(false);
    // Red Desert's Genesis is queued ahead of the draw; nothing is drawn or discarded yet.
    expect(store.getState().cpuPendingTriggerCount).toBe(1);
    expect(store.getState().zones.p1.hand).toHaveLength(0);
    expect(store.getState().zones.p1.graveyard).toHaveLength(0);
    await settle();
    // The single-site Genesis resolves unprompted, then the spell completes.
    const messages = transport.sendMessage.mock.calls.map(([message]) => message);
    const genesis = messages.findIndex(message => message.type === "magicBegin" && message.spell?.card?.name === "Red Desert");
    const completed = messages.findIndex(message => message.type === "magicResolve" && message.id === "outer-spell");
    expect(genesis).toBeGreaterThanOrEqual(0);
    expect(completed).toBeGreaterThan(genesis);
    expect(store.getState().zones.p1.hand.map(card => card.name)).toEqual(["Drown"]);
    expect(store.getState().zones.p1.graveyard.map(card => card.name)).toContain("Blink");
    expect(store.getState().cpuEffectContinuations).toHaveLength(0);
  });
  it("covers every precon card with printed Genesis", () => {
    const genesis = Object.values(cards).filter(card => /Genesis\s*→/.test(card.rulesText));
    expect(genesis).toHaveLength(25);
    expect(genesis.filter(card => !hasCpuGenesis(card.name))).toEqual([]);
  });
  it("queues entry once, resolves the lone human choice unprompted, and ignores a state echo", async () => {
    const store = setup();
    store.setState({matchId:"genesis-match",transport:new LocalTransport(),zones:{...store.getState().zones,p1:{...store.getState().zones.p1,spellbook:[card("Blaze")]}}});
    store.setState({permanents:{"2,3":[unit("Apprentice Wizard")]}});
    expect(store.getState().cpuPendingTriggerCount).toBe(1);
    await Promise.resolve();
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().zones.p1.hand.map(card => card.name)).toEqual(["Blaze"]);
    expect(store.getState().permanents["2,3"][0].card.name).toBe("Apprentice Wizard");
    store.setState({permanents:{...store.getState().permanents}});
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().zones.p1.hand).toHaveLength(1);
  });
  it("resolves CPU entry without asking the human to choose", async () => {
    const store = setup();
    store.setState({matchId:"cpu-genesis",transport:new LocalTransport(),zones:{...store.getState().zones,p2:{...store.getState().zones.p2,spellbook:[card("Blaze")]}}});
    store.setState({permanents:{"2,3":[unit("Apprentice Wizard",2)]}});
    await Promise.resolve();
    expect(store.getState().zones.p2.hand.map(card => card.name)).toEqual(["Blaze"]);
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("leaves human versus human games untouched", async () => {
    const store = setup();
    store.setState({opponentPlayerId:"human",matchId:"tabletop",transport:new LocalTransport()});
    store.setState({permanents:{"2,3":[unit("Apprentice Wizard")]}});
    await Promise.resolve();
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("charges Village mana and creates a unit that dies when submerged", () => {
    const store = setup();
    const choices = begin(store,"Humble Village");
    const choice = choices.find(choice => choice.key === "genesis/soldier");
    if (!choice) throw new Error("Missing Village choice");
    applySpellChoice(store.setState,store.getState,choice);
    expect(store.getState().players.p1.mana).toBe(-1);
    const soldier = unitsInRealm(store.getState()).find(unit => unit.card.name === "Foot Soldier");
    if (!soldier) throw new Error("Missing Foot Soldier");
    applySpellChoice(store.setState,store.getState,{...choices[0],operations:[{kind:"subsurface",targets:[soldier.target],state:"submerged"}]});
    expect(unitsInRealm(store.getState()).some(unit => unit.card.name === "Foot Soldier")).toBe(false);
    expect(store.getState().zones.p1.graveyard.some(card => card.name === "Foot Soldier")).toBe(false);
  });
  it("puts the Giantess to sleep and wakes her only after damage", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Slumbering Giantess")]}});
    applySpellChoice(store.setState,store.getState,begin(store,"Slumbering Giantess")[0]);
    const giantess = unitsInRealm(store.getState())[0];
    expect(isDisabled(store.getState(),giantess)).toBe(true);
    applyDamageEvent(store.setState,store.getState,[{target:giantess.target,amount:1}]);
    expect(isDisabled(store.getState(),unitsInRealm(store.getState())[0])).toBe(false);
  });
  it("reorders only the top three spells and draws Mermaids from the bottom", () => {
    const store = setup();
    store.setState({zones:{...store.getState().zones,p1:{...store.getState().zones.p1,spellbook:[card("Blaze"),card("Drown"),card("Bury"),card("Teleport")]}}});
    const choices = begin(store,"Observatory");
    expect(choices).toHaveLength(6);
    const choice = choices.find(choice => choice.key === "genesis/2-1-0");
    if (!choice) throw new Error("Missing Observatory permutation");
    applySpellChoice(store.setState,store.getState,choice);
    expect(store.getState().zones.p1.spellbook.map(card => card.name)).toEqual(["Bury","Drown","Blaze","Teleport"]);
    store.setState({permanents:{"2,3":[unit("Deep-Sea Mermaids")]}});
    applySpellChoice(store.setState,store.getState,begin(store,"Deep-Sea Mermaids")[0]);
    expect(store.getState().zones.p1.hand.map(card => card.name)).toEqual(["Teleport"]);
    expect(store.getState().zones.p1.spellbook.map(card => card.name)).toEqual(["Bury","Drown","Blaze"]);
  });
});
