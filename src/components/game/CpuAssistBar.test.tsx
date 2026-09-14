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
import { CPU_TRIGGERS_IN_ORDER } from "@/lib/game/cpu/spellTypes";
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
const click = (tile: string) => act(() => { picker().select(tile); });
const noDropdowns = () => { expect(document.querySelector("select")).toBeNull(); expect(screen.queryByRole("combobox")).toBeNull(); expect(screen.queryByRole("listbox")).toBeNull(); };
const cpuChoice = () => useGameStore.getState().pendingMagic?.cpuChoice;
/** The projectile selections encoded in the current key (projectileKey appends them as URI-encoded JSON). */
const selections = () => { const key = cpuChoice(); return key?.includes("|") ? JSON.parse(decodeURIComponent(key.slice(key.indexOf("|")+1))) as string[] : null; };

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
  useCpuBoardPicker.setState({request:"",tiles:[],selected:null,glow:[],sources:[]});
  useCpuAbilityPicker.setState({request:"",picked:null,hovered:null});
  window.sessionStorage.clear();
  renders = 0;
  vi.mocked(abilityChoices).mockClear();
  vi.mocked(getSpellChoices).mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CPU assist bar: own spells", () => {
  it("Fireball: click the caster, then a tile along the flight, then confirm", () => {
    realm({"2,1":[unit("Ogre Goons",2,"goon")],"4,3":[unit("Apprentice Wizard",1,"wiz")]},cast("Fireball"));
    render(<CpuAssistBar />);
    expect(screen.getByText("· click who casts")).toBeTruthy();
    expect(tiles()).toEqual(["2,3","4,3"]);
    click("2,3");
    expect(screen.getByText("· click a target")).toBeTruthy();
    // The avatar's flights north, east and west; south leaves the board at once.
    expect(tiles()).toEqual(["0,3","1,3","2,0","2,1","2,2","3,3","4,3"]);
    expect(picker().sources).toEqual(["2,3"]);
    expect(setCpuMagicChoice).not.toHaveBeenCalled();
    click("2,1");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("p1/N");
    expect(picker().tiles).toEqual([]);
    expect([...picker().glow].sort()).toEqual(["2,0","2,1","2,2"]);
    expect(screen.getByText(/^Flamecaller: shoot N/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Confirm"}));
    expect(confirmMagic).toHaveBeenCalledTimes(1);
    expect(confirmedWith).toBe("p1/N");
    noDropdowns();
  });

  it("Teleport narrows by the ally, then by the destination, and steps back", () => {
    realm({"1,2":[unit("Ogre Goons",1,"ally")]},cast("Teleport"));
    render(<CpuAssistBar />);
    expect(tiles()).toEqual(["1,2","2,3"]);
    click("1,2");
    expect(screen.getByText("· click the destination")).toBeTruthy();
    expect(tiles()).toHaveLength(19);
    expect(tiles()).not.toContain("1,2");
    expect(picker().glow).toEqual(["1,2"]);
    click("0,0");
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("p1/1,2:0/0,0");
    expect(screen.getByText("Flamecaller: Move Ogre Goons to Tile #1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Back"}));
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("");
    expect(tiles()).toHaveLength(19);
    fireEvent.keyDown(window,{key:"Escape"});
    expect(tiles()).toEqual(["1,2","2,3"]);
    expect(cancelMagic).not.toHaveBeenCalled();
    noDropdowns();
  });

  it("lists the effects that share a clicked tile", () => {
    realm({"2,1":[unit("Ogre Goons",2,"goon"),unit("Apprentice Wizard",2,"wiz")],"3,1":[unit("Ogre Goons",2,"goon2")]},cast("Bury"));
    render(<CpuAssistBar />);
    expect(tiles()).toEqual(["2,1","3,1"]);
    expect(screen.queryByRole("region",{name:"Effects"})).toBeNull();
    click("2,1");
    const list = screen.getByRole("region",{name:"Effects"});
    expect(within(list).getAllByRole("button").map(button => button.textContent)).toEqual(["Flamecaller: Burrow Ogre Goons","Flamecaller: Burrow Apprentice Wizard"]);
    fireEvent.click(within(list).getByRole("button",{name:"Flamecaller: Burrow Apprentice Wizard"}));
    expect(setCpuMagicChoice).toHaveBeenLastCalledWith("p1/2,1/1");
    expect(screen.queryByRole("region",{name:"Effects"})).toBeNull();
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

describe("CPU assist bar: projectile decisions", () => {
  it("Fireball: units sharing the impact tile are picked from the list, never by a tile click", () => {
    realm({"2,1":[unit("Mountain Giant",2,"giant"),unit("Ogre Goons",2,"goon")]},cast("Fireball"));
    render(<CpuAssistBar />);
    click("2,1");
    expect(cpuChoice()).toBe("p1/N");
    fireEvent.click(screen.getByRole("button",{name:/^Impact 3/}));
    expect(screen.getByText(/· pick below$/)).toBeTruthy();
    expect(picker().tiles).toEqual([]);
    click("2,1");
    expect(cpuChoice()).toBe("p1/N");
    fireEvent.click(screen.getByRole("button",{name:"Mountain Giant (enemy) at Tile #8"}));
    expect(selections()).toEqual(["giant"]);
    noDropdowns();
  });

  it("Chain Lightning: a tile click names the next link only where it stands alone", () => {
    const {players} = useGameStore.getState();
    act(() => { useGameStore.setState({players:{...players,p1:{...players.p1,mana:10}}}); });
    realm({"2,2":[unit("Ogre Goons",2,"g1")],"2,1":[unit("Mountain Giant",2,"giant"),unit("Ogre Goons",2,"goon")]},cast("Chain Lightning"));
    render(<CpuAssistBar />);
    click("2,2");
    const base = cpuChoice();
    fireEvent.click(screen.getByRole("button",{name:/^After Ogre Goons/}));
    const options = getSpellChoices(useGameStore.getState(),"p1","Chain Lightning",base).find(choice => choice.projectile?.baseKey === base)?.projectile?.decisions[0].options ?? [];
    expect(options.filter(option => option.label.includes("Tile #8")).map(option => option.at)).toEqual([undefined,undefined]);
    expect(tiles()).toEqual(options.flatMap(option => option.at ? [option.at] : []).sort());
    expect(tiles()).not.toContain("2,1");
    const lone = options.find(option => option.at === tiles()[0]);
    click("2,1");
    expect(selections()?.[0]).not.toBe("giant");
    click(tiles()[0]);
    expect(lone?.key).toBeTruthy();
    expect(selections()?.[0]).toBe(lone?.key);
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
      click("1,2");
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
      expect(tiles()).toEqual(["1,2","2,3"]);
      fireEvent.keyDown(window,{key:"Escape"});
      expect(cancelMagic).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown",hand);
    }
  });
});

describe("CPU assist bar: spell subscriptions", () => {
  it("ignores UI-only store updates and regenerates for realm and selection changes", () => {
    act(() => { useGameStore.setState({pendingMagic:bolt()}); });
    renderCounted(<CpuAssistBar />);
    expect(screen.getByText("· click a target")).toBeTruthy();
    expect(spellCalls()).toBe(1);
    const mounted = renders;
    applyUiUpdates();
    expect(spellCalls()).toBe(1);
    expect(renders).toBe(mounted);
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Mountain Giant",2,"giant2")]}}); });
    expect(spellCalls()).toBe(2);
    // Mountain Giants are not bolt targets here: only the two avatars' tiles are.
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
    const pressed = plane("1,2");
    if (!pressed) throw new Error("no capture plane on 1,2");
    fireEvent.pointerDown(pressed);
    fireEvent.pointerUp(pressed);
    expect(picker().selected).toBeNull();
    expect(plane("1,2")).toBe(pressed);
    expect(screen.queryByText("· click the destination")).toBeNull();
    fireEvent.click(pressed);
    expect(screen.getByText("· click the destination")).toBeTruthy();
    expect(plane("1,2")).toBeNull();
    expect(plane("0,0")).toBeTruthy();
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
  it("lists the trigger options under the bar and resolves the chosen one", () => {
    act(() => { useGameStore.setState({cpuTriggerOptions:[{id:"t1",label:"Spring River: Genesis"},{id:"t2",label:"Sinkhole: Genesis"}]}); });
    render(<CpuAssistBar />);
    expect(screen.getByText("Choose the next trigger to resolve")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Sinkhole: Genesis"}));
    expect(chooseCpuTrigger).toHaveBeenCalledWith("t2");
    noDropdowns();
  });
  it("can be dismissed, which resolves the triggers in the listed order", () => {
    act(() => { useGameStore.setState({cpuTriggerOptions:[{id:"t1",label:"Arid Desert — Genesis"},{id:"t2",label:"Red Desert — Genesis"}]}); });
    render(<CpuAssistBar />);
    fireEvent.click(screen.getByRole("button",{name:"Close Triggers"}));
    expect(chooseCpuTrigger).toHaveBeenCalledWith(CPU_TRIGGERS_IN_ORDER);
    chooseCpuTrigger.mockClear();
    fireEvent.keyDown(window,{key:"Escape"});
    expect(chooseCpuTrigger).toHaveBeenCalledWith(CPU_TRIGGERS_IN_ORDER);
  });
});
