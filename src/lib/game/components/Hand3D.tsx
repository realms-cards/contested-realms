"use client";

import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import CardPlane from "@/lib/game/components/CardPlane";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PlayerKey } from "@/lib/game/store";
import {
  CARD_LONG,
  CARD_SHORT,
  HAND_DIST,
  HAND_BOTTOM_MARGIN,
  HAND_MAX_TOTAL_ANGLE,
  HAND_STEP_MAX,
  HAND_OVERLAP_FRAC,
  HAND_FAN_ARC_Y,
} from "@/lib/game/constants";
import type { Group, PerspectiveCamera } from "three";

 

export interface Hand3DProps {
  matW: number;
  matH: number;
  owner?: PlayerKey; // default: p1 (bottom)
}

export default function Hand3D({ owner = "p1" }: Hand3DProps) {
  const zones = useGameStore((s) => s.zones);
  const selected = useGameStore((s) => s.selectedCard);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const dragFromPile = useGameStore((s) => s.dragFromPile);

  const hand = zones[owner].hand || [];
  const rootRef = useRef<Group | null>(null);
  const { camera } = useThree();
  // Keep the hand anchored to the camera: in front of it and near the bottom of the viewport
  useFrame(() => {
    const cam = camera as PerspectiveCamera;
    if (!rootRef.current || !("fov" in cam)) return;
    const dist = HAND_DIST; // world units in front of camera
    const fov = (cam.fov * Math.PI) / 180;
    const worldH = 2 * Math.tan(fov / 2) * dist; // visible height at distance
    const margin = HAND_BOTTOM_MARGIN; // gap from screen bottom
    const bottomY = -worldH / 2 + margin + CARD_LONG * 0.5;

    rootRef.current.position.copy(cam.position);
    rootRef.current.quaternion.copy(cam.quaternion);
    rootRef.current.translateZ(-dist);
    rootRef.current.translateY(bottomY);
  });

  // Layout: fan cards and center across available width
  const layout = useMemo(() => {
    const n = hand.length;
    if (n === 0) return [] as { x: number; y: number; rot: number }[];
    const maxTotal = HAND_MAX_TOTAL_ANGLE; // cap total fan angle
    const step = Math.min(HAND_STEP_MAX, n > 1 ? maxTotal / (n - 1) : 0);
    const total = step * (n - 1);
    const start = -total / 2;
    const overlap = CARD_SHORT * HAND_OVERLAP_FRAC;
    const startX = -((n - 1) * overlap) / 2;
    const arc = HAND_FAN_ARC_Y;
    return new Array(n).fill(0).map((_, i) => {
      const x = startX + i * overlap;
      const rot = start + i * step;
      // Optional slight vertical arc across the fan (0 disables)
      let y = 0;
      if (arc !== 0) {
        const t = n > 1 ? i / (n - 1) : 0.5; // 0..1 across the fan
        y = Math.sin(t * Math.PI) * arc; // peak at center
      }
      return { x, y, rot };
    });
  }, [hand.length]);

  const hoverTimer = useRef<number | null>(null);
  function beginHoverPreview(card?: CardRef | null) {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (!card?.slug) return;
    hoverTimer.current = window.setTimeout(() => setPreviewCard(card), 600);
  }
  function clearHoverPreview() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPreviewCard(null);
  }

  return (
    <group ref={rootRef}>
      {hand.map((c, i) => {
        const isDragging = !!dragFromHand || !!dragFromPile;
        const isSite = (c.type || "").toLowerCase().includes("site");
        const isSel = !!selected && selected.who === owner && selected.index === i;
        const { x, y, rot } = layout[i] || { x: 0, y: 0, rot: 0 };
        const rotZ = (isSite ? -Math.PI / 2 : 0) + rot;
        return (
          <group
            key={`${c.cardId}-${i}`}
            position={[x, y, 0]}
            onClick={(e: ThreeEvent<PointerEvent>) => {
              if (isDragging) return; // let events bubble during drags
              e.stopPropagation();
              if (isSel) clearSelection();
              else selectHandCard(owner, i);
            }}
            onContextMenu={(e: ThreeEvent<PointerEvent>) => {
              if (isDragging) return; // ignore during drags
              e.stopPropagation();
              e.nativeEvent.preventDefault();
              // No context menu for hand cards (keep board-only per preference)
            }}
            onPointerOver={(e) => {
              if (isDragging) return; // allow bubbling while dragging
              e.stopPropagation();
              beginHoverPreview(c);
            }}
            onPointerOut={(e) => {
              if (isDragging) return; // allow bubbling while dragging
              e.stopPropagation();
              clearHoverPreview();
            }}
            onPointerDown={(e) => {
              if (isDragging) return; // don't start another drag
              // Start drag only if already selected, mirroring HUD behavior
              if (e.button === 0 && isSel) {
                e.stopPropagation();
                setDragFromHand(true);
              }
            }}
          >
            {c.slug ? (
              <CardPlane
                slug={c.slug}
                width={isSite ? CARD_LONG : CARD_SHORT}
                height={isSite ? CARD_SHORT : CARD_LONG}
                rotationZ={rotZ}
                upright
                depthWrite={false}
                depthTest={false}
                renderOrder={1000 + i}
                interactive={!isDragging}
                elevation={0.002 + i * 0.0002}
              />
            ) : (
              <mesh rotation-x={0} rotation-z={rotZ} position={[0, 0.002 + i * 0.0002, 0]} renderOrder={1000 + i}>
                <planeGeometry args={[isSite ? CARD_LONG : CARD_SHORT, isSite ? CARD_SHORT : CARD_LONG]} />
                <meshBasicMaterial color={"#1f2937"} depthTest={false} depthWrite={false} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
