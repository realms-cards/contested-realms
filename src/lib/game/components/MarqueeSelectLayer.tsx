import { useCallback, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { useGameStore } from "@/lib/game/store";
import { TILE_SIZE } from "@/lib/game/constants";
import type { CellKey } from "@/lib/game/store/types";

type MarqueeState = {
  active: boolean;
  startScreen: { x: number; y: number };
  startWorld: { x: number; z: number };
};

type Props = {
  /** Callback to update the HTML overlay rectangle (screen coords) */
  onMarqueeUpdate: (
    rect: { x1: number; y1: number; x2: number; y2: number } | null,
  ) => void;
  isSpectator: boolean;
  boardSize: { w: number; h: number };
  boardOffset: { x: number; y: number };
};

const DRAG_THRESHOLD_PX = 6;

/**
 * Invisible plane at board level that detects left-click drag on empty surface
 * to begin a marquee (rubber-band) selection in TTS control mode.
 */
export function MarqueeSelectLayer({
  onMarqueeUpdate,
  isSpectator,
  boardSize,
  boardOffset,
}: Props) {
  const marqueeRef = useRef<MarqueeState>({
    active: false,
    startScreen: { x: 0, y: 0 },
    startWorld: { x: 0, z: 0 },
  });

  const { camera, gl } = useThree();

  const worldToScreen = useCallback(
    (wx: number, wz: number) => {
      const v = new THREE.Vector3(wx, 0, wz);
      v.project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return {
        x: ((v.x + 1) / 2) * rect.width + rect.left,
        y: ((-v.y + 1) / 2) * rect.height + rect.top,
      };
    },
    [camera, gl],
  );

  const handlePointerDown = useCallback(
    (e: THREE.Event & { button?: number; clientX?: number; clientY?: number; point?: THREE.Vector3; nativeEvent?: PointerEvent }) => {
      const ne = e.nativeEvent as PointerEvent | undefined;
      if (!ne) return;
      if (ne.button !== 0) return;
      if (ne.shiftKey) return; // Shift+click is context menu in TTS
      if (isSpectator) return;

      const store = useGameStore.getState();
      if (store.controlScheme !== "tts") return;
      // Don't start marquee if dragging cards
      if (store.dragFromHand || store.dragFromPile || store.boardDragActive)
        return;

      const point = (e as unknown as { point: THREE.Vector3 }).point;
      marqueeRef.current = {
        active: false, // not active until drag threshold met
        startScreen: { x: ne.clientX, y: ne.clientY },
        startWorld: { x: point.x, z: point.z },
      };
    },
    [isSpectator],
  );

  const handlePointerMove = useCallback(
    (e: THREE.Event & { nativeEvent?: PointerEvent }) => {
      const ne = e.nativeEvent as PointerEvent | undefined;
      if (!ne) return;
      const m = marqueeRef.current;
      if (!m.startScreen.x && !m.startScreen.y && !m.active) return;

      const dx = ne.clientX - m.startScreen.x;
      const dy = ne.clientY - m.startScreen.y;

      if (!m.active) {
        // Check drag threshold
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD_PX) return;
        m.active = true;
      }

      // Update the overlay rectangle
      onMarqueeUpdate({
        x1: m.startScreen.x,
        y1: m.startScreen.y,
        x2: ne.clientX,
        y2: ne.clientY,
      });
    },
    [onMarqueeUpdate],
  );

  const handlePointerUp = useCallback(
    (e: THREE.Event & { nativeEvent?: PointerEvent; point?: THREE.Vector3 }) => {
      const ne = e.nativeEvent as PointerEvent | undefined;
      if (!ne) return;
      const m = marqueeRef.current;

      if (m.active) {
        // Calculate world-space selection rectangle
        const point = (e as unknown as { point: THREE.Vector3 }).point;
        const minX = Math.min(m.startWorld.x, point.x);
        const maxX = Math.max(m.startWorld.x, point.x);
        const minZ = Math.min(m.startWorld.z, point.z);
        const maxZ = Math.max(m.startWorld.z, point.z);

        // Find all permanents within the rectangle
        const store = useGameStore.getState();
        const selected: Array<{ at: CellKey; index: number }> = [];

        for (const [cellKey, items] of Object.entries(store.permanents)) {
          if (!items || items.length === 0) continue;
          const parts = cellKey.split(",");
          const cx = parseInt(parts[0], 10);
          const cy = parseInt(parts[1], 10);
          // Convert grid coords to world position
          const worldX = boardOffset.x + cx * TILE_SIZE;
          const worldZ = boardOffset.y + cy * TILE_SIZE;

          if (
            worldX >= minX &&
            worldX <= maxX &&
            worldZ >= minZ &&
            worldZ <= maxZ
          ) {
            for (let i = 0; i < items.length; i++) {
              selected.push({ at: cellKey as CellKey, index: i });
            }
          }
        }

        // Also check avatars within rectangle
        // (avatars are on specific tiles, handled via selectedAvatar separately)

        if (selected.length > 0) {
          store.marqueeSelectPermanents(selected);
        } else {
          store.clearMarqueeSelection();
        }
      }

      // Reset
      marqueeRef.current = {
        active: false,
        startScreen: { x: 0, y: 0 },
        startWorld: { x: 0, z: 0 },
      };
      onMarqueeUpdate(null);
    },
    [boardOffset, onMarqueeUpdate],
  );

  // Large invisible plane at board level
  const planeWidth = (boardSize.w + 4) * TILE_SIZE;
  const planeHeight = (boardSize.h + 4) * TILE_SIZE;

  return (
    <mesh
      position={[0, -0.01, 0]}
      rotation-x={-Math.PI / 2}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        marqueeRef.current = {
          active: false,
          startScreen: { x: 0, y: 0 },
          startWorld: { x: 0, z: 0 },
        };
        onMarqueeUpdate(null);
      }}
    >
      <planeGeometry args={[planeWidth, planeHeight]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}
