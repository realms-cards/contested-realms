import { afterEach, beforeEach, expect, it, vi } from "vitest";
import cards from "@/lib/game/cpu/cards.json";
import { CPU_TRIGGERS_IN_ORDER } from "@/lib/game/cpu/spellTypes";
import { getSpellChoices } from "@/lib/game/cpu/spells";
import { rangedAttack, stationaryAttack } from "@/lib/game/cpu/stationaryAttack";
import { tileLabel } from "@/lib/game/cpu/tileLabels";
import { createGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
function setup() {
  const store = createGameStore();
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,
    matchId:"goldfish-regressions",transport:new LocalTransport(),
    board:{size:{w:5,h:4},sites:{"2,3":{owner:2,card:card("Humble Village")},"2,2":{owner:1,card:card("Humble Village","north")}}},permanents:{},
    avatars:{p1:{card:card("Flamecaller"),pos:[2,3],tapped:false},p2:{card:card("Geomancer"),pos:[2,0],tapped:false}}});
  return store;
}
const settle = async () => { for (let i=0;i<10;i++) await Promise.resolve(); };
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());

it("uses playmat tile numbers at all four corners", () => {
  expect(tileLabel("0,0 / 4,0 / 0,3 / 4,3",{w:5,h:4})).toBe("Tile #1 / Tile #5 / Tile #16 / Tile #20");
});

it("Desert labels point at the same numbered tile as its damage targets", async () => {
  const store = setup();
  store.setState({permanents:{"2,2":[{owner:2,card:card("Raal Dromedary"),instanceId:"victim"}]}});
  store.setState({board:{...store.getState().board,sites:{...store.getState().board.sites,"1,3":{owner:1,card:card("Red Desert")}}}});
  await settle();
  const choices = getSpellChoices(store.getState(),"p1","Red Desert");
  const choice = choices.find(choice => choice.label.includes("Tile #13"));
  expect(choice).toBeDefined();
  expect(choice?.picks).toEqual(["2,2"]);
  expect(choice?.operations).toContainEqual(expect.objectContaining({kind:"damageEvent",hits:[expect.objectContaining({target:expect.objectContaining({at:"2,2"}),amount:1})]}));
  expect(choices.every(choice => !/\b\d+,\d+\b/.test(choice.label))).toBe(true);
});

it("offers an attack on the current enemy site for a ready avatar or minion", () => {
  const store = setup();
  store.setState({selectedAvatar:"p1"});
  expect(stationaryAttack(store.getState())?.candidates).toContainEqual(expect.objectContaining({kind:"site",at:"2,3",label:"Humble Village — Tile #18"}));
  store.setState({selectedAvatar:null,selectedPermanent:{at:"2,3",index:0},permanents:{"2,3":[{owner:1,card:card("Raal Dromedary"),instanceId:"attacker",tapped:false}]}});
  expect(stationaryAttack(store.getState())?.attacker).toMatchObject({at:"2,3",index:0,instanceId:"attacker"});
  store.setState({permanents:{"2,3":[{...store.getState().permanents["2,3"][0],tapped:true}]}});
  expect(stationaryAttack(store.getState())).toBeNull();
  store.setState({permanents:{"2,3":[{...store.getState().permanents["2,3"][0],tapped:false,summonedThisTurn:true}]}});
  expect(stationaryAttack(store.getState())).toBeNull();
  store.setState({permanents:{"2,3":[{...store.getState().permanents["2,3"][0],summonedThisTurn:false}]}});
  store.setState({currentPlayer:2});
  expect(stationaryAttack(store.getState())).toBeNull();
});

it("shoots the first unit in line with Ranged and resolves without defenders or a strike back", () => {
  const store = setup();
  const board = store.getState().board;
  store.setState({selectedPermanent:{at:"2,3",index:0},board:{...board,sites:{...board.sites,"2,1":{owner:2,card:card("Vantage Hills","far")}}},permanents:{
    "2,3":[{owner:1,card:card("Belmotte Longbowmen"),instanceId:"archer",tapped:false}],
    "2,2":[{owner:2,card:card("Raal Dromedary"),instanceId:"near"}],
    "2,1":[{owner:2,card:card("Raal Dromedary","far-unit"),instanceId:"far"}]}});
  // Melee stays on the archer's own tile (the enemy site there).
  expect(stationaryAttack(store.getState())?.candidates.every(candidate => candidate.at === "2,3")).toBe(true);
  const choice = rangedAttack(store.getState());
  expect(choice).toMatchObject({ranged:true,attacker:{at:"2,3",index:0,instanceId:"archer"}});
  // Ranged 1 stops at the first unit; the enemy two steps away is out of reach.
  expect(choice?.candidates).toEqual([expect.objectContaining({kind:"permanent",at:"2,2",index:0,label:"Raal Dromedary — Tile #13"})]);
  if (!choice) throw new Error("expected a ranged choice");
  store.getState().rangedStrike(choice.attacker,{kind:"permanent",at:"2,2",index:0});
  const state = store.getState();
  expect(state.pendingCombat).toBeNull();
  expect(state.permanents["2,3"][0]).toMatchObject({tapped:true});
  expect(state.permanents["2,3"][0].damage ?? 0).toBe(0);
  expect(state.permanents["2,2"] ?? []).toHaveLength(0);
  expect(state.zones.p2.graveyard.map(dead => dead.name)).toContain("Raal Dromedary");
  expect(state.permanents["2,1"]).toHaveLength(1);
  expect(state.lastCombatSummary?.text).toContain("shoots");
  expect(rangedAttack(state)).toBeNull();
});

it("resolves a dismissed trigger list in the listed order without asking again", async () => {
  const store = setup();
  const board = store.getState().board;
  store.setState({board:{...board,sites:{...board.sites,"1,3":{owner:1,card:card("Arid Desert")},"3,3":{owner:1,card:card("Red Desert")}}}});
  await settle();
  const options = store.getState().cpuTriggerOptions || [];
  expect(options).toHaveLength(2);
  store.getState().chooseCpuTrigger(CPU_TRIGGERS_IN_ORDER);
  await settle();
  expect(`${store.getState().pendingMagic?.spell.card.name} — Genesis`).toBe(options[0].label);
  expect(store.getState().cpuTriggerOptions || []).toHaveLength(0);
  expect(store.getState().cpuChosenTrigger).toBe(CPU_TRIGGERS_IN_ORDER);
});

it("lets allies block Ranged strikes, Stealth units pass, and Vantage Hills extend the reach", () => {
  const store = setup();
  const board = store.getState().board;
  const sites = {...board.sites,"2,1":{owner:2 as const,card:card("Vantage Hills","far")}};
  const archer = {owner:1 as const,card:card("Belmotte Longbowmen"),instanceId:"archer",tapped:false};
  const enemy = {owner:2 as const,card:card("Raal Dromedary","enemy"),instanceId:"enemy"};
  store.setState({selectedPermanent:{at:"2,3",index:0},board:{...board,sites},permanents:{
    "2,3":[archer],"2,2":[{owner:1,card:card("Raal Dromedary","ally"),instanceId:"ally"}],"2,1":[enemy]}});
  expect(rangedAttack(store.getState())).toBeNull();
  store.setState({board:{...board,sites:{...sites,"2,3":{owner:1,card:card("Vantage Hills")}}},permanents:{
    "2,3":[archer],"2,2":[{owner:2,card:card("Midnight Rogue"),instanceId:"rogue"}],"2,1":[enemy]}});
  expect(rangedAttack(store.getState())?.candidates).toEqual([expect.objectContaining({kind:"permanent",at:"2,1",index:0})]);
});

it("restores a board without replaying Genesis, but still detects subsequent plays", async () => {
  const store = setup();
  const board = {...store.getState().board,sites:{...store.getState().board.sites,"1,3":{owner:1 as const,card:card("Red Desert")}}};
  store.getState().applyServerPatch({board,permanents:{"2,3":[{owner:1,card:card("Apprentice Wizard"),instanceId:"restored"}]},__replaceKeys:["board","permanents"]});
  await settle();
  expect(store.getState().pendingMagic).toBeNull();
  expect(store.getState().cpuPendingTriggerCount).toBe(0);
  store.setState({board:{...board,sites:{...board.sites,"3,3":{owner:1,card:card("Red Desert","new-desert")}}}});
  await settle();
  expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("genesis");
});

it("prompts Dragonettes at end of its controller's turn and stamps the resolved effect", async () => {
  const store = setup();
  const dragon = {...card("Raal Dromedary"),name:"Colicky Dragonettes",attack:3,defence:3,instanceId:"dragon",text:"At the end of your turn, Colicky Dragonettes shoot a projectile. It deals 1 damage."};
  store.setState({permanents:{"2,3":[{owner:1,card:dragon,instanceId:"dragon",tapped:true}],"2,2":[{owner:2,card:card("Raal Dromedary"),instanceId:"victim"}]}});
  store.setState({phase:"End",currentPlayer:2});
  await settle();
  expect(store.getState().pendingMagic).toBeNull();
  store.setState({phase:"Main",currentPlayer:1});
  store.setState({phase:"End"});
  await settle();
  expect(store.getState().pendingMagic?.cpuEvent?.kind).toBe("unitEnd");
  expect(getSpellChoices(store.getState(),"p1",dragon.name)).toHaveLength(4);
  store.getState().setCpuMagicChoice("unit-end/N");
  store.getState().resolveMagic();
  await settle();
  expect(store.getState().permanents["2,2"][0].damage).toBe(1);
  expect(store.getState().permanents["2,3"][0].cpuAuraLastEnd?.effect).toBe("3:1");
  store.setState({phase:"Main"});
  store.setState({phase:"End"});
  await settle();
  expect(store.getState().pendingMagic).toBeNull();
});
