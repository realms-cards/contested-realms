import { useFrame } from "@react-three/fiber";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React, { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CpuAbilityButtons from "@/components/game/CpuAbilityButtons";
import CpuAssistBar from "@/components/game/CpuAssistBar";
import CpuFieldTargets from "@/lib/game/components/CpuFieldTargets";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import { useCpuAbilityPicker } from "@/lib/game/cpu/abilityPicker";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import cards from "@/lib/game/cpu/cards.json";
import { CPU_TRIGGERS_IN_ORDER, type SpellChoice } from "@/lib/game/cpu/spellTypes";
import { getSpellChoices } from "@/lib/game/cpu/spells";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PendingMagic, PermanentItem, SiteTile } from "@/lib/game/store/types";

// A plain store copy without the CPU controller subscription, so test states stay as written.
vi.mock("@/lib/game/store", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/game/store")>();
  const { create } = await import("zustand");
  return {...actual,useGameStore:create<GameState>()(() => actual.useGameStore.getState())};
});
vi.mock("@/lib/game/cpu/abilities", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/game/cpu/abilities")>();
  return {...actual,abilityChoices:vi.fn(actual.abilityChoices)};
});
vi.mock("@/lib/game/cpu/spells", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/game/cpu/spells")>();
  return {...actual,getSpellChoices:vi.fn(actual.getSpellChoices)};
});
vi.mock("@/lib/audio/soundManager", () => ({soundManager:{play:vi.fn()}}));
// The board layer renders through react-dom here (no WebGL); its pulse registration is what the tests observe.
vi.mock("@react-three/fiber", async importOriginal => ({...await importOriginal<typeof import("@react-three/fiber")>(),useFrame:vi.fn()}));

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, owner: 1 | 2, id: string): PermanentItem => ({owner,card:card(name,id),instanceId:id,tapped:false});
const initial = useGameStore.getState();
const realSpellChoices = vi.mocked(getSpellChoices).getMockImplementation();
const abilityCalls = () => vi.mocked(abilityChoices).mock.calls.length;
const spellCalls = () => vi.mocked(getSpellChoices).mock.calls.length;
const cast = (name: keyof typeof cards, overrides: Partial<PendingMagic> = {}): PendingMagic => ({id:"mag1",tile:{x:2,y:3},spell:{at:"2,3",index:-1,owner:1,card:card(name)},status:"choosingTarget",createdAt:1,...overrides});
const bolt = (overrides: Partial<PendingMagic> = {}) => cast("Lightning Bolt",overrides);
/** Lone Towers on every tile (p1 owns the home row), for spells that need sites to aim at. */
const towers = (): Record<string, SiteTile> => Object.fromEntries(Array.from({length:20},(_,i) => [`${i%5},${Math.floor(i/5)}`,{owner:(Math.floor(i/5) === 3 ? 1 : 2) as 1 | 2,card:card("Lone Tower",`site${i}`)}]));
const realm = (permanents: GameState["permanents"], pendingMagic: PendingMagic) => act(() => { useGameStore.setState({board:{size:{w:5,h:4},sites:towers()},permanents,pendingMagic}); });
// UI-only updates that happen constantly while the human hovers and selects.
const uiUpdates: Partial<GameState>[] = [
  {hoverCell:[1,1]},{previewCard:card("Mountain Giant")},{selectedPermanent:{at:"2,1",index:0}},{handHoverCount:2},{hoverCell:null},{previewCard:null},{selectedPermanent:null},
];
const picker = () => useCpuBoardPicker.getState();
const tiles = () => [...picker().tiles].sort();
/** A click on any pick token: a tile, a board card, an arrow or an anchored button (each renderer calls select). */
const click = (token: string) => act(() => { picker().select(token); });
const noDropdowns = () => { expect(document.querySelector("select")).toBeNull(); expect(screen.queryByRole("combobox")).toBeNull(); expect(screen.queryByRole("listbox")).toBeNull(); };
const noEffectList = () => expect(screen.queryByRole("region",{name:"Effects"})).toBeNull();
const cpuChoice = () => useGameStore.getState().pendingMagic?.cpuChoice;
/** The projectile selections encoded in the current key (projectileKey appends them as URI-encoded JSON). */
const selections = () => { const key = cpuChoice(); return key?.includes("|") ? JSON.parse(decodeURIComponent(key.slice(key.indexOf("|")+1))) as string[] : null; };
const pressed = (button: HTMLElement) => button.getAttribute("aria-pressed");

let renders = 0;
let confirmedWith: string | undefined;
let setCpuMagicChoice = vi.fn<(key: string) => void>();
let confirmMagic = vi.fn<() => void>();
let activateCpuAbility = vi.fn<(key: string) => void>();
let chooseCpuTrigger = vi.fn<(id: string) => void>();
let cancelMagic = vi.fn<() => void>();
let completeCpuMagicManual = vi.fn<() => void>();
function renderCounted(ui: React.ReactElement) {
  render(<Profiler id="cpu-assist" onRender={() => { renders++; }}>{ui}</Profiler>);
}
function applyUiUpdates() {
  for (const update of uiUpdates) act(() => { useGameStore.setState(update); });
}

beforeEach(() => {
  vi.stubGlobal("React",React);
  confirmedWith = undefined;
  // The selection mock behaves like the store: it records the key on the pending effect.
  setCpuMagicChoice = vi.fn((key: string) => {
    const pending = useGameStore.getState().pendingMagic;
    if (pending) useGameStore.setState({pendingMagic:{...pending,cpuChoice:key || undefined}});
  });
  confirmMagic = vi.fn(() => { confirmedWith = useGameStore.getState().pendingMagic?.cpuChoice; });
  activateCpuAbility = vi.fn();
  chooseCpuTrigger = vi.fn();
  cancelMagic = vi.fn();
  completeCpuMagicManual = vi.fn();
  useGameStore.setState(initial,true);
  useGameStore.setState({
    opponentPlayerId:"cpu_test",actorKey:"p1",matchId:"m1",phase:"Main",currentPlayer:1,turn:3,matchEnded:false,
    pendingMagic:null,pendingCombat:null,cpuTriggerOptions:[],cpuPendingTriggerCount:0,cpuEffectContinuations:[],
    board:{size:{w:5,h:4},sites:{"2,3":{owner:1,card:card("Sinkhole")},"2,2":{owner:2,card:card("Spring River")}}},
    permanents:{"2,1":[unit("Mountain Giant",2,"giant")]},permanentPositions:{},
    avatars:{...initial.avatars,p1:{card:card("Flamecaller"),pos:[2,3],tapped:false},p2:{card:card("Geomancer"),pos:[2,0],tapped:false}},
    setCpuMagicChoice,activateCpuAbility,chooseCpuTrigger,cancelMagic,confirmMagic,completeCpuMagicManual,
  });
  useCpuBoardPicker.setState({request:"",tiles:[],selected:null,glow:[],sources:[],labels:{}});
  useCpuAbilityPicker.setState({request:"",picked:null,hovered:null});
  window.sessionStorage.clear();
  renders = 0;
  if (realSpellChoices) vi.mocked(getSpellChoices).mockImplementation(realSpellChoices);
  vi.mocked(abilityChoices).mockClear();
  vi.mocked(getSpellChoices).mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CPU assist bar: own spells", () => {
  it("Fireball: click the caster, then a direction arrow, then confirm", () => {
    realm({"2,1":[unit("Ogre Goons",2,"goon")],"4,3":[unit("Apprentice Wizard",1,"wiz")]},cast("Fireball"));
    render(<CpuAssistBar />);
    expect(screen.getByText("· click who casts")).toBeTruthy();
    expect(tiles()).toEqual(["2,3","4,3"]);
    click("2,3");
    expect(screen.getByText("· pick a direction")).toBeTruthy();
    expect(tiles()).toEqual(["dir:2,3:E","dir:2,3:N","dir:2,3:S","dir:2,3:W"]);
    // The arrows carry their text from the choices' pickLabels.
    expect(picker().labels).toMatchObject({"dir:2,3:N":"North","dir:2,3:E":"East","dir:2,3:S":"South","dir:2,3:W":"West"});
    expect(picker().sources).toEqual(["2,3"]);
    expect(setCpuMagicChoice).not.toHaveBeenCalled();
    click("dir:2,3:N");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("p1/N");
    expect(picker().tiles).toEqual([]);
    // The chosen arrow stays lit (drawn pressed).
    expect(picker().glow).toEqual(["dir:2,3:N"]);
    expect(screen.getByText(/^Flamecaller: shoot N/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Confirm"}));
    expect(confirmMagic).toHaveBeenCalledTimes(1);
    expect(confirmedWith).toBe("p1/N");
    noDropdowns();
  });

  it("Teleport narrows by the ally's card, then by the destination, and steps back", () => {
    realm({"1,2":[unit("Ogre Goons",1,"ally")]},cast("Teleport"));
    render(<CpuAssistBar />);
    expect(screen.getByText("· click a card on the board")).toBeTruthy();
    expect(tiles()).toEqual(["unit:avatar:p1","unit:perm:ally"]);
    click("unit:perm:ally");
    expect(screen.getByText("· click the destination")).toBeTruthy();
    expect(tiles()).toHaveLength(19);
    expect(tiles()).not.toContain("1,2");
    expect(picker().glow).toEqual(["unit:perm:ally"]);
    click("0,0");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("p1/1,2:0/0,0");
    expect(screen.getByText("Flamecaller: Move Ogre Goons to Tile #1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Back"}));
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("");
    expect(tiles()).toHaveLength(19);
    fireEvent.keyDown(window,{key:"Escape"});
    expect(tiles()).toEqual(["unit:avatar:p1","unit:perm:ally"]);
    expect(cancelMagic).not.toHaveBeenCalled();
    noDropdowns();
  });

  // Behaviour change: units sharing a tile used to be picked from a forced "Effects" list after clicking the tile.
  it("Bury: units sharing a tile are clicked as their own cards, with no effect list", () => {
    realm({"2,1":[unit("Ogre Goons",2,"goon"),unit("Apprentice Wizard",2,"wiz")],"3,1":[unit("Ogre Goons",2,"goon2")]},cast("Bury"));
    render(<CpuAssistBar />);
    expect(tiles()).toEqual(["unit:perm:goon","unit:perm:goon2","unit:perm:wiz"]);
    expect(screen.getByText("· click a card on the board")).toBeTruthy();
    noEffectList();
    click("unit:perm:wiz");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("p1/2,1/1");
    expect(screen.getByText("Flamecaller: Burrow Apprentice Wizard")).toBeTruthy();
    noEffectList();
    noDropdowns();
  });

  it("two casters on one tile (avatar and Apprentice Wizard) are told apart by clicking the caster's card", () => {
    realm({"2,3":[unit("Apprentice Wizard",1,"wiz")]},bolt());
    render(<CpuAssistBar />);
    expect(screen.getByText("· click the caster's card on the board")).toBeTruthy();
    expect(tiles()).toEqual(["unit:avatar:p1","unit:perm:wiz"]);
    click("unit:perm:wiz");
    expect(screen.getByText("· click a target")).toBeTruthy();
    expect(tiles()).toEqual(["2,0","2,3"]);
    expect(picker().sources).toEqual(["unit:perm:wiz"]);
    click("2,0");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("wiz/2,0");
    noEffectList();
  });

  it("a fight prompt is two labelled buttons on the board, not a list", () => {
    const permanents = {"2,3":[unit("Ogre Goons",1,"me"),unit("Mountain Giant",2,"giant")]};
    realm(permanents,cast("Ogre Goons",{spell:{at:"2,3",index:-1,owner:1,card:card("Ogre Goons","me")},
      cpuEvent:{kind:"fightChoice",source:{kind:"permanent",at:"2,3",index:0,instanceId:"me"},target:{kind:"permanent",at:"2,3",index:1,instanceId:"giant"}}}));
    render(<CpuAssistBar />);
    expect(screen.getByText("· choose on the board")).toBeTruthy();
    expect(tiles()).toEqual(["opt:2,3:accept","opt:2,3:decline"]);
    expect(picker().labels).toMatchObject({"opt:2,3:accept":"Fight","opt:2,3:decline":"Decline"});
    noEffectList();
    click("opt:2,3:accept");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("fight/accept");
    expect(picker().glow).toEqual(["opt:2,3:accept"]);
    fireEvent.click(screen.getByRole("button",{name:"Confirm"}));
    expect(confirmedWith).toBe("fight/accept");
    noDropdowns();
  });

  it("Genesis lights the site whose Genesis it is, not the avatar's tile (an ability source)", () => {
    const {board} = useGameStore.getState(), desert = card("Arid Desert","desert");
    act(() => { useGameStore.setState({board:{...board,sites:{...board.sites,"3,3":{owner:1,card:desert}}},
      pendingMagic:cast("Arid Desert",{tile:{x:3,y:3},spell:{at:"3,3",index:-1,owner:1,card:desert},cpuEvent:{kind:"genesis",region:"surface",sourceSite:{at:"3,3",name:"Arid Desert",instanceId:"desert"}}})}); });
    render(<CpuAssistBar />);
    expect(tiles()).toEqual(["2,2","2,3","3,3"]);
    click("2,2");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("genesis/2,2");
    expect(picker().glow).toEqual(["2,2"]);
    // The avatar stands on the Sinkhole at 2,3: lighting it here read as selecting Sinkhole's ability.
    expect(picker().sources).toEqual(["3,3"]);
  });

  it("Observatory shows the next three spells as cards to reorder, never a list of orders", () => {
    const {board,zones} = useGameStore.getState(), site = card("Observatory","obs");
    act(() => { useGameStore.setState({board:{...board,sites:{...board.sites,"3,3":{owner:1,card:site}}},
      zones:{...zones,p1:{...zones.p1,spellbook:[card("Chain Lightning","s1"),card("Gyre Hippogriffs","s2"),card("Highland Clansmen","s3"),card("Lightning Bolt","s4")]}},
      pendingMagic:cast("Observatory",{tile:{x:3,y:3},spell:{at:"3,3",index:-1,owner:1,card:site},cpuEvent:{kind:"genesis",region:"surface",sourceSite:{at:"3,3",name:"Observatory",instanceId:"obs"}}})}); });
    render(<CpuAssistBar />);
    noEffectList();
    const row = screen.getByRole("region",{name:"Card order"});
    const order = () => within(row).getAllByRole("button",{name:/from the top$/}).map(button => button.getAttribute("aria-label"));
    expect(order()).toEqual(["Chain Lightning, 1st from the top","Gyre Hippogriffs, 2nd from the top","Highland Clansmen, 3rd from the top"]);
    // Click two cards to swap them: Highland Clansmen goes on top.
    fireEvent.click(within(row).getByRole("button",{name:"Chain Lightning, 1st from the top"}));
    fireEvent.click(within(row).getByRole("button",{name:"Highland Clansmen, 3rd from the top"}));
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("genesis/2-1-0");
    // An arrow moves one step: Chain Lightning from 3rd to 2nd.
    fireEvent.click(within(row).getByRole("button",{name:"Move Chain Lightning toward the top"}));
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("genesis/2-0-1");
    expect(order()).toEqual(["Highland Clansmen, 1st from the top","Chain Lightning, 2nd from the top","Gyre Hippogriffs, 3rd from the top"]);
    fireEvent.click(screen.getByRole("button",{name:"Confirm"}));
    expect(confirmedWith).toBe("genesis/2-0-1");
    noDropdowns();
  });

  it("a River shows its next spell with Keep on top and Put on bottom", () => {
    const {board,zones} = useGameStore.getState(), site = card("Autumn River","river");
    act(() => { useGameStore.setState({board:{...board,sites:{...board.sites,"3,3":{owner:1,card:site}}},
      zones:{...zones,p1:{...zones.p1,spellbook:[card("Lightning Bolt","s1"),card("Chain Lightning","s2")]}},
      pendingMagic:cast("Autumn River",{tile:{x:3,y:3},spell:{at:"3,3",index:-1,owner:1,card:site},cpuEvent:{kind:"genesis",region:"surface",sourceSite:{at:"3,3",name:"Autumn River",instanceId:"river"}}})}); });
    render(<CpuAssistBar />);
    const row = screen.getByRole("region",{name:"Card order"});
    expect(within(row).getByRole("button",{name:"Lightning Bolt, 1st from the top"})).toBeTruthy();
    noEffectList();
    fireEvent.click(screen.getByRole("button",{name:"Put on bottom"}));
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("genesis/bottom");
    expect(within(row).getByRole("button",{name:"Lightning Bolt, bottom of your spellbook"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Keep on top"}));
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("genesis/0");
    fireEvent.click(screen.getByRole("button",{name:"Put on bottom"}));
    fireEvent.click(screen.getByRole("button",{name:"Confirm"}));
    expect(confirmedWith).toBe("genesis/bottom");
  });

  it("offers Done, Cancel and the rules text for a manual effect without generating choices", () => {
    act(() => { useGameStore.setState({pendingMagic:bolt({spell:{at:"2,3",index:-1,owner:1,card:card("Mountain Giant")}})}); });
    renderCounted(<CpuAssistBar />);
    expect(screen.getByText("Manual effect — resolve it on the board")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Rules"}));
    expect(screen.getByText(cards["Mountain Giant"].rulesText)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Done"}));
    expect(completeCpuMagicManual).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
    expect(cancelMagic).toHaveBeenCalledTimes(1);
    act(() => { useGameStore.setState({permanents:{}}); });
    expect(spellCalls()).toBe(0);
    noDropdowns();
  });
});

describe("CPU assist bar: card rows", () => {
  it("a Lucky Charm re-roll is picked by the damaged unit's card, then confirmed", () => {
    const charm: CardRef = {cardId:0,name:"Lucky Charm",type:"Artifact"};
    realm({"2,1":[unit("Mountain Giant",2,"giant")]},bolt({spell:{at:"2,3",index:-1,owner:1,card:charm},cpuEvent:{kind:"randomChoice",outcomes:[
      {kind:"damage",targets:[{kind:"permanent",at:"2,1",index:0,instanceId:"giant"}],amount:3},{kind:"damage",targets:[{kind:"avatar",seat:"p2"}],amount:3},
    ]}}));
    render(<CpuAssistBar />);
    expect(screen.getByText("· click a card below")).toBeTruthy();
    expect(picker().tiles).toEqual([]);
    noEffectList();
    const row = screen.getByRole("region",{name:"Choose a card"});
    const giant = () => within(row).getByRole("button",{name:"Mountain Giant, 3 damage"});
    const geomancer = () => within(row).getByRole("button",{name:"Geomancer, 3 damage"});
    expect(screen.getByRole("button",{name:"Confirm"}).hasAttribute("disabled")).toBe(true);
    fireEvent.click(giant());
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("random/0");
    expect([pressed(giant()),pressed(geomancer())]).toEqual(["true","false"]);
    fireEvent.click(geomancer());
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("random/1");
    expect([pressed(giant()),pressed(geomancer())]).toEqual(["false","true"]);
    fireEvent.click(screen.getByRole("button",{name:"Confirm"}));
    expect(confirmedWith).toBe("random/1");
    noEffectList();
    noDropdowns();
  });

  it("Raise Dead with a Lucky Charm: the result's card, then the tile, then the layer button", () => {
    const dead = [{card:card("Ogre Goons","dead1"),fromSeat:"p1" as const,graveyardIndex:0},{card:card("Mountain Giant","dead2"),fromSeat:"p2" as const,graveyardIndex:0}];
    realm({},cast("Raise Dead",{cpuRandomMinion:dead[0],cpuRandomMinionOptions:dead}));
    render(<CpuAssistBar />);
    expect(screen.getByText("· click a card below")).toBeTruthy();
    expect(picker().tiles).toEqual([]);
    const row = screen.getByRole("region",{name:"Choose a card"});
    expect(within(row).getAllByRole("button").map(button => button.getAttribute("aria-label"))).toEqual(["Ogre Goons, Result 1","Mountain Giant, Result 2"]);
    fireEvent.click(within(row).getByRole("button",{name:"Mountain Giant, Result 2"}));
    expect(screen.getByText("· click a target")).toBeTruthy();
    expect(tiles()).toContain("0,0");
    click("0,0");
    expect(screen.getByText("· choose on the board")).toBeTruthy();
    expect(tiles()).toEqual(["opt:0,0:surface","opt:0,0:underground"]);
    expect(picker().labels).toMatchObject({"opt:0,0:surface":"Surface","opt:0,0:underground":"Underground"});
    click("opt:0,0:underground");
    expect(cpuChoice()).toBe("p1/outcome-1/0,0/underground");
    expect(pressed(within(row).getByRole("button",{name:"Mountain Giant, Result 2"}))).toBe("true");
    fireEvent.click(screen.getByRole("button",{name:"Confirm"}));
    expect(confirmedWith).toBe("p1/outcome-1/0,0/underground");
    noEffectList();
  });
});

describe("CPU assist bar: token kinds", () => {
  const choice = (key: string, picks: string[], extra: Partial<SpellChoice> = {}): SpellChoice =>
    ({key,label:`Effect ${key}`,caster:{kind:"avatar",seat:"p1"},target:null,operations:[],score:0,picks,...extra});
  /** Synthetic choices for a pending Lightning Bolt, standing in for any generator's token output. */
  const offer = (choices: SpellChoice[]) => {
    vi.mocked(getSpellChoices).mockImplementation(() => choices);
    act(() => { useGameStore.setState({pendingMagic:bolt()}); });
    render(<CpuAssistBar />);
  };

  it.each<[string, string, string[][]]>([
    ["hand cards","click a card in your hand",[["hand:p1:h1"],["hand:p1:h2"]]],
    ["the other seat's hand cards","click a card in their hand",[["hand:p2:h1"],["hand:p2:h2"]]],
    ["piles","click your spellbook or atlas",[["pile:p1:spellbook"],["pile:p1:atlas"]]],
    ["draw splits","click your spellbook or atlas",[["draw:p1:1-0"],["draw:p1:0-1"]]],
    ["anchored buttons","choose on the board",[["opt:2,1:yes"],["opt:2,1:no"]]],
    ["directions","pick a direction",[["dir:2,3:N"],["dir:2,3:E"]]],
    ["board cards","click a card on the board",[["unit:perm:a"],["unit:avatar:p2"]]],
    ["tiles","click a target",[["2,1"],["3,1"]]],
    ["tiles and cards","click a tile or a card on the board",[["2,1"],["unit:perm:a"]]],
  ])("names %s as the next click, with no effect list", (_kind, text, paths) => {
    offer(paths.map((picks,index) => choice(`c${index}`,picks)));
    expect(screen.getByText(`· ${text}`)).toBeTruthy();
    expect(tiles()).toEqual(uniqueSorted(paths.map(path => path[0])));
    noEffectList();
  });

  it("button text from pickLabels reaches the picker, and the clicked button stays lit", () => {
    offer([choice("yes",["opt:2,1:yes"],{pickLabels:{"opt:2,1:yes":"Accept"}}),choice("no",["opt:2,1:no"],{pickLabels:{"opt:2,1:no":"Decline"}})]);
    expect(picker().labels).toEqual({"opt:2,1:yes":"Accept","opt:2,1:no":"Decline"});
    click("opt:2,1:no");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("no");
    expect(picker().glow).toEqual(["opt:2,1:no"]);
    expect(picker().labels).toEqual({"opt:2,1:yes":"Accept","opt:2,1:no":"Decline"});
  });

  it("takes a step for the player when every remaining effect goes through the same lone token", () => {
    offer([choice("a",["unit:perm:crew","2,1"]),choice("b",["unit:perm:crew","3,1"])]);
    expect(screen.getByText("· click the destination")).toBeTruthy();
    expect(tiles()).toEqual(["2,1","3,1"]);
    expect(picker().glow).toEqual(["unit:perm:crew"]);
    click("3,1");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("b");
  });

  it("forces the effect list only as a last resort, when neither a click nor a card tells effects apart", () => {
    offer([choice("a",["2,1"]),choice("b",["2,1"])]);
    expect(screen.getByText("· choose an effect below")).toBeTruthy();
    const list = screen.getByRole("region",{name:"Effects"});
    fireEvent.click(within(list).getByRole("button",{name:"Effect b"}));
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("b");
  });

  it("never shows the face of a card still in the other seat's hand", () => {
    const {zones} = useGameStore.getState();
    act(() => { useGameStore.setState({zones:{...zones,p2:{...zones.p2,hand:[card("Lightning Bolt","secret")]}}}); });
    offer([choice("a",[],{card:{name:"Chain Lightning",cardId:1,instanceId:"secret"},badge:"Discard"}),choice("b",[],{card:{name:"Mountain Giant",cardId:1,instanceId:"giant"},badge:"3 damage"})]);
    const row = screen.getByRole("region",{name:"Choose a card"});
    fireEvent.click(within(row).getByRole("button",{name:"Hidden card, Discard"}));
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("a");
    expect(within(row).queryByText("Chain Lightning")).toBeNull();
    expect(within(row).getByRole("button",{name:"Mountain Giant, 3 damage"})).toBeTruthy();
  });
});

function uniqueSorted(list: string[]) { return [...new Set(list)].sort(); }

describe("CPU assist bar: projectile decisions", () => {
  it("Fireball: units sharing the impact tile are clicked as their cards; the option list only opens on request", () => {
    // Single-location units: an oversized Mountain Giant at 2,1 would also stand in the flight's earlier locations.
    realm({"2,1":[unit("Amazon Warriors",2,"giant"),unit("Ogre Goons",2,"goon")]},cast("Fireball"));
    render(<CpuAssistBar />);
    click("dir:2,3:N");
    expect(cpuChoice()).toBe("p1/N");
    fireEvent.click(screen.getByRole("button",{name:/^Impact 3/}));
    expect(screen.getByText(/· click a card on the board$/)).toBeTruthy();
    expect(tiles()).toEqual(["unit:perm:giant","unit:perm:goon"]);
    expect(screen.queryByRole("region",{name:/^Impact 3/})).toBeNull();
    expect(picker().labels).toMatchObject({"unit:perm:giant":"Amazon Warriors (enemy) at Tile #8"});
    // The list stays available for keyboard players, but never opens by itself.
    fireEvent.click(screen.getByRole("button",{name:"List the options"}));
    const list = screen.getByRole("region",{name:/^Impact 3/});
    expect(within(list).getAllByRole("button",{name:/at Tile #8$/}).map(button => button.textContent)).toEqual(["Amazon Warriors (enemy) at Tile #8","Ogre Goons (enemy) at Tile #8"]);
    click("unit:perm:giant");
    expect(selections()).toEqual(["giant"]);
    expect(screen.queryByRole("region",{name:/^Impact 3/})).toBeNull();
    noDropdowns();
  });

  it("Chain Lightning: each link is clicked as its unit's card, and Stop is a labelled button on the board", () => {
    const {players} = useGameStore.getState();
    act(() => { useGameStore.setState({players:{...players,p1:{...players.p1,mana:10}}}); });
    realm({"2,2":[unit("Ogre Goons",2,"g1")],"2,1":[unit("Mountain Giant",2,"giant"),unit("Ogre Goons",2,"goon")]},cast("Chain Lightning"));
    render(<CpuAssistBar />);
    click("unit:perm:g1");
    expect(cpuChoice()).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:/^After Ogre Goons/}));
    expect(tiles()).toEqual(["opt:2,2:stop","unit:avatar:p1","unit:perm:giant","unit:perm:goon"]);
    expect(screen.getByText(/· click a button or a card on the board$/)).toBeTruthy();
    expect(picker().labels).toMatchObject({"opt:2,2:stop":"Stop the chain"});
    noEffectList();
    click("unit:perm:giant");
    expect(selections()?.[0]).toBe("giant");
    fireEvent.click(screen.getAllByRole("button",{name:/^After Ogre Goons/})[0]);
    click("opt:2,2:stop");
    expect(selections()?.[0]).toBe("stop");
  });
});

describe("CPU assist bar: Escape", () => {
  it("never backs out or cancels while typing or while Escape serves the hand's cleanup", () => {
    // Registered before the bar, like Hand3D's emergency cleanup: it resets the hover state before later listeners run.
    const hand = (event: KeyboardEvent) => { if (event.key === "Escape") useGameStore.setState({handHoverCount:0,mouseInHandZone:false}); };
    window.addEventListener("keydown",hand);
    try {
      realm({"1,2":[unit("Ogre Goons",1,"ally")]},cast("Teleport"));
      render(<><input aria-label="chat" /><CpuAssistBar /></>);
      const input = screen.getByRole("textbox",{name:"chat"});
      input.focus();
      fireEvent.keyDown(input,{key:"Escape"});
      click("unit:perm:ally");
      fireEvent.keyDown(input,{key:"Escape"});
      expect(tiles()).toHaveLength(19);
      input.blur();
      act(() => { useGameStore.setState({handHoverCount:1}); });
      fireEvent.keyDown(window,{key:"Escape"});
      expect(tiles()).toHaveLength(19);
      act(() => { useGameStore.setState({dragFromHand:true}); });
      fireEvent.keyDown(window,{key:"Escape"});
      expect(tiles()).toHaveLength(19);
      act(() => { useGameStore.setState({dragFromHand:false}); });
      expect(cancelMagic).not.toHaveBeenCalled();
      fireEvent.keyDown(window,{key:"Escape"});
      expect(tiles()).toEqual(["unit:avatar:p1","unit:perm:ally"]);
      fireEvent.keyDown(window,{key:"Escape"});
      expect(cancelMagic).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown",hand);
    }
  });
});

describe("CPU assist bar: spell subscriptions", () => {
  it("ignores UI-only store updates and regenerates for realm and selection changes", () => {
    // Single-location units: the default oversized Mountain Giant at 2,1 would stand next to the caster.
    act(() => { useGameStore.setState({pendingMagic:bolt(),permanents:{"2,1":[unit("Amazon Warriors",2,"giant")]}}); });
    renderCounted(<CpuAssistBar />);
    expect(screen.getByText("· click a target")).toBeTruthy();
    expect(spellCalls()).toBe(1);
    const mounted = renders;
    applyUiUpdates();
    expect(spellCalls()).toBe(1);
    expect(renders).toBe(mounted);
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Amazon Warriors",2,"giant2")]}}); });
    expect(spellCalls()).toBe(2);
    // These units are not bolt targets here: only the two avatars' tiles are.
    expect(tiles()).toEqual(["2,0","2,3"]);
    vi.mocked(getSpellChoices).mockClear();
    click("2,0");
    // The new selection key reaches the generator (projectile plans depend on it).
    const key = useGameStore.getState().pendingMagic?.cpuChoice;
    expect(key).toBe("p1/2,0");
    expect(spellCalls()).toBe(1);
    expect(vi.mocked(getSpellChoices).mock.calls[0][3]).toBe(key);
  });

  it("shows another seat's choice as a label without generating before that choice is announced", () => {
    act(() => { useGameStore.setState({actorKey:"p2",pendingMagic:bolt()}); });
    renderCounted(<CpuAssistBar />);
    expect(screen.getByText("Choosing…")).toBeTruthy();
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Mountain Giant",2,"giant2")]}}); });
    applyUiUpdates();
    expect(spellCalls()).toBe(0);
    expect(picker().tiles).toEqual([]);
    const choice = getSpellChoices(useGameStore.getState(),"p1","Lightning Bolt")[0];
    vi.mocked(getSpellChoices).mockClear();
    act(() => { useGameStore.setState({pendingMagic:bolt({cpuChoice:choice.key,status:"confirm"})}); });
    expect(spellCalls()).toBe(1);
    expect(screen.getByText(`${choice.label} — Resolving…`)).toBeTruthy();
    expect(picker().tiles).toEqual([]);
    expect(screen.queryByRole("button")).toBeNull();
    noDropdowns();
  });
});

const chips = () => screen.queryAllByRole("button",{name:/^Sinkhole abilities/});
const resolveButton = () => screen.queryByRole("button",{name:"Resolve"});
const pickedSource = () => useCpuAbilityPicker.getState().picked;
const pickSinkhole = () => act(() => { useCpuAbilityPicker.getState().pick("m1:ability:3:1","Sinkhole@2,3"); });
const silenceSinkhole = () => act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"2,3":[{owner:1,card:{cardId:0,name:"Silenced",type:"Token"},instanceId:"silence",tapped:false}]}}); });

describe("CPU assist bar: activated abilities", () => {
  it("opens nothing until a source button is clicked, then clicks the target tile and resolves", () => {
    render(<><CpuAbilityButtons /><CpuAssistBar /></>);
    expect(chips()).toHaveLength(1);
    expect(resolveButton()).toBeNull();
    expect(screen.queryByRole("button",{name:"Back"})).toBeNull();
    expect(picker().sources).toEqual([]);
    expect(picker().tiles).toEqual([]);
    expect(pickedSource()).toBeNull();
    expect(useGameStore.getState().selectedPermanent).toBeFalsy();
    fireEvent.click(chips()[0]);
    expect(tiles()).toEqual(["2,2","2,3"]);
    click("2,2");
    expect(screen.getByText("Sinkhole: destroy the site at Tile #13, then sacrifice Sinkhole")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Resolve"}));
    expect(activateCpuAbility).toHaveBeenCalledWith("sinkhole/Sinkhole/2,2");
    expect(pickedSource()).toBeNull();
    expect(resolveButton()).toBeNull();
    expect(chips()).toHaveLength(1);
    expect(picker().tiles).toEqual([]);
    noDropdowns();
  });

  it("targets a pick set through the shared store; Back and a stale source clear it", () => {
    render(<CpuAssistBar />);
    expect(screen.queryByRole("button")).toBeNull();
    pickSinkhole();
    expect(resolveButton()).toBeTruthy();
    expect(tiles()).toEqual(["2,2","2,3"]);
    fireEvent.click(screen.getByRole("button",{name:"Back"}));
    expect(pickedSource()).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    pickSinkhole();
    expect(resolveButton()).toBeTruthy();
    // Silencing the Sinkhole removes its only abilities: the pick must not linger and come back later.
    silenceSinkhole();
    expect(pickedSource()).toBeNull();
    expect(resolveButton()).toBeNull();
    expect(picker().tiles).toEqual([]);
  });

  it("clears the pick when the turn changes", () => {
    render(<CpuAssistBar />);
    pickSinkhole();
    act(() => { useGameStore.setState({turn:4}); });
    expect(resolveButton()).toBeNull();
    expect(pickedSource()).toBeNull();
  });

  it("ignores UI-only store updates and generates once for both consumers when the realm changes", () => {
    renderCounted(<><CpuAbilityButtons /><CpuAssistBar /></>);
    expect(chips()).toHaveLength(1);
    expect(abilityCalls()).toBe(1);
    const mounted = renders;
    applyUiUpdates();
    expect(abilityCalls()).toBe(1);
    expect(renders).toBe(mounted);
    silenceSinkhole();
    expect(abilityCalls()).toBe(2);
    expect(chips()).toHaveLength(0);
    expect(screen.getByRole("button",{name:"Abilities"}).hasAttribute("disabled")).toBe(true);
  });

  it.each<[string, Partial<GameState>]>([
    ["the opponent's turn",{currentPlayer:2}],
    ["another phase",{phase:"Draw"}],
    ["a pending trigger choice",{cpuTriggerOptions:[{id:"trigger",label:"Genesis"}]}],
    ["queued triggers",{cpuPendingTriggerCount:1}],
    ["pending combat",{pendingCombat:{id:"c",tile:{x:2,y:1},attacker:{at:"2,1",index:0,owner:2},defenderSeat:"p1",defenders:[],status:"declared",createdAt:1}}],
    ["the end of the match",{matchEnded:true}],
  ])("does not generate abilities during %s", (_label, inactive) => {
    act(() => { useGameStore.setState(inactive); });
    renderCounted(<><CpuAbilityButtons /><CpuAssistBar /></>);
    expect(chips()).toHaveLength(0);
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Mountain Giant",2,"giant2")]}}); });
    applyUiUpdates();
    expect(abilityCalls()).toBe(0);
    if (inactive.cpuTriggerOptions) expect(screen.getByRole("button",{name:"Genesis"})).toBeTruthy();
  });

  it("generates as soon as the human's Main phase begins", () => {
    act(() => { useGameStore.setState({currentPlayer:2}); });
    renderCounted(<><CpuAbilityButtons /><CpuAssistBar /></>);
    expect(abilityCalls()).toBe(0);
    act(() => { useGameStore.setState({currentPlayer:1}); });
    expect(abilityCalls()).toBe(1);
    expect(chips()).toHaveLength(1);
  });
});

describe("CPU assist bar: combat HUD top slot", () => {
  const attacker = {at:"2,2",index:0,owner:1 as const};

  it("gives way to the attack-choice bars, which precede pendingCombat", () => {
    render(<><CpuAbilityButtons /><CpuAssistBar /></>);
    act(() => { useGameStore.setState({attackChoice:{tile:{x:2,y:1},attacker,attackerName:"Ogre Goons"}}); });
    expect(chips()[0].hasAttribute("disabled")).toBe(true);
    fireEvent.click(chips()[0]);
    expect(pickedSource()).toBeNull();
    expect(picker().sources).toEqual([]);
    act(() => { useGameStore.setState({attackChoice:null}); });
    fireEvent.click(chips()[0]);
    expect(tiles()).toEqual(["2,2","2,3"]);
    act(() => { useGameStore.setState({attackConfirm:{tile:{x:2,y:1},attacker,target:{kind:"site",at:"2,1",index:null},targetLabel:"Lone Tower"}}); });
    expect(picker().tiles).toEqual([]);
    expect(picker().sources).toEqual([]);
    expect(resolveButton()).toBeNull();
    // Escape belongs to the combat bar while it is open: the ability pick survives it.
    fireEvent.keyDown(window,{key:"Escape"});
    expect(pickedSource()).toBe("Sinkhole@2,3");
    act(() => { useGameStore.setState({attackConfirm:null,attackTargetChoice:{tile:{x:2,y:1},attacker,candidates:[]}}); });
    expect(resolveButton()).toBeNull();
    act(() => { useGameStore.setState({attackTargetChoice:null}); });
    expect(tiles()).toEqual(["2,2","2,3"]);
    expect(resolveButton()).toBeTruthy();
  });
});

describe("CPU assist bar: ability Escape", () => {
  it("leaves targeting, but never while typing or while the hand is hovered", () => {
    render(<><input aria-label="chat" /><CpuAssistBar /></>);
    pickSinkhole();
    const input = screen.getByRole("textbox",{name:"chat"});
    input.focus();
    fireEvent.keyDown(input,{key:"Escape"});
    expect(pickedSource()).toBe("Sinkhole@2,3");
    input.blur();
    act(() => { useGameStore.setState({handHoverCount:1}); });
    fireEvent.keyDown(window,{key:"Escape"});
    expect(pickedSource()).toBe("Sinkhole@2,3");
    act(() => { useGameStore.setState({handHoverCount:0}); });
    fireEvent.keyDown(window,{key:"Escape"});
    expect(pickedSource()).toBeNull();
    expect(resolveButton()).toBeNull();
  });
});

describe("CPU board layer", () => {
  const plane = (tile: string) => document.querySelector(`mesh[name="cpu-pick:${tile}"]`);
  // react-dom warns about the three.js intrinsics (<mesh>, renderOrder, ...); the handlers and structure are what matter here.
  let quiet: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { quiet = vi.spyOn(console,"error").mockImplementation(() => undefined); vi.mocked(useFrame).mockClear(); });
  afterEach(() => { quiet.mockRestore(); });

  it("commits a pick on click, so the plane still swallows the gesture after the press", () => {
    realm({"1,2":[unit("Ogre Goons",1,"ally")]},cast("Teleport"));
    render(<><CpuAssistBar /><CpuFieldTargets offsetX={0} offsetY={0} /></>);
    // The ally is a board card (PermanentStack draws its pick); the destinations are tile planes.
    click("unit:perm:ally");
    const pressedPlane = plane("0,0");
    if (!pressedPlane) throw new Error("no capture plane on 0,0");
    fireEvent.pointerDown(pressedPlane);
    fireEvent.pointerUp(pressedPlane);
    expect(picker().selected).toBeNull();
    expect(plane("0,0")).toBe(pressedPlane);
    expect(setCpuMagicChoice).not.toHaveBeenCalled();
    fireEvent.click(pressedPlane);
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("p1/1,2:0/0,0");
    expect(plane("0,0")).toBeNull();
    expect(plane("1,0")).toBeNull();
  });

  it("lights a source only while its button is hovered or picked, and pulses only while a tile awaits a click", () => {
    render(<><CpuAbilityButtons /><CpuAssistBar /><CpuFieldTargets offsetX={0} offsetY={0} /></>);
    expect(picker().sources).toEqual([]);
    expect(document.querySelectorAll("mesh")).toHaveLength(0);
    fireEvent.pointerEnter(chips()[0]);
    expect(picker().sources).toEqual(["2,3"]);
    expect(document.querySelectorAll("mesh")).toHaveLength(1);
    expect(plane("2,3")).toBeNull();
    expect(useFrame).not.toHaveBeenCalled();
    fireEvent.pointerLeave(chips()[0]);
    expect(picker().sources).toEqual([]);
    fireEvent.click(chips()[0]);
    expect(plane("2,2")).toBeTruthy();
    expect(useFrame).toHaveBeenCalled();
    const clicked = plane("2,2");
    if (!clicked) throw new Error("no capture plane on 2,2");
    fireEvent.click(clicked);
    // The chosen target and the source stay lit without a pulse: re-render the layer and no frame loop registers.
    expect(picker().glow).toEqual(["2,2"]);
    expect(picker().sources).toEqual(["2,3"]);
    vi.mocked(useFrame).mockClear();
    act(() => { useCpuBoardPicker.setState({glow:[...picker().glow]}); });
    expect(document.querySelectorAll("mesh")).toHaveLength(2);
    expect(document.querySelectorAll("mesh[name]")).toHaveLength(0);
    expect(useFrame).not.toHaveBeenCalled();
  });
});

describe("CPU assist bar: trigger ordering", () => {
  const trigger = (id: string, name: keyof typeof cards, badge: string) =>
    ({id,label:`${name} — ${badge}`,card:{name,slug:null,cardId:1,instanceId:`${id}-card`,type:cards[name].type},badge});

  it("shows the triggering cards under the bar and resolves the one clicked next", () => {
    act(() => { useGameStore.setState({cpuTriggerOptions:[trigger("t1","Spring River","Genesis"),trigger("t2","Thunderstorm","duration counter")]}); });
    render(<CpuAssistBar />);
    expect(screen.getByText("Choose the next trigger to resolve")).toBeTruthy();
    const row = screen.getByRole("region",{name:"Triggers"});
    expect(within(row).getAllByRole("button",{name:/, /}).map(button => button.getAttribute("aria-label"))).toEqual(["Spring River, Genesis","Thunderstorm, duration counter"]);
    expect(within(row).getByText("duration counter")).toBeTruthy();
    fireEvent.click(within(row).getByRole("button",{name:"Thunderstorm, duration counter"}));
    expect(chooseCpuTrigger).toHaveBeenCalledWith("t2");
    noDropdowns();
  });

  it("can be dismissed, which resolves the triggers in the listed order", () => {
    act(() => { useGameStore.setState({cpuTriggerOptions:[trigger("t1","Arid Desert","Genesis"),trigger("t2","Autumn River","Genesis")]}); });
    render(<CpuAssistBar />);
    fireEvent.click(screen.getByRole("button",{name:"Close Triggers"}));
    expect(chooseCpuTrigger).toHaveBeenCalledWith(CPU_TRIGGERS_IN_ORDER);
    chooseCpuTrigger.mockClear();
    fireEvent.keyDown(window,{key:"Escape"});
    expect(chooseCpuTrigger).toHaveBeenCalledWith(CPU_TRIGGERS_IN_ORDER);
    expect(chooseCpuTrigger).not.toHaveBeenCalledWith("t1");
  });
});
