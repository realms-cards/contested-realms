"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Group, Object3D } from "three";
import { createCardMeshUserData } from "@/lib/game/card-preview.types";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";

/**
 * Small Y offset per card in stack - MouseTracker sorts by Y to pick topmost card
 *
 * This offset is ONLY applied when cards are actually stacked (totalInStack > 1).
 * In unstacked mode, cards get a minimal offset (passed via y prop) to allow MouseTracker
 * to distinguish overlapping cards while remaining visually flat.
 *
 * Benefits:
 * - Autostack mode: Stacked cards get unique Y positions (0.001 per layer) → clear visual stacking
 * - Unstacked mode: Minimal Y offset (0.001 per card index) → visually flat but pickable
 */
const STACK_VERTICAL_STEP = 0.001;

function isPrimaryCardHit(e: ThreeEvent<PointerEvent>): boolean {
  const intersections = e.intersections;
  if (!intersections || intersections.length === 0) {
    return true;
  }

  const primaryObject = (intersections[0]?.object ?? null) as Object3D | null;
  const eventObject = (e.object as Object3D | undefined) ?? null;

  if (!primaryObject || !eventObject) {
    return true;
  }

  if (primaryObject.uuid === eventObject.uuid) {
    return true;
  }

  let cursor: Object3D | null = eventObject.parent ?? null;
  while (cursor) {
    if (cursor.uuid === primaryObject.uuid) {
      return true;
    }
    cursor = cursor.parent ?? null;
  }

  cursor = primaryObject.parent ?? null;
  while (cursor) {
    if (cursor.uuid === eventObject.uuid) {
      return true;
    }
    cursor = cursor.parent ?? null;
  }

  return false;
}

function DraggableCard3DInner({
  slug,
  isSite,
  x,
  z,
  y = 0.002,
  onDrop,
  disabled,
  onDragChange,
  rotationZ: extraRotZ = 0,
  onDragMove,
  onRelease,
  getTopRenderOrder,
  onHoverChange,
  onHoverStart,
  onHoverEnd,
  lockUpright,
  onDoubleClick,
  onContextMenu,
  baseRenderOrder = 1500,
  stackIndex = 0,
  totalInStack = 1,
  cardId,
  cardName,
  cardType,
  interactive = true,
  preferRaster = false,
}: {
  slug: string;
  isSite: boolean;
  x: number;
  z: number;
  y?: number;
  onDrop?: (wx: number, wz: number) => void;
  disabled?: boolean;
  onDragChange?: (dragging: boolean) => void;
  rotationZ?: number;
  onDragMove?: (wx: number, wz: number) => void;
  onRelease?: (wx: number, wz: number, wasDragging: boolean) => void;
  getTopRenderOrder?: () => number;
  onHoverChange?: (hovering: boolean) => void;
  onHoverStart?: (card: {
    slug: string;
    name: string;
    type: string | null;
  }) => void;
  onHoverEnd?: () => void;
  lockUpright?: boolean;
  onDoubleClick?: () => void;
  onContextMenu?: (clientX: number, clientY: number) => void;
  baseRenderOrder?: number;
  stackIndex?: number;
  totalInStack?: number;
  cardId?: number;
  cardName?: string;
  cardType?: string | null;
  interactive?: boolean;
  preferRaster?: boolean;
}) {
  const ref = useRef<Group | null>(null);
  const dragStart = useRef<{
    x: number;
    z: number;
    time: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const dragging = useRef(false);
  const upCleanupRef = useRef<(() => void) | null>(null);
  const roRef = useRef<number>(baseRenderOrder);
  const [isDragging, setIsDragging] = useState(false);
  const [uprightLocked, setUprightLocked] = useState(false);
  const lastClickTime = useRef<number>(0);

  const meshUserData = useMemo(
    () =>
      createCardMeshUserData({
        cardId,
        slug,
        name: cardName,
        type: cardType ?? null,
      }),
    [cardId, slug, cardName, cardType]
  );

  // Reset render order to base when not dragging
  useEffect(() => {
    if (!isDragging) {
      roRef.current = baseRenderOrder;
    }
  }, [baseRenderOrder, isDragging]);

  // Calculate unique Y position for this card in the stack
  // MouseTracker sorts by Y to pick the topmost card
  // Only offset Y when actually stacked (totalInStack > 1), otherwise keep all cards on same plane
  const cardY = totalInStack > 1 ? y + stackIndex * STACK_VERTICAL_STEP : y;

  const setPos = useCallback(
    (wx: number, wz: number, lift = false) => {
      if (!ref.current) return;
      ref.current.position.set(wx, lift ? 0.25 : cardY, wz);
    },
    [cardY]
  );

  const rotZ =
    (isSite ? -Math.PI / 2 : 0) +
    (isDragging || lockUpright || uprightLocked ? 0 : extraRotZ);

  // Use full card hitbox for all cards
  // MouseTracker component handles picking the topmost card based on Y position
  // This is simpler and more reliable than trying to calculate visible strips
  const visibleWidth = CARD_SHORT;
  const visibleHeight = CARD_LONG;
  const hitboxOffsetX = 0;
  const hitboxOffsetZ = 0;

  return (
    <group ref={ref} position={[x, cardY, z]}>
      {/* Invisible hitbox positioned at card surface level, sized for visible area */}
      <mesh
        position={[hitboxOffsetX, 0.005, hitboxOffsetZ]}
        rotation-x={-Math.PI / 2}
        rotation-z={isSite ? -Math.PI / 2 : 0}
        userData={
          meshUserData ?? {
            cardId: cardId ?? 0,
            slug,
            type: cardType ?? null,
            name: cardName,
          }
        }
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
          if (!isPrimaryCardHit(e)) return;
          e.stopPropagation();
          onHoverChange?.(false);
          // Record potential drag start in both world and screen space
          dragStart.current = {
            x: e.point.x,
            z: e.point.z,
            time: Date.now(),
            screenX: e.clientX,
            screenY: e.clientY,
          };
          // bring to front
          if (getTopRenderOrder) {
            const next = getTopRenderOrder();
            roRef.current = next;
          }
          // Don't lock orbit immediately - wait for actual drag to start
          // Ensure we always unlock if pointerup happens off the mesh before drag begins
          if (!upCleanupRef.current) {
            const earlyUp = () => {
              onDragChange?.(false);
              dragStart.current = null;
              dragging.current = false;
              setIsDragging(false);
              if (upCleanupRef.current) {
                upCleanupRef.current();
                upCleanupRef.current = null;
              }
            };
            window.addEventListener("pointerup", earlyUp, { once: true });
            upCleanupRef.current = () =>
              window.removeEventListener("pointerup", earlyUp);
          }
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          if (!interactive) return;
          if (!isPrimaryCardHit(e)) return;
          onHoverStart?.({
            slug,
            name: cardName ?? slug,
            type: cardType ?? null,
          });
        }}
        onPointerOut={() => {
          if (!interactive) return;
          onHoverEnd?.();
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          // Continuous hover detection: check if this card is the topmost one under cursor
          // This fires more reliably than onPointerOver for overlapping cards
          if (interactive && !dragging.current && isPrimaryCardHit(e)) {
            onHoverStart?.({
              slug,
              name: cardName ?? slug,
              type: cardType ?? null,
            });
          }
          if (disabled) return;
          const s = dragStart.current;
          if (!s) return;
          // Check threshold to start dragging
          const held = Date.now() - s.time;
          const dx = e.clientX - s.screenX;
          const dy = e.clientY - s.screenY;
          const dist = Math.hypot(dx, dy);
          const PIX_THRESH = 6;
          if (!dragging.current && held >= 50 && dist > PIX_THRESH) {
            dragging.current = true;
            setIsDragging(true);
            setUprightLocked(true);
            // Lock orbit controls when dragging actually starts
            onDragChange?.(true);
            // Bind a global pointerup fallback
            const handleUp = () => {
              // Ensure cleanup even if pointer up occurs off the mesh
              onDragChange?.(false);
              dragStart.current = null;
              dragging.current = false;
              setIsDragging(false);
              if (upCleanupRef.current) {
                upCleanupRef.current();
                upCleanupRef.current = null;
              }
            };
            window.addEventListener("pointerup", handleUp, { once: true });
            upCleanupRef.current = () =>
              window.removeEventListener("pointerup", handleUp);
          }
          if (dragging.current) {
            e.stopPropagation();
            const wx = e.point.x;
            const wz = e.point.z;
            setPos(wx, wz, true);
            onDragMove?.(wx, wz);
          }
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
          const wasDragging = dragging.current;
          const wx = e.point.x;
          const wz = e.point.z;

          // Detect double-click
          const now = Date.now();
          const timeSinceLastClick = now - lastClickTime.current;
          const isDoubleClick = !wasDragging && timeSinceLastClick < 300;
          lastClickTime.current = now;

          // Always settle to ground height
          setPos(wx, wz, false);
          dragStart.current = null;
          dragging.current = false;
          setIsDragging(false);
          onDragChange?.(false);
          if (upCleanupRef.current) {
            upCleanupRef.current();
            upCleanupRef.current = null;
          }

          if (isDoubleClick) {
            onDoubleClick?.();
          } else if (onDrop && wasDragging) {
            onDrop(wx, wz);
          }

          onRelease?.(wx, wz, wasDragging);
        }}
        onContextMenu={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          e.stopPropagation();
          e.nativeEvent.preventDefault();
          onContextMenu?.(e.clientX, e.clientY);
        }}
      >
        <planeGeometry args={[visibleWidth, visibleHeight]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={true}
          depthTest={true}
        />
        {/* Allow raycasting to pass through to cards below by setting raycast layers */}
      </mesh>

      {/* Visual card */}
      <group>
        <CardPlane
          slug={slug}
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={rotZ}
          upright={false}
          depthWrite={false}
          depthTest={false}
          renderOrder={roRef.current}
          interactive={interactive}
          elevation={0.002}
          cardId={cardId}
          preferRaster={preferRaster}
        />
      </group>
    </group>
  );
}

// Memoize to prevent re-renders when parent state (like hoverPreview) changes
const DraggableCard3D = memo(DraggableCard3DInner);
export default DraggableCard3D;
