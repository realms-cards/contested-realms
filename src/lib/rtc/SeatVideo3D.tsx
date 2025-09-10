'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TILE_SIZE } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';
import type { Vector3 } from 'three';
import type { SeatVideo3DProps } from '../../../specs/006-live-video-and/contracts/ui-components';

/**
 * 3D Video Seat Component
 * 
 * Renders a video stream as a 3D plane positioned at a specific location in 3D space.
 * Designed for displaying player video feeds at their respective seats around a game board.
 * 
 * Features:
 * - 3D positioned video planes with proper world coordinates
 * - Automatic rotation to face board center or specified angle
 * - Video texture streaming with WebRTC MediaStream integration
 * - Player identification with colored stand indicators
 * - Non-interactive raycast handling to avoid interfering with game interactions
 * 
 * The component creates a video texture from the provided MediaStream and renders it
 * on a 3D plane positioned at the specified coordinates. The video surface is muted
 * as audio is handled separately through WebRTC audio channels.
 * 
 * @example
 * ```tsx
 * // Position video at specific 3D coordinates
 * <SeatVideo3D
 *   playerId="player1"
 *   stream={webrtcStream}
 *   position={new THREE.Vector3(2, 0.5, 3)}
 *   rotation={Math.PI / 4}
 *   width={1.2}
 *   height={0.9}
 *   visible={true}
 * />
 * ```
 * 
 * @param props - Component configuration
 * @param props.playerId - Unique identifier for the player
 * @param props.stream - WebRTC MediaStream containing video data
 * @param props.position - 3D position for the video plane
 * @param props.rotation - Y-axis rotation in radians (optional)
 * @param props.width - Width of the video plane (optional)
 * @param props.height - Height of the video plane (optional)
 * @param props.visible - Whether the video plane should be visible (optional)
 */
export function SeatVideo3D({
  playerId,
  stream,
  position: providedPosition,
  rotation = 0,
  width = TILE_SIZE * 1.2,
  height: propHeight,
  visible = true,
}: SeatVideo3DProps) {
  const height = propHeight ?? width * (9 / 16);

  // Use provided position directly or compute from legacy game store
  const finalPosition = providedPosition;
  const rotationY = rotation;

  // Prepare HTMLVideoElement and VideoTexture
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const texture = useMemo(() => {
    const vid = document.createElement('video');
    vid.autoplay = true;
    vid.muted = true; // texture surface should be silent; audio handled via <audio/>
    vid.playsInline = true;
    vid.controls = false;
    vid.crossOrigin = 'anonymous'; // For better compatibility
    videoElRef.current = vid;
    const tex = new THREE.VideoTexture(vid);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false; // Better for video textures
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

  // If no stream or not visible, render nothing to keep scene clean
  if (!stream || !visible) return null;

  return (
    <group position={finalPosition.toArray()} rotation={[0, rotationY, 0]}>
      <mesh raycast={noopRaycast as unknown as never}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial 
          map={texture} 
          toneMapped={false} 
          transparent={true}
          opacity={visible ? 1.0 : 0.0}
        />
      </mesh>
      {/* Simple stand with player ID indicator */}
      <mesh position={[0, -height / 2, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.04, 8]} />
        <meshStandardMaterial 
          color={playerId.includes('1') || playerId === 'p1' ? '#6ee7b7' : '#93c5fd'} 
        />
      </mesh>
      
      {/* Optional player ID text (for debugging) */}
      {process.env.NODE_ENV === 'development' && (
        <group position={[0, height / 2 + 0.1, 0]}>
          {/* We'd need a text geometry here, but it's complex - leaving as placeholder */}
        </group>
      )}
    </group>
  );
}

// Legacy wrapper for existing code that uses the old interface
export function LegacySeatVideo3D({
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

  // Compute world transform from board size and playerPositions (original logic)
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

  // Use the enhanced component with computed values
  return (
    <SeatVideo3D
      playerId={who}
      stream={stream}
      position={position}
      rotation={rotationY}
      width={width}
      height={height}
      visible={true}
    />
  );
}
