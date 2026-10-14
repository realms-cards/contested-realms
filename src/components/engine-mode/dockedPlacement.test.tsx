import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEngineSession } from "@/lib/engine-mode/session";
import EngineHud from "./EngineHud";
import EngineNarration from "./EngineNarration";
import { PromptBanner, PromptDialog, PromptPlacementContext } from "./EnginePromptShell";
import type { EngineInteraction } from "./useEngineInteraction";

type Game = NonNullable<ReturnType<typeof useEngineSession.getState>["game"]>;

/** Just the fields these components read; the rest of the engine state is irrelevant here. */
function fakeGame(fields: Partial<Record<keyof Game, unknown>>): Game {
  return { phase: "main", turn: 3, activePlayer: "p2", prompts: [], ...fields } as unknown as Game;
}

const interaction = { picking: false, confirmable: false, confirm: () => {} } as unknown as EngineInteraction;

/** Walks up from the dialog to the outermost element the component rendered. */
function hasFixedAncestor(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.classList.contains("fixed")) return true;
  }
  return false;
}

afterEach(() => {
  act(() => useEngineSession.setState({ game: null, narration: null, botThinking: false, lastError: null }));
});

describe("PromptBanner placement", () => {
  it("floats over the board by default (the 3D layout)", () => {
    render(<PromptBanner title="Pick a unit" counter="0/1" />);
    const dialog = screen.getByRole("region", { name: "Pick a unit" });
    expect(hasFixedAncestor(dialog)).toBe(true);
    expect(dialog.parentElement?.className).toContain("top-14");
  });

  it("renders in the page flow when docked", () => {
    render(
      <PromptPlacementContext.Provider value="docked">
        <div data-testid="dock">
          <PromptBanner title="Pick a unit" hint="Tap it on the board." counter="0/1">
            <button type="button">Done</button>
          </PromptBanner>
        </div>
      </PromptPlacementContext.Provider>,
    );
    const dialog = screen.getByRole("region", { name: "Pick a unit" });
    expect(hasFixedAncestor(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(screen.getByTestId("dock"));
    expect(screen.getByText("Tap it on the board.").isConnected).toBe(true);
    // the title's line in a wide dock, or leading the hint in a phone's narrow one (CSS picks)
    expect(screen.getAllByText("0/1").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Done" }).isConnected).toBe(true);
  });

  it("pins its button row to the bottom of the dock's scroller when docked", () => {
    render(
      <PromptPlacementContext.Provider value="docked">
        <PromptBanner title="Deal 1 damage to each minion atop which nearby site?" hint="Tap a site.">
          <button type="button">Auto</button>
          <button type="button">None</button>
          <button type="button">Confirm</button>
        </PromptBanner>
      </PromptPlacementContext.Provider>,
    );
    const region = screen.getByRole("region", { name: /Deal 1 damage/ });
    const row = screen.getByRole("button", { name: "Confirm" }).parentElement;
    expect(row?.className).toContain("sticky");
    expect(row?.className).toContain("bottom-0");
    // overflow:hidden would make the banner its own scroll container and the row would never stick
    expect(region.className).not.toContain("overflow-hidden");
    expect(region.className).toContain("overflow-clip");
  });
});

describe("PromptDialog placement", () => {
  it("is a centred modal by default", () => {
    render(<PromptDialog title="Choose">body</PromptDialog>);
    const outer = screen.getByRole("dialog", { name: "Choose" }).parentElement;
    expect(outer?.className).toContain("items-center");
    expect(screen.getByRole("dialog").className).toContain("max-h-[86vh]");
  });

  it("is a bottom sheet capped at three quarters of the screen when docked", () => {
    render(
      <PromptPlacementContext.Provider value="docked">
        <PromptDialog title="Choose" hint="Yours to decide.">
          body
        </PromptDialog>
      </PromptPlacementContext.Provider>,
    );
    const sheet = screen.getByRole("dialog", { name: "Choose" });
    expect(sheet.parentElement?.className).toContain("justify-end");
    expect(sheet.className).toContain("max-h-[75vh]");
    expect(sheet.className).toContain("pb-[env(safe-area-inset-bottom)]");
    // the scrim never takes the pointer, so the board under it stays live
    expect(sheet.parentElement?.className).toContain("pointer-events-none");
    expect(screen.getByText("body").isConnected).toBe(true);
  });
});

describe("EngineNarration docked", () => {
  it("renders the newest line in the page flow", () => {
    act(() =>
      useEngineSession.setState({ game: fakeGame({}), narration: { text: "Casts a spell at tile 8.", seq: 1 } }),
    );
    render(
      <div data-testid="row">
        <EngineNarration docked />
      </div>,
    );
    const line = screen.getByRole("status");
    expect(line.textContent).toContain("Casts a spell at tile 8.");
    expect(hasFixedAncestor(line)).toBe(false);
  });

  it("says the computer is thinking before it has a line, and nothing when idle", () => {
    act(() => useEngineSession.setState({ game: fakeGame({}), narration: null, botThinking: true }));
    const { container, rerender } = render(<EngineNarration docked />);
    expect(screen.getByRole("status").textContent).toContain("The computer is thinking");
    act(() => useEngineSession.setState({ botThinking: false }));
    rerender(<EngineNarration docked />);
    expect(container.childElementCount).toBe(0);
  });

  it("still floats at the centre by default", () => {
    act(() => useEngineSession.setState({ game: fakeGame({}), narration: { text: "Moves to tile 3.", seq: 2 } }));
    render(<EngineNarration />);
    expect(hasFixedAncestor(screen.getByText("Moves to tile 3."))).toBe(true);
  });
});

describe("EngineHud opt-outs", () => {
  it("shows the turn pill by default and hides it on request", () => {
    act(() => useEngineSession.setState({ game: fakeGame({}) }));
    const { rerender } = render(<EngineHud interaction={interaction} onRestart={() => {}} onExit={() => {}} />);
    expect(screen.getByText("Turn 3").isConnected).toBe(true);
    rerender(<EngineHud interaction={interaction} onRestart={() => {}} onExit={() => {}} hideStatusPill />);
    expect(screen.queryByText("Turn 3")).toBeNull();
  });

  it("moves the error toast to the top edge when asked", () => {
    act(() => useEngineSession.setState({ game: fakeGame({}), lastError: "Not enough mana." }));
    render(<EngineHud interaction={interaction} onRestart={() => {}} onExit={() => {}} toastPlacement="top" />);
    const wrapper = screen.getByRole("alert").parentElement;
    expect(wrapper?.className).toContain("safe-area-inset-top");
    expect(wrapper?.className).not.toContain("bottom-4");
  });
});
