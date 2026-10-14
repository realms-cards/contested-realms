import { affinity, createGame } from "@sorcery/shared";
import type { GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { enginePrecons, toEngineDeck } from "./decks";
import { engineSeatResources, manaColor, THRESHOLD_ELEMENTS } from "./resources";

const P0 = 0 as PlayerId;
const P1 = 1 as PlayerId;

function newGame(): EngineState {
  const deck = toEngineDeck(enginePrecons[0]);
  return createGame([deck, deck], ["You", "Computer"], 7, P0);
}

describe("engineSeatResources", () => {
  it("reads the engine's own pool, affinity and pile sizes for each seat", () => {
    const game = newGame();
    for (const seat of [P0, P1]) {
      const player = game.players[seat];
      const aff = affinity(game, seat);
      expect(engineSeatResources(game, seat)).toEqual({
        mana: player.mana,
        total: player.mana,
        thresholds: { air: aff.air, water: aff.water, earth: aff.earth, fire: aff.fire },
        handCount: player.hand.length,
        spellbook: player.spellbook.length,
        atlas: player.atlas.length,
        cemetery: player.cemetery.length,
      });
    }
  });

  it("adds this turn's spent mana to the total and follows judge threshold overrides", () => {
    const game = newGame();
    game.players[0].mana = 2;
    game.flow = { ...(game.flow ?? {}), manaSpent: { 0: 3 }, judgeThresh: { 0: { fire: 2, water: 1 } } };
    const res = engineSeatResources(game, P0);
    expect(res.mana).toBe(2);
    expect(res.total).toBe(5);
    expect(res.thresholds.fire).toBe(affinity(game, P0).fire);
    expect(res.thresholds.fire).toBeGreaterThanOrEqual(2);
    expect(res.thresholds.water).toBeGreaterThanOrEqual(1);
    // the other seat spent nothing
    expect(engineSeatResources(game, P1).total).toBe(game.players[1].mana);
  });

  it("counts piles as they change", () => {
    const game = newGame();
    const before = engineSeatResources(game, P0);
    game.players[0].cemetery.push(game.players[0].hand.pop()!);
    const after = engineSeatResources(game, P0);
    expect(after.handCount).toBe(before.handCount - 1);
    expect(after.cemetery).toBe(before.cemetery + 1);
  });
});

describe("manaColor", () => {
  it("is red when empty, amber once spent, parchment when full", () => {
    expect(manaColor({ mana: 0, total: 3 })).toBe("#ef4444");
    expect(manaColor({ mana: 1, total: 3 })).toBe("#fbbf24");
    expect(manaColor({ mana: 3, total: 3 })).toBe("#fbf6e8");
  });
});

describe("THRESHOLD_ELEMENTS", () => {
  it("lists the four elements in the regular panels' order", () => {
    expect(THRESHOLD_ELEMENTS.map((el) => el.key)).toEqual(["air", "water", "earth", "fire"]);
  });
});
