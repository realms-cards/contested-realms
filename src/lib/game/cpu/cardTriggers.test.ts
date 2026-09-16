import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import cards from "@/lib/game/cpu/cards.json";
import { movementSteps } from "@/lib/game/cpu/movement";
import type { SpellChoice } from "@/lib/game/cpu/spellTypes";
import { getAttackTargets, getRangedTargets, getSpellChoices, isWater, unitStats, unitsInRealm } from "@/lib/game/cpu/spells";
import { rangedAttack, stationaryAttack } from "@/lib/game/cpu/stationaryAttack";
import { createGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem, SiteTile } from "@/lib/game/store/types";
import { LocalTransport } from "@/lib/net/localTransport";
import { validateAction } from "../../../../server/modules/rules-validation";

type Name = keyof typeof cards;
type Store = ReturnType<typeof createGameStore>;
const card = (name: Name, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: Name, owner: 1 | 2, id: string = name): PermanentItem => ({owner,card:card(name,id),instanceId:id,tapped:false});
const site = (name: Name, owner: 1 | 2, id = `${name}-${owner}`): SiteTile => ({owner,card:card(name,id)});
const settle = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };

/** A CPU match on a 5x4 realm of Cornerstones (land without Genesis), with the given sites laid over it. */
function setup(sites: Record<string, SiteTile> = {}, state: Partial<GameState> = {}) {
  const store = createGameStore();
  const land = Object.fromEntries(Array.from({length:20},(_,i) => [`${i%5},${Math.floor(i/5)}`,site("Cornerstone",Math.floor(i/5) >= 2 ? 1 : 2,`land${i}`)]));
  store.setState({opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,matchId:"card-triggers",transport:new LocalTransport(),
    board:{size:{w:5,h:4},sites:{...land,...sites}},permanents:{},
    avatars:{p1:{card:card("Flamecaller"),pos:[4,3],tapped:false},p2:{card:card("Geomancer"),pos:[4,0],tapped:false}},...state} as Partial<GameState>);
  return store;
}
const pendingChoices = (store: Store): SpellChoice[] => {
  const state = store.getState(), pending = state.pendingMagic;
  return pending ? getSpellChoices(state,pending.spell.owner === 1 ? "p1" : "p2",pending.spell.card.name || "") : [];
};
/** Pick an effect for the pending trigger and resolve it, as the targeting bar's confirm does. */
function choose(store: Store, key: string) {
  const pending = store.getState().pendingMagic;
  if (!pending || !pendingChoices(store).some(choice => choice.key === key)) throw new Error(`No ${key} in ${pendingChoices(store).map(choice => choice.key).join(", ")}`);
  store.setState({pendingMagic:{...pending,cpuChoice:key,status:"confirm"}});
  store.getState().resolveMagic();
}
const ids = (items: PermanentItem[] | undefined) => (items || []).map(item => item.instanceId);

beforeEach(() => { vi.spyOn(HTMLMediaElement.prototype,"play").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());

describe("end and start of turn triggers", () => {
  it("Infernal Legion deals 3 to each other adjacent unit (its own square included) at its controller's end of turn", async () => {
    const store = setup();
    store.setState({permanents:{"2,2":[unit("Infernal Legion",1,"legion"),unit("Raal Dromedary",2,"here")],"2,1":[unit("Raal Dromedary",2,"north")],"1,1":[unit("Raal Dromedary",2,"diagonal")]}});
    await settle();
    store.setState({phase:"End"});
    await settle();
    const state = store.getState();
    expect(ids(state.permanents["2,2"])).toEqual(["legion"]);
    expect(ids(state.permanents["2,1"])).toEqual([]);
    expect(ids(state.permanents["1,1"])).toEqual(["diagonal"]);
    expect(state.permanents["2,2"][0].cpuTriggerStamps?.end).toBe("3:1");
  });
  it("the CPU's Quarrelsome Kobolds strike an adjacent enemy rather than themselves", async () => {
    const store = setup({},{currentPlayer:2});
    store.setState({permanents:{"2,1":[unit("Quarrelsome Kobolds",2,"kobolds")],"2,2":[unit("Raal Dromedary",1,"victim")]}});
    await settle();
    store.setState({phase:"End"});
    await settle();
    expect(ids(store.getState().permanents["2,2"])).toEqual([]);
    expect(store.getState().permanents["2,1"][0].damage ?? 0).toBe(0);
  });
  it("Guile Sirens force a nearby enemy minion one step toward them", async () => {
    const store = setup({},{turn:2,currentPlayer:2});
    store.setState({permanents:{"2,3":[unit("Guile Sirens",1,"sirens")],"3,2":[unit("Raal Dromedary",2,"lured")]}});
    await settle();
    store.setState({turn:3,currentPlayer:1,phase:"Start"});
    await settle();
    expect(pendingChoices(store).map(choice => choice.key)).toEqual(expect.arrayContaining(["trigger/lure/lured/2,2","trigger/lure/lured/3,3"]));
    choose(store,"trigger/lure/lured/3,3");
    expect(ids(store.getState().permanents["3,3"])).toContain("lured");
    expect(store.getState().permanents["2,3"][0].cpuTriggerStamps?.start).toBe("3:1");
  });
  it("teleports the CPU's Headless Haunt at the start of the CPU's turn", async () => {
    const store = setup();
    store.setState({permanents:{"1,1":[unit("Headless Haunt",2,"haunt")]}});
    await settle();
    vi.spyOn(Math,"random").mockReturnValue(0);
    store.setState({turn:4,currentPlayer:2,phase:"Start"});
    await settle();
    expect(ids(store.getState().permanents["1,1"])).toEqual([]);
    expect(ids(store.getState().permanents["0,0"])).toContain("haunt");
  });
  it("Maelström may pull each minion in its body of water one step closer", async () => {
    const store = setup({"2,2":site("Maelström",1),"2,1":site("Floodplain",2),"2,0":site("Floodplain",2,"far-water")},{turn:2,currentPlayer:2});
    store.setState({permanents:{"2,0":[unit("Raal Dromedary",2,"swimmer")]}});
    await settle();
    store.setState({turn:3,currentPlayer:1,phase:"Start"});
    await settle();
    choose(store,"trigger/pull");
    expect(ids(store.getState().permanents["2,1"])).toContain("swimmer");
    expect(store.getState().board.sites["2,2"].cpuTriggerStamps?.start).toBe("3:1");
  });
});

describe("whenever triggers", () => {
  it("offers Wayfaring Pilgrim a draw on its first entry into each corner only", async () => {
    const store = setup();
    store.setState({permanents:{"1,3":[unit("Wayfaring Pilgrim",1,"pilgrim")]}});
    await settle();
    store.setState({permanents:{"0,3":store.getState().permanents["1,3"]}});
    await settle();
    expect(store.getState().pendingMagic?.cpuEvent).toMatchObject({kind:"cardTrigger",trigger:"corner",corner:"0,3"});
    choose(store,"trigger/decline");
    expect(store.getState().permanents["0,3"][0].cpuCornersVisited).toEqual(["0,3"]);
    store.setState({permanents:{"1,3":store.getState().permanents["0,3"]}});
    await settle();
    store.setState({permanents:{"0,3":store.getState().permanents["1,3"]}});
    await settle();
    expect(store.getState().pendingMagic).toBeNull();
  });
  it("Mariner's Curse submerges a minion entering its water site and returns to its owner's hand", async () => {
    const store = setup({"2,2":site("Floodplain",1)});
    store.setState({permanents:{"1,2":[unit("Mariner's Curse",1,"curse")],"2,3":[unit("Raal Dromedary",2,"sailor")]}});
    await settle();
    store.setState({permanents:{"1,2":store.getState().permanents["1,2"],"2,2":store.getState().permanents["2,3"]}});
    await settle();
    const state = store.getState();
    expect(state.zones.p1.hand.map(held => held.name)).toContain("Mariner's Curse");
    expect(ids(state.permanents["1,2"])).toEqual([]);
    expect(state.zones.p2.graveyard.map(dead => dead.name)).toContain("Raal Dromedary");
  });
  it("offers Kite Archer a step right after its ranged strike", async () => {
    const store = setup();
    store.setState({selectedPermanent:{at:"2,3",index:0},permanents:{"2,3":[unit("Kite Archer",1,"kite")],"2,2":[unit("Raal Dromedary",2,"target")]}});
    await settle();
    const choice = rangedAttack(store.getState());
    if (!choice) throw new Error("expected a ranged choice");
    store.getState().rangedStrike(choice.attacker,{kind:"permanent",at:"2,2",index:0});
    await settle();
    expect(store.getState().pendingMagic?.cpuEvent).toMatchObject({kind:"cardTrigger",trigger:"kiteStep"});
    choose(store,"trigger/step/1,3");
    expect(ids(store.getState().permanents["1,3"])).toContain("kite");
  });
  it("lets Skirmishers of Mu shoot from a location they moved through", async () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Skirmishers of Mu",1,"skirmishers")],"2,2":[unit("Raal Dromedary",2,"target")]}});
    await settle();
    store.setState({permanents:{"1,3":store.getState().permanents["2,3"],"2,2":store.getState().permanents["2,2"]}});
    await settle();
    choose(store,"trigger/shoot/target");
    expect(ids(store.getState().permanents["2,2"])).toEqual([]);
  });
  it("King of the Realm controls every Mortal while it rules, then control returns", async () => {
    const store = setup();
    store.setState({permanents:{"1,1":[unit("Wayfaring Pilgrim",2,"subject")],"2,2":[unit("Raal Dromedary",2,"beast")]}});
    await settle();
    store.setState({permanents:{...store.getState().permanents,"3,3":[unit("King of the Realm",1,"king")]}});
    await settle();
    expect(store.getState().permanents["1,1"][0]).toMatchObject({owner:1,cpuNativeOwner:2});
    expect(store.getState().permanents["2,2"][0].owner).toBe(2);
    store.setState({permanents:{"1,1":store.getState().permanents["1,1"],"2,2":store.getState().permanents["2,2"]}});
    await settle();
    expect(store.getState().permanents["1,1"][0]).toMatchObject({owner:2,cpuNativeOwner:null});
  });
});

describe("site abilities, placement and bot-only choices", () => {
  it("Floodplain floods one adjacent site once per turn", () => {
    const store = setup({"2,3":site("Floodplain",1)});
    const flood = abilityChoices(store.getState(),"p1").find(choice => choice.key.startsWith("floodplain/") && choice.key.endsWith("/2,2"));
    if (!flood) throw new Error("Missing Floodplain choice");
    store.getState().activateCpuAbility(flood.key);
    expect(store.getState().board.sites["2,2"].cpuFloodedUntil).toBe("3:1");
    expect(abilityChoices(store.getState(),"p1").some(choice => choice.key.startsWith("floodplain/"))).toBe(false);
  });
  it("Cloud City flies to a nearby void with the units atop it", () => {
    const store = setup();
    const sites = {...store.getState().board.sites};
    delete sites["2,1"];
    sites["2,2"] = {owner:1,card:{...card("Cloud City"),thresholds:{air:3,earth:0,fire:0,water:0}}};
    store.setState({board:{...store.getState().board,sites},permanents:{"2,2":[unit("Raal Dromedary",1,"passenger")]}});
    const fly = abilityChoices(store.getState(),"p1").find(choice => choice.key.startsWith("cloudcity/") && choice.key.endsWith("/2,1"));
    if (!fly) throw new Error("Missing Cloud City choice");
    store.getState().activateCpuAbility(fly.key);
    const state = store.getState();
    expect(state.board.sites["2,1"]?.card?.name).toBe("Cloud City");
    expect(state.board.sites["2,2"]).toBeUndefined();
    expect(ids(state.permanents["2,1"])).toContain("passenger");
  });
  it("Island Leviathan transforms into a Monster atop flooded Rubble", () => {
    const store = setup({"2,2":{owner:1,card:{...card("Island Leviathan"),thresholds:{air:0,earth:0,fire:0,water:8}}}});
    const transform = abilityChoices(store.getState(),"p1").find(choice => choice.key.startsWith("leviathan/"));
    if (!transform) throw new Error("Missing Island Leviathan choice");
    store.getState().activateCpuAbility(transform.key);
    const state = store.getState();
    expect(state.board.sites["2,2"]).toMatchObject({cpuNeutral:true,card:{name:"Rubble"}});
    expect(isWater(state,"2,2")).toBe(true);
    expect(state.permanents["2,2"].at(-1)?.card).toMatchObject({name:"Island Leviathan",type:"Minion"});
  });
  it("offers the CPU Ranged strikes as abilities", () => {
    const store = setup();
    store.setState({permanents:{"2,3":[unit("Kite Archer",1,"kite")],"2,2":[unit("Raal Dromedary",2,"target")]}});
    expect(abilityChoices(store.getState(),"p1").map(choice => choice.key)).toContain("ranged/kite/target");
  });
  it("lets Cornerstone be played to any corner, and only Cornerstone", () => {
    const game = {currentPlayer:1,board:{size:{w:5,h:4},sites:{"2,3":{owner:1,card:{name:"Humble Village"}}}},avatars:{p1:{pos:[2,3]}}};
    const context = {match:{playerIds:["human","cpu_bot"]}};
    const play = (at: string, name: string) => validateAction(game,{board:{sites:{[at]:{owner:1,card:{name}}}}} as Parameters<typeof validateAction>[1],"human",context).ok;
    expect(play("4,0","Cornerstone")).toBe(true);
    expect(play("4,1","Cornerstone")).toBe(false);
    expect(play("4,0","Humble Village")).toBe(false);
  });
});

describe("Mountain Giant occupies four locations", () => {
  const located = (store: Store, id: string) => {
    const found = unitsInRealm(store.getState()).find(unit => unit.target.kind === "permanent" && unit.target.instanceId === id);
    if (!found) throw new Error(`missing ${id}`);
    return found;
  };
  it("can be attacked and shot at any of its locations", () => {
    const store = setup();
    store.setState({permanents:{"2,1":[unit("Mountain Giant",2,"giant")],"3,2":[unit("Raal Dromedary",1,"raider")],"3,3":[unit("Kite Archer",1,"archer")]}});
    const giant = {kind:"permanent",at:"2,1",index:0};
    expect(located(store,"giant").cells).toEqual(["2,1","3,1","2,2","3,2"]);
    expect(getAttackTargets(store.getState(),located(store,"raider")).map(choice => choice.target)).toContainEqual(giant);
    expect(getRangedTargets(store.getState(),located(store,"archer")).map(choice => choice.target)).toContainEqual(giant);
  });
  it("moves all four locations together, and only where each can stand", () => {
    const store = setup();
    const sites = {...store.getState().board.sites};
    delete sites["4,2"];
    store.setState({board:{...store.getState().board,sites},permanents:{"2,1":[unit("Mountain Giant",1,"giant")]}});
    const steps = movementSteps(store.getState(),"2,1",store.getState().permanents["2,1"][0]).map(step => step.at).sort();
    expect(steps).toEqual(["1,1","2,0","2,2"]);
  });
  it("attacks from any of its locations, and the fight there resolves", () => {
    const store = setup();
    store.setState({selectedPermanent:{at:"2,1",index:0},permanents:{"2,1":[unit("Mountain Giant",1,"giant")],"3,2":[unit("Raal Dromedary",2,"victim")]}});
    const choice = stationaryAttack(store.getState());
    const candidate = choice?.candidates.find(entry => entry.kind === "permanent" && entry.at === "3,2");
    if (!choice || !candidate) throw new Error("expected the Giant to attack at 3,2");
    expect(candidate.tile).toEqual({x:3,y:2});
    store.getState().declareAttack(candidate.tile ?? choice.tile,choice.attacker,{kind:"permanent",at:"3,2",index:0});
    const pending = store.getState().pendingCombat;
    if (!pending) throw new Error("expected a declared attack");
    store.setState({pendingCombat:{...pending,status:"committed"}});
    store.getState().autoResolveCombat();
    expect(ids(store.getState().permanents["3,2"])).toEqual([]);
    expect(store.getState().permanents["2,1"][0]).toMatchObject({tapped:true,damage:2});
  });
});

describe("Voidwalk cards", () => {
  // These live outside the 132-card cards.json, so they arrive the way the bot hydrates them:
  // their printed text on `rulesText` rather than `text`.
  const voidCard = (name: string, attack: number, defence: number, rulesText: string, id = name): CardRef =>
    ({cardId:2,name,type:"Minion",attack,defence,instanceId:id,rulesText});
  const voidUnit = (name: string, owner: 1 | 2, attack: number, defence: number, rulesText: string, id = name): PermanentItem =>
    ({owner,card:voidCard(name,attack,defence,rulesText,id),instanceId:id,tapped:false});
  /** Remove tiles so those locations are the void. */
  const openVoid = (store: Store, ...ats: string[]) => {
    const sites = {...store.getState().board.sites};
    for (const at of ats) delete sites[at];
    store.setState({board:{...store.getState().board,sites}});
  };
  const located = (store: Store, id: string) => {
    const found = unitsInRealm(store.getState()).find(unit => unit.target.kind === "permanent" && unit.target.instanceId === id);
    if (!found) throw new Error(`missing ${id}`);
    return found;
  };

  it("Lord of the Void banishes an adjacent site at end of turn, but never one an Avatar stands on", async () => {
    const store = setup();
    store.setState({permanents:{"4,2":[voidUnit("Lord of the Void",1,0,0,
      "Voidwalk\n\nAt the end of your turn, Lord of the Void may banish an adjacent site, unless there's an Avatar there.","lord")]}});
    await settle();
    store.setState({phase:"End"});
    await settle();
    const keys = pendingChoices(store).map(choice => choice.key);
    expect(keys).toContain("trigger/banish/4,1");
    expect(keys).not.toContain("trigger/banish/4,3"); // the p1 avatar stands there
    choose(store,"trigger/banish/4,1");
    expect(store.getState().board.sites["4,1"]).toBeUndefined();
    expect(store.getState().zones.p2.banished.map(banished => banished.name)).toContain("Cornerstone");
  });

  it("Phase Assassin gains Stealth when he enters the void", async () => {
    const store = setup();
    openVoid(store,"2,2");
    store.setState({permanents:{"2,3":[voidUnit("Phase Assassin",1,3,3,
      "Voidwalk\n\nWhenever Phase Assassin enters the void, he gains Stealth.","assassin")]}});
    await settle();
    store.setState({permanents:{"2,2":store.getState().permanents["2,3"],"2,3":[]}});
    await settle();
    expect(store.getState().permanents["2,2"].some(item => item.card.name === "Stealth" && item.attachedTo?.at === "2,2")).toBe(true);
  });

  it("Varistus the Evictor kills the enemies in the void he enters", async () => {
    const store = setup();
    openVoid(store,"2,2");
    store.setState({permanents:{
      "2,3":[voidUnit("Varistus the Evictor",1,2,2,"Voidwalk\n\nWhenever Varistus enters a void location, he kills all enemies there.","varistus")],
      "2,2":[voidUnit("Spectral Stalker",2,2,2,"Voidwalk","stalker")],
    }});
    await settle();
    store.setState({permanents:{"2,2":[...store.getState().permanents["2,2"],...store.getState().permanents["2,3"]],"2,3":[]}});
    await settle();
    expect(ids(store.getState().permanents["2,2"])).toEqual(["varistus"]);
  });

  it("teleports Hauntless Head at the start of its controller's turn", async () => {
    const store = setup();
    store.setState({permanents:{"1,1":[voidUnit("Hauntless Head",2,2,2,
      "Spellcaster, Voidwalk\n\nAt the start of your turn, Hauntless Head teleports to the top of a random site or void.","head")]}});
    await settle();
    vi.spyOn(Math,"random").mockReturnValue(0);
    store.setState({turn:4,currentPlayer:2,phase:"Start"});
    await settle();
    expect(ids(store.getState().permanents["1,1"])).toEqual([]);
    expect(ids(store.getState().permanents["0,0"])).toContain("head");
  });

  it("Hounds of Ondaros permanently strip Stealth from nearby enemies", async () => {
    const store = setup();
    store.setState({permanents:{"2,2":[unit("Dead of Night Demon",2,"sneak")]}});
    await settle();
    expect(store.getState().permanents["2,2"][0].cpuStealthLost).toBeUndefined();
    store.setState({permanents:{...store.getState().permanents,"2,3":[voidUnit("Hounds of Ondaros",1,4,4,
      "Airborne, Burrowing, Submerge, Voidwalk\n\nNearby enemies permanently lose Stealth.","hounds")]}});
    await settle();
    expect(store.getState().permanents["2,2"][0].cpuStealthLost).toBe(true);
  });

  it("Aaj-kegon Ghost Crabs gain power for each void in their row", () => {
    const store = setup();
    openVoid(store,"0,2","1,2");
    store.setState({permanents:{"3,2":[voidUnit("Aaj-kegon Ghost Crabs",1,0,0,
      "Submerge, Voidwalk\n\nHas +1 power for each void in their row.","crabs")]}});
    expect(unitStats(store.getState(),located(store,"crabs")).atk).toBe(2);
  });

  it("All-terrain Vestments grant their bearer Voidwalk", () => {
    const store = setup();
    openVoid(store,"2,2");
    const vestments: PermanentItem = {owner:1,instanceId:"vestments",tapped:false,attachedTo:{at:"2,3",index:0},
      card:{cardId:2,name:"All-terrain Vestments",type:"Artifact",instanceId:"vestments",
        rulesText:"Bearer has Burrowing, Submerge, and Voidwalk, if it's a minion."}};
    store.setState({permanents:{"2,3":[unit("Raal Dromedary",1,"walker")]}});
    expect(movementSteps(store.getState(),"2,3",store.getState().permanents["2,3"][0]).map(step => step.at)).not.toContain("2,2");
    store.setState({permanents:{"2,3":[unit("Raal Dromedary",1,"walker"),vestments]}});
    expect(movementSteps(store.getState(),"2,3",store.getState().permanents["2,3"][0]).map(step => step.at)).toContain("2,2");
  });

  it("Lucid Dreamers grant Voidwalk to a minion sharing their void", () => {
    const store = setup();
    openVoid(store,"2,2","2,1");
    store.setState({permanents:{"2,2":[unit("Raal Dromedary",1,"guest")]}});
    expect(movementSteps(store.getState(),"2,2",store.getState().permanents["2,2"][0]).map(step => step.at)).not.toContain("2,1");
    store.setState({permanents:{"2,2":[store.getState().permanents["2,2"][0],voidUnit("Lucid Dreamers",1,2,2,
      "Voidwalk\n\nYou may cast minions to this void, granting them Voidwalk until they're no longer in the void.","dreamers")]}});
    expect(movementSteps(store.getState(),"2,2",store.getState().permanents["2,2"][0]).map(step => step.at)).toContain("2,1");
  });

  it("Vril Revenant pays a mana for +1 power this turn", () => {
    const store = setup();
    store.setState({permanents:{"2,2":[voidUnit("Vril Revenant",1,1,1,"Voidwalk\n\n① → Gain +1 power this turn.","vril")]}});
    const ability = abilityChoices(store.getState(),"p1").find(choice => choice.key.startsWith("vril/"));
    if (!ability) throw new Error("Missing Vril Revenant ability");
    store.getState().activateCpuAbility(ability.key);
    expect(unitStats(store.getState(),located(store,"vril")).atk).toBe(2);
    expect(store.getState().players.p1.mana).toBe(-1);
  });
});
