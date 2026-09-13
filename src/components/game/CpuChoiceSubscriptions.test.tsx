import { act, cleanup, render, screen } from "@testing-library/react";
import React, { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CpuAbilityChoices from "@/components/game/CpuAbilityChoices";
import CpuMagicChoices from "@/components/game/CpuMagicChoices";
import { abilityChoices } from "@/lib/game/cpu/abilities";
import cards from "@/lib/game/cpu/cards.json";
import { getSpellChoices } from "@/lib/game/cpu/spells";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PendingMagic, PermanentItem } from "@/lib/game/store/types";

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

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, owner: 1 | 2, id: string): PermanentItem => ({owner,card:card(name,id),instanceId:id,tapped:false});
const initial = useGameStore.getState();
const abilityCalls = () => vi.mocked(abilityChoices).mock.calls.length;
const spellCalls = () => vi.mocked(getSpellChoices).mock.calls.length;
const bolt = (overrides: Partial<PendingMagic> = {}): PendingMagic => ({id:"mag1",tile:{x:2,y:3},spell:{at:"2,3",index:-1,owner:1,card:card("Lightning Bolt")},status:"choosingTarget",createdAt:1,...overrides});
// UI-only updates that happen constantly while the human hovers and selects.
const uiUpdates: Partial<GameState>[] = [
  {hoverCell:[1,1]},{previewCard:card("Mountain Giant")},{selectedPermanent:{at:"2,1",index:0}},{handHoverCount:2},{hoverCell:null},{previewCard:null},{selectedPermanent:null},
];
let renders = 0;
function renderCounted(ui: React.ReactElement) {
  render(<Profiler id="cpu-choices" onRender={() => { renders++; }}>{ui}</Profiler>);
}
function applyUiUpdates() {
  for (const update of uiUpdates) act(() => { useGameStore.setState(update); });
}

beforeEach(() => {
  vi.stubGlobal("React",React);
  useGameStore.setState(initial,true);
  useGameStore.setState({
    opponentPlayerId:"cpu_test",actorKey:"p1",matchId:"m1",phase:"Main",currentPlayer:1,turn:3,matchEnded:false,
    pendingMagic:null,pendingCombat:null,cpuTriggerOptions:[],cpuPendingTriggerCount:0,cpuEffectContinuations:[],
    board:{size:{w:5,h:4},sites:{"2,3":{owner:1,card:card("Sinkhole")},"2,2":{owner:2,card:card("Spring River")}}},
    permanents:{"2,1":[unit("Mountain Giant",2,"giant")]},permanentPositions:{},
    avatars:{...initial.avatars,p1:{card:card("Flamecaller"),pos:[2,3],tapped:false},p2:{card:card("Geomancer"),pos:[2,0],tapped:false}},
    setCpuMagicChoice:vi.fn(),activateCpuAbility:vi.fn(),chooseCpuTrigger:vi.fn(),cancelMagic:vi.fn(),confirmMagic:vi.fn(),completeCpuMagicManual:vi.fn(),
  });
  renders = 0;
  vi.mocked(abilityChoices).mockClear();
  vi.mocked(getSpellChoices).mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CPU ability picker subscriptions", () => {
  it("ignores UI-only store updates and regenerates when the realm changes", () => {
    renderCounted(<CpuAbilityChoices />);
    expect(screen.getByText("Activated abilities")).toBeTruthy();
    expect(abilityCalls()).toBe(1);
    const mounted = renders;
    applyUiUpdates();
    expect(abilityCalls()).toBe(1);
    expect(renders).toBe(mounted);
    // Silencing the Sinkhole removes its only abilities: the picker must not keep stale choices.
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"2,3":[{owner:1,card:{cardId:0,name:"Silenced",type:"Token"},instanceId:"silence",tapped:false}]}}); });
    expect(abilityCalls()).toBe(2);
    expect(screen.queryByText("Activated abilities")).toBeNull();
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
    renderCounted(<CpuAbilityChoices />);
    expect(screen.queryByText("Activated abilities")).toBeNull();
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Mountain Giant",2,"giant2")]}}); });
    applyUiUpdates();
    expect(abilityCalls()).toBe(0);
    if (inactive.cpuTriggerOptions) expect(screen.getByRole("button",{name:"Genesis"})).toBeTruthy();
  });

  it("generates as soon as the human's Main phase begins", () => {
    act(() => { useGameStore.setState({currentPlayer:2}); });
    renderCounted(<CpuAbilityChoices />);
    expect(abilityCalls()).toBe(0);
    act(() => { useGameStore.setState({currentPlayer:1}); });
    expect(abilityCalls()).toBe(1);
    expect(screen.getByText("Activated abilities")).toBeTruthy();
  });
});

describe("CPU spell picker subscriptions", () => {
  it("ignores UI-only store updates and regenerates for realm and pending-spell changes", () => {
    act(() => { useGameStore.setState({pendingMagic:bolt()}); });
    renderCounted(<CpuMagicChoices />);
    expect(screen.getByText("Spellcaster and effect")).toBeTruthy();
    expect(spellCalls()).toBe(1);
    const mounted = renders;
    applyUiUpdates();
    expect(spellCalls()).toBe(1);
    expect(renders).toBe(mounted);
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Mountain Giant",2,"giant2")]}}); });
    expect(spellCalls()).toBe(2);
    const choice = getSpellChoices(useGameStore.getState(),"p1","Lightning Bolt")[0];
    vi.mocked(getSpellChoices).mockClear();
    act(() => { useGameStore.setState({pendingMagic:bolt({cpuChoice:choice.key})}); });
    // The new selection key reaches the generator (projectile plans depend on it).
    expect(spellCalls()).toBe(1);
    expect(vi.mocked(getSpellChoices).mock.calls[0][3]).toBe(choice.key);
  });

  it("shows another seat's choice without generating before that choice is announced", () => {
    act(() => { useGameStore.setState({actorKey:"p2",pendingMagic:bolt()}); });
    renderCounted(<CpuMagicChoices />);
    expect(screen.getByText("Choosing a spellcaster and effect…")).toBeTruthy();
    act(() => { useGameStore.setState({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Mountain Giant",2,"giant2")]}}); });
    applyUiUpdates();
    expect(spellCalls()).toBe(0);
    const choice = getSpellChoices(useGameStore.getState(),"p1","Lightning Bolt")[0];
    vi.mocked(getSpellChoices).mockClear();
    act(() => { useGameStore.setState({pendingMagic:bolt({cpuChoice:choice.key,status:"confirm"})}); });
    expect(spellCalls()).toBe(1);
    expect(screen.getByText(`${choice.label} — Resolving…`)).toBeTruthy();
  });

  it("does not generate choices for a manual effect", () => {
    act(() => { useGameStore.setState({pendingMagic:bolt({spell:{at:"2,3",index:-1,owner:1,card:card("Mountain Giant")}})}); });
    renderCounted(<CpuMagicChoices />);
    expect(screen.getByText("I have resolved the effect")).toBeTruthy();
    act(() => { useGameStore.setState({permanents:{}}); });
    expect(spellCalls()).toBe(0);
  });
});
