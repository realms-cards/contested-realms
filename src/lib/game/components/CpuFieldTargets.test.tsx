import { useFrame } from "@react-three/fiber";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CpuFieldTargets from "@/lib/game/components/CpuFieldTargets";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { useGameStore } from "@/lib/game/store";
import type { GameState } from "@/lib/game/store/types";

// A plain store copy without the CPU controller subscription, so test states stay as written.
vi.mock("@/lib/game/store", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/game/store")>();
  const { create } = await import("zustand");
  return {...actual,useGameStore:create<GameState>()(() => actual.useGameStore.getState())};
});
// The board layer renders through react-dom here (no WebGL): frame loops are observed, Html renders its children in place.
vi.mock("@react-three/fiber", async importOriginal => ({...await importOriginal<typeof import("@react-three/fiber")>(),useFrame:vi.fn()}));
vi.mock("@react-three/drei", () => ({Html:({children}: {children?: React.ReactNode}) => <div data-testid="html">{children}</div>}));

const picker = () => useCpuBoardPicker.getState();
const offer = (state: Partial<ReturnType<typeof picker>>) => act(() => { useCpuBoardPicker.setState(state); });
const capture = (token: string) => document.querySelector(`mesh[name="cpu-pick:${token}"]`);
const captures = () => [...document.querySelectorAll("mesh[name]")].map(mesh => mesh.getAttribute("name")).sort();
const show = () => render(<CpuFieldTargets offsetX={0} offsetY={0} />);

let quiet: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubGlobal("React",React);
  // react-dom warns about the three.js intrinsics (<mesh>, renderOrder, ...); the handlers and structure are what matter here.
  quiet = vi.spyOn(console,"error").mockImplementation(() => undefined);
  vi.mocked(useFrame).mockClear();
  useGameStore.setState({opponentPlayerId:"cpu_test"});
  useCpuBoardPicker.setState({request:"r",tiles:[],selected:null,glow:[],sources:[],labels:{}});
});
afterEach(() => { cleanup(); quiet.mockRestore(); vi.unstubAllGlobals(); });

describe("CPU board layer: tokens", () => {
  it("draws tiles only from tile tokens and ignores other kinds", () => {
    show();
    offer({tiles:["1,1","unit:perm:a","hand:p1:x","pile:p1:atlas","draw:p1:1-1"],glow:["2,2","unit:avatar:p2"],sources:["3,3","unit:perm:b"]});
    expect(captures()).toEqual(["cpu-pick:1,1"]);
    // One fill + one capture for the candidate, one fill each for the target and the source.
    expect(document.querySelectorAll("mesh")).toHaveLength(4);
    expect(screen.queryAllByTestId("html")).toHaveLength(0);
  });

  it("renders nothing outside CPU matches", () => {
    act(() => { useGameStore.setState({opponentPlayerId:"human"}); });
    show();
    offer({tiles:["1,1","dir:2,3:N","opt:2,3:fight"]});
    expect(document.querySelectorAll("mesh")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("gives every direction its own arrow capture and picks on click, not on press", () => {
    show();
    offer({tiles:["dir:2,3:N","dir:2,3:E","dir:2,3:S","dir:2,3:W"],sources:["2,3"],labels:{"dir:2,3:N":"North"}});
    expect(captures()).toEqual(["cpu-pick:dir:2,3:E","cpu-pick:dir:2,3:N","cpu-pick:dir:2,3:S","cpu-pick:dir:2,3:W"]);
    expect(useFrame).toHaveBeenCalled();
    const south = capture("dir:2,3:S");
    if (!south) throw new Error("no capture for the south arrow");
    fireEvent.pointerDown(south);
    fireEvent.pointerUp(south);
    expect(picker().selected).toBeNull();
    fireEvent.click(south);
    expect(picker().selected).toBe("dir:2,3:S");
    // The picked arrow stays mounted to swallow the rest of the gesture.
    expect(capture("dir:2,3:S")).toBe(south);
  });

  it("shows a chosen direction from glow as a static arrow without a capture", () => {
    show();
    offer({glow:["dir:1,1:W"]});
    expect(document.querySelectorAll("mesh")).toHaveLength(1);
    expect(captures()).toEqual([]);
    expect(useFrame).not.toHaveBeenCalled();
  });
});

describe("CPU board layer: anchored buttons", () => {
  it("groups the options of a tile into one row of labelled buttons and picks on click", () => {
    show();
    offer({tiles:["opt:1,2:summon","opt:1,2:skip","opt:3,0:fight"],labels:{"opt:1,2:summon":"Summon Foot Soldier (1)","opt:1,2:skip":"Skip"}});
    expect(document.querySelectorAll("[data-cpu-options]")).toHaveLength(2);
    const row = document.querySelector('[data-cpu-options="1,2"]');
    expect([...row?.querySelectorAll("button") ?? []].map(button => button.getAttribute("aria-label"))).toEqual(["Summon Foot Soldier (1)","Skip"]);
    // No label: the id is the text.
    expect(screen.getByRole("button",{name:"fight"})).toBeTruthy();
    // Buttons are DOM, not board meshes, and nothing pulses for them.
    expect(document.querySelectorAll("mesh")).toHaveLength(0);
    expect(useFrame).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("button",{name:"Skip"}));
    expect(picker().selected).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Skip"}));
    expect(picker().selected).toBe("opt:1,2:skip");
    expect(screen.getByRole("button",{name:"Skip"}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button",{name:"Summon Foot Soldier (1)"}).getAttribute("aria-pressed")).toBe("false");
  });

  it("shows options from glow as pressed and drops the rows once no options remain", () => {
    show();
    offer({tiles:["opt:3,0:surface","opt:3,0:underground"],glow:["opt:3,0:underground"],labels:{"opt:3,0:surface":"Surface","opt:3,0:underground":"Underground"}});
    expect(screen.getByRole("button",{name:"Underground"}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button",{name:"Surface"}).getAttribute("aria-pressed")).toBe("false");
    offer({tiles:["2,2"],glow:[],labels:{}});
    expect(screen.queryAllByTestId("html")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
