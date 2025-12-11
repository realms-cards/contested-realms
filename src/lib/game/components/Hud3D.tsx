"use client";

import { Text } from "@react-three/drei";
import { useMemo } from "react";
import type { Intersection, Object3D, Raycaster } from "three";
import Threshold3D from "@/lib/game/components/Threshold3D";
import { CARD_SHORT, TILE_SIZE } from "@/lib/game/constants";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import { siteProvidesMana } from "@/lib/game/store/utils/resourceHelpers";

function noopRaycast(this: Object3D, _r: Raycaster, _i: Intersection[]) {
  void _r;
  void _i;
}

export interface Hud3DProps {
  owner: PlayerKey; // p1 top, p2 bottom
}

export default function Hud3D({ owner }: Hud3DProps) {
  const boardSize = useGameStore((s) => s.board.size);
  const ownerNum = owner === "p1" ? 1 : 2;

  // Compute mana directly from state for proper reactivity
  const sites = useGameStore((s) => s.board.sites);
  const manaOffset = useGameStore((s) => s.players[owner]?.mana ?? 0);

  // Count sites that provide mana for this player
  const baseMana = useMemo(() => {
    let count = 0;
    for (const site of Object.values(sites)) {
      if (site.owner === ownerNum && siteProvidesMana(site.card ?? null)) {
        count++;
      }
    }
    return count;
  }, [sites, ownerNum]);

  // Available mana = base + offset (offset is negative when spent)
  const mana = Math.max(0, baseMana + manaOffset);

  // Seat mapping for HUD: p1 bottom, p2 top
  const isBottom = owner === "p1";
  const ownerRot = isBottom ? 0 : Math.PI; // face seat

  const sideX = useMemo(() => {
    const gridHalfW = (boardSize.w * TILE_SIZE) / 2;
    // Sides for thresholds (mirror like piles: p1 right, p2 left)
    const rightX = gridHalfW + TILE_SIZE * 0.95;
    const leftX = -gridHalfW - TILE_SIZE * 0.95;
    return owner === "p1" ? rightX : leftX;
  }, [boardSize, owner]);

  // Position mana display below thresholds column (from each player's perspective)
  const manaPos = useMemo(() => {
    const gridHalfW = (boardSize.w * TILE_SIZE) / 2;
    // Position below the threshold column (same X as thresholds)
    const x =
      owner === "p1"
        ? gridHalfW + TILE_SIZE * 0.95
        : -gridHalfW - TILE_SIZE * 0.95;
    // Below the threshold icons - flip Z for each player's perspective
    const size = CARD_SHORT * 0.55;
    const gap = size * 0.25 + 0.1;
    const thresholdHeight = size * 4 + gap * 3;
    const offset = thresholdHeight / 2 + size * 0.8;
    // P1: positive Z is "below" (toward viewer), P2: negative Z is "below" (toward their side)
    const z = isBottom ? offset : -offset;
    return [x, 0.003, z] as [number, number, number];
  }, [boardSize, owner, isBottom]);

  // Color based on mana state
  const manaColor =
    mana === 0 ? "#ef4444" : mana < baseMana ? "#fbbf24" : "#ffffff";

  return (
    <group>
      {/* Thresholds at sides (vertical column) */}
      <group position={[sideX, 0.001, 0]}>
        <Threshold3D
          owner={owner}
          position={[0, 0, 0]}
          rotationZ={ownerRot}
          direction="column"
        />
      </group>

      {/* Mana display below thresholds - using 3D Text like Threshold3D */}
      <group position={manaPos}>
        <Text
          font="/fantaisie_artistiqu.ttf"
          position={[0, 0.002, 0]}
          rotation-x={-Math.PI / 2}
          rotation-z={ownerRot}
          color={manaColor}
          anchorX="center"
          anchorY="middle"
          fontSize={0.22}
          raycast={noopRaycast}
        >
          {`${mana}/${baseMana}`}
        </Text>
      </group>
    </group>
  );
}
