"use client";

import { Text } from "@react-three/drei";
import { useMemo } from "react";
import type { Intersection, Object3D, Raycaster } from "three";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_SHORT } from "@/lib/game/constants";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import { computeThresholdTotals } from "@/lib/game/store/utils/resourceHelpers";

function noopRaycast(this: Object3D, _r: Raycaster, _i: Intersection[]) {
  void _r;
  void _i;
}

export interface Threshold3DProps {
  owner: PlayerKey;
  position: [number, number, number];
  rotationZ?: number; // orientation toward seat
  direction?: "row" | "column"; // layout direction
}

export default function Threshold3D({
  owner,
  position,
  rotationZ = 0,
  direction = "row",
}: Threshold3DProps) {
  // Subscribe to granular state slices for proper reactivity
  // Using individual selectors ensures re-render when any dependency changes
  const boardSize = useGameStore((s) => s.board.size);
  const boardSites = useGameStore((s) => s.board.sites);
  const permanents = useGameStore((s) => s.permanents);
  const avatar = useGameStore((s) => s.avatars[owner]);
  const specialSiteState = useGameStore((s) => s.specialSiteState);

  // Compute thresholds from the subscribed state
  const thresholds = useMemo(
    () =>
      computeThresholdTotals(
        { size: boardSize, sites: boardSites },
        permanents,
        owner,
        avatar,
        specialSiteState
      ),
    [boardSize, boardSites, permanents, owner, avatar, specialSiteState]
  );

  // Layout
  const size = CARD_SHORT * 0.55; // square icon size
  const gap = size * 0.25 + 0.1;
  const total = size * 4 + gap * 3;
  const start = -total / 2 + size / 2;
  const yElev = 0.003; // lift slightly above ground

  const items: { key: keyof typeof thresholds; icon: string; color: string }[] =
    [
      { key: "air", icon: "/api/assets/air.png", color: "#93c5fd" },
      { key: "water", icon: "/api/assets/water.png", color: "#67e8f9" },
      { key: "earth", icon: "/api/assets/earth.png", color: "#f59e0b" },
      { key: "fire", icon: "/api/assets/fire.png", color: "#f87171" },
    ];

  return (
    <group position={position}>
      {items.map((it, i) => {
        const offset = i * (size + gap);
        const x = direction === "row" ? start + offset : 0;
        const z = direction === "column" ? start + offset : 0;
        const v = thresholds[it.key] ?? 0;
        return (
          <group key={it.key} position={[x, 0, z]}>
            <CardPlane
              slug={""}
              textureUrl={it.icon}
              width={size}
              height={size}
              rotationZ={rotationZ}
              elevation={yElev}
              interactive={false}
            />
            <Text
              font="/fantaisie_artistiqu.ttf"
              position={[0, yElev + 0.002, -size * 0.75]}
              rotation-x={-Math.PI / 2}
              rotation-z={rotationZ}
              color={it.color}
              anchorX="center"
              anchorY="middle"
              fontSize={0.18}
              raycast={noopRaycast}
            >
              {String(v)}
            </Text>
          </group>
        );
      })}
    </group>
  );
}
