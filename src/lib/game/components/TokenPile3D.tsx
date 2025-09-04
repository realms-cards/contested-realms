"use client";

import { useMemo } from "react";
import type { PlayerKey } from "@/lib/game/store";
import { useGameStore } from "@/lib/game/store";
import { TILE_SIZE, CARD_SHORT, CARD_LONG } from "@/lib/game/constants";
import type { ThreeEvent } from "@react-three/fiber";
import { Text } from "@react-three/drei";

export interface TokenPile3DProps {
  owner: PlayerKey; // p1 is TOP, p2 is BOTTOM
}

// A simple face-up token "pile" that lives on the player's left side, lower third of the playmat.
// Right-clicking opens a search dialog with all known tokens; selecting one adds it to the player's hand.
export default function TokenPile3D({ owner }: TokenPile3DProps) {
  const boardSize = useGameStore((s) => s.board.size);
  const openContextMenu = useGameStore((s) => s.openContextMenu);

  // Compute position: inside the grid, near the player's left side, roughly lower third.
  const { x, z, rotZ } = useMemo(() => {
    const gridHalfW = (boardSize.w * TILE_SIZE) / 2;
    const gridHalfH = (boardSize.h * TILE_SIZE) / 2;
    const isBottom = owner === "p2";
    // Left side (relative to seat): p2 uses negative X, p1 uses positive X (mirrored)
    const posX = isBottom ? -gridHalfW + CARD_SHORT * 0.7 : gridHalfW - CARD_SHORT * 0.7;
    // Lower third along the player's edge
    const edgeZ = isBottom ? gridHalfH : -gridHalfH;
    const inward = TILE_SIZE * 1.2;
    const posZ = isBottom ? edgeZ - inward : edgeZ + inward;
    const ownerRot = owner === "p1" ? Math.PI : 0;
    return { x: posX, z: posZ, rotZ: ownerRot + Math.PI };
  }, [boardSize.w, boardSize.h, owner]);

  return (
    <group position={[x, 0.002, z]}>
      {/* Click target */}
      <mesh
        rotation-x={-Math.PI / 2}
        rotation-z={rotZ}
        onContextMenu={(e: ThreeEvent<PointerEvent>) => {
          e.nativeEvent.preventDefault();
          e.stopPropagation();
          openContextMenu({ kind: "tokenpile", who: owner }, { x: e.clientX, y: e.clientY });
        }}
      >
        <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
        <meshStandardMaterial color="#3f3f46" transparent opacity={0.35} depthWrite />
      </mesh>
      <Text
        position={[0, 0.01, 0]}
        rotation-x={-Math.PI / 2}
        rotation-z={rotZ}
        fontSize={0.18}
        color="#e4e4e7"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.005}
        outlineColor="#000"
      >
        Tokens
      </Text>
    </group>
  );
}

