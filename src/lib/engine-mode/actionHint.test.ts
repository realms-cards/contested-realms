import { createGame } from "@sorcery/shared";
import type { Action, GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { actionHint } from "./actionPaths";
import { enginePrecons, toEngineDeck } from "./decks";

/**
 * The hover tooltip on a highlighted tile or card. The board already shows WHERE, so these
 * only have to say WHAT, in a few words.
 */
function game(): EngineState {
  const deck = toEngineDeck(enginePrecons[0]);
  return createGame([deck, deck], ["You", "Computer"], 41, 0 as PlayerId);
}

describe("action hints", () => {
  it("names the site being played and the draw alternative", () => {
    const g = game();
    const site = g.players[0].hand.find((id) => g.cards[id]);
    expect(actionHint(g, { t: "avatarSite", mode: "draw" } as Action)).toBe("Draw a site");
    expect(actionHint(g, { t: "avatarSite", mode: "play", cardId: site!, x: 0, y: 0 } as Action)).toContain("Play ");
  });

  it("distinguishes a move from an attack", () => {
    const g = game();
    const avatar = Object.values(g.units).find((u) => u.isAvatar && u.owner === 0)!;
    expect(actionHint(g, { t: "moveAttack", unitId: avatar.id, path: [] } as unknown as Action)).toContain("Move");
    expect(
      actionHint(g, { t: "moveAttack", unitId: avatar.id, path: [], attack: { site: "s1" } } as unknown as Action),
    ).toContain("attacks the site");
  });

  it("says end the turn", () => {
    expect(actionHint(game(), { t: "endTurn" } as Action)).toBe("End the turn");
  });

  it("falls back to something honest for an action it does not know", () => {
    expect(actionHint(game(), { t: "concede" } as Action)).toBe("Take this action");
  });
});
