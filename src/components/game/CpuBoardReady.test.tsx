import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CpuBoardReady from "@/components/game/CpuBoardReady";

const mocks = vi.hoisted(() => ({state:{phase:"Main",matchId:"test-match",opponentPlayerId:"cpu_test",transport:{sendMessage:vi.fn()}}}));
vi.mock("@/lib/game/store",() => ({useGameStore:(select: (state: typeof mocks.state) => unknown) => select(mocks.state)}));
beforeEach(() => {
  vi.useFakeTimers();vi.clearAllMocks();
  mocks.state.opponentPlayerId = "cpu_test";
  vi.spyOn(document,"visibilityState","get").mockReturnValue("visible");
});
afterEach(() => {cleanup();vi.restoreAllMocks();vi.useRealTimers();});

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
  });
});
