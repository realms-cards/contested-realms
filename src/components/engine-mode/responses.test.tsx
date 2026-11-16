import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorBlindProvider } from "@/lib/contexts/ColorBlindContext";
import { enginePrecons, toEngineDeck } from "@/lib/engine-mode/decks";
import { useEngineSession } from "@/lib/engine-mode/session";
import { botNeedsToAct } from "@untested-realm/bot/bot";
import type { Action, GameState, PlayerId } from "@sorcery/shared";
import { applyAction, createGame, legalActions } from "@sorcery/shared";
import EnginePromptPanel from "./EnginePromptPanel";

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <span role="img" aria-label={props.alt} />,
}));

const YOU = 0 as PlayerId;
const CPU = 1 as PlayerId;

/**
 * The computer's turn: its Frost Elemental can attack your Polar Bears, and you hold Dodge Roll with
 * the water to cast it. Both rows are water sites, so thresholds are met.
 */
function cpuTurnWithDodgeRollInHand(): GameState {
  const deck = toEngineDeck(enginePrecons.find((d) => d.id === "fvl-frost-mage")!);
  const game = createGame([deck, deck], ["You", "Computer"], 5, CPU);
  game.phase = "main";
  game.prompts = [];
  game.activePlayer = CPU;
  game.turn = 4;
  let n = 0;
  for (let x = 0; x < 5; x++) {
    for (const y of [1, 2]) {
      const owner = (y === 2 ? YOU : CPU) as PlayerId;
      const id = `s${90 + n++}`;
      game.cards[`c${id}`] = { id: `c${id}`, name: "Stream", owner } as GameState["cards"][string];
      game.sites[id] = { id, cardId: `c${id}`, name: "Stream", x, y, owner, controller: owner, isRubble: false, tapped: false } as GameState["sites"][string];
    }
  }
  const avatar = Object.values(game.units).find((u) => u.isAvatar && u.owner === YOU)!;
  const minion = (id: string, name: string, owner: PlayerId, x: number, y: number) => {
    game.cards[`c${id}`] = { id: `c${id}`, name, owner } as GameState["cards"][string];
    game.units[id] = {
      ...avatar, id, cardId: `c${id}`, name, owner, controller: owner, isAvatar: false, x, y,
      tapped: false, damage: 0, enteredTurn: 1, counters: {}, modifiers: [], carrying: [], carryingUnits: [],
    };
  };
  minion("uBears", "Polar Bears", YOU, 2, 2);
  minion("uElemental", "Frost Elemental", CPU, 2, 1);
  game.cards.cDodge = { id: "cDodge", name: "Dodge Roll", owner: YOU } as GameState["cards"][string];
  game.players[YOU].hand.push("cDodge");
  return game;
}

afterEach(() => {
  cleanup();
  act(() => useEngineSession.setState({ game: null, legal: null }));
});

describe("responses on the opponent's turn (Dodge Roll, Valor)", () => {
  it("asks you during the computer's attack, waits for you, and the ally rolls clear", () => {
    const game = cpuTurnWithDodgeRollInHand();
    const attack = legalActions(game, CPU).find(
      (a) => a.t === "moveAttack" && a.unitId === "uElemental" && a.attack && "unit" in a.attack && a.attack.unit === "uBears",
    );
    expect(attack).toBeDefined();
    expect(applyAction(game, CPU, attack!).ok).toBe(true);

    // the engine asks YOU, mid-way through the computer's turn, and the computer waits for the answer
    expect(game.prompts[0]).toMatchObject({ player: YOU, kind: "yesNo" });
    expect(botNeedsToAct(game, CPU)).toBe(false);

    const dispatch = vi.fn((action: Action) => {
      const result = applyAction(game, YOU, action);
      act(() => useEngineSession.setState((s) => ({ rev: s.rev + 1 })));
      return result;
    });
    act(() => useEngineSession.setState({ game, rev: 1, seat: YOU, mode: "local", legal: [], portalsRevealed: true, dispatch }));
    render(
      <ColorBlindProvider>
        <EnginePromptPanel />
      </ColorBlindProvider>,
    );
    expect(screen.getByText("Polar Bears is attacked — cast Dodge Roll?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ t: "prompt", choice: true }));

    // paid for (to the cemetery), then where to roll: a square pick, still yours
    expect(game.players[YOU].cemetery).toContain("cDodge");
    const where = game.prompts[0];
    expect(where).toMatchObject({ player: YOU, kind: "chooseSquare" });
    const square = (where.data as { squares: { x: number; y: number }[] }).squares[0];
    expect(applyAction(game, YOU, { t: "prompt", promptId: where.id, choice: square }).ok).toBe(true);

    const bears = game.units.uBears;
    expect({ x: bears.x, y: bears.y }).toEqual({ x: square.x, y: square.y });
    expect(bears.damage).toBe(0);
  });
});
