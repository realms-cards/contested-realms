import { describe, expect, it } from "vitest";
import { computeBoard2DSizing } from "./useBoard2DSizing";
import type { Area2D, Board2DSizing, Box2D } from "./useBoard2DSizing";

const overlaps = (a: Box2D, b: Box2D) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** iPhone-ish safe-area insets: the usable area the page actually measures. */
const inset = (w: number, h: number) => (w > h ? [w - 2 * 47, h - 21] : [w, h - 47 - 34]);

/** Every box the layout placed, by name. */
const placed = (s: Board2DSizing) =>
  (Object.entries(s.boxes) as Array<[Area2D, Box2D | undefined]>).filter((e): e is [Area2D, Box2D] => !!e[1]);

const SIZES: Array<[number, number]> = [
  [390, 844],
  [430, 932],
  [844, 390],
  [932, 430],
  [360, 640],
];

describe("computeBoard2DSizing", () => {
  for (const [w, h] of SIZES) {
    for (const [label, [uw, uh]] of [
      ["full viewport", [w, h]],
      ["inside safe-area insets", inset(w, h)],
    ] as const) {
      it(`${w}x${h} (${label}): board and hand never overlap and everything fits`, () => {
        const s = computeBoard2DSizing(uw, uh);
        expect(s.layout).toBe(uw > uh ? "landscape" : "portrait");
        const { board, hand } = s.boxes;

        // the board is exactly 5 x 4 tiles (not necessarily square), and big enough to tap
        expect(board.w).toBe(5 * s.tileW);
        expect(board.h).toBe(4 * s.tileH);
        expect(s.tile).toBe(Math.min(s.tileW, s.tileH));
        expect(s.tile).toBeGreaterThanOrEqual(56);
        // the hand strip holds its cards (Hand2D: cardHeight + 8, plus a scrollbar)
        expect(hand.h).toBeGreaterThanOrEqual(s.handCardH + 8);
        expect(s.handCardH).toBeGreaterThanOrEqual(60);
        expect(s.handCardH).toBeLessThanOrEqual(128);

        // every area is inside the usable area, and no two areas share a pixel
        const boxes = placed(s);
        for (const [name, b] of boxes) {
          expect(b.w, name).toBeGreaterThan(0);
          expect(b.h, name).toBeGreaterThan(0);
          expect(b.x, name).toBeGreaterThanOrEqual(0);
          expect(b.y, name).toBeGreaterThanOrEqual(0);
          expect(b.x + b.w, name).toBeLessThanOrEqual(uw);
          expect(b.y + b.h, name).toBeLessThanOrEqual(uh);
        }
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} / ${boxes[j][0]}`).toBe(false);
          }
        }
        // the hand sits below the board, never beside or over it
        expect(hand.y).toBeGreaterThanOrEqual(board.y + board.h);
        if (s.layout === "portrait") {
          // the prompt dock always has room for a docked banner
          expect(s.boxes.dock?.h).toBeGreaterThanOrEqual(64);
        } else {
          // the inspector column holds the dock, the feed and the actions: a usable width
          expect(s.boxes.side?.w).toBeGreaterThanOrEqual(260);
          // a phone's inspector stops above the hand row, which runs on under it
          expect(s.boxes.side?.h).toBeGreaterThanOrEqual(240);
          expect(hand.w).toBe(board.w + 4 + (s.boxes.side?.w ?? 0));
        }
      });
    }
  }

  it("portrait: the board takes the width; spare height goes to the hand first", () => {
    const phone = computeBoard2DSizing(390, 844);
    expect(phone.tile).toBe(Math.floor((390 - 16) / 5));
    expect(phone.tileH).toBe(phone.tileW);
    expect(phone.handCardH).toBe(128);
    // a short phone squashes its rows a little (never under 88% of square) for a readable hand and prompt
    const small = computeBoard2DSizing(360, 640);
    expect(small.tileW).toBe(68);
    expect(small.tileH).toBe(60);
    expect(small.boxes.dock?.h).toBe(136);
    expect(small.boxes.board.w).toBe(340);
    expect(small.handCardH).toBeLessThan(128);
    expect(small.handCardH).toBeGreaterThanOrEqual(108);
  });

  it("portrait: a short phone's dock still fits a banner's title, hint and button row", () => {
    for (const [w, h] of [
      [360, 640],
      [375, 667],
      [390, 844],
    ] as const) {
      const s = computeBoard2DSizing(w, h);
      expect(s.boxes.dock?.h, `${w}x${h}`).toBeGreaterThanOrEqual(96);
    }
  });

  it("portrait: the dock row is split, the card preview left of the prompt dock", () => {
    for (const [w, h] of [
      [390, 844],
      [390, 763],
      [360, 640],
      [430, 932],
    ] as const) {
      const s = computeBoard2DSizing(w, h);
      const preview = s.boxes.preview as Box2D;
      const dock = s.boxes.dock as Box2D;
      // one row: same top and height, side by side with the usual gap, spanning the width
      expect(preview.y, `${w}x${h}`).toBe(dock.y);
      expect(preview.h, `${w}x${h}`).toBe(dock.h);
      expect(preview.x, `${w}x${h}`).toBe(8);
      expect(dock.x, `${w}x${h}`).toBe(preview.x + preview.w + 4);
      expect(dock.x + dock.w, `${w}x${h}`).toBe(w - 8);
      // the preview takes at most about half; the prompt keeps a readable column
      expect(preview.w, `${w}x${h}`).toBeLessThanOrEqual(Math.floor((w - 16) * 0.45));
      expect(preview.w, `${w}x${h}`).toBeGreaterThanOrEqual(90);
      expect(dock.w, `${w}x${h}`).toBeGreaterThanOrEqual(200);
    }
    // a phone's landscape keeps the preview inside the inspector column
    expect(computeBoard2DSizing(844, 390).boxes.preview).toBeUndefined();
  });

  it("portrait grid tracks add up to the boxes", () => {
    const s = computeBoard2DSizing(430, 932);
    const rows = s.rows.split(" ").map((r) => Number.parseInt(r, 10));
    const order: Area2D[] = ["oppBar", "board", "dock", "myBar", "hand", "actions"];
    expect(rows).toEqual(order.map((name) => s.boxes[name]?.h));
    expect(s.boxes.side).toBeUndefined();
    // no reserved status row: the board starts right under the opponent's bar
    expect(s.boxes.status).toBeUndefined();
    expect(s.boxes.board.y).toBe(s.boxes.oppBar.y + s.boxes.oppBar.h + 4);
  });

  it("landscape: rail, board over hand, then the inspector column, left to right", () => {
    const s = computeBoard2DSizing(844, 390);
    const { board, hand, oppBar } = s.boxes;
    const side = s.boxes.side as Box2D;
    expect(oppBar.x + oppBar.w).toBeLessThanOrEqual(hand.x);
    expect(board.x + board.w).toBeLessThanOrEqual(side.x);
    // the hand runs on under the inspector: the board alone is too narrow a row for a full hand
    expect(hand.x).toBe(board.x);
    expect(hand.x + hand.w).toBe(side.x + side.w);
    expect(hand.y + hand.h).toBeLessThanOrEqual(390);
    // the inspector spans the board's height, so the prompt, feed and actions stack beside it
    expect(side.y).toBe(4);
    expect(side.h).toBe(board.h);
    expect(side.y + side.h).toBeLessThanOrEqual(hand.y);
    // portrait's own boxes are not placed
    expect(s.boxes.dock).toBeUndefined();
    expect(s.boxes.actions).toBeUndefined();
  });

  it("landscape: the width a height-bound board leaves goes to the inspector, then stretches the tiles", () => {
    for (const [w, h] of [
      [844, 390],
      [932, 430],
      [740, 360],
    ]) {
      const s = computeBoard2DSizing(w, h);
      const { board, oppBar } = s.boxes;
      const side = s.boxes.side as Box2D;
      // no dead strip between the board and the inspector
      expect(side.x, `${w}x${h}`).toBe(board.x + board.w + 4);
      expect(oppBar.x + oppBar.w + 4, `${w}x${h}`).toBe(board.x);
      expect(side.w, `${w}x${h}`).toBeGreaterThan(oppBar.w);
      expect(side.x + side.w, `${w}x${h}`).toBeLessThanOrEqual(w - 8);
      // no empty margins: the composition spans the window
      expect(oppBar.x, `${w}x${h}`).toBe(8);
      expect(side.x + side.w, `${w}x${h}`).toBe(w - 8);
      const cols = s.columns.split(" ").map((c) => Number.parseInt(c, 10));
      expect(cols, `${w}x${h}`).toEqual([oppBar.w, board.w, side.w]);
    }
    // the phone that cut off the Genesis prompt's Confirm had a 165px prompt column
    expect(computeBoard2DSizing(844, 390).boxes.side?.w).toBeGreaterThanOrEqual(260);
  });

  it("phone-width seat bars use the tight one-line layout; landscape stacks them in a rail", () => {
    expect(computeBoard2DSizing(390, 844).seatBar).toBe("tight");
    expect(computeBoard2DSizing(430, 932).seatBar).toBe("tight");
    expect(computeBoard2DSizing(360, 640).seatBar).toBe("tight");
    expect(computeBoard2DSizing(844, 390).seatBar).toBe("columnTight");
    // a tablet in portrait has room for labels and the avatar's name on one line
    expect(computeBoard2DSizing(768, 1024).seatBar).toBe("full");
  });

  it("a tablet in portrait grows the board past the phone cap", () => {
    const s = computeBoard2DSizing(768, 1024);
    expect(s.layout).toBe("portrait");
    expect(s.tile).toBe(Math.floor((768 - 16) / 5));
    expect(s.handCardH).toBeGreaterThan(112);
  });

  for (const [w, h] of [
    [1512, 906],
    [1440, 900],
    [1280, 720],
    [1920, 1080],
    [1024, 768],
  ] as const) {
    it(`${w}x${h} desktop: the wide layout fills the window without overlaps`, () => {
      const s = computeBoard2DSizing(w, h);
      expect(s.layout).toBe("wide");
      expect(s.seatBar).toBe("column");
      const boxes = placed(s);
      for (const [name, b] of boxes) {
        expect(b.x + b.w, name).toBeLessThanOrEqual(w);
        expect(b.y + b.h, name).toBeLessThanOrEqual(h);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i][1], boxes[j][1]), `${boxes[i][0]} / ${boxes[j][0]}`).toBe(false);
        }
      }
      const { board, hand, oppBar } = s.boxes;
      const side = s.boxes.side as Box2D;
      expect(hand.y).toBeGreaterThanOrEqual(board.y + board.h);
      // the board and the hand fill the height (not a phone's 58%)
      expect(board.h + hand.h).toBeGreaterThanOrEqual(0.9 * (h - 8));
      // the inspector is readable but capped: never a slab (plus the pixels five tiles leave)
      expect(side.w).toBeGreaterThanOrEqual(300);
      expect(side.w).toBeLessThanOrEqual(424);
      expect(oppBar.h).toBeGreaterThan(100);
      // the left column: the opponent's stats, the card preview, your stats; nothing to either side
      const preview = s.boxes.preview as Box2D;
      expect(preview.x).toBe(oppBar.x);
      expect(preview.w).toBe(oppBar.w);
      expect(preview.y).toBe(oppBar.y + oppBar.h + 4);
      expect(preview.y + preview.h + 4).toBe(s.boxes.myBar.y);
      expect(preview.h).toBeGreaterThanOrEqual(240);
      expect(oppBar.x).toBe(8);
      expect(side.x + side.w).toBe(w - 8);
      expect(board.x).toBe(oppBar.x + oppBar.w + 4);
      // the hand row gets a generous share of the height: big, readable cards
      expect(s.handCardH).toBeGreaterThanOrEqual(0.15 * h);
    });
  }

  it("1440x900 desktop: big tiles and hand cards", () => {
    const s = computeBoard2DSizing(1440, 900);
    expect(s.tile).toBeGreaterThanOrEqual(160);
    expect(s.boxes.board.h).toBeGreaterThanOrEqual(0.7 * 900);
    expect(s.handCardH).toBeGreaterThanOrEqual(165);
    expect(s.boxes.side?.w).toBeGreaterThanOrEqual(300);
  });

  it("portrait seat bars are slim single lines", () => {
    for (const [w, h] of [
      [390, 844],
      [360, 640],
    ] as const) {
      const s = computeBoard2DSizing(w, h);
      expect(s.boxes.oppBar.h, `${w}x${h}`).toBeLessThanOrEqual(32);
      expect(s.boxes.myBar.h, `${w}x${h}`).toBeLessThanOrEqual(32);
    }
  });

  for (const [w, h] of [
    [844, 390],
    [932, 430],
    [750, 369],
    [1512, 906],
    [1440, 900],
    [1920, 1080],
    [1280, 720],
    [1024, 768],
  ] as const) {
    it(`${w}x${h}: the seats are slim columns in a rail, the opponent above you`, () => {
      const s = computeBoard2DSizing(w, h);
      const { oppBar, myBar, board, hand } = s.boxes;
      const side = s.boxes.side as Box2D;
      // one rail left of the board (a desktop's grows with the window), both seats the same width
      if (s.layout === "wide") {
        expect(oppBar.w).toBeGreaterThanOrEqual(200);
        expect(oppBar.w).toBeLessThanOrEqual(300);
      } else {
        expect(oppBar.w).toBeLessThanOrEqual(88);
        expect(oppBar.w).toBeGreaterThanOrEqual(64);
      }
      expect(myBar.w).toBe(oppBar.w);
      expect(myBar.x).toBe(oppBar.x);
      expect(oppBar.x + oppBar.w).toBeLessThanOrEqual(Math.min(board.x, hand.x));
      // the opponent's stack at the top, yours at the bottom, never touching
      expect(oppBar.y).toBe(4);
      expect(myBar.y + myBar.h).toBe(h - 4);
      expect(oppBar.y + oppBar.h).toBeLessThan(myBar.y);
      // tall enough for the stack (life, mana, thresholds and the 2 x 2 pile chips)
      expect(oppBar.h).toBeGreaterThanOrEqual(s.layout === "wide" ? 180 : 150);
      // the inspector: right of the board; the full height on a desktop, above the hand on a phone
      expect(side.x).toBeGreaterThanOrEqual(board.x + board.w);
      expect(side.y).toBe(4);
      expect(side.y + side.h).toBe(s.layout === "wide" ? h - 4 : board.y + board.h);
    });
  }

  it("desktop: the hand row is sized first, then the board; a very wide window stretches the tiles", () => {
    const s = computeBoard2DSizing(1512, 906);
    expect(s.layout).toBe("wide");
    expect(s.tile).toBeGreaterThanOrEqual(170);
    expect(s.handCardH).toBeGreaterThanOrEqual(170);
    expect(s.boxes.side?.w).toBeGreaterThanOrEqual(340);
    const big = computeBoard2DSizing(2560, 1080);
    const side = big.boxes.side as Box2D;
    expect(side.w).toBeLessThanOrEqual(424);
    // the board fills the width the columns leave: wide tiles, no margins
    expect(big.boxes.oppBar.x).toBe(8);
    expect(side.x + side.w).toBe(2560 - 8);
    expect(big.tileW).toBeGreaterThan(big.tileH);
    expect(big.tile).toBe(big.tileH);
  });

  it("a small desktop window keeps the phone landscape layout", () => {
    expect(computeBoard2DSizing(900, 500).layout).toBe("landscape");
  });

  it("a tiny window still produces a non-negative layout", () => {
    const s = computeBoard2DSizing(0, 0);
    expect(s.tile).toBeGreaterThanOrEqual(1);
  });
});
