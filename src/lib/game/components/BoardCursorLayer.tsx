"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { PLAYER_COLORS } from "@/lib/game/constants";
import {
  REMOTE_CURSOR_TTL_MS,
  useGameStore,
  type RemoteCursorState,
} from "@/lib/game/store";

const CURSOR_HEIGHT = 0.18;
const PULSE_SPEED = 6;
const BASE_SCALE = 1;

const FALLBACK_REMOTE_COLOR = PLAYER_COLORS.spectator;

function cursorColor(entry: RemoteCursorState): string {
  if (entry.playerKey === "p1") return PLAYER_COLORS.p1;
  if (entry.playerKey === "p2") return PLAYER_COLORS.p2;
  return FALLBACK_REMOTE_COLOR;
}

function CursorMarker({ entry }: { entry: RemoteCursorState }) {
  const pointerRef = useRef<Group>(null);
  const color = cursorColor(entry);

  useFrame(({ clock }) => {
    if (!entry.position) return;
    const t = clock.getElapsedTime();
    const scale = BASE_SCALE + 0.08 * Math.sin(t * PULSE_SPEED);
    if (pointerRef.current) {
      pointerRef.current.scale.setScalar(scale);
    }
  });

  if (!entry.position) return null;

  return (
    <group position={[entry.position.x, CURSOR_HEIGHT, entry.position.z]} ref={pointerRef}>
      <Html
        center
        transform
        position={[0, 0.04, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            backgroundColor: color,
            opacity: 0.5,
            WebkitMaskImage: 'url(/gamecursor-skeleton.svg)',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskSize: 'contain',
            WebkitMaskPosition: 'center',
            maskImage: 'url(/gamecursor-skeleton.svg)',
            maskRepeat: 'no-repeat',
            maskSize: 'contain',
            maskPosition: 'center',
            borderRadius: 4,
            boxShadow: '0 0 4px rgba(0,0,0,0.35)'
          }}
        />
      </Html>
    </group>
  );
}

export default function BoardCursorLayer() {
  const remoteCursors = useGameStore((s) => s.remoteCursors);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const prune = useGameStore((s) => s.pruneRemoteCursors);
  const peekDialog = useGameStore((s) => s.peekDialog);
  const searchDialog = useGameStore((s) => s.searchDialog);
  const placementDialog = useGameStore((s) => s.placementDialog);

  useEffect(() => {
    const timer = window.setInterval(() => {
      prune(REMOTE_CURSOR_TTL_MS);
    }, 500);
    return () => window.clearInterval(timer);
  }, [prune]);

  const overlayBlocking = Boolean(
    peekDialog ||
      searchDialog ||
      placementDialog
  );

  const entries = useMemo(() => {
    if (overlayBlocking) return [] as RemoteCursorState[];
    return Object.values(remoteCursors || {})
      .filter((entry) => entry && entry.position && entry.playerId !== localPlayerId)
      .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  }, [remoteCursors, localPlayerId, overlayBlocking]);

  if (!entries.length) return null;

  return (
    <group>
      {entries.map((entry) => (
        <CursorMarker key={entry.playerId} entry={entry} />
      ))}
    </group>
  );
}
