"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Mesh, MeshBasicMaterial } from "three";
import { useSound } from "@/lib/contexts/SoundContext";
import { PLAYER_COLORS } from "@/lib/game/constants";
import {
  BOARD_PING_LIFETIME_MS,
  useGameStore,
  type BoardPingEvent,
} from "@/lib/game/store";

const FADE_BUFFER_MS = 150;
// Base geometry for a thin ring; we will scale this outward over time
const BASE_INNER_RADIUS = 0.18;
const RING_THICKNESS = 0.02;
const SEGMENTS = 128; // smoother circles to avoid blockiness
// Ripple configuration
const RING_COUNT = 5; // number of concentric ripples
const RING_SPACING = 1 / RING_COUNT; // start offset per ring in normalized lifetime
const SCALE_RANGE = 1.8; // how far rings expand over their local lifetime

function PingMarker({
  ping,
  onExpire,
}: {
  ping: BoardPingEvent;
  onExpire: (id: string) => void;
}) {
  const ringRefs = useRef<Array<Mesh | null>>([]);
  const materialRefs = useRef<Array<MeshBasicMaterial | null>>([]);
  const startTsRef = useRef(ping.ts);

  useEffect(() => {
    startTsRef.current = ping.ts;
  }, [ping.ts]);

  const color =
    ping.playerKey === "p1"
      ? PLAYER_COLORS.p1
      : ping.playerKey === "p2"
      ? PLAYER_COLORS.p2
      : PLAYER_COLORS.spectator;

  useFrame(() => {
    const elapsed = Date.now() - startTsRef.current;
    const progress = Math.min(1, elapsed / BOARD_PING_LIFETIME_MS);

    for (let i = 0; i < RING_COUNT; i++) {
      const mesh = ringRefs.current[i];
      const material = materialRefs.current[i];
      if (!mesh || !material) continue;

      // Each ring starts later by a fixed spacing; compute its local progress
      const local = progress - i * RING_SPACING;
      if (local <= 0 || local >= 1) {
        // Not started yet or finished -> hide
        material.opacity = 0;
        continue;
      }

      const scale = 1 + local * SCALE_RANGE;
      mesh.scale.setScalar(scale);
      // Fade out over the local lifetime
      material.opacity = Math.max(0, 1 - local);
    }

    if (elapsed > BOARD_PING_LIFETIME_MS + FADE_BUFFER_MS) {
      onExpire(ping.id);
    }
  });

  return (
    <group
      position={[ping.position.x, 0.035, ping.position.z]}
      rotation-x={-Math.PI / 2}
    >
      {[...Array(RING_COUNT).keys()].map((i) => (
        <mesh key={i} ref={(el) => (ringRefs.current[i] = el)}>
          <ringGeometry
            args={[
              BASE_INNER_RADIUS,
              BASE_INNER_RADIUS + RING_THICKNESS,
              SEGMENTS,
            ]}
          />
          <meshBasicMaterial
            ref={(el) => (materialRefs.current[i] = el)}
            transparent
            opacity={0}
            color={color}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function BoardPingLayer() {
  const boardPings = useGameStore((s) => s.boardPings);
  const removeBoardPing = useGameStore((s) => s.removeBoardPing);
  const { playPing } = useSound();
  const lastPingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const latest = boardPings.at(-1);
    if (!latest) return;
    if (lastPingIdRef.current === latest.id) return;

    lastPingIdRef.current = latest.id;
    try {
      playPing();
    } catch {
      // Ignore autoplay failures
    }
  }, [boardPings, playPing]);

  if (boardPings.length === 0) {
    return null;
  }

  return (
    <group>
      {boardPings.map((ping) => (
        <PingMarker key={ping.id} ping={ping} onExpire={removeBoardPing} />
      ))}
    </group>
  );
}
