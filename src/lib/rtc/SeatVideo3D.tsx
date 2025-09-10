'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TILE_SIZE } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';

export function SeatVideo3D({
  who,
  stream,
  width = TILE_SIZE * 1.2,
  height: propHeight,
}: {
  who: 'p1' | 'p2';
  stream: MediaStream | null;
  width?: number;
  height?: number;
}) {
  const board = useGameStore((s) => s.board);
  const playerPositions = useGameStore((s) => s.playerPositions);

  const height = propHeight ?? width * (9 / 16);

  // Compute world transform from board size and playerPositions
  const { position, rotationY } = useMemo(() => {
    const center = { x: (board.size.w - 1) / 2, z: (board.size.h - 1) / 2 };
    const seat = playerPositions?.[who]?.position ?? {
      x: center.x,
      z: who === 'p1' ? center.z + 3 : center.z - 3,
    };
    const offsetX = -((board.size.w - 1) * TILE_SIZE) / 2;
    const offsetZ = -((board.size.h - 1) * TILE_SIZE) / 2;
    const worldX = offsetX + seat.x * TILE_SIZE;
    const worldZ = offsetZ + seat.z * TILE_SIZE;
    // Yaw toward board center (0,0) in world coords
    const angleY = Math.atan2(0 - worldX, 0 - worldZ);
    return {
      position: new THREE.Vector3(worldX, height / 2 + 0.02, worldZ),
      rotationY: angleY,
    };
  }, [board.size.w, board.size.h, playerPositions, who, height]);

  // Prepare HTMLVideoElement and VideoTexture
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const texture = useMemo(() => {
    const vid = document.createElement('video');
    vid.autoplay = true;
    vid.muted = true; // texture surface should be silent; audio handled via <audio/>
    vid.playsInline = true;
    vid.controls = false;
    videoElRef.current = vid;
    const tex = new THREE.VideoTexture(vid);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => {
    const vid = videoElRef.current;
    if (!vid) return;
    if (stream) {
      try {
        vid.srcObject = stream;
        const play = vid.play();
        if (play && typeof play.then === 'function') {
          play.catch(() => {/* user gesture gating; controlled by external join button */});
        }
      } catch {}
    } else {
      try {
        vid.pause();
        (vid as HTMLVideoElement).srcObject = null;
      } catch {}
    }
    return () => {
      try { vid.pause(); } catch {}
      try { (vid as HTMLVideoElement).srcObject = null; } catch {}
    };
  }, [stream]);

  // Invisible raycast handler to make plane non-interactive
  const noopRaycast = useMemo(() => function noop(this: THREE.Object3D) {
    return [] as unknown as THREE.Intersection[];
  }, []);

  // If no stream, render nothing to keep scene clean
  if (!stream) return null;

  return (
    <group position={position.toArray()} rotation={[0, rotationY, 0]}>
      <mesh raycast={noopRaycast as unknown as never}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {/* Simple stand */}
      <mesh position={[0, -height / 2, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.02, 8]} />
        <meshStandardMaterial color={who === 'p1' ? '#6ee7b7' : '#93c5fd'} />
      </mesh>
    </group>
  );
}
