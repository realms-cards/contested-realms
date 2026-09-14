import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CpuBoardReady, { CPU_TAB_RETURN_BEAT_MS } from "@/components/game/CpuBoardReady";
import { useCpuReveals } from "@/lib/game/cpu/revealQueue";

const mocks = vi.hoisted(() => ({state:{phase:"Main",matchId:"test-match",opponentPlayerId:"cpu_test",transport:{sendMessage:vi.fn()}}}));
vi.mock("@/lib/game/store",() => ({useGameStore:(select: (state: typeof mocks.state) => unknown) => select(mocks.state)}));
const card = {cardId:1,name:"Ogre Goons",type:"Minion"};
const reveal = (id: string) => useCpuReveals.getState().show({id,seat:"p2",card,kind:"permanent",action:"summons at Tile #8"});
const lastVisible = () => {
  const calls = mocks.state.transport.sendMessage.mock.calls;
  return (calls[calls.length-1]?.[0] as {visible?: boolean} | undefined)?.visible;
};
beforeEach(() => {
  vi.useFakeTimers();vi.clearAllMocks();
  mocks.state.opponentPlayerId = "cpu_test";
  vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
  useCpuReveals.getState().reset();
  useCpuReveals.getState().setHidden(false);
});
afterEach(() => {cleanup();vi.restoreAllMocks();useCpuReveals.getState().reset();vi.useRealTimers();});

describe("CPU pause readiness", () => {
  it("keeps heartbeat paused until explicitly resumed", () => {
    const view = render(<CpuBoardReady paused />);
    expect(mocks.state.transport.sendMessage).toHaveBeenLastCalledWith({type:"cpuHumanReady",matchId:"test-match",visible:false});
    act(() => {vi.advanceTimersByTime(4000);});
    expect(mocks.state.transport.sendMessage.mock.calls.every(([message]) => message.visible === false)).toBe(true);
    view.rerender(<CpuBoardReady paused={false} />);
    expect(mocks.state.transport.sendMessage).toHaveBeenLastCalledWith({type:"cpuHumanReady",matchId:"test-match",visible:true});
    view.unmount();
    expect(mocks.state.transport.sendMessage).toHaveBeenLastCalledWith({type:"cpuHumanReady",matchId:"test-match",visible:false});
    const count = mocks.state.transport.sendMessage.mock.calls.length;
    act(() => {vi.advanceTimersByTime(4000);});
    expect(mocks.state.transport.sendMessage).toHaveBeenCalledTimes(count);
    // Unmounted: a reveal no longer signals anything.
    reveal("after-unmount");
    expect(mocks.state.transport.sendMessage).toHaveBeenCalledTimes(count);
  });
  it("does not signal readiness for human opponents", () => {
    mocks.state.opponentPlayerId = "human";
    render(<CpuBoardReady paused />);
    expect(mocks.state.transport.sendMessage).not.toHaveBeenCalled();
  });
  it("does not resume CPU actions while the browser is hidden", () => {
    vi.spyOn(document,"visibilityState","get").mockReturnValue("hidden");
    render(<CpuBoardReady />);
    expect(mocks.state.transport.sendMessage).toHaveBeenLastCalledWith({type:"cpuHumanReady",matchId:"test-match",visible:false});
    expect(useCpuReveals.getState().hidden).toBe(true);
  });
});

describe("CPU pause while a play reveal is up", () => {
  it("pauses synchronously when a reveal is queued and resumes as soon as the queue empties", () => {
    render(<CpuBoardReady />);
    expect(lastVisible()).toBe(true);
    // No render flush: the pause leaves in the same tick, ahead of any resolve message that follows.
    reveal("a");
    expect(lastVisible()).toBe(false);
    reveal("b");
    const count = mocks.state.transport.sendMessage.mock.calls.length;
    act(() => {vi.advanceTimersByTime(2000);});
    expect(mocks.state.transport.sendMessage.mock.calls.length).toBeGreaterThan(count);
    expect(lastVisible()).toBe(false);
    act(() => {vi.advanceTimersByTime(5999);});
    expect(useCpuReveals.getState().queue).toHaveLength(1);
    expect(lastVisible()).toBe(false);
    act(() => {vi.advanceTimersByTime(1);});
    expect(useCpuReveals.getState().queue).toHaveLength(0);
    expect(lastVisible()).toBe(true);
  });
  it("stops reveal countdowns while hidden and resumes a beat after the tab returns", () => {
    const visibility = vi.spyOn(document,"visibilityState","get");
    render(<CpuBoardReady />);
    reveal("a");
    visibility.mockReturnValue("hidden");
    act(() => {document.dispatchEvent(new Event("visibilitychange"));});
    expect(lastVisible()).toBe(false);
    expect(useCpuReveals.getState().hidden).toBe(true);
    act(() => {vi.advanceTimersByTime(20000);});
    expect(useCpuReveals.getState().queue).toHaveLength(1);
    visibility.mockReturnValue("visible");
    act(() => {document.dispatchEvent(new Event("visibilitychange"));});
    expect(useCpuReveals.getState().hidden).toBe(false);
    useCpuReveals.getState().dismiss("a");
    // The queue is empty, but the return beat still holds the CPU.
    expect(lastVisible()).toBe(false);
    act(() => {vi.advanceTimersByTime(CPU_TAB_RETURN_BEAT_MS);});
    expect(lastVisible()).toBe(true);
  });
});
