"use client";

import { Text } from "@react-three/drei";
import { useMemo } from "react";
import Threshold3D from "@/lib/game/components/Threshold3D";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import { CARD_SHORT, TILE_SIZE } from "@/lib/game/constants";
import type { Intersection, Object3D, Raycaster } from "three";

function noopRaycast(this: Object3D, _r: Raycaster, _i: Intersection[]) {
  void _r;
  void _i;
}

export interface Hud3DProps {
  owner: PlayerKey; // p1 top, p2 bottom
}

export default function Hud3D({ owner }: Hud3DProps) {
  const boardSize = useGameStore((s) => s.board.size);
  const manaAvail = useGameStore((s) => s.getAvailableMana(owner));
  const manaPool = useGameStore((s) => s.players[owner].mana);

  // Seat mapping for HUD: p1 bottom, p2 top
  const isBottom = owner === "p1";
  const ownerRot = isBottom ? 0 : Math.PI; // face seat

  const { sideX } = useMemo(() => {
    const gridHalfW = (boardSize.w * TILE_SIZE) / 2;
    // Sides for thresholds (mirror like piles: p1 right, p2 left)
    const rightX = gridHalfW + TILE_SIZE * 0.95;
    const leftX = -gridHalfW - TILE_SIZE * 0.95;
    const sideX = owner === "p1" ? rightX : leftX;
    return { sideX };
  }, [boardSize, owner]);

  // Layout distances along Z (forward/back relative to player)
  const thresholdsZ = 0; // centered along Z at side column
  // Place mana label just outside the threshold column horizontally
  const outsideSign = owner === "p1" ? 1 : -1;
  const manaX = sideX + outsideSign * CARD_SHORT * 0.9;

  return (
    <group>
      {/* Thresholds at sides (vertical column) */}
      <group position={[sideX, 0.001, 0]}>
        <Threshold3D
          owner={owner}
          position={[0, 0, thresholdsZ]}
          rotationZ={ownerRot}
          direction="column"
        />
      </group>

      {/* Mana text near threshold column */}
      <group position={[manaX, 0.001, 0]}>
        <Text
          position={[0, 0.003, 0]}
          rotation-x={-Math.PI / 2}
          rotation-z={ownerRot + Math.PI * 1.5}
          color="#a7f3d0"
          anchorX="center"
          anchorY="middle"
          fontSize={0.22}
          raycast={noopRaycast}
        >
          {`Mana ${manaPool} (avail ${manaAvail})`}
        </Text>
      </group>
    </group>
  );
}
