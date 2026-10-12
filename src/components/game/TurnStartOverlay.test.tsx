import { act, cleanup, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TurnStartOverlay from "@/components/game/TurnStartOverlay";

const mocks = vi.hoisted(() => ({state:{currentPlayer:1,turn:1,phase:"Start",hasDrawnThisTurn:false,actorKey:"p1" as string | null,setTurnOverlayActive:vi.fn()},gong:vi.fn()}));
const reset = () => Object.assign(mocks.state,{currentPlayer:1,turn:1,phase:"Start",hasDrawnThisTurn:false,actorKey:"p1"});
vi.mock("@/lib/game/store",() => ({useGameStore:(select:(state:typeof mocks.state)=>unknown) => select(mocks.state)}));
vi.mock("@/lib/contexts/SoundContext",() => ({useSound:() => ({playTurnGong:mocks.gong})}));
beforeEach(() => {vi.stubGlobal("React",React);vi.useFakeTimers();vi.clearAllMocks();reset();});
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

it("announces only the given seat's turns when the store names no actor", () => {
  // Engine mode drives both seats from one client with actorKey null, which elsewhere means
  // hotseat ("announce every turn"). `seat` is what keeps the computer's turn quiet.
  mocks.state.actorKey = null;
  const view = render(<TurnStartOverlay gameStarted={false} seat="p1" />);
  view.rerender(<TurnStartOverlay gameStarted seat="p1" />);
  expect(mocks.state.setTurnOverlayActive).toHaveBeenLastCalledWith(true);
  act(() => {vi.advanceTimersByTime(2000);});
  mocks.state.setTurnOverlayActive.mockClear();

  // the opponent's turn begins: nothing is announced
  mocks.state.turn = 2;
  mocks.state.currentPlayer = 2;
  view.rerender(<TurnStartOverlay gameStarted seat="p1" />);
  expect(mocks.state.setTurnOverlayActive).not.toHaveBeenCalledWith(true);

  // ours begins again, and it is announced
  mocks.state.turn = 3;
  mocks.state.currentPlayer = 1;
  view.rerender(<TurnStartOverlay gameStarted seat="p1" />);
  expect(mocks.state.setTurnOverlayActive).toHaveBeenLastCalledWith(true);
});
