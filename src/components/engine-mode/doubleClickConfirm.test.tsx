import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorBlindProvider } from "@/lib/contexts/ColorBlindContext";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import { useEngineSession } from "@/lib/engine-mode/session";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import type { Action, GameState, PlayerId } from "@sorcery/shared";
import { createGame } from "@sorcery/shared";
import EnginePromptPanel from "./EnginePromptPanel";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));

/** A one-target question over two units, the shape of Quarrelsome Kobolds' end-of-turn strike. */
function askForOneTarget(): { game: GameState; dispatch: ReturnType<typeof vi.fn> } {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 7, 0 as PlayerId);
  game.phase = "main";
  const avatars = Object.values(game.units).filter((u) => u.isAvatar).map((u) => u.id);
  game.prompts.push({
    id: "p-kobolds",
    player: 0 as PlayerId,
    kind: "chooseTargets",
    title: "Who takes the blow?",
    data: { candidates: avatars, count: 1, upTo: false, kind: "unit" },
    cont: "test",
    ctx: {},
  });
  const dispatch = vi.fn((_a: Action) => ({ ok: true as const }));
  useEngineSession.setState({ game, rev: 1, seat: 0 as PlayerId, mode: "local", legal: [], portalsRevealed: true, dispatch });
  return { game, dispatch };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useEngineSession.setState({ game: null, legal: null });
});

const armedTokens = () => useCpuBoardPicker.getState().tiles;
const click = (token: string) => act(() => useCpuBoardPicker.getState().select(token));

describe("a double-click on a target confirms the pick", () => {
  it("one click picks it and waits for Confirm; a second click right after answers the question", () => {
    const { dispatch } = askForOneTarget();
    render(
      <ColorBlindProvider>
        <EnginePromptPanel />
      </ColorBlindProvider>,
    );
    const [token] = armedTokens();
    expect(token, "the candidates are armed on the board").toBeTruthy();
    click(token);
    expect(dispatch, "one click only picks").not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 150);
    click(token);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const sent = dispatch.mock.calls[0][0] as { t: string; choice: string[] };
    expect(sent.t).toBe("prompt");
    expect(sent.choice).toHaveLength(1);
  });

  it("two clicks far apart still toggle, as before", () => {
    const { dispatch } = askForOneTarget();
    render(
      <ColorBlindProvider>
        <EnginePromptPanel />
      </ColorBlindProvider>,
    );
    const [token] = armedTokens();
    click(token);
    vi.setSystemTime(Date.now() + 2000);
    click(token);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

