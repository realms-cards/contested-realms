"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { Group } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import CardPlane from "@/lib/game/components/CardPlane";

export default function DraggableCard3D({
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
  lockUpright,
  onDoubleClick,
  onContextMenu,
  baseRenderOrder = 1500,
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
  lockUpright?: boolean;
  onDoubleClick?: () => void;
  onContextMenu?: (clientX: number, clientY: number) => void;
  baseRenderOrder?: number;
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
  const hoveringRef = useRef(false);
  const hoverStableRef = useRef<number | null>(null);
  const lastClickTime = useRef<number>(0);

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverStableRef.current) {
        window.clearTimeout(hoverStableRef.current);
      }
    };
  }, []);

  // Reset render order to base when not dragging
  useEffect(() => {
    if (!isDragging) {
      roRef.current = baseRenderOrder;
    }
  }, [baseRenderOrder, isDragging]);

  const setPos = useCallback((wx: number, wz: number, lift = false) => {
    if (!ref.current) return;
    ref.current.position.set(wx, lift ? 0.25 : 0.002, wz);
  }, []);

  const rotZ =
    (isSite ? -Math.PI / 2 : 0) +
    (isDragging || lockUpright || uprightLocked ? 0 : extraRotZ);

  return (
    <group ref={ref} position={[x, y, z]}>
      {/* Larger invisible hitbox for easier interaction */}
      <mesh
        position={[0, 0.01, 0]}
        rotation-y={rotZ}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
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
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
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
        onPointerOver={() => {
          if (disabled) return;
          hoveringRef.current = true;
          // Clear any pending hover-out debounce
          if (hoverStableRef.current) {
            window.clearTimeout(hoverStableRef.current);
            hoverStableRef.current = null;
          }
          onHoverChange?.(true);
        }}
        onPointerOut={() => {
          hoveringRef.current = false;
          // Add a small delay before calling hover false to prevent spurious events
          if (hoverStableRef.current) {
            window.clearTimeout(hoverStableRef.current);
          }
          hoverStableRef.current = window.setTimeout(() => {
            // Only call hover false if we're truly not hovering anymore
            if (!hoveringRef.current) {
              onHoverChange?.(false);
            }
            hoverStableRef.current = null;
          }, 50); // Small delay to handle pointer event quirks
        }}
        onContextMenu={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          e.stopPropagation();
          e.nativeEvent.preventDefault();
          onContextMenu?.(e.clientX, e.clientY);
        }}
      >
        <boxGeometry args={[CARD_SHORT * 1.12, 0.02, CARD_LONG * 1.12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
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
          interactive={false}
          elevation={0.002}
        />
      </group>
    </group>
  );
}

