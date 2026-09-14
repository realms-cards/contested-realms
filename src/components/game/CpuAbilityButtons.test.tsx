import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CpuAbilityButtons from "@/components/game/CpuAbilityButtons";
import CpuAssistBar from "@/components/game/CpuAssistBar";
import { soundManager } from "@/lib/audio/soundManager";
import { useCpuAbilityPicker } from "@/lib/game/cpu/abilityPicker";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import cards from "@/lib/game/cpu/cards.json";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, GameState, PermanentItem } from "@/lib/game/store/types";

// A plain store copy without the CPU controller subscription, so test states stay as written.
vi.mock("@/lib/game/store", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/game/store")>();
  const { create } = await import("zustand");
  return {...actual,useGameStore:create<GameState>()(() => actual.useGameStore.getState())};
});
vi.mock("@/lib/audio/soundManager", () => ({soundManager:{play:vi.fn()}}));

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const unit = (name: keyof typeof cards, owner: 1 | 2, id: string): PermanentItem => ({owner,card:card(name,id),instanceId:id,tapped:false});
const initial = useGameStore.getState();
const toasts: string[] = [];
const onToast = (event: Event) => { if (event instanceof CustomEvent) toasts.push(String((event.detail as {message?: string}).message)); };
const chimes = () => vi.mocked(soundManager.play).mock.calls.length;
const sinkholes = () => screen.queryAllByRole("button",{name:/^Sinkhole abilities/});
const pulsing = (button: HTMLElement | undefined) => button?.getAttribute("data-new") === "true";
const set = (state: Partial<GameState>) => act(() => { useGameStore.setState(state); });
const addSinkhole = () => act(() => {
  const {board} = useGameStore.getState();
  useGameStore.setState({board:{...board,sites:{...board.sites,"1,3":{owner:1,card:card("Sinkhole","sinkhole2")}}}});
});

beforeEach(() => {
  vi.stubGlobal("React",React);
  useGameStore.setState(initial,true);
  useGameStore.setState({
    opponentPlayerId:"cpu_test",actorKey:"p1",matchId:"m1",phase:"Main",currentPlayer:1,turn:3,matchEnded:false,
    pendingMagic:null,pendingCombat:null,cpuTriggerOptions:[],cpuPendingTriggerCount:0,cpuEffectContinuations:[],
    board:{size:{w:5,h:4},sites:{"2,3":{owner:1,card:card("Sinkhole")},"2,2":{owner:2,card:card("Spring River")}}},
    permanents:{"2,1":[unit("Mountain Giant",2,"giant")]},permanentPositions:{},
    avatars:{...initial.avatars,p1:{card:card("Flamecaller"),pos:[2,3],tapped:false},p2:{card:card("Geomancer"),pos:[2,0],tapped:false}},
    activateCpuAbility:vi.fn(),
  });
  useCpuBoardPicker.setState({request:"",tiles:[],selected:null,glow:[],sources:[]});
  useCpuAbilityPicker.setState({request:"",picked:null,hovered:null});
  window.sessionStorage.clear();
  toasts.length = 0;
  vi.mocked(soundManager.play).mockClear();
  window.addEventListener("app:toast",onToast);
});
afterEach(() => { cleanup(); window.removeEventListener("app:toast",onToast); vi.unstubAllGlobals(); });

describe("CPU ability buttons", () => {
  it("keeps a disabled Abilities button in place while no ability is ready", () => {
    set({currentPlayer:2});
    render(<CpuAbilityButtons />);
    expect(screen.getByRole("button",{name:"Abilities"}).hasAttribute("disabled")).toBe(true);
    expect(sinkholes()).toHaveLength(0);
    expect(toasts).toEqual([]);
    expect(chimes()).toBe(0);
  });

  it("renders nothing outside CPU matches", () => {
    set({opponentPlayerId:"human"});
    render(<CpuAbilityButtons />);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("shows one button per ready source, adding the tile only when names repeat", () => {
    render(<CpuAbilityButtons />);
    expect(sinkholes()).toHaveLength(1);
    expect(sinkholes()[0].getAttribute("aria-label")).toBe("Sinkhole abilities, Tile #18");
    expect(sinkholes()[0].textContent).toBe("Sinkhole");
    addSinkhole();
    expect(sinkholes().map(button => button.getAttribute("aria-label")).sort()).toEqual(["Sinkhole abilities, Tile #17","Sinkhole abilities, Tile #18"]);
    expect(sinkholes().map(button => button.textContent).sort()).toEqual(["Sinkhole#17","Sinkhole#18"]);
  });

  it("opens and selects nothing without a click; a click opens targeting and a second click closes it", () => {
    render(<><CpuAbilityButtons /><CpuAssistBar /></>);
    expect(screen.queryByRole("button",{name:"Resolve"})).toBeNull();
    expect(useCpuAbilityPicker.getState().picked).toBeNull();
    expect(useCpuBoardPicker.getState().tiles).toEqual([]);
    expect(useGameStore.getState().selectedPermanent).toBeFalsy();
    expect(useGameStore.getState().selectedAvatar).toBeFalsy();
    fireEvent.click(sinkholes()[0]);
    expect(sinkholes()[0].getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button",{name:"Resolve"})).toBeTruthy();
    expect([...useCpuBoardPicker.getState().tiles].sort()).toEqual(["2,2","2,3"]);
    fireEvent.click(sinkholes()[0]);
    expect(sinkholes()[0].getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("button",{name:"Resolve"})).toBeNull();
  });

  it("announces each source once per match: not on re-render, turn change or remount", () => {
    set({currentPlayer:2});
    render(<CpuAbilityButtons />);
    expect(toasts).toEqual([]);
    set({currentPlayer:1});
    expect(toasts).toEqual(["Sinkhole ability ready"]);
    expect(chimes()).toBe(1);
    expect(vi.mocked(soundManager.play)).toHaveBeenCalledWith("consent");
    set({permanents:{...useGameStore.getState().permanents,"3,1":[unit("Mountain Giant",2,"giant2")]}});
    set({currentPlayer:2});
    set({turn:4,currentPlayer:1});
    // A reload in the same match remounts with the same sessionStorage.
    cleanup();
    render(<CpuAbilityButtons />);
    expect(sinkholes()).toHaveLength(1);
    expect(toasts).toHaveLength(1);
    expect(chimes()).toBe(1);
    addSinkhole();
    expect(toasts).toEqual(["Sinkhole ability ready","Sinkhole ability ready"]);
    expect(chimes()).toBe(2);
    // A new match announces again: both sources in one batch, one toast (the board toast has a single slot) and one chime.
    cleanup();
    set({matchId:"m2"});
    render(<CpuAbilityButtons />);
    expect(toasts.slice(2)).toEqual(["Sinkhole abilities ready"]);
    expect(chimes()).toBe(3);
  });

  it("still announces once when sessionStorage is unavailable", () => {
    const blocked = vi.spyOn(Storage.prototype,"getItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      set({matchId:"m-private"});
      render(<CpuAbilityButtons />);
      expect(toasts).toHaveLength(1);
      cleanup();
      render(<CpuAbilityButtons />);
      expect(toasts).toHaveLength(1);
      expect(chimes()).toBe(1);
    } finally {
      blocked.mockRestore();
    }
  });

  it("pulses a newly ready button until it is clicked, hovered or the turn ends", () => {
    render(<CpuAbilityButtons />);
    expect(pulsing(sinkholes()[0])).toBe(true);
    fireEvent.click(sinkholes()[0]);
    expect(pulsing(sinkholes()[0])).toBe(false);
    addSinkhole();
    const fresh = () => screen.getByRole("button",{name:"Sinkhole abilities, Tile #17"});
    expect(pulsing(fresh())).toBe(true);
    expect(pulsing(screen.getByRole("button",{name:"Sinkhole abilities, Tile #18"}))).toBe(false);
    fireEvent.pointerEnter(fresh());
    expect(pulsing(fresh())).toBe(false);
    cleanup();
    set({matchId:"m3"});
    render(<CpuAbilityButtons />);
    expect(sinkholes().every(pulsing)).toBe(true);
    set({currentPlayer:2});
    set({turn:4,currentPlayer:1});
    expect(sinkholes()).toHaveLength(2);
    expect(sinkholes().some(pulsing)).toBe(false);
  });

  it("lights the source tile on the board while its button is hovered or focused", () => {
    render(<><CpuAbilityButtons /><CpuAssistBar /></>);
    const sources = () => useCpuBoardPicker.getState().sources;
    expect(sources()).toEqual([]);
    fireEvent.pointerEnter(sinkholes()[0]);
    expect(sources()).toEqual(["2,3"]);
    fireEvent.pointerLeave(sinkholes()[0]);
    expect(sources()).toEqual([]);
    fireEvent.focus(sinkholes()[0]);
    expect(sources()).toEqual(["2,3"]);
    fireEvent.blur(sinkholes()[0]);
    expect(sources()).toEqual([]);
    expect(useCpuAbilityPicker.getState().picked).toBeNull();
  });
});
