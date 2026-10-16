import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Compass } from "./EnginePromptShell";

vi.mock("@iconify/react", () => ({
  Icon: (props: { icon: string; style?: { transform?: string } }) => <span data-icon={props.icon} data-transform={props.style?.transform ?? ""} />,
}));

afterEach(cleanup);

/**
 * game-icons:plain-arrow points DOWN at 0°. The compass turned it as if it pointed up, so every
 * arrow faced the opposite way from its slot (the top button showed ↓).
 */
describe("direction compass", () => {
  it("turns each arrow to face its own slot", () => {
    const opts = [
      { key: "N", label: "n" },
      { key: "E", label: "e" },
      { key: "S", label: "s" },
      { key: "W", label: "w" },
    ];
    render(<Compass options={opts} onPick={() => undefined} />);
    const turn = (label: string) => screen.getByRole("button", { name: label }).querySelector("[data-icon]")?.getAttribute("data-transform");
    // a down-pointing arrow: up = 180°, right = 270°, down = 0°, left = 90° (clockwise CSS rotation)
    expect(turn("n")).toBe("rotate(180deg)");
    expect(turn("e")).toBe("rotate(270deg)");
    expect(turn("s")).toBe("rotate(0deg)");
    expect(turn("w")).toBe("rotate(90deg)");
  });
});
