import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CombatHudOverlay from "@/components/game/CombatHudOverlay";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import cards from "@/lib/game/cpu/cards.json";
import { rangedAttack, stationaryAttack } from "@/lib/game/cpu/stationaryAttack";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, GameState } from "@/lib/game/store/types";

// A plain store copy without the CPU controller subscription, so test states stay as written.
vi.mock("@/lib/game/store", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/game/store")>();
  const { create } = await import("zustand");
  return {...actual,useGameStore:create<GameState>()(() => actual.useGameStore.getState())};
});
vi.mock("@/lib/audio/soundManager", () => ({soundManager:{play:vi.fn()}}));
vi.mock("@/lib/hooks/useTouchDevice", () => ({useSmallScreen:() => false}));

const card = (name: keyof typeof cards, id: string = name): CardRef => ({cardId:1,...cards[name],text:cards[name].rulesText,instanceId:id});
const initial = useGameStore.getState();
const picker = () => useCpuBoardPicker.getState();
const state = () => useGameStore.getState();

beforeEach(() => {
  vi.stubGlobal("React",React);
  useCpuBoardPicker.setState({request:"",tiles:[],selected:null,glow:[],sources:[],labels:{}});
  useGameStore.setState({...initial,
    // The copied store's actions write to the original store, so the ones this flow uses write here instead.
    setAttackTargetChoice:vi.fn((attackTargetChoice: GameState["attackTargetChoice"]) => useGameStore.setState({attackTargetChoice})),
    setAttackConfirm:vi.fn((attackConfirm: GameState["attackConfirm"]) => useGameStore.setState({attackConfirm})),
    combatGuidesActive:true,opponentPlayerId:"cpu_test",actorKey:"p1",phase:"Main",currentPlayer:1,turn:3,
    attackChoice:null,attackTargetChoice:null,attackConfirm:null,pendingCombat:null,pendingMagic:null,selectedAvatar:null,selectedPermanent:null,
    board:{size:{w:5,h:4},sites:{"2,3":{owner:2,card:card("Humble Village")},"2,2":{owner:1,card:card("Humble Village","north")},"2,1":{owner:2,card:card("Vantage Hills","far")}}},
    avatars:{...initial.avatars,p1:{card:card("Flamecaller"),pos:[2,3],tapped:false},p2:{card:card("Geomancer"),pos:[2,3],tapped:false}},
    permanents:{
      "2,3":[{owner:1,card:card("Belmotte Longbowmen","archer"),instanceId:"archer",tapped:false},{owner:2,card:card("Raal Dromedary","guard"),instanceId:"guard",tapped:false}],
      "2,2":[{owner:2,card:card("Raal Dromedary","near"),instanceId:"near",tapped:false}],
    },
  } as Partial<GameState>);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("combat attack targets are picked on the board", () => {
  it("Attack here lights the enemy cards and site at the tile, and a card click opens the confirm step", () => {
    useGameStore.setState({selectedPermanent:{at:"2,3",index:0}});
    const choice = stationaryAttack(state());
    expect(choice).not.toBeNull();
    render(<CombatHudOverlay />);
    act(() => { state().setAttackTargetChoice(choice); });

    expect(screen.getByText(/Pick a target on the board at/)).toBeTruthy();
    // No list of targets: the only button is Cancel.
    expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["Cancel"]);
    expect([...picker().tiles].sort()).toEqual(["2,3","unit:avatar:p2","unit:perm:guard"]);
    expect(picker().sources).toEqual(["unit:perm:archer"]);

    act(() => { picker().select("unit:perm:guard"); });
    expect(state().attackConfirm).toMatchObject({attacker:{at:"2,3",index:0},target:{kind:"permanent",at:"2,3",index:1},targetLabel:"Raal Dromedary — Tile #18"});
    expect(state().attackConfirm?.ranged).toBeUndefined();
    expect(screen.getByRole("button",{name:"Confirm"})).toBeTruthy();
    // The picker lets go while confirming; Back reopens the same picks.
    expect(picker().tiles).toEqual([]);
    fireEvent.click(screen.getByRole("button",{name:"Back"}));
    expect([...picker().tiles].sort()).toEqual(["2,3","unit:avatar:p2","unit:perm:guard"]);
    expect(picker().selected).toBeNull();

    // The site is the tile token; the enemy avatar is its card.
    act(() => { picker().select("2,3"); });
    expect(state().attackConfirm).toMatchObject({target:{kind:"site",at:"2,3",index:null}});
    fireEvent.click(screen.getByRole("button",{name:"Back"}));
    act(() => { picker().select("unit:avatar:p2"); });
    expect(state().attackConfirm).toMatchObject({target:{kind:"avatar",at:"2,3",index:null}});
  });

  it("Ranged lights only the reachable unit; Cancel clears the board picks", () => {
    useGameStore.setState({selectedPermanent:{at:"2,3",index:0},permanents:{...state().permanents,"2,3":[state().permanents["2,3"][0]]},
      avatars:{...state().avatars,p2:{...state().avatars.p2,pos:[2,0]}}});
    const choice = rangedAttack(state());
    expect(choice?.candidates).toHaveLength(1);
    render(<CombatHudOverlay />);
    act(() => { state().setAttackTargetChoice(choice); });

    expect(screen.getByText(/Ranged strike · pick a target on the board/)).toBeTruthy();
    expect(screen.queryByText(/Raal Dromedary/)).toBeNull();
    expect(picker().tiles).toEqual(["unit:perm:near"]);
    // Clicks on anything else are ignored by the picker.
    act(() => { picker().select("unit:perm:archer"); });
    expect(state().attackConfirm).toBeNull();

    fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
    expect(state().attackTargetChoice).toBeNull();
    expect(picker()).toMatchObject({request:"",tiles:[],sources:[]});

    act(() => { state().setAttackTargetChoice(choice); });
    act(() => { picker().select("unit:perm:near"); });
    expect(state().attackConfirm).toMatchObject({ranged:true,target:{kind:"permanent",at:"2,2",index:0},targetLabel:"Raal Dromedary — Tile #13"});
    expect(screen.getByText(/shoots/)).toBeTruthy();
  });

  it("does not touch the picker for a Moves & Attacks choice without listed candidates", () => {
    render(<CombatHudOverlay />);
    act(() => { state().setAttackTargetChoice({tile:{x:2,y:2},attacker:{at:"2,2",index:0,owner:1},candidates:[]}); });
    expect(screen.getByText(/Pick a target on the board at/)).toBeTruthy();
    expect(picker().request).toBe("");
  });
});
