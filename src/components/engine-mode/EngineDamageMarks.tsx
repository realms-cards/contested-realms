"use client";

import { Html } from "@react-three/drei";
import { auraPlacement, PINNED_SCALE, unitCell } from "@/lib/engine-mode/projection";
import { HUMAN_SEAT, useEngineSession } from "@/lib/engine-mode/session";
import { getPermanentOwnerBaseZ } from "@/lib/game/boardShared";
import { TILE_SIZE } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import { occupiedSquares } from "@sorcery/shared";

/**
 * A standing mark on every minion carrying damage.
 *
 * `unit.damage` is exactly "hurt this turn and still alive": the engine zeroes it for every
 * non-avatar at the start of a turn (turn.ts:27 and :416), and a unit that died is gone from
 * `units` altogether. Avatars are excluded — their loss is life, which the life counters
 * already show.
 *
 * Deliberately static. The floating numbers in EngineEventReveal are the event; this is the
 * lasting state, and a board full of pulsing badges would be noise.
 */

/** Cards sit offset toward their owner, so the badge rides along (see PermanentStack). */
const OWNER_SHIFT = TILE_SIZE * 0.15;
/** Up and to the right of the card's centre, clear of the art. */
const CORNER_X = TILE_SIZE * 0.3;
const CORNER_Z = TILE_SIZE * 0.26;
/** Under the DOM HUD and the prompt shell, above the board. */
const HTML_Z: [number, number] = [25, 0];

export default function EngineDamageMarks() {
  const game = useEngineSession((s) => s.game);
  useEngineSession((s) => s.rev);
  const layer = useEngineSession((s) => s.layer);
  const width = useGameStore((s) => s.board.size.w);
  const height = useGameStore((s) => s.board.size.h);
  if (!game || game.phase === "mulligan" || game.phase === "over") return null;

  const offsetX = -((width - 1) * TILE_SIZE) / 2;
  const offsetY = -((height - 1) * TILE_SIZE) / 2;
  const surface = layer !== "subsurface";

  const marks = Object.values(game.units).filter((unit) => {
    if (unit.isAvatar || !unit.damage || unit.damage <= 0) return false;
    if (unit.carriedBy) return false; // riding inside another unit; it has no card of its own
    // only mark what the player is actually looking at
    const onSurface = !unit.region || unit.region === "surface";
    return onSurface === surface;
  });
  if (!marks.length) return null;

  return (
    <group>
      {marks.map((unit) => {
        // A multi-square body is drawn pinned at its footprint's centre, smaller (projectView's
        // auraPlacement + PINNED_SCALE), with the owner nudge cancelled: ride on THAT card.
        const owner = unit.controller === HUMAN_SEAT ? 1 : 2;
        const body = occupiedSquares(unit);
        const placed = body.length > 1 ? auraPlacement(body, owner) : null;
        const [bx, by] = (placed?.at ?? unitCell(unit)).split(",").map(Number);
        // engine seat 0 is our p1, who sits at the near edge; its cards shift toward it
        const toward = placed
          ? placed.offset[1] + getPermanentOwnerBaseZ(owner)
          : unit.controller === HUMAN_SEAT
            ? OWNER_SHIFT
            : -OWNER_SHIFT;
        const sideX = placed ? placed.offset[0] : 0;
        const corner = placed ? PINNED_SCALE : 1;
        return (
          <Html
            key={unit.id}
            center
            zIndexRange={HTML_Z}
            style={{ pointerEvents: "none" }}
            position={[
              offsetX + bx * TILE_SIZE + sideX + CORNER_X * corner,
              0.12,
              offsetY + by * TILE_SIZE + toward - CORNER_Z * corner,
            ]}
          >
            <span
              title={`${unit.name} has taken ${unit.damage} damage this turn`}
              className="flex h-5 min-w-[20px] select-none items-center justify-center rounded-full px-1 font-rc-mono text-[11px] font-bold tabular-nums leading-none text-rc-fg-strong"
              style={{
                background: "rgba(150,22,20,0.95)",
                boxShadow: "0 0 0 1px rgba(255,170,165,0.45), 0 1px 4px rgba(0,0,0,0.8)",
              }}
            >
              {unit.damage}
            </span>
          </Html>
        );
      })}
    </group>
  );
}
