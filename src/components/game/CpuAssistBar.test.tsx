import { useFrame } from "@react-three/fiber";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React, { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CpuAssistBar from "@/components/game/CpuAssistBar";
import CpuFieldTargets from "@/lib/game/components/CpuFieldTargets";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import cards from "@/lib/game/cpu/cards.json";
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

describe("CPU assist bar: activated abilities", () => {
  const chips = () => screen.queryAllByRole("button",{name:/^Sinkhole abilities/});

  it("taps a source chip, clicks the target tile and resolves", () => {
    render(<CpuAssistBar />);
    expect(picker().sources).toEqual(["2,3"]);
    expect(picker().tiles).toEqual([]);
    fireEvent.click(chips()[0]);
    expect(tiles()).toEqual(["2,2","2,3"]);
    click("2,2");
    expect(screen.getByText("Sinkhole: destroy the site at Tile #13, then sacrifice Sinkhole")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Resolve"}));
    expect(activateCpuAbility).toHaveBeenCalledWith("sinkhole/Sinkhole/2,2");
    expect(chips()).toHaveLength(1);
    expect(picker().tiles).toEqual([]);
    noDropdowns();
  });

  it("ignores UI-only store updates and regenerates when the realm changes", () => {
    renderCounted(<CpuAssistBar />);
    expect(chips()).toHaveLength(1);
    expect(abilityCalls()).toBe(1);
    const mounted = renders;
    applyUiUpdates();
    expect(abilityCalls()).toBe(1);
    expect(renders).toBe(mounted);
    // Silencing the Sinkhole removes its only abilities: the bar must not keep stale choices.
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"2,3":[{owner:1,card:{cardId:0,name:"Silenced",type:"Token"},instanceId:"silence",tapped:false}]}}); });
    expect(abilityCalls()).toBe(2);
    expect(chips()).toHaveLength(0);
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
    renderCounted(<CpuAssistBar />);
    expect(chips()).toHaveLength(0);
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Mountain Giant",2,"giant2")]}}); });
    applyUiUpdates();
    expect(abilityCalls()).toBe(0);
    if (inactive.cpuTriggerOptions) expect(screen.getByRole("button",{name:"Genesis"})).toBeTruthy();
  });

  it("generates as soon as the human's Main phase begins", () => {
    act(() => { useGameStore.setState({currentPlayer:2}); });
    renderCounted(<CpuAssistBar />);
    expect(abilityCalls()).toBe(0);
    act(() => { useGameStore.setState({currentPlayer:1}); });
    expect(abilityCalls()).toBe(1);
    expect(chips()).toHaveLength(1);
  });
});

describe("CPU assist bar: combat HUD top slot", () => {
  const chips = () => screen.queryAllByRole("button",{name:/^Sinkhole abilities/});
  const attacker = {at:"2,2",index:0,owner:1 as const};

  it("gives way to the attack-choice bars, which precede pendingCombat", () => {
    render(<CpuAssistBar />);
    expect(chips()).toHaveLength(1);
    act(() => { useGameStore.setState({attackChoice:{tile:{x:2,y:1},attacker,attackerName:"Ogre Goons"}}); });
    expect(chips()).toHaveLength(0);
    expect(picker().sources).toEqual([]);
    expect(screen.queryByRole("button")).toBeNull();
    act(() => { useGameStore.setState({attackChoice:null}); });
    expect(chips()).toHaveLength(1);
    expect(picker().sources).toEqual(["2,3"]);
    fireEvent.click(chips()[0]);
    expect(tiles()).toEqual(["2,2","2,3"]);
    act(() => { useGameStore.setState({attackConfirm:{tile:{x:2,y:1},attacker,target:{kind:"site",at:"2,1",index:null},targetLabel:"Lone Tower"}}); });
    expect(picker().tiles).toEqual([]);
    expect(screen.queryByRole("button",{name:"Resolve"})).toBeNull();
    fireEvent.keyDown(window,{key:"Escape"});
    act(() => { useGameStore.setState({attackConfirm:null,attackTargetChoice:{tile:{x:2,y:1},attacker,candidates:[]}}); });
    expect(screen.queryByRole("button")).toBeNull();
    act(() => { useGameStore.setState({attackTargetChoice:null}); });
    expect(tiles()).toEqual(["2,2","2,3"]);
  });
});

describe("CPU board layer", () => {
  const chips = () => screen.queryAllByRole("button",{name:/^Sinkhole abilities/});
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

  it("keeps idle ability sources static and pulses only while a tile awaits a click", () => {
    render(<><CpuAssistBar /><CpuFieldTargets offsetX={0} offsetY={0} /></>);
    expect(picker().sources).toEqual(["2,3"]);
    expect(document.querySelectorAll("mesh")).toHaveLength(1);
    expect(plane("2,3")).toBeNull();
    expect(useFrame).not.toHaveBeenCalled();
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

describe("CPU assist bar: hiding abilities", () => {
  const chips = () => screen.queryAllByRole("button",{name:/^Sinkhole abilities/});
  const hide = () => fireEvent.click(screen.getByRole("button",{name:"Hide abilities for this turn"}));
  const addSinkhole = () => act(() => {
    const {board} = useGameStore.getState();
    useGameStore.setState({board:{...board,sites:{...board.sites,"1,3":{owner:1,card:card("Sinkhole","sinkhole2")}}}});
  });

  it("collapses to a Show abilities pill and stays hidden while the same sources offer abilities", () => {
    render(<CpuAssistBar />);
    hide();
    expect(chips()).toHaveLength(0);
    expect(picker().sources).toEqual([]);
    // A realm change that adds no ability source keeps the chips hidden.
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Mountain Giant",2,"giant2")]}}); });
    expect(chips()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button",{name:"Show abilities"}));
    expect(chips()).toHaveLength(1);
    expect(screen.queryByRole("button",{name:"Show abilities"})).toBeNull();
  });

  it("reopens when a new ability source appears or the turn changes", () => {
    render(<CpuAssistBar />);
    hide();
    addSinkhole();
    expect(chips()).toHaveLength(2);
    hide();
    expect(chips()).toHaveLength(0);
    act(() => { useGameStore.setState({turn:4}); });
    expect(chips()).toHaveLength(2);
    noDropdowns();
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
});
