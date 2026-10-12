"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The pixel action sprites (public/sprites/actions-dark-v1).
 *
 * Presentation only: it takes a state id and plays frames. It never reads or mutates game
 * state — the rail decides which id to show and when to replay.
 *
 * Frames are driven by a timer rather than a CSS `steps()` animation so a sequence can stop
 * on its own idle frame. Every state is a one-shot — see the effect below for why the pack's
 * `loop: true` states are played once here too. `prefers-reduced-motion` pins every state to
 * its idle frame.
 */

export type ActionSpriteId =
  | "log"
  | "tools"
  | "subsurface-off"
  | "subsurface-on"
  | "undo"
  | "cemetery"
  | "collection"
  | "cancel"
  | "confirm"
  | "end-turn"
  | "concede"
  | "concede-armed"
  | "leave"
  | "music"
  | "music-muted";

interface SpriteState {
  row: number;
  frameDurationMs: number;
  loop: boolean;
  idleFrame: number;
}

/**
 * Mirrors assets/manifest.json. Kept as a typed table rather than fetched at runtime so a
 * button can render on its first paint; `actionSprite.test.ts` asserts it still matches the
 * shipped manifest, so a re-export of the art cannot drift from this silently.
 */
export const ACTION_SPRITES: Record<ActionSpriteId, SpriteState> = {
  log: { row: 0, frameDurationMs: 100, loop: false, idleFrame: 0 },
  tools: { row: 1, frameDurationMs: 90, loop: false, idleFrame: 0 },
  "subsurface-off": { row: 2, frameDurationMs: 100, loop: false, idleFrame: 5 },
  "subsurface-on": { row: 3, frameDurationMs: 100, loop: false, idleFrame: 5 },
  undo: { row: 4, frameDurationMs: 100, loop: false, idleFrame: 0 },
  cemetery: { row: 5, frameDurationMs: 140, loop: true, idleFrame: 0 },
  collection: { row: 6, frameDurationMs: 110, loop: false, idleFrame: 0 },
  cancel: { row: 7, frameDurationMs: 55, loop: false, idleFrame: 0 },
  confirm: { row: 8, frameDurationMs: 85, loop: false, idleFrame: 5 },
  "end-turn": { row: 9, frameDurationMs: 120, loop: false, idleFrame: 0 },
  concede: { row: 10, frameDurationMs: 100, loop: false, idleFrame: 5 },
  "concede-armed": { row: 11, frameDurationMs: 110, loop: true, idleFrame: 5 },
  leave: { row: 12, frameDurationMs: 110, loop: false, idleFrame: 0 },
  music: { row: 13, frameDurationMs: 140, loop: true, idleFrame: 0 },
  "music-muted": { row: 14, frameDurationMs: 140, loop: false, idleFrame: 0 },
};

export const ATLAS_URL = "/sprites/actions-dark-v1/atlas.png";
export const SPRITE_FRAME = 64;
export const SPRITE_COLUMNS = 6;
export const SPRITE_ROWS = 15;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ActionSprite({
  id,
  size = 32,
  /** Change this value to replay the sprite (hover, activation, a state transition). */
  playKey,
}: {
  id: ActionSpriteId;
  size?: number;
  playKey?: string | number;
}) {
  const state = ACTION_SPRITES[id];
  const [frame, setFrame] = useState(state.idleFrame);
  const firstPlay = useRef(true);

  useEffect(() => {
    setFrame(ACTION_SPRITES[id].idleFrame);
  }, [id]);

  useEffect(() => {
    const sprite = ACTION_SPRITES[id];
    if (prefersReducedMotion()) {
      setFrame(sprite.idleFrame);
      return;
    }
    // Nothing on this rail ever animates continuously, including the states the art pack
    // marks `loop: true` (music, cemetery, concede-armed). A button that keeps moving while
    // you are reading the board is a distraction, not information — every state plays its
    // six frames once on hover or on a real state change, then holds its idle frame.
    if (playKey === undefined) return;
    if (firstPlay.current) {
      firstPlay.current = false;
      setFrame(sprite.idleFrame);
      return;
    }

    let step = 0;
    setFrame(0);
    const timer = setInterval(() => {
      step += 1;
      if (step >= SPRITE_COLUMNS) {
        clearInterval(timer);
        setFrame(sprite.idleFrame);
        return;
      }
      setFrame(step);
    }, sprite.frameDurationMs);
    return () => clearInterval(timer);
  }, [id, playKey]);

  return (
    <span
      aria-hidden
      className="block shrink-0"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${ATLAS_URL})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${SPRITE_COLUMNS * size}px ${SPRITE_ROWS * size}px`,
        backgroundPosition: `-${frame * size}px -${state.row * size}px`,
        imageRendering: "pixelated",
      }}
    />
  );
}
