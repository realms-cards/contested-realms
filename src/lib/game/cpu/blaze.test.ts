import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applySpellChoice } from "@/lib/game/cpu/applySpellChoice";
import cards from "@/lib/game/cpu/cards.json";
import { getSpellChoices, projectileKey, scoreOperations } from "@/lib/game/cpu/spells";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem, ServerPatchT } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";
import { __testZoneHelpers } from "../../../../server/modules/match-leader";
import { validateAction } from "../../../../server/modules/rules-validation";

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, id: string, owner: 1 | 2 = 2): PermanentItem => ({owner,card:card(name,id),instanceId:id,tapped:false});
function setup(permanents: GameState["permanents"]) {
  const store = createGameStore();
  const transport = Object.assign(new LocalTransport(),{sendMessage:vi.fn(),sendAction:vi.fn()});
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,matchId:"blaze",transport,
    board:{size:{w:5,h:4},sites:Object.fromEntries(Array.from({length:20},(_,i) => [`${i%5},${Math.floor(i/5)}`,{owner:Math.floor(i/5) === 3 ? 1 : 2,card:card("Lone Tower",`site${i}`)}]))},
    avatars:{p1:{card:card("Flamecaller"),pos:[4,3],tapped:false},p2:{card:card("Geomancer"),pos:[4,0],tapped:false}},permanents,
  } as Partial<GameState>);
  // Blaze the runner: a 1-movement minion now has three steps this turn.
  const blaze = getSpellChoices(store.getState(),"p1","Blaze").find(c => c.target?.kind === "permanent")!;
  applySpellChoice(store.setState,store.getState,blaze);
  return {store,transport};
}
type Store = ReturnType<typeof setup>["store"];
const settle = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
const runner = (store: Store) => Object.values(store.getState().permanents).flat().find(item => item.instanceId === "runner")!;
const damageAt = (store: Store, at: string) => (store.getState().permanents[at] || []).filter(item => item.instanceId !== "runner").map(item => item.damage || 0);
/** Simulates a board drag: the human's units are neither tapped nor range-checked in CPU matches. */
async function drag(store: Store, from: string, to: string) {
  const permanents = store.getState().permanents, mover = runner(store);
  store.setState({permanents:{...permanents,[from]:permanents[from].filter(item => item !== mover),[to]:[...(permanents[to] || []),mover]}});
  await settle();
}
const lastEvent = (store: Store) => store.getState().events[store.getState().events.length-1]?.text;
const logged = (store: Store, text: string) => store.getState().events.some(event => event.text.includes(text));
const trails = (transport: ReturnType<typeof setup>["transport"]) => transport.sendMessage.mock.calls.filter(([message]) => message.type === "magicBegin" && String(message.id).startsWith("cpu_trail_")).length;
const withoutSite = (store: Store, at: string) => store.setState({board:{...store.getState().board,sites:Object.fromEntries(Object.entries(store.getState().board.sites).filter(([cell]) => cell !== at))}});
beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); vi.spyOn(console,"log").mockImplementation(() => {}); });
afterEach(() => vi.restoreAllMocks());

describe("Blaze trail budget", () => {
  it("fires one unprompted trail per single-step drag until the turn's steps are spent", async () => {
    const {store} = setup({"2,3":[unit("Raal Dromedary","runner",1),unit("Ogre Goons","home")],"2,2":[unit("Ogre Goons","middle")],"2,1":[unit("Ogre Goons","top")]});
    expect(runner(store).cpuTurnEffect).toMatchObject({blaze:true,movement:2});
    await drag(store,"2,3","2,2");
    expect(store.getState().pendingMagic).toBeNull();
    expect(damageAt(store,"2,3")).toEqual([2]);
    expect(runner(store).cpuTurnEffect?.steps).toBe(1);
    await drag(store,"2,2","2,1");
    expect(damageAt(store,"2,2")).toEqual([2]);
    expect(runner(store).cpuTurnEffect?.steps).toBe(2);
    await drag(store,"2,1","2,0");
    expect(damageAt(store,"2,1")).toEqual([2]);
    expect(runner(store).cpuTurnEffect?.steps).toBe(3);
    const events = store.getState().events.length;
    await drag(store,"2,0","1,0");
    expect(store.getState().pendingMagic).toBeNull();
    expect(runner(store).cpuTurnEffect?.steps).toBe(3);
    expect(store.getState().events).toHaveLength(events+1);
    expect(lastEvent(store)).toBe("Blaze: Raal Dromedary has no movement left this turn; no fire trail");
    // Each departed tile burned exactly once.
    expect([damageAt(store,"2,3"),damageAt(store,"2,2"),damageAt(store,"2,1")]).toEqual([[2],[2],[2]]);
    expect(store.getState().players.p1.life).toBe(20);
  });
  it("spends every step on a single three-step drop", async () => {
    const {store} = setup({"2,3":[unit("Raal Dromedary","runner",1),unit("Ogre Goons","home")],"2,2":[unit("Ogre Goons","middle")],"2,1":[unit("Ogre Goons","top")]});
    await drag(store,"2,3","2,0");
    expect(store.getState().pendingMagic).toBeNull();
    expect([damageAt(store,"2,3"),damageAt(store,"2,2"),damageAt(store,"2,1")]).toEqual([[2],[2],[2]]);
    expect(runner(store).cpuTurnEffect?.steps).toBe(3);
    await drag(store,"2,0","1,0");
    expect(runner(store).cpuTurnEffect?.steps).toBe(3);
    expect(lastEvent(store)).toContain("no fire trail");
    expect(damageAt(store,"2,0")).toEqual([]);
  });
  it("burns only the departed tile on a forced move and spends no steps", async () => {
    const {store} = setup({"2,3":[unit("Raal Dromedary","runner",1),unit("Ogre Goons","home")],"2,2":[unit("Ogre Goons","middle")]});
    const teleport = getSpellChoices(store.getState(),"p1","Teleport").find(c => c.key === "p1/2,3:0/0,0")!;
    applySpellChoice(store.setState,store.getState,teleport);
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().permanents["0,0"][0].instanceId).toBe("runner");
    expect(damageAt(store,"2,3")).toEqual([2]);
    expect(damageAt(store,"2,2")).toEqual([0]);
    expect(runner(store).cpuTurnEffect?.steps || 0).toBe(0);
    // The full allowance is still available afterwards.
    await drag(store,"0,0","0,1");
    expect(store.getState().pendingMagic).toBeNull();
    expect(runner(store).cpuTurnEffect?.steps).toBe(1);
  });
  it("prompts for an ambiguous route, marks tile options, and burns the chosen path", async () => {
    const {store} = setup({"0,0":[unit("Raal Dromedary","runner",1)],"1,0":[unit("Ogre Goons","east")],"0,1":[unit("Ogre Goons","south")]});
    await drag(store,"0,0","1,1");
    const pending = store.getState().pendingMagic;
    expect(pending?.cpuEvent).toMatchObject({kind:"blazeTrail",from:"0,0",to:"1,1",budget:3});
    const [choice, ...rest] = getSpellChoices(store.getState(),"p1","Raal Dromedary");
    expect(rest).toHaveLength(0);
    expect(choice.autoResolve).toBeUndefined();
    expect(choice.projectile?.decisions[0].options).toEqual(expect.arrayContaining([expect.objectContaining({key:"1,0",at:"1,0"}),expect.objectContaining({key:"0,1",at:"0,1"})]));
    expect(choice.projectile?.decisions[0].options.filter(option => option.key === "stop")).toEqual([]);
    expect(choice.operations).toContainEqual({kind:"moveSpent",target:pending?.cpuEvent?.kind === "blazeTrail" ? pending.cpuEvent.source : null,steps:2});
    expect(choice.score).toBe(scoreOperations(store.getState(),"p1",choice.operations.filter(op => op.kind === "damageEvent")));
    const detour = getSpellChoices(store.getState(),"p1","Raal Dromedary",projectileKey("blaze-trail",["0,1"]))[0];
    expect(detour.projectile?.selections).toEqual(["0,1","1,1","stop"]);
    store.getState().setCpuMagicChoice(detour.key);
    store.getState().resolveMagic();
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
    expect(damageAt(store,"0,1")).toEqual([2]);
    expect(damageAt(store,"1,0")).toEqual([0]);
    expect(runner(store).cpuTurnEffect?.steps).toBe(2);
  });
  it("carries the step ledger through the permanents patch and the server's avatar normalization", async () => {
    const {store} = setup({"2,3":[unit("Raal Dromedary","runner",1)]});
    const patches: ServerPatchT[] = [];
    const send = store.getState().trySendPatch;
    store.setState({trySendPatch:patch => { patches.push(patch); return send(patch); }});
    await drag(store,"2,3","2,2");
    const ledger = patches.flatMap(patch => patch.permanents?.["2,2"] || []).map(item => item.cpuTurnEffect?.steps);
    expect(ledger).toContain(1);
    const fallback = {card:card("Flamecaller"),pos:[4,3] as [number,number],tapped:false};
    const effect = {turn:"3:1",power:0,movement:2,blaze:true,steps:2};
    expect(__testZoneHelpers.normalizeAvatar({cpuTurnEffect:effect},fallback).cpuTurnEffect).toEqual(effect);
    expect(__testZoneHelpers.normalizeAvatar({cpuTurnEffect:{...effect,steps:"2"}},fallback).cpuTurnEffect).toEqual({turn:"3:1",power:0,movement:2,blaze:true});
  });
  it("charges void crossings: a unit without Voidwalk burns nothing going out and spends a step coming back", async () => {
    const {store,transport} = setup({"2,2":[unit("Raal Dromedary","runner",1),unit("Ogre Goons","home")]});
    withoutSite(store,"1,2");
    for (let i=0;i<8;i++) await drag(store,i%2 ? "1,2" : "2,2",i%2 ? "2,2" : "1,2");
    expect(store.getState().pendingMagic).toBeNull();
    expect(logged(store,"Blaze: Raal Dromedary has no legal route within its 3 remaining steps; no fire trail")).toBe(true);
    expect(trails(transport)).toBe(3);
    expect(runner(store).cpuTurnEffect?.steps).toBe(3);
    expect(damageAt(store,"2,2")).toEqual([0]);
    expect(lastEvent(store)).toBe("Blaze: Raal Dromedary has no movement left this turn; no fire trail");
  });
  it("lets a Voidwalker cross the void one step at a time", async () => {
    const {store,transport} = setup({"2,2":[unit("Spectral Stalker","runner",1),unit("Ogre Goons","home")]});
    withoutSite(store,"1,2");
    await drag(store,"2,2","1,2");
    expect(store.getState().pendingMagic).toBeNull();
    expect(damageAt(store,"2,2")).toEqual([2]);
    expect(runner(store).cpuTurnEffect?.steps).toBe(1);
    for (let i=1;i<4;i++) await drag(store,i%2 ? "1,2" : "2,2",i%2 ? "2,2" : "1,2");
    expect(trails(transport)).toBe(3);
    expect(runner(store).cpuTurnEffect?.steps).toBe(3);
    expect(lastEvent(store)).toBe("Blaze: Spectral Stalker has no movement left this turn; no fire trail");
  });
  it("charges a step for each free Updraft Ridge hop", async () => {
    const {store,transport} = setup({"2,2":[unit("Plumed Pegasus","runner",1),unit("Ogre Goons","low")],"2,1":[unit("Ogre Goons","high")]});
    const sites = store.getState().board.sites;
    store.setState({board:{...store.getState().board,sites:{...sites,"2,2":{...sites["2,2"],card:card("Updraft Ridge","ridge-low")},"2,1":{...sites["2,1"],card:card("Updraft Ridge","ridge-high")}}}});
    for (let i=0;i<4;i++) await drag(store,i%2 ? "2,1" : "2,2",i%2 ? "2,2" : "2,1");
    expect(store.getState().pendingMagic).toBeNull();
    expect(trails(transport)).toBe(3);
    expect(runner(store).cpuTurnEffect?.steps).toBe(3);
    expect(lastEvent(store)).toBe("Blaze: Plumed Pegasus has no movement left this turn; no fire trail");
  });
  it("re-derives the budget of trails queued behind a trigger-order prompt", async () => {
    const {store} = setup({"2,3":[unit("Raal Dromedary","runner",1),unit("Ogre Goons","home")],"2,2":[unit("Ogre Goons","a")],"2,1":[unit("Ogre Goons","b")],"2,0":[unit("Ogre Goons","c")]});
    store.setState({cpuGenesisRequests:[{id:"g1",at:"0,3"},{id:"g2",at:"1,3"}]});
    await settle();
    const options = store.getState().cpuTriggerOptions || [];
    expect(store.getState().pendingMagic).toBeNull();
    expect(options).toHaveLength(2);
    // Board drags are not gated by the order prompt: every trail is queued with the three steps left at that time.
    for (const [from,to] of [["2,3","2,2"],["2,2","2,1"],["2,1","2,0"],["2,0","1,0"]]) await drag(store,from,to);
    expect(store.getState().cpuPendingTriggerCount).toBe(6);
    store.getState().chooseCpuTrigger(options[0].id);
    for (let i=0;i<3;i++) await settle();
    expect(store.getState().pendingMagic).toBeNull();
    expect(store.getState().cpuPendingTriggerCount).toBe(0);
    expect(runner(store).cpuTurnEffect?.steps).toBe(3);
    expect([damageAt(store,"2,3"),damageAt(store,"2,2"),damageAt(store,"2,1"),damageAt(store,"2,0")]).toEqual([[2],[2],[2],[0]]);
    expect(logged(store,"Raal Dromedary: No fire trail: no movement left this turn")).toBe(true);
  });
  it("fizzles a trail queued behind an open prompt once that prompt spends the steps it needed", async () => {
    const {store} = setup({"0,0":[unit("Raal Dromedary","runner",1)],"1,1":[unit("Ogre Goons","centre")],"2,1":[unit("Ogre Goons","east")]});
    await drag(store,"0,0","1,1");
    expect(store.getState().pendingMagic?.cpuEvent).toMatchObject({kind:"blazeTrail",budget:3});
    await drag(store,"1,1","3,1");
    store.getState().setCpuMagicChoice("blaze-trail");
    store.getState().resolveMagic();
    for (let i=0;i<2;i++) await settle();
    expect(store.getState().pendingMagic).toBeNull();
    expect(runner(store).cpuTurnEffect?.steps).toBe(2);
    expect([damageAt(store,"1,1"),damageAt(store,"2,1")]).toEqual([[0],[0]]);
    expect(logged(store,"Raal Dromedary: No fire trail: no legal route within 1 remaining step")).toBe(true);
  });
  it("sends only the step ledger for the opponent's avatar so the server accepts the trail", async () => {
    const store = createGameStore();
    const transport = Object.assign(new LocalTransport(),{sendMessage:vi.fn(),sendAction:vi.fn()});
    store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:2,turn:3,matchId:"blaze-avatar",transport,
      board:{size:{w:5,h:4},sites:Object.fromEntries(Array.from({length:20},(_,i) => [`${i%5},${Math.floor(i/5)}`,{owner:2,card:card("Lone Tower",`site${i}`)}]))},
      avatars:{p1:{card:card("Flamecaller"),pos:[4,3],tapped:false},p2:{card:card("Geomancer"),pos:[4,0],tapped:false}},permanents:{},
    } as Partial<GameState>);
    // The human client adjudicates the bot's Blaze on its own avatar, then the avatar walks one step.
    applySpellChoice(store.setState,store.getState,getSpellChoices(store.getState(),"p2","Blaze").find(c => c.target?.kind === "avatar")!);
    const patches: ServerPatchT[] = [];
    const send = store.getState().trySendPatch;
    store.setState({trySendPatch:patch => { patches.push(patch); return send(patch); }});
    store.setState({avatars:{...store.getState().avatars,p2:{...store.getState().avatars.p2,pos:[3,0]}}});
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
    const ledger = patches.filter(patch => patch.avatars);
    expect(ledger).toEqual([{avatars:{p2:{cpuTurnEffect:{turn:"3:2",power:0,movement:2,blaze:true,steps:1}}}}]);
    const game = {currentPlayer:2,phase:"Main",turn:3,avatars:{p1:{tapped:false},p2:{tapped:false}},permanents:{},board:{sites:{}},zones:{}};
    expect(validateAction(game,ledger[0],"human",{match:{playerIds:["human","cpu_bot"]}})).toEqual({ok:true});
  });
});
