import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PracticeMatchControls from "@/components/online/lobby/PracticeMatchControls";

// Icon data is fetched from the Iconify API at runtime; not under test here.
vi.mock("@iconify/react", () => ({ Icon: () => null }));

function button(name: string | RegExp): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("PracticeMatchControls", () => {
  it.each([
    ["precon", "Practice vs CPU"],
    ["constructed", "Goldfish practice"],
  ] as const)("titles a %s practice game by its mode", (matchType, label) => {
    render(
      <PracticeMatchControls
        match={{ id: "m1", matchType, status: "in_progress" }}
        onResume={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: label })).toBeTruthy();
    expect(screen.getByRole("heading", { name: label })).toBeTruthy();
    // No auto-join countdown and none of the regular match controls
    expect(screen.queryByText(/Joining/)).toBeNull();
    expect(screen.queryByText("Match Controls")).toBeNull();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Resume",
      "End practice",
    ]);
  });

  it("resumes the game", () => {
    const onResume = vi.fn();
    const onEnd = vi.fn();
    render(
      <PracticeMatchControls
        match={{ id: "m1", matchType: "precon", status: "in_progress" }}
        onResume={onResume}
        onEnd={onEnd}
      />,
    );
    fireEvent.click(button("Resume"));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("ends the game in one click and blocks repeats while in flight", () => {
    const onEnd = vi.fn();
    render(
      <PracticeMatchControls
        match={{ id: "m1", matchType: "constructed", status: "waiting" }}
        onResume={vi.fn()}
        onEnd={onEnd}
      />,
    );
    fireEvent.click(button("End practice"));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();

    const busy = button(/Ending/);
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(button("Resume").disabled).toBe(true);
    fireEvent.click(busy);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("lets the player retry when ending throws", () => {
    const onEnd = vi.fn(() => {
      throw new Error("transport down");
    });
    render(
      <PracticeMatchControls
        match={{ id: "m1", matchType: "precon", status: "in_progress" }}
        onResume={vi.fn()}
        onEnd={onEnd}
      />,
    );
    fireEvent.click(button("End practice"));
    expect(button("End practice").disabled).toBe(false);
  });

  it("offers only dismissal once the game has ended", () => {
    render(
      <PracticeMatchControls
        match={{ id: "m1", matchType: "precon", status: "ended" }}
        onResume={vi.fn()}
        onEnd={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(button("End practice")).toBeTruthy();
  });
});
