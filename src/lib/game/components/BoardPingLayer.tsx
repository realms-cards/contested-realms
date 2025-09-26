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
const INNER_RADIUS = 0.18;
const OUTER_RADIUS = 0.6;
const SEGMENTS = 48;

function PingMarker({
  ping,
  onExpire,
}: {
  ping: BoardPingEvent;
  onExpire: (id: string) => void;
}) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const startTsRef = useRef(ping.ts);

  useEffect(() => {
    startTsRef.current = ping.ts;
  }, [ping.ts]);

  useFrame(() => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    const elapsed = Date.now() - startTsRef.current;
    const progress = Math.min(1, elapsed / BOARD_PING_LIFETIME_MS);
    const scale = 1 + progress * 1.8;

    mesh.scale.setScalar(scale);
    material.opacity = Math.max(0, 1 - progress);

    if (elapsed > BOARD_PING_LIFETIME_MS + FADE_BUFFER_MS) {
      onExpire(ping.id);
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[ping.position.x, 0.035, ping.position.z]}
      rotation-x={-Math.PI / 2}
    >
      <ringGeometry args={[INNER_RADIUS, OUTER_RADIUS, SEGMENTS]} />
      <meshBasicMaterial
        ref={materialRef}
        transparent
        opacity={1}
        color={
          ping.playerKey === "p1"
            ? PLAYER_COLORS.p1
            : ping.playerKey === "p2"
            ? PLAYER_COLORS.p2
            : PLAYER_COLORS.spectator
        }
        depthWrite={false}
      />
    </mesh>
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
