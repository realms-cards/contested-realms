import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_SPRITES, SPRITE_COLUMNS, SPRITE_FRAME, SPRITE_ROWS } from "./ActionSprite";

/**
 * The sprite table in ActionSprite.tsx is a hand-written mirror of the art pack's manifest,
 * so a button can paint on its first frame without fetching. These tests are what stop the
 * two drifting: re-export the art with different timings or a reordered atlas and they fail
 * rather than silently animating the wrong row.
 */
interface Manifest {
  frameWidth: number;
  frameHeight: number;
  columns: number;
  rows: number;
  framesPerState: number;
  states: Record<
    string,
    { row: number; frameDurationMs: number; loop: boolean; idleFrame: number; frames: { x: number; y: number }[] }
  >;
}

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "public/sprites/actions-dark-v1/manifest.json"), "utf8"),
) as Manifest;

describe("action sprite table", () => {
  it("matches the shipped atlas geometry", () => {
    expect(manifest.frameWidth).toBe(SPRITE_FRAME);
    expect(manifest.frameHeight).toBe(SPRITE_FRAME);
    expect(manifest.columns).toBe(SPRITE_COLUMNS);
    expect(manifest.rows).toBe(SPRITE_ROWS);
    expect(manifest.framesPerState).toBe(SPRITE_COLUMNS);
  });

  it("covers every state in the manifest, and no invented ones", () => {
    expect(Object.keys(ACTION_SPRITES).sort()).toEqual(Object.keys(manifest.states).sort());
  });

  it("agrees with the manifest on row, timing, loop and idle frame", () => {
    for (const [id, state] of Object.entries(manifest.states)) {
      expect(ACTION_SPRITES[id as keyof typeof ACTION_SPRITES], id).toEqual({
        row: state.row,
        frameDurationMs: state.frameDurationMs,
        loop: state.loop,
        idleFrame: state.idleFrame,
      });
    }
  });

  it("places every frame where our background-position maths expects it", () => {
    for (const [id, state] of Object.entries(manifest.states)) {
      state.frames.forEach((cell, index) => {
        expect(cell.x, `${id} frame ${index} x`).toBe(index * SPRITE_FRAME);
        expect(cell.y, `${id} frame ${index} y`).toBe(state.row * SPRITE_FRAME);
      });
      expect(state.idleFrame, `${id} idle frame in range`).toBeLessThan(SPRITE_COLUMNS);
    }
  });
});
