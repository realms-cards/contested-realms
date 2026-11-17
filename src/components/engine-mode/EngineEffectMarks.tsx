"use client";

import { Icon } from "@iconify/react";
import { Html } from "@react-three/drei";
import { EFFECT_MARKS, effectMarks } from "@/lib/engine-mode/cardStatus";
import { faceDownTraps } from "@/lib/engine-mode/projection";
import { useEngineSession } from "@/lib/engine-mode/session";
import { TILE_SIZE } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import { BADGE_HTML_Z, unitCardSpot } from "./EngineDamageMarks";

/** Up and to the LEFT of the card's centre: the damage badge has the right-hand corner. */
const CORNER_X = TILE_SIZE * 0.3;
const CORNER_Z = TILE_SIZE * 0.26;
/** A face-down trap's mark sits in its tile's far-left corner, clear of the cards on it. */
const TRAP_INSET = TILE_SIZE * 0.38;

const TONE_COLOR = { good: "#9ee6b0", bad: "#f0c2b5", info: "#93c5fd" } as const;

const BADGE_STYLE = {
  background: "rgba(7,10,20,0.92)",
  boxShadow: "0 0 0 1px rgba(255,255,255,0.18), 0 1px 4px rgba(0,0,0,0.8)",
};

/**
 * The 3D board's marks for what has no token of its own: the effects the engine keeps on a unit in
 * `flow` (encased, protected, blazing — effectMarks) and face-down site traps (yours in gold, the
 * opponent's in red; only the owner's preview names the real card). The 2D board draws the same
 * marks as badges (Card2D) and tile icons (Tile2D).
 */
export default function EngineEffectMarks() {
  const game = useEngineSession((s) => s.game);
  const viewer = useEngineSession((s) => s.seat);
  useEngineSession((s) => s.rev);
  const layer = useEngineSession((s) => s.layer);
  const width = useGameStore((s) => s.board.size.w);
  const height = useGameStore((s) => s.board.size.h);
  if (!game || game.phase === "mulligan" || game.phase === "over") return null;

  const surface = layer !== "subsurface";
  const marks = Object.entries(effectMarks(game)).flatMap(([id, list]) => {
    const unit = game.units[id];
    if (!unit || unit.carriedBy) return [];
    const onSurface = !unit.region || unit.region === "surface";
    return onSurface === surface ? [{ unit, list }] : [];
  });
  const traps = surface ? Object.entries(faceDownTraps(game, viewer)) : [];
  if (!marks.length && !traps.length) return null;

  const offsetX = -((width - 1) * TILE_SIZE) / 2;
  const offsetY = -((height - 1) * TILE_SIZE) / 2;

  return (
    <group>
      {marks.map(({ unit, list }) => {
        const spot = unitCardSpot(unit, viewer, { width, height });
        return (
          <Html
            key={`mark:${unit.id}`}
            center
            zIndexRange={BADGE_HTML_Z}
            style={{ pointerEvents: "none" }}
            position={[spot.x - CORNER_X * spot.scale, 0.12, spot.z - CORNER_Z * spot.scale]}
          >
            <span className="flex select-none gap-0.5">
              {list.map((mark) => (
                <span
                  key={mark}
                  title={`${unit.name}: ${EFFECT_MARKS[mark].label}`}
                  aria-label={`${unit.name}: ${EFFECT_MARKS[mark].label}`}
                  className="flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ ...BADGE_STYLE, color: TONE_COLOR[EFFECT_MARKS[mark].tone] }}
                >
                  <Icon icon={EFFECT_MARKS[mark].icon} width={14} height={14} />
                </span>
              ))}
            </span>
          </Html>
        );
      })}
      {traps.map(([cell, trap]) => {
        const [bx, by] = cell.split(",").map(Number);
        const mine = trap.realName !== null;
        const label = mine ? `Your face-down trap: ${trap.realName}` : "Face-down trap";
        return (
          <Html
            key={`trap:${trap.siteId}`}
            center
            zIndexRange={BADGE_HTML_Z}
            style={{ pointerEvents: "none" }}
            position={[offsetX + bx * TILE_SIZE - TRAP_INSET, 0.12, offsetY + by * TILE_SIZE - TRAP_INSET]}
          >
            <span
              title={label}
              aria-label={label}
              className="flex h-6 w-6 select-none items-center justify-center rounded-full"
              style={{ ...BADGE_STYLE, color: mine ? "var(--color-rc-accent)" : TONE_COLOR.bad }}
            >
              <Icon icon="game-icons:wolf-trap" width={16} height={16} />
            </span>
          </Html>
        );
      })}
    </group>
  );
}
