import { actingSeatFor, applyAction, createGame } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { botNeedsToAct } from "@untested-realm/bot/bot";
import { describe, expect, it } from "vitest";
import { legalActionsWithCasters } from "@shared/engine/casterActions";
import { enginePrecons, toEngineDeck } from "./decks";
import { humanDecisionSeat, isPiloting } from "./session";

/**
 * Courtesan Thaïs hands the human the opponent's turn. The engine marks it with
 * `flow.thaisActive`: the active player stays seat 1 but the decisions belong to seat 0.
 * Gating our UI on `activePlayer === 0` left nobody able to act — the human got no legal
 * moves and the bot correctly declined, because the choices were not its own.
 */
function piloted(): EngineState {
  const deck = toEngineDeck(enginePrecons[0]);
  const game = createGame([deck, deck], ["You", "Computer"], 5, 0 as PlayerId);
  game.flow = { ...(game.flow ?? {}), thaisActive: 1 as PlayerId };
  game.activePlayer = 1 as PlayerId;
  game.phase = "main";
  return game;
}

describe("piloting the opponent's turn", () => {
  it("is the state neither side could act in", () => {
    const game = piloted();
    // the engine redirects the decisions to us...
    expect(actingSeatFor(game, game.activePlayer)).toBe(0);
    // ...and the bot therefore declines, which is correct and left the match stuck
    expect(botNeedsToAct(game, 1)).toBe(false);
  });

  it("names the seat whose turn we are deciding", () => {
    const game = piloted();
    expect(humanDecisionSeat(game)).toBe(1);
    expect(isPiloting(game)).toBe(true);
  });

  it("reports our own seat, and not piloting, on a normal turn", () => {
    const deck = toEngineDeck(enginePrecons[0]);
    const game = createGame([deck, deck], ["You", "Computer"], 5, 0 as PlayerId);
    game.phase = "main";
    game.activePlayer = 0 as PlayerId;
    expect(humanDecisionSeat(game)).toBe(0);
    expect(isPiloting(game)).toBe(false);

    game.activePlayer = 1 as PlayerId;
    expect(humanDecisionSeat(game)).toBeNull();
  });

  it("only enumerates moves once the pilot marker is stripped from the copy we ask about", () => {
    const game = piloted();
    // this is the trap: the generator will not enumerate for a seat it thinks is piloted
    expect(legalActionsWithCasters(game, 1)).toHaveLength(0);

    const clone = JSON.parse(JSON.stringify(game)) as EngineState;
    const flow: { thaisActive?: PlayerId } | undefined = clone.flow;
    delete flow?.thaisActive;
    const actions = legalActionsWithCasters(clone, 1);
    expect(actions.length).toBeGreaterThan(0);

    // and those actions really are accepted by the REAL state when the human sends them:
    // applyAction does the seat remap itself
    const probe = JSON.parse(JSON.stringify(game)) as EngineState;
    expect(applyAction(probe, 0, actions[0]).ok).toBe(true);
  });
});
