import { describe, expect, it } from "vitest";
import {
  BOARD_DIRECTION,
  BOARD_DIRECTIONS,
  boardArrowForStep,
  boardToEngine,
  cellKeyToEngine,
  ENGINE_DIRECTIONS,
  ENGINE_STEPS,
  engineCellKey,
  engineToBoard,
  engineTileNumber,
  localizeEngineText,
  type ViewerSeat,
} from "./coords";

const VIEWERS: readonly ViewerSeat[] = [0, 1];

describe("engine coordinate localization", () => {
  it("maps engine squares to our tile numbers (y flipped, x kept)", () => {
    expect(engineTileNumber(2, 0)).toBe(18); // engine seat-0 home centre → our bottom centre
    expect(engineTileNumber(2, 3)).toBe(3);
    expect(engineTileNumber(0, 0)).toBe(16); // engine x=0 is seat 0's LEFT: our bottom-left
    expect(engineTileNumber(4, 3)).toBe(5);
  });

  it("rewrites the 1-based 'at (x,y)' site-play form", () => {
    // casting.ts logs (x+1,y+1): "(2,3)" is engine (1,2) → board (1,1) = our tile 7
    expect(localizeEngineText("Computer plays Pebbled Paths at (2,3).")).toBe("Computer plays Pebbled Paths at tile 7.");
    expect(localizeEngineText("Computer plays Forgotten Tomb at (3,4).")).toBe("Computer plays Forgotten Tomb at tile 3.");
    // out of range stays untouched rather than becoming a wrong tile
    expect(localizeEngineText("dealt (9,9) damage")).toBe("dealt (9,9) damage");
  });

  it("puts Courtesan Thaïs's bargain line in the second person", () => {
    expect(localizeEngineText("Thaïs's bargain: You plays this turn for Computer!")).toBe("Thaïs's bargain: You play this turn for Computer!");
    expect(localizeEngineText("Thaïs's bargain: Computer plays this turn for You!")).toBe("Thaïs's bargain: Computer plays this turn for you!");
  });

  it("rewrites the squareLabel form (0-based letter, 1-based number)", () => {
    expect(localizeEngineText("The portents mark a2, c3, e1.")).toBe("The portents mark tile 11, tile 8, tile 20.");
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

  it("reads the engine's compass as printed: north up the screen, east on the right", () => {
    // engine north is away from seat 0, whose avatar starts at engine (2,0) = our bottom centre
    expect(engineTileNumber(2, 0)).toBe(18);
    expect(engineTileNumber(2, 1)).toBe(13); // one step north = one row up our board
    expect(BOARD_DIRECTION.n).toBe("N");
    expect(BOARD_DIRECTION.s).toBe("S");
    expect(BOARD_DIRECTION.e).toBe("E");
    expect(BOARD_DIRECTION.w).toBe("W");
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
    // engine a1 is x=0,y=0, seat 0's near-left corner: board (0,3) = tile 16
    expect(parse("lands at a1")).toBe(engineCellKey(0, 0));
    expect(parse("lands at e4")).toBe(engineCellKey(4, 3));
    expect(parse("lands at c2")).toBe(engineCellKey(2, 1));
  });

  it("leaves options that name no square alone", () => {
    expect(parse("flies off the board")).toBeNull();
    expect(parse("hold fire")).toBeNull();
  });
});

describe("drawing the same engine board for the seat-1 viewer", () => {
  it("puts whichever seat is looking on the near row", () => {
    // the anchor the seat-0 mapping was derived from: seat 0's avatar starts at engine (2,0),
    // seat 1's at engine (2,3), and the viewer always sits at board (2,3)
    expect(engineToBoard(2, 0, 0)).toEqual({ x: 2, y: 3 });
    expect(engineToBoard(2, 3, 1)).toEqual({ x: 2, y: 3 });
    expect(engineToBoard(2, 3, 0)).toEqual({ x: 2, y: 0 });
    expect(engineToBoard(2, 0, 1)).toEqual({ x: 2, y: 0 });
  });

  it("turns the table between the two seats rather than mirroring it", () => {
    // Seat 0 sees the engine's x left to right; seat 1, across the table, sees it right to left.
    expect(engineToBoard(0, 0, 0)).toEqual({ x: 0, y: 3 });
    expect(engineToBoard(0, 0, 1)).toEqual({ x: 4, y: 0 });
    expect(engineToBoard(4, 1, 0)).toEqual({ x: 4, y: 2 });
    expect(engineToBoard(4, 1, 1)).toEqual({ x: 0, y: 1 });
    // one view is the other turned 180°: (x, y) ↔ (4 - x, 3 - y)
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 4; y++) {
        const a = engineToBoard(x, y, 0);
        expect(engineToBoard(x, y, 1)).toEqual({ x: 4 - a.x, y: 3 - a.y });
      }
    }
  });

  it("keeps each seat's own left on its left, as the engine's cards read it", () => {
    // Southpaw Dyrodor's script: "left" is -x for seat 0 and +x for seat 1 (each controller's
    // own left); the Codex puts East (+x) on the first player's right. Each viewer's left is
    // our board's smaller x.
    expect(engineToBoard(1, 1, 0).x).toBeLessThan(engineToBoard(2, 1, 0).x);
    expect(engineToBoard(3, 1, 1).x).toBeLessThan(engineToBoard(2, 1, 1).x);
  });

  it("round-trips every square both ways, for both viewers", () => {
    for (const viewer of VIEWERS) {
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 4; y++) {
          const engine = boardToEngine(x, y, viewer);
          expect(engineToBoard(engine.x, engine.y, viewer)).toEqual({ x, y });
          expect(cellKeyToEngine(engineCellKey(x, y, viewer), viewer)).toEqual({ x, y });
        }
      }
    }
  });

  it("maps every engine direction to the board arrow its own step lands on, for both viewers", () => {
    // Same authority as the seat-0 case: step in engine space, map both ends through the
    // viewer's own transform, and the board delta must be the arrow the table claims.
    for (const viewer of VIEWERS) {
      for (const dir of ENGINE_DIRECTIONS) {
        const [dx, dy] = ENGINE_STEPS[dir];
        const from = engineToBoard(2, 1, viewer); // interior, so the step stays on the board
        const to = engineToBoard(2 + dx, 1 + dy, viewer);
        expect(boardArrowForStep(to.x - from.x, to.y - from.y)).toBe(BOARD_DIRECTIONS[viewer][dir]);
      }
    }
  });

  it("turns every direction around for seat 1, across the table", () => {
    expect(BOARD_DIRECTIONS[1]).toEqual({ n: "S", s: "N", e: "W", w: "E" });
    expect(BOARD_DIRECTIONS[0]).toEqual(BOARD_DIRECTION);
  });

  it("numbers tiles and rewrites log text from the seat-1 viewer's side", () => {
    expect(engineTileNumber(2, 3, 1)).toBe(18); // seat 1's home centre → our bottom centre
    expect(engineTileNumber(2, 0, 1)).toBe(3);
    expect(engineTileNumber(0, 0, 1)).toBe(5);
    expect(localizeEngineText("You plays Stream at (3,4).", 1)).toBe("You play Stream at tile 18.");
    expect(localizeEngineText("Hillock Basilisk moves to c1.", 1)).toBe("Hillock Basilisk moves to tile 3.");
  });

  it("defaults to the seat-0 viewer, so single-player callers are unchanged", () => {
    expect(engineToBoard(1, 2)).toEqual(engineToBoard(1, 2, 0));
    expect(engineCellKey(1, 2)).toBe(engineCellKey(1, 2, 0));
    expect(engineTileNumber(1, 2)).toBe(engineTileNumber(1, 2, 0));
    expect(localizeEngineText("Ends at c1.")).toBe(localizeEngineText("Ends at c1.", 0));
  });
});
