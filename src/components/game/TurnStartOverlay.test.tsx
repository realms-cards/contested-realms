import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TurnStartOverlay from "@/components/game/TurnStartOverlay";

const mocks = vi.hoisted(() => ({state:{currentPlayer:1,turn:1,phase:"Start",hasDrawnThisTurn:false,actorKey:"p1",setTurnOverlayActive:vi.fn()},gong:vi.fn()}));
vi.mock("@/lib/game/store",() => ({useGameStore:(select:(state:typeof mocks.state)=>unknown) => select(mocks.state)}));
vi.mock("@/lib/contexts/SoundContext",() => ({useSound:() => ({playTurnGong:mocks.gong})}));
beforeEach(() => {vi.stubGlobal("React",React);vi.useFakeTimers();vi.clearAllMocks();});
afterEach(() => {cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it("dismisses without input even when a phase update arrives during the announcement", () => {
  const view = render(<TurnStartOverlay gameStarted={false} />);
  view.rerender(<TurnStartOverlay gameStarted />);
  expect(mocks.state.setTurnOverlayActive).toHaveBeenLastCalledWith(true);
  mocks.state.phase = "Main";
  view.rerender(<TurnStartOverlay gameStarted />);
  act(() => {vi.advanceTimersByTime(2000);});
  expect(mocks.state.setTurnOverlayActive).toHaveBeenLastCalledWith(false);
});
