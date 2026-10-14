import { describe, expect, it } from "vitest";
import {
  BOARD_DIRECTION,
  boardArrowForStep,
  ENGINE_DIRECTIONS,
  ENGINE_STEPS,
  engineCellKey,
  engineToBoard,
  engineTileNumber,
  localizeEngineText,
} from "./coords";

describe("engine coordinate localization", () => {
  it("maps engine squares to our tile numbers (180° rotation)", () => {
    expect(engineTileNumber(2, 0)).toBe(18); // engine seat-0 home centre → our bottom centre
    expect(engineTileNumber(2, 3)).toBe(3);
    expect(engineTileNumber(0, 0)).toBe(20);
    expect(engineTileNumber(4, 3)).toBe(1);
  });

  it("rewrites the 1-based 'at (x,y)' site-play form", () => {
    // casting.ts logs (x+1,y+1): "(2,3)" is engine (1,2) → our tile 9
    expect(localizeEngineText("Computer plays Pebbled Paths at (2,3).")).toBe("Computer plays Pebbled Paths at tile 9.");
    expect(localizeEngineText("Computer plays Forgotten Tomb at (3,4).")).toBe("Computer plays Forgotten Tomb at tile 3.");
    // out of range stays untouched rather than becoming a wrong tile
    expect(localizeEngineText("dealt (9,9) damage")).toBe("dealt (9,9) damage");
  });

  it("puts Courtesan Thaïs's bargain line in the second person", () => {
    expect(localizeEngineText("Thaïs's bargain: You plays this turn for Computer!")).toBe("Thaïs's bargain: You play this turn for Computer!");
    expect(localizeEngineText("Thaïs's bargain: Computer plays this turn for You!")).toBe("Thaïs's bargain: Computer plays this turn for you!");
  });

  it("rewrites the squareLabel form (0-based letter, 1-based number)", () => {
    expect(localizeEngineText("The portents mark a2, c3, e1.")).toBe("The portents mark tile 15, tile 8, tile 16.");
    expect(localizeEngineText("Hillock Basilisk moves to c1.")).toBe("Hillock Basilisk moves to tile 18.");
    expect(localizeEngineText("no coords here")).toBe("no coords here");
  });

  it("leaves a bare 0-based coordinate label alone (it is ambiguous with the 1-based form)", () => {
    expect(localizeEngineText("Sacred Scarabs (1,2)")).toBe("Sacred Scarabs (1,2)");
  });

  it("maps every engine direction to the board arrow its own step lands on", () => {
    // The authority is the rotation itself: step in engine space, rotate both ends, and the
    // board delta must be the arrow we claim. A guessed table would fail here.
    for (const dir of ENGINE_DIRECTIONS) {
      const [dx, dy] = ENGINE_STEPS[dir];
      const from = engineToBoard(2, 1); // interior, so the step stays on the board
      const to = engineToBoard(2 + dx, 1 + dy);
      expect(boardArrowForStep(to.x - from.x, to.y - from.y)).toBe(BOARD_DIRECTION[dir]);
    }
  });

  it("keeps north running up the screen and swaps only east/west", () => {
    // engine north is away from seat 0, whose avatar starts at engine (2,0) = our bottom centre
    expect(engineTileNumber(2, 0)).toBe(18);
    expect(engineTileNumber(2, 1)).toBe(13); // one step north = one row up our board
    expect(BOARD_DIRECTION.n).toBe("N");
    expect(BOARD_DIRECTION.s).toBe("S");
    expect(BOARD_DIRECTION.e).toBe("W");
    expect(BOARD_DIRECTION.w).toBe("E");
  });

  it("writes the player's own lines in the second person", () => {
    expect(localizeEngineText("You plays Stream at (3,1).")).toBe("You play Stream at tile 18.");
    expect(localizeEngineText("You draws a card from their spellbook.")).toBe("You draw a card from their spellbook.");
    expect(localizeEngineText("You mills 2 from their spellbook.")).toBe("You mill 2 from their spellbook.");
    expect(localizeEngineText("You banishes it.")).toBe("You banish it.");
    // a line about someone else keeps its own grammar
    expect(localizeEngineText("Rimland Nomads attacks Harbinger!")).toBe("Rimland Nomads attacks Harbinger!");
  });
});

describe("square-naming engine options", () => {
  // Mirrors squareOptionsFor in EnginePromptPanel: the engine's squareLabel(x,y) is a 0-based
  // letter and a 1-based number, which is the form Chaos Twister's landing roll uses.
  const parse = (option: string): string | null => {
    const match = /\b([a-e])([1-4])\b/.exec(option);
    if (!match) return null;
    const x = match[1].charCodeAt(0) - 97;
    const y = Number(match[2]) - 1;
    return engineCellKey(x, y);
  };

  it("reads a landing square out of the engine's wording", () => {
    // engine a1 is x=0,y=0, which our 180° rotation puts at board (4,3) = tile 20
    expect(parse("lands at a1")).toBe(engineCellKey(0, 0));
    expect(parse("lands at e4")).toBe(engineCellKey(4, 3));
    expect(parse("lands at c2")).toBe(engineCellKey(2, 1));
  });

  it("leaves options that name no square alone", () => {
    expect(parse("flies off the board")).toBeNull();
    expect(parse("hold fire")).toBeNull();
  });
});
