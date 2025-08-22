"use client";

import { useMemo, useState } from "react";
import { Text, useTexture } from "@react-three/drei";
import { SRGBColorSpace } from "three";
import { useGameStore } from "@/lib/game/store";

const TILE_SIZE = 1.5; // world units per cell

export default function Board() {
  const board = useGameStore((s) => s.board);
  const sitePlacementMode = useGameStore((s) => s.sitePlacementMode);
  const showGrid = useGameStore((s) => s.showGridOverlay);
  const placeSite = useGameStore((s) => s.placeSite);
  const playSelectedSiteTo = useGameStore((s) => s.playSelectedSiteTo);
  const toggleTapSite = useGameStore((s) => s.toggleTapSite);
  const selected = useGameStore((s) => s.selectedCard);
  const boardW = board.size.w * TILE_SIZE;
  const boardH = board.size.h * TILE_SIZE;
  const tex = useTexture("/api/assets/playmat.jpg");
  tex.colorSpace = SRGBColorSpace;

  const cells = useMemo(() => {
    const out: { x: number; y: number; key: string }[] = [];
    for (let y = 0; y < board.size.h; y++) {
      for (let x = 0; x < board.size.w; x++) {
        out.push({ x, y, key: `${x},${y}` });
      }
    }
    return out;
  }, [board.size.w, board.size.h]);

  const offsetX = -((board.size.w - 1) * TILE_SIZE) / 2;
  const offsetY = -((board.size.h - 1) * TILE_SIZE) / 2;

  const [hover, setHover] = useState<string | null>(null);

  return (
    <group>
      {/* Playmat background */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[boardW, boardH]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>

      {/* Interactive tiles */}
      <group position={[0, 0.01, 0]}> {/* slight lift to avoid z-fighting */}
        {cells.map(({ x, y, key }) => {
          const pos: [number, number, number] = [offsetX + x * TILE_SIZE, 0, offsetY + y * TILE_SIZE];
          const site = board.sites[key];
          const isHover = hover === key;
          const base = sitePlacementMode ? 0.22 : 0.16;
          const color = isHover ? `hsl(210 40% ${base * 100 + 10}%)` : `hsl(210 10% ${base * 100}%)`;
          const opacity = sitePlacementMode || isHover ? 0.25 : 0.08;
          return (
            <group key={key} position={pos}>
              <mesh
                rotation-x={-Math.PI / 2}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  setHover(key);
                }}
                onPointerOut={(e) => {
                  e.stopPropagation();
                  setHover((h) => (h === key ? null : h));
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (sitePlacementMode) {
                    placeSite(x, y);
                  } else if (selected) {
                    playSelectedSiteTo(x, y);
                  } else if (site) {
                    toggleTapSite(x, y);
                  }
                }}
              >
                <planeGeometry args={[TILE_SIZE * 0.96, TILE_SIZE * 0.96]} />
                <meshStandardMaterial color={color} transparent opacity={opacity} metalness={0} roughness={1} />
              </mesh>

              {site && (
                <mesh
                  position={[0, 0.15, 0]}
                  castShadow
                  rotation-z={site.tapped ? Math.PI / 2 : 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTapSite(x, y);
                  }}
                >
                  <cylinderGeometry args={[TILE_SIZE * 0.22, TILE_SIZE * 0.22, 0.25, 16]} />
                  <meshStandardMaterial color={site.owner === 1 ? "#2f6fed" : "#d94e4e"} />
                </mesh>
              )}

              {showGrid && (
                <Text
                  position={[0, 0.02, 0]}
                  rotation-x={-Math.PI / 2}
                  fontSize={0.18}
                  color={isHover ? "#fff" : "#cbd5e1"}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.005}
                  outlineColor="#000"
                >
                  {`${x},${y}`}
                </Text>
              )}
            </group>
          );
        })}
      </group>
    </group>
  );
}
