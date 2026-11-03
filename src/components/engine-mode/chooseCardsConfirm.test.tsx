import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorBlindProvider } from "@/lib/contexts/ColorBlindContext";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import { useEngineSession } from "@/lib/engine-mode/session";
import type { Action, PlayerId } from "@sorcery/shared";
import { createGame } from "@sorcery/shared";
import EnginePromptPanel from "./EnginePromptPanel";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));

const MASKS = ["Archimago", "Deathspeaker", "Enchantress", "Flamecaller", "Interrogator", "Ironclad", "Pathfinder", "Sorcerer", "Waveshaper", "Witch"];

/** The Imposter's mask choice: ten Avatars, choose one — the list that used to push Confirm out of sight. */
function askForAMask(kind: "chooseCards" | "orderCards") {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 7, 0 as PlayerId);
  game.phase = "main";
  game.prompts.push({
    id: "p-mask",
    player: 0 as PlayerId,
    kind,
    title: "The Imposter wears whose face?",
    data: { cards: MASKS, pick: 1, upTo: false },
    cont: "test",
    ctx: {},
  });
  const dispatch = vi.fn((_a: Action) => ({ ok: true as const }));
  act(() => useEngineSession.setState({ game, rev: 1, seat: 0 as PlayerId, mode: "local", legal: [], portalsRevealed: true, dispatch }));
  render(
    <ColorBlindProvider>
      <EnginePromptPanel />
    </ColorBlindProvider>,
  );
  return dispatch;
}

afterEach(() => {
  cleanup();
  act(() => useEngineSession.setState({ game: null, legal: null }));
});

describe("a long card list never hides the confirm button", () => {
  it("chooseCards: Confirm sits below the scrolling list, not inside it, and answers", () => {
    const dispatch = askForAMask("chooseCards");
    const list = screen.getByRole("region", { name: "0/1 chosen" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(list.contains(confirm), "Confirm is outside the list's own scroll box").toBe(false);
    fireEvent.click(within(list).getAllByRole("button")[3]); // Flamecaller
    fireEvent.click(confirm);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ t: "prompt", promptId: "p-mask", choice: [3] }));
  });

  it("orderCards: Confirm order sits below the scrolling list too", () => {
    askForAMask("orderCards");
    const list = screen.getByRole("region", { name: "Order" });
    expect(list.contains(screen.getByRole("button", { name: "Confirm order" }))).toBe(false);
  });
});
