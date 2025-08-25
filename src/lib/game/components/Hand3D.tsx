"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  HAND_CARD_SCALE,
} from "@/lib/game/constants";
import { DRAG_HOLD_MS } from "@/lib/game/constants";
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
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);

  const hand = zones[owner].hand || [];
  const rootRef = useRef<Group | null>(null);
  const { camera } = useThree();
  // Track whether mouse is in the bottom 1/4 of the screen
  const [mouseInZone, setMouseInZone] = useState(true);
  // Track the number of cards being hovered (simpler than insideHand)
  const [hoveredCardCount, setHoveredCardCount] = useState(0);
  const handDragStart = useRef<{
    x: number;
    y: number;
    time: number;
    index: number;
  } | null>(null);
  const revealLerp = useRef(1); // 0 hidden .. 1 shown
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const h = window.innerHeight || 1;
      const inZone = e.clientY >= h * 0.75;
      setMouseInZone(inZone);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  // Clear local hand drag start when mouse is released anywhere
  useEffect(() => {
    const onUp = () => {
      handDragStart.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);
  // Keep the hand anchored to the camera with less frequent updates
  useFrame(() => {
    const cam = camera as PerspectiveCamera;
    if (!rootRef.current || !("fov" in cam)) return;

    const dist = HAND_DIST;
    const fov = (cam.fov * Math.PI) / 180;
    const worldH = 2 * Math.tan(fov / 2) * dist;
    const margin = HAND_BOTTOM_MARGIN;
    const bottomY = -worldH / 2 + margin + CARD_LONG * 0.5 * HAND_CARD_SCALE;

    // Smart visibility logic - distinguish between hand drags and pile drags
    const isHandDrag = dragFromHand && selected && selected.who === owner; // Hand card being dragged
    const isPileDrag = dragFromHand && dragFromPile && !selected; // Pile card being dragged
    const targetShown =
      !isHandDrag && (mouseInZone || hoveredCardCount > 0) ? 1 : 0;

    if (isHandDrag) {
      revealLerp.current = 0; // Collapse for hand drags
    } else {
      const k = 0.25; // faster lerp for more responsive feel
      revealLerp.current += (targetShown - revealLerp.current) * k;
      if (Math.abs(targetShown - revealLerp.current) < 0.005)
        revealLerp.current = targetShown;
    }

    const hiddenOffset = -CARD_LONG * HAND_CARD_SCALE * 0.8;
    const yOffset = hiddenOffset * (1 - revealLerp.current);

    rootRef.current.position.copy(cam.position);
    rootRef.current.quaternion.copy(cam.quaternion);
    rootRef.current.translateZ(-dist);
    rootRef.current.translateY(bottomY + yOffset);
  });

  // Layout: fan cards and center across available width
  const layout = useMemo(() => {
    const n = hand.length;
    if (n === 0) return [] as { x: number; y: number; rot: number }[];
    const maxTotal = HAND_MAX_TOTAL_ANGLE; // cap total fan angle
    const step = Math.min(HAND_STEP_MAX, n > 1 ? maxTotal / (n - 1) : 0);
    const total = step * (n - 1);
    const start = -total / 2;
    // Better overlap calculation for smoother fan and more clickable cards
    const overlap = CARD_SHORT * HAND_OVERLAP_FRAC * HAND_CARD_SCALE * 0.7;
    const startX = -((n - 1) * overlap) / 2;
    const arc = HAND_FAN_ARC_Y;
    return new Array(n).fill(0).map((_, i) => {
      const x = startX + i * overlap;
      const rot = start + i * step;
      // Optional slight vertical arc across the fan (0 disables)
      let y = 0;
      if (arc !== 0) {
        const t = n > 1 ? i / (n - 1) : 0.5; // 0..1 across the fan
        // Flip arc direction so the fan bows downward toward the bottom of the screen
        y = -Math.sin(t * Math.PI) * arc; // peak at center
      }
      return { x, y, rot };
    });
  }, [hand.length]);

  // Simplified hover handling
  const hoverTimer = useRef<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

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

  // More robust state management
  useEffect(() => {
    if (hand.length === 0) {
      setHoveredCardCount(0);
      setHovered(null);
      clearHoverPreview();
    }
  }, [hand.length]);

  useEffect(() => {
    if (!dragFromHand && !dragFromPile) {
      // Reset hover state when dragging stops to prevent sticking
      setHovered(null);
      // Also clear the drag start ref to prevent ghost drags
      handDragStart.current = null;
    }
  }, [dragFromHand, dragFromPile]);

  // Additional failsafe for stuck drag states - no dependencies to prevent re-registration
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      handDragStart.current = null;
      setHovered(null);
      setHoveredCardCount(0); // Reset hover count on global mouse up
      // Note: Don't clear drag states here as it may interfere with Board drop logic
      // Let the Board component be authoritative for clearing drag states after drops
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []); // No dependencies to prevent handler re-registration

  useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    },
    []
  );

  return (
    <group ref={rootRef}>
      {hand.map((c, i) => {
        const isHandDrag = dragFromHand && selected && selected.who === owner;
        const isPileDrag = dragFromHand && dragFromPile && !selected;
        const isDragging = isHandDrag; // Only block interactions for actual hand drags
        const isSite = (c.type || "").toLowerCase().includes("site");
        const isSel =
          !!selected && selected.who === owner && selected.index === i;
        const { x, y, rot } = layout[i] || { x: 0, y: 0, rot: 0 };
        const isHovered = hovered === i && !isDragging;
        const scale = HAND_CARD_SCALE;
        const renderOrder = 1000 + i; // Static render order for performance
        return (
          <group
            key={`${c.cardId}-${i}`}
            position={[x, y, 0]}
            scale={[scale, scale, scale]}
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
              // Don't stop propagation for hover - allow orbit controls
              setHoveredCardCount((prev) => prev + 1);
              setHovered(i);
              beginHoverPreview(c);
            }}
            onPointerOut={(e) => {
              if (isDragging) return; // allow bubbling while dragging
              // Don't stop propagation for hover out
              setHoveredCardCount((prev) => Math.max(0, prev - 1));
              if (hovered === i) setHovered(null);
              clearHoverPreview();
            }}
            onPointerDown={(e) => {
              if (isDragging) return; // don't start another drag
              if (e.button !== 0) return;
              e.stopPropagation();
              // Record potential drag start; actual drag starts after hold+move threshold
              handDragStart.current = {
                x: e.clientX,
                y: e.clientY,
                time: Date.now(),
                index: i,
              };
            }}
            onPointerMove={(e) => {
              // Start drag only after a tiny hold and some pointer travel
              if (isHandDrag || isPileDrag) return;
              const s = handDragStart.current;
              if (!s || s.index !== i) return;
              const held = Date.now() - s.time;
              const dx = e.clientX - s.x;
              const dy = e.clientY - s.y;
              const dist = Math.hypot(dx, dy);
              const PIX_THRESH = 8; // pixels
              if (held >= DRAG_HOLD_MS && dist > PIX_THRESH) {
                // Select the card at drag start so Board ghost + drop logic works reliably
                selectHandCard(owner, i);
                setDragFromHand(true);
              }
            }}
          >
            {c.slug ? (
              <CardPlane
                slug={c.slug}
                width={isSite ? CARD_LONG : CARD_SHORT}
                height={isSite ? CARD_SHORT : CARD_LONG}
                rotationZ={(isSite ? -Math.PI / 2 : 0) - rot}
                upright
                depthWrite={false}
                depthTest={false}
                renderOrder={renderOrder}
                interactive={!isDragging}
                elevation={isHovered ? 0.02 : 0.002}
              />
            ) : (
              <mesh
                rotation-x={0}
                rotation-z={(isSite ? -Math.PI / 2 : 0) - rot}
                position={[0, isHovered ? 0.02 : 0.002, 0]}
                renderOrder={renderOrder}
              >
                <planeGeometry
                  args={[
                    isSite ? CARD_LONG : CARD_SHORT,
                    isSite ? CARD_SHORT : CARD_LONG,
                  ]}
                />
                <meshBasicMaterial
                  color={"#1f2937"}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
