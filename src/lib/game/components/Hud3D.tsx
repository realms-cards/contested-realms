"use client";

import { useMemo } from "react";
import Threshold3D from "@/lib/game/components/Threshold3D";
import { TILE_SIZE } from "@/lib/game/constants";
import { useGameStore, type PlayerKey } from "@/lib/game/store";

export interface Hud3DProps {
  owner: PlayerKey; // p1 top, p2 bottom
}

export default function Hud3D({ owner }: Hud3DProps) {
  const boardSize = useGameStore((s) => s.board.size);

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
    </group>
  );
}
