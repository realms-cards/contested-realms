"use client";

import { Html } from "@react-three/drei";
import { useMemo } from "react";
import { ManaCounterHUD } from "@/components/game/manacost";
import Threshold3D from "@/lib/game/components/Threshold3D";
import { CARD_SHORT, TILE_SIZE } from "@/lib/game/constants";
import { useGameStore, type PlayerKey } from "@/lib/game/store";


export interface Hud3DProps {
  owner: PlayerKey; // p1 top, p2 bottom
}

export default function Hud3D({ owner }: Hud3DProps) {
  const boardSize = useGameStore((s) => s.board.size);
  // Track available mana directly on player.mana
  const avail = useGameStore((s) => s.players[owner].mana);
  const siteMana = useGameStore((s) => s.getAvailableMana(owner));
  const addMana = useGameStore((s) => s.addMana);

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

      {/* Available mana counter near threshold column */}
      <group position={[manaX, 0.001, 0]}>
        {/* DOM-based controls to avoid interfering with 3D raycasting */}
        <Html
          position={[0, 0.003, 0]}
          zIndexRange={[10, 0]}
          transform
          rotation-x={-Math.PI / 2}
          rotation-z={ownerRot}
        >
          <div className="pointer-events-auto select-none">
            <ManaCounterHUD
              value={avail}
              onIncrement={() => (avail < siteMana + 99 ? addMana(owner, +1) : undefined)}
              onDecrement={() => (avail > 0 ? addMana(owner, -1) : undefined)}
              disableInc={avail >= siteMana + 99}
              disableDec={avail <= 0}
              size={18}
            />
          </div>
        </Html>
      </group>
    </group>
  );
}
