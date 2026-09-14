"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { TILE_SIZE } from "@/lib/game/constants";
import { requestCosmeticFrame } from "@/lib/game/render/cosmeticFrame";
import type { CellKey, GameState, Permanents } from "@/lib/game/store/types";
import {
  getMagicOrigin,
  isTileInMagicRange,
  type TilePos,
} from "@/lib/game/store/utils/magicTargeting";

export type MagicTargetOverlayProps = {
  tileX: number;
  tileY: number;
  pendingMagic: GameState["pendingMagic"];
  avatars: GameState["avatars"];
  permanents: Permanents;
  hasSite: boolean;
  highlightColor?: string;
  magicGuidesActive: GameState["magicGuidesActive"];
};

/**
 * Role of this tile in the pending spell's intention:
 * - target: the chosen target (or the tile a projectile will hit)
 * - path: tiles a projectile travels through before hitting
 * - candidate: a tile the caster may still pick
 * - area: a tile covered by an area effect around the caster
 */
type TileRole = "target" | "path" | "candidate" | "area";

const CANDIDATE_COLOR = "#f59e0b";

// Outline-led: a faint fill keeps the tile readable, the border does the work.
const ROLE_STYLE: Record<
  TileRole,
  { opacity: number; pulse: number; useHighlight: boolean }
> = {
  target: { opacity: 0.14, pulse: 0.05, useHighlight: true },
  path: { opacity: 0.06, pulse: 0.02, useHighlight: true },
  candidate: { opacity: 0.05, pulse: 0.03, useHighlight: false },
  area: { opacity: 0.1, pulse: 0.04, useHighlight: true },
};

function computeRole(
  props: MagicTargetOverlayProps,
): TileRole | null {
  const { pendingMagic, avatars, hasSite, tileX, tileY } = props;
  if (!pendingMagic) return null;
  const tile: TilePos = { x: tileX, y: tileY };
  const tileKey = `${tileX},${tileY}` as CellKey;
  const origin = getMagicOrigin(pendingMagic, avatars);
  const target = pendingMagic.target;

  // Units and avatars carry their own glow (candidate / caster / target) and
  // the chevron strips connect spell -> caster -> target, so this overlay
  // only marks *locations*: a chosen site, eligible sites, or an area.
  if (target) {
    if (target.kind === "location") {
      return target.at === tileKey ? "target" : null;
    }
    return null;
  }

  if (pendingMagic.status !== "choosingTarget") return null;
  const mode = pendingMagic.hints?.mode ?? "single";
  const range = pendingMagic.hints?.range ?? "global";
  if (mode !== "site" && mode !== "area") return null;
  if (!isTileInMagicRange(range, origin, tile)) return null;
  if (mode === "area") return "area";
  return hasSite ? "candidate" : null;
}

function MagicTileHighlight({
  color,
  opacity,
  pulse,
}: {
  color: string;
  opacity: number;
  pulse: number;
}) {
  const fillRef = useRef<THREE.Mesh>(null);
  // Mounted only while this tile is highlighted (frameloop="demand"); the
  // decorative pulse asks for cosmetic frames instead of invalidating.
  useFrame(({ clock }) => {
    const mesh = fillRef.current;
    if (!mesh) return;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = opacity + Math.sin(clock.getElapsedTime() * 3) * pulse;
    requestCosmeticFrame();
  });
  const half = TILE_SIZE / 2 - 0.01;
  return (
    <group position={[0, 0.012, 0]} rotation-x={-Math.PI / 2}>
      <mesh ref={fillRef} renderOrder={1100}>
        <planeGeometry args={[TILE_SIZE - 0.02, TILE_SIZE - 0.02]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineLoop renderOrder={1101}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                -half,
                half,
                0.001,
                half,
                half,
                0.001,
                half,
                -half,
                0.001,
                -half,
                -half,
                0.001,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.85} />
      </lineLoop>
    </group>
  );
}

/**
 * Per-tile overlay that shows the caster's intention while a Magic spell is
 * pending: candidate tiles before a target is picked (by mode: site, single
 * target, area around the caster, or the projectile lines), then the chosen
 * target and, for projectiles, the path up to the first unit hit.
 */
export function MagicTargetOverlay(props: MagicTargetOverlayProps) {
  const { pendingMagic, magicGuidesActive, highlightColor = "#ef4444" } = props;
  if (!pendingMagic || !magicGuidesActive || pendingMagic.guidesSuppressed) {
    return null;
  }
  const role = computeRole(props);
  if (!role) return null;
  const style = ROLE_STYLE[role];
  return (
    <MagicTileHighlight
      color={style.useHighlight ? highlightColor : CANDIDATE_COLOR}
      opacity={style.opacity}
      pulse={style.pulse}
    />
  );
}
