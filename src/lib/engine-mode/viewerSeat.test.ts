import { createGame } from "@sorcery/shared";
import type { Action, GameState as EngineState, PlayerId } from "@sorcery/shared";
import { describe, expect, it } from "vitest";
import { actionPaths, tokenForEngineId } from "./actionPaths";
import { areaFootprints } from "./areaPrompt";
import { cellKeyToEngine, engineCellKey } from "./coords";
import { enginePrecons, toEngineDeck } from "./decks";

/**
 * Everything the player clicks is a BOARD token, and the board is drawn from one seat's side.
 * A seat-1 viewer therefore gets different tokens for the same engine objects — and the click
 * has to land back on the engine square the action named, not on its mirror image. Seat 0 is
 * the default throughout, so single player is exactly as it was.
 */
function game(): EngineState {
  const deck = toEngineDeck(enginePrecons[0]);
  return createGame([deck, deck], ["You", "Opponent"], 11, 0 as PlayerId);
}

const VIEWERS = [0, 1] as const;

describe("board tokens for the seat that is looking", () => {
  it("calls whichever avatar is ours p1", () => {
    const g = game();
    for (const viewer of VIEWERS) {
      const mine = g.players[viewer].avatarUnitId;
      const theirs = g.players[viewer === 0 ? 1 : 0].avatarUnitId;
      expect(tokenForEngineId(g, mine, viewer, viewer)).toBe("unit:avatar:p1");
      expect(tokenForEngineId(g, theirs, viewer, viewer)).toBe("unit:avatar:p2");
    }
  });

  it("puts a card we hold in our own hand row", () => {
    const g = game();
    const cardId = g.players[1].hand[0];
    expect(tokenForEngineId(g, cardId, 1, 1)).toBe(`hand:p1:${cardId}`);
    // the same card seen from the other side of the table is the opponent's
    expect(tokenForEngineId(g, cardId, 1, 0)).toBe(`hand:p2:${cardId}`);
  });

  it("takes a click back to the square the action named", () => {
    const g = game();
    const cardId = g.players[1].hand[0];
    const play = { t: "avatarSite", mode: "play", cardId, x: 0, y: 0 } as Action;
    for (const viewer of VIEWERS) {
      const { paths } = actionPaths(g, [play], 1, viewer);
      const tile = paths[0].steps[1];
      expect(cellKeyToEngine(tile, viewer)).toEqual({ x: 0, y: 0 });
    }
    // and the two viewers really are being offered different squares on screen
    expect(actionPaths(g, [play], 1, 0).paths[0].steps[1]).not.toBe(actionPaths(g, [play], 1, 1).paths[0].steps[1]);
  });

  it("walks a unit to the tile the board shows it on", () => {
    const g = game();
    const avatar = g.units[g.players[1].avatarUnitId];
    const step = { x: avatar.x, y: avatar.y - 1, region: "surface" };
    const move = { t: "moveAttack", unitId: avatar.id, path: [step] } as unknown as Action;
    const { paths } = actionPaths(g, [move], 1, 1);
    expect(paths[0].steps[0]).toBe("unit:avatar:p1");
    expect(paths[0].steps[1]).toBe(engineCellKey(step.x, step.y, 1));
  });
});

describe("area footprints for the seat that is looking", () => {
  it("covers the same engine squares, drawn on each viewer's own board", () => {
    const g = game();
    const anchor = { x: 1, y: 1 };
    const engineSquares = (viewer: 0 | 1) =>
      areaFootprints(g, [anchor], viewer)[engineCellKey(anchor.x, anchor.y, viewer)]
        .map((cell) => cellKeyToEngine(cell, viewer))
        .map((sq) => `${sq.x},${sq.y}`)
        .sort();
    expect(engineSquares(1)).toEqual(engineSquares(0));
    // ...on genuinely different board cells, or the seat-1 player would be clicking the mirror
    expect(Object.keys(areaFootprints(g, [anchor], 1))).not.toEqual(Object.keys(areaFootprints(g, [anchor])));
  });
});
