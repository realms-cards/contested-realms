"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { TextureLoader, SRGBColorSpace, Color } from "three";
import { PLAYER_COLORS } from "@/lib/game/constants";
import {
  REMOTE_CURSOR_TTL_MS,
  useGameStore,
  type RemoteCursorState,
} from "@/lib/game/store";

const CURSOR_HEIGHT = 0.04; // hover slightly above the board so it can be occluded by cards
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
  const tex = useLoader(TextureLoader, "/gamecursor-skeleton.svg");

  if (tex && tex.colorSpace !== SRGBColorSpace) {
    tex.colorSpace = SRGBColorSpace;
    tex.needsUpdate = true;
  }

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
      <group rotation-x={-Math.PI / 2}>
        <mesh renderOrder={6}>
          <planeGeometry args={[0.36, 0.36]} />
          <shaderMaterial
            key={color}
            transparent
            depthTest
            depthWrite={false}
            uniforms={{
              uColor: { value: new Color(color) },
              uTex: { value: tex },
              uOpacity: { value: 0.7 },
            }}
            vertexShader={`
              varying vec2 vUv;
              void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `}
            fragmentShader={`
              uniform vec3 uColor;
              uniform sampler2D uTex;
              uniform float uOpacity;
              varying vec2 vUv;
              void main() {
                vec4 smp = texture2D(uTex, vUv);
                float lum = dot(smp.rgb, vec3(0.299, 0.587, 0.114));
                float a = (1.0 - lum) * smp.a * uOpacity;
                if (a < 0.01) discard;
                gl_FragColor = vec4(uColor, a);
              }
            `}
          />
        </mesh>
      </group>
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
