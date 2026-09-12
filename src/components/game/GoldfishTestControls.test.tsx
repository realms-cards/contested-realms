import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GoldfishTestControls from "@/components/game/GoldfishTestControls";

beforeEach(() => {vi.stubGlobal("React",React);});
afterEach(() => {cleanup();vi.unstubAllGlobals();});

describe("Goldfish in-match controls", () => {
  it("requires explicit confirmation and only requests restart once", () => {
    const restart = vi.fn();
    render(<GoldfishTestControls paused={false} onPauseChange={vi.fn()} onRestart={restart} />);
    fireEvent.click(screen.getByRole("button",{name:"Test controls"}));
    fireEvent.click(screen.getByRole("button",{name:"Start a fresh test…"}));
    expect(screen.getByText(/Leaving concedes the current game/)).toBeTruthy();
    expect(restart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Leave and test again"}));
    fireEvent.click(screen.getByRole("button",{name:"Leave and test again"}));
    expect(restart).toHaveBeenCalledTimes(1);
  });
  it("can cancel a restart without leaving or changing pause state", () => {
    const restart = vi.fn(), pause = vi.fn();
    render(<GoldfishTestControls paused={false} onPauseChange={pause} onRestart={restart} />);
    fireEvent.click(screen.getByRole("button",{name:"Test controls"}));
    fireEvent.click(screen.getByRole("button",{name:"Start a fresh test…"}));
    fireEvent.click(screen.getByRole("button",{name:"Keep this game"}));
    fireEvent.click(screen.getByRole("button",{name:"Back to board"}));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(restart).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
  });
  it("offers pause and resume and keeps the paused indicator visible on the board", () => {
    const pause = vi.fn();
    const view = render(<GoldfishTestControls paused={false} onPauseChange={pause} onRestart={vi.fn()} />);
    fireEvent.click(screen.getByRole("button",{name:"Test controls"}));
    fireEvent.click(screen.getByRole("button",{name:"Pause CPU actions"}));
    expect(pause).toHaveBeenCalledWith(true);
    view.rerender(<GoldfishTestControls paused onPauseChange={pause} onRestart={vi.fn()} />);
    fireEvent.click(screen.getByRole("button",{name:"Resume CPU actions"}));
    expect(pause).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button",{name:"Back to board"}));
    expect(screen.getByRole("button",{name:"CPU paused — Test controls"})).toBeTruthy();
  });
});
