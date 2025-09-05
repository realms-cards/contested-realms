"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { Group, PerspectiveCamera, Object3D, Intersection } from "three";
import { Vector3, Plane, Raycaster, Vector2 } from "three";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT, HAND_DIST, HAND_BOTTOM_MARGIN, DRAG_HOLD_MS } from "@/lib/game/constants";
import type { BoosterCard } from "@/lib/game/cardSorting";

// Row card scale bounds relative to board card size (1.0 = board size)
const ROW_MIN_SCALE = 0.55;
const ROW_MAX_SCALE = 0.85;

export interface DraftPackHand3DProps {
  cards: BoosterCard[];
  // Disable all interactions (e.g., while resolving pick)
  disabled?: boolean;
  // Hide a specific index (e.g., when staged on the board)
  hiddenIndex?: number | null;
  // Lock/unlock orbit controls during drag
  onDragChange?: (dragging: boolean) => void;
  // Notify parent of drag move in world coords (for staging radius check)
  onDragMove?: (index: number, wx: number, wz: number) => void;
  // Notify parent of release (for staging commit/uncommit)
  onRelease?: (
    index: number,
    wx: number,
    wz: number,
    wasDragging: boolean
  ) => void;
  // Render-order helper so dragged cards come to front
  getTopRenderOrder?: () => number;
  // Hover info hook for preview overlays
  onHoverInfo?: (info: { slug: string; name: string; type: string | null } | null) => void;
  // If true, suppress hover previews
  orbitLocked?: boolean;
  // Controlled selection from parent for persistent preview/indicator
  selectedIndex?: number | null;
  onSelectIndex?: (index: number | null) => void;
}

// A simple, anchored-to-camera row of cards for draft packs (no fan, fully visible)
export default function DraftPackHand3D({
  cards,
  disabled = false,
  hiddenIndex = null,
  onDragChange,
  onDragMove,
  onRelease,
  getTopRenderOrder,
  onHoverInfo,
  orbitLocked = false,
  selectedIndex = null,
  onSelectIndex,
}: DraftPackHand3DProps) {
  const rootRef = useRef<Group | null>(null);
  const worldLayerRef = useRef<Group | null>(null);
  const { camera, size } = useThree();

  // (reserved) minimal hover state if needed later
  const focusIndexRef = useRef<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const hoverIndexRef = useRef<number | null>(null);
  const hoverAnyRef = useRef<boolean>(false);
  const hoverClearTimerRef = useRef<number | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const mouseYRef = useRef<number>(0);
  React.useEffect(() => {
    const onMove = (e: MouseEvent) => (mouseYRef.current = e.clientY);
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  React.useEffect(() => {
    focusIndexRef.current = focusIndex;
  }, [focusIndex]);

  // Anchor the root to the camera's bottom area (similar to Hand3D)
  useFrame(() => {
    if (!rootRef.current) return;

    const dist = HAND_DIST;
    const cam = camera as PerspectiveCamera;
    const fov = (cam.fov * Math.PI) / 180;
    const worldH = 2 * Math.tan(fov / 2) * dist;
    const bottomY = -worldH / 2 + HAND_BOTTOM_MARGIN + CARD_LONG * ROW_MIN_SCALE * 0.5;

    rootRef.current.position.copy(cam.position);
    rootRef.current.quaternion.copy(cam.quaternion);
    rootRef.current.translateZ(-dist);
    // Always visible, no hide/peek motion
    rootRef.current.translateY(bottomY);
  });

  // Visible indices after hiding a staged card
  const visibleIndices = useMemo(() => {
    return cards.map((_, i) => i).filter((i) => i !== hiddenIndex);
  }, [cards, hiddenIndex]);

  // Clear keyboard focus whenever the pack changes or hidden index changes
  React.useEffect(() => {
    setFocusIndex(null);
  }, [cards, hiddenIndex]);

  // Keyboard and wheel browsing (arrow keys or wheel in bottom zone)
  React.useEffect(() => {
    const bumpFocusTimer = () => {
      if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
      focusTimerRef.current = window.setTimeout(() => {
        setFocusIndex(null);
        if (!orbitLocked && !hoverAnyRef.current) onHoverInfo?.(null);
      }, 1800);
    };

    const pickNext = (dir: 1 | -1) => {
      const vis = visibleIndices;
      const n = vis.length;
      if (n === 0) return;
      const start = focusIndexRef.current != null ? focusIndexRef.current : hoverIndexRef.current;
      const curPos = start == null ? -1 : vis.indexOf(start);
      const nextPos = (curPos + dir + n) % n;
      const nextIdx = vis[nextPos] ?? null;
      setFocusIndex(nextIdx);
      if (nextIdx != null && !orbitLocked) {
        const c = cards[nextIdx];
        if (c) onHoverInfo?.({ slug: c.slug, name: c.cardName, type: c.type ?? null });
        bumpFocusTimer();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (orbitLocked) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        pickNext(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        pickNext(-1);
      } else if (e.key === "Enter") {
        // Stage focused card via parent onSelectIndex
        const idx = focusIndexRef.current != null ? focusIndexRef.current : hoverIndexRef.current;
        if (idx != null) {
          e.preventDefault();
          onSelectIndex?.(idx);
          // Clear focus after staging
          setFocusIndex(null);
          if (!orbitLocked) onHoverInfo?.(null);
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (orbitLocked) return;
      const h = window.innerHeight || 1;
      const inBottomZone = mouseYRef.current >= h * 0.78; // bottom ~22%
      if (!inBottomZone) return;
      e.preventDefault();
      if (e.deltaY > 0) pickNext(1);
      else if (e.deltaY < 0) pickNext(-1);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [visibleIndices, orbitLocked, cards, onHoverInfo, onSelectIndex]);

  // Clear preview when focus is removed (from timer) unless something is selected (handled by parent)
  React.useEffect(() => {
    if (focusIndex == null && selectedIndex == null) {
      // Do not clear if the mouse is currently hovering any card
      if (!hoverAnyRef.current) onHoverInfo?.(null);
    }
  }, [focusIndex, selectedIndex, onHoverInfo]);

  // Basic straight-line layout (no fan) for visible cards only, with dynamic scaling as pack shrinks
  const layout = useMemo(() => {
    const n = visibleIndices.length;
    if (n === 0) return [] as { originalIndex: number; x: number; z: number; scale: number }[];

    // Fit target: occupy ~85% of viewport width at HAND_DIST
    const gapFrac = 0.08; // 8% of card width

    // Estimate available world width at HAND_DIST (use 85% of viewport width)
    const cam = camera as PerspectiveCamera;
    const fov = (cam.fov * Math.PI) / 180;
    const worldH = 2 * Math.tan(fov / 2) * HAND_DIST;
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 16 / 9;
    const worldW = worldH * aspect * 0.85; // 85% safety margin

    // Solve for scale to fit worldW (with constant gap fraction)
    const denom = CARD_SHORT * (n + (n - 1) * gapFrac);
    const fitScale = denom > 0 ? worldW / denom : ROW_MIN_SCALE;
    const scale = Math.max(ROW_MIN_SCALE, Math.min(ROW_MAX_SCALE, fitScale));
    const cardW = CARD_SHORT * scale;
    const realGap = CARD_SHORT * gapFrac * scale;
    const total = n * cardW + (n - 1) * realGap;
    const startX = -total / 2 + cardW / 2;

    return new Array(n).fill(0).map((_, i) => {
      const x = startX + i * (cardW + realGap);
      const originalIndex = visibleIndices[i]!;
      return { originalIndex, x, z: i * 0.001, scale };
    });
  }, [visibleIndices, camera, size.width, size.height]);

  return (
    <group>
      {/* World-space drag layer (identity transform) */}
      <group ref={worldLayerRef} />
      {/* Camera-anchored hand row */}
      <group ref={rootRef}>
        {layout.map((entry) => {
          const { originalIndex, x, z, scale } = entry;
          const c = cards[originalIndex]!;
          const isSite = (c.type || "").toLowerCase().includes("site");
          const key = c.variantId != null ? `v-${c.variantId}` : `c-${c.cardId}-${originalIndex}`;
          return (
            <PackCard3D
              key={key}
              index={originalIndex}
              slug={c.slug}
              name={c.cardName}
              type={c.type}
              isSite={isSite}
              x={x}
              z={z}
              scale={scale}
              disabled={disabled}
              onDragChange={(drag) => onDragChange?.(drag)}
              onDragMove={onDragMove}
              onRelease={onRelease}
              getTopRenderOrder={getTopRenderOrder}
              onHoverInfo={(info) => {
                onHoverInfo?.(info);
                if (info) {
                  if (hoverClearTimerRef.current) window.clearTimeout(hoverClearTimerRef.current);
                  hoverClearTimerRef.current = null;
                }
              }}
              onHoverIndexChange={(i) => {
                hoverIndexRef.current = i;
                hoverAnyRef.current = i != null;
                if (i != null) {
                  if (hoverClearTimerRef.current) window.clearTimeout(hoverClearTimerRef.current);
                  hoverClearTimerRef.current = null;
                } else {
                  if (hoverClearTimerRef.current) window.clearTimeout(hoverClearTimerRef.current);
                  hoverClearTimerRef.current = window.setTimeout(() => {
                    // Only clear if no hover has resumed and no keyboard focus or selection
                    if (!hoverAnyRef.current && focusIndexRef.current == null && selectedIndex == null) {
                      onHoverInfo?.(null);
                    }
                  }, 260);
                }
              }}
              orbitLocked={orbitLocked}
              rootRef={rootRef}
              worldLayerRef={worldLayerRef}
              selected={selectedIndex === originalIndex}
              focused={focusIndex === originalIndex}
              onSelectIndex={onSelectIndex}
            />
          );
        })}
      </group>
    </group>
  );
}

function PackCard3D({
  index,
  slug,
  name,
  type,
  isSite,
  x,
  z,
  scale,
  disabled,
  onDragChange,
  onDragMove,
  onRelease,
  getTopRenderOrder,
  onHoverInfo,
  orbitLocked,
  rootRef,
  worldLayerRef,
  selected,
  focused,
  onSelectIndex,
  onHoverIndexChange,
}: {
  index: number;
  slug: string;
  name: string;
  type: string | null | undefined;
  isSite: boolean;
  x: number;
  z: number;
  scale: number;
  disabled?: boolean;
  onDragChange?: (dragging: boolean) => void;
  onDragMove?: (index: number, wx: number, wz: number) => void;
  onRelease?: (index: number, wx: number, wz: number, wasDragging: boolean) => void;
  getTopRenderOrder?: () => number;
  onHoverInfo?: (info: { slug: string; name: string; type: string | null } | null) => void;
  orbitLocked?: boolean;
  rootRef: React.MutableRefObject<Group | null>;
  worldLayerRef: React.MutableRefObject<Group | null>;
  selected?: boolean;
  focused?: boolean;
  onSelectIndex?: (index: number | null) => void;
  onHoverIndexChange?: (index: number | null) => void;
}) {
  // Mark orbitLocked as used to avoid lint warning (we no longer gate hover by it)
  void orbitLocked;
  const ref = useRef<Group | null>(null);
  const roRef = useRef<number>(1500);
  const dragStart = useRef<{ time: number; screenX: number; screenY: number } | null>(null);
  const dragging = useRef(false);
  const upCleanupRef = useRef<(() => void) | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const hoveringRef = useRef(false);
  const didInteractRef = useRef(false);
  const inWorldRef = useRef(false);
  const groundPlaneRef = useRef<Plane>(new Plane(new Vector3(0, 1, 0), 0));
  const tmpWorldRef = useRef<Vector3>(new Vector3());
  // No separate ghost; move the group to track pointer while dragging
  const lastWorldPosRef = useRef<{ x: number; z: number } | null>(null);
  const targetLocalRef = useRef<{ x: number; z: number; y: number } | null>(null);
  const moveCleanupRef = useRef<(() => void) | null>(null);
  const raycasterRef = useRef<Raycaster>(new Raycaster());
  const ndcRef = useRef<Vector2>(new Vector2());
  const three = useThree();
  const dragScreenRef = useRef<{x:number;y:number}|null>(null);

  // Helper to set local position (coordinates relative to rootRef)
  const setLocalPos = useCallback(
    (lx: number, lz: number, lift = false) => {
      if (!ref.current) return;
      ref.current.position.set(lx, lift ? 0.25 : 0.002, lz);
    },
    []
  );

  // Reset to initial anchored row position when not dragging
  const resetToRow = useCallback(() => {
    setLocalPos(x, z, false);
  }, [setLocalPos, x, z]);

  // Initialize to row position
  React.useEffect(() => {
    resetToRow();
  }, [resetToRow]);

  // Disable raycast on visual-only meshes (like selection overlay)
  function noopRaycast(this: Object3D, _ray: Raycaster, _isects: Intersection[]) {
    void _ray;
    void _isects;
  }

  // Smoothly move toward target local position while dragging
  useFrame(() => {
    if (!ref.current) return;
    // Determine target position & scale
    const baseLiftY = focused ? 0.16 : selected ? 0.12 : (hoveringRef.current ? 0.06 : 0.002);
    const baseTarget = { x, z, y: baseLiftY };
    if (!inWorldRef.current) {
      const t = dragging.current && targetLocalRef.current ? targetLocalRef.current : baseTarget;
      const p = ref.current.position;
      if (dragging.current && targetLocalRef.current) {
        // While dragging in local space, pin exactly under cursor (no smoothing)
        p.set(t.x, t.y, t.z);
      } else {
        const alpha = 0.25; // smoothing factor
        p.x += (t.x - p.x) * alpha;
        p.z += (t.z - p.z) * alpha;
        p.y += (t.y - p.y) * alpha;
      }
    }

    // Scale animation
    let sTarget = (focused || selected || hoveringRef.current) ? 1.1 * scale : scale;
    if (inWorldRef.current) {
      // When dragging in world space, use board size unless pointer is back in bottom hand zone
      const rect = three.gl.domElement.getBoundingClientRect();
      const sy = dragScreenRef.current?.y ?? 0;
      const inBottom = sy >= rect.top + rect.height * 0.78;
      sTarget = inBottom ? scale : 1.0;
    }
    const s = ref.current.scale;
    if (inWorldRef.current) {
      // Immediate scale while dragging in world space
      s.set(sTarget, sTarget, sTarget);
    } else {
      const sAlpha = 0.2;
      s.x += (sTarget - s.x) * sAlpha;
      s.y += (sTarget - s.y) * sAlpha;
      s.z += (sTarget - s.z) * sAlpha;
    }
  });

  // When selected or focused, bring to top render order
  React.useEffect(() => {
    if ((selected || focused) && getTopRenderOrder) {
      roRef.current = getTopRenderOrder();
    }
  });

  return (
    <group ref={ref} position={[x, 0.002, z]} scale={[scale, scale, scale]}>
      {/* Horizontal plane hitbox (aligned with ground) for reliable top-down hover/click */}
      <mesh
        position={[0, 0, 0]}
        rotation-x={-Math.PI / 2}
        rotation-z={0}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
          didInteractRef.current = true;
          onHoverInfo?.(null);
          dragStart.current = {
            time: Date.now(),
            screenX: e.clientX,
            screenY: e.clientY,
          };
          if (getTopRenderOrder) {
            const next = getTopRenderOrder();
            roRef.current = next;
          }
          // Clear selection on new interaction
          onSelectIndex?.(null);
          if (!upCleanupRef.current) {
            const earlyUp = () => {
              onDragChange?.(false);
              dragStart.current = null;
              const was = dragging.current;
              dragging.current = false;
              setIsDragging(false);
              // If pointerup happens off the mesh while dragging, still emit a release using last world coords
              if (was) {
                const last = lastWorldPosRef.current;
                if (last) onRelease?.(index, last.x, last.z, true);
              }
              // Always snap back to row after cancellation
              resetToRow();
              // Remove global move listener
              if (moveCleanupRef.current) {
                moveCleanupRef.current();
                moveCleanupRef.current = null;
              }
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
          didInteractRef.current = true;
          const held = Date.now() - s.time;
          const dx = e.clientX - s.screenX;
          const dy = e.clientY - s.screenY;
          const dist = Math.hypot(dx, dy);
          const PIX_THRESH = 6;
          if (!dragging.current && held >= DRAG_HOLD_MS && dist > PIX_THRESH) {
            dragging.current = true;
            setIsDragging(true);
            // Lock orbit only when actual drag begins
            onDragChange?.(true);
            // Bind global move listener for smooth dragging off the mesh
            if (!moveCleanupRef.current) {
              const handleMove = (evt: PointerEvent) => {
                if (!dragging.current) return;
                dragScreenRef.current = { x: evt.clientX, y: evt.clientY };
                const rect = three.gl.domElement.getBoundingClientRect();
                const ndcX = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
                const ndcY = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
                const rc = raycasterRef.current;
                const ndc = ndcRef.current;
                ndc.set(ndcX, ndcY);
                rc.setFromCamera(ndc, three.camera as PerspectiveCamera);
                const hit = rc.ray.intersectPlane(groundPlaneRef.current, tmpWorldRef.current);
                if (!hit) return;
                const wx = hit.x;
                const wz = hit.z;
                lastWorldPosRef.current = { x: wx, z: wz };
                if (inWorldRef.current && ref.current) {
                  ref.current.position.set(wx, 0.25, wz);
                } else {
                  const root = rootRef.current;
                  if (root) {
                    const v = new Vector3(wx, 0, wz);
                    root.worldToLocal(v);
                    targetLocalRef.current = { x: v.x, z: v.z, y: 0.25 };
                    if (ref.current) {
                      ref.current.position.set(v.x, 0.25, v.z);
                    }
                  }
                }
                onDragMove?.(index, wx, wz);
              };
              window.addEventListener("pointermove", handleMove);
              moveCleanupRef.current = () => window.removeEventListener("pointermove", handleMove);
            }
            // On drag start: reparent to world layer and snap under cursor
            const hit = e.ray.intersectPlane(groundPlaneRef.current, tmpWorldRef.current);
            if (hit && worldLayerRef.current && ref.current) {
              inWorldRef.current = true;
              worldLayerRef.current.attach(ref.current);
              ref.current.position.set(hit.x, 0.25, hit.z);
            }
          }
          if (dragging.current) {
            e.stopPropagation();
            // Convert ray to ground-plane intersection in world space (y=0)
            const hit = e.ray.intersectPlane(groundPlaneRef.current, tmpWorldRef.current);
            if (!hit) return;
            dragScreenRef.current = { x: e.clientX, y: e.clientY };
            const wx = hit.x;
            const wz = hit.z;
            lastWorldPosRef.current = { x: wx, z: wz };
            if (inWorldRef.current && ref.current) {
              ref.current.position.set(wx, 0.25, wz);
            } else {
              const root = rootRef.current;
              if (root) {
                const v = new Vector3(wx, 0, wz);
                root.worldToLocal(v);
                targetLocalRef.current = { x: v.x, z: v.z, y: 0.25 };
                if (ref.current) {
                  // Immediate update to keep card under cursor
                  ref.current.position.set(v.x, 0.25, v.z);
                }
              }
            }
            onDragMove?.(index, wx, wz);
          }
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
          const wasDragging = dragging.current;
          const hit = e.ray.intersectPlane(groundPlaneRef.current, tmpWorldRef.current);
          const wx = (hit?.x ?? e.point.x);
          const wz = (hit?.z ?? e.point.z);
          dragStart.current = null;
          dragging.current = false;
          setIsDragging(false);
          onDragChange?.(false);
          if (upCleanupRef.current) {
            upCleanupRef.current();
            upCleanupRef.current = null;
          }
          if (moveCleanupRef.current) {
            moveCleanupRef.current();
            moveCleanupRef.current = null;
          }
          // Reattach to hand row parent
          if (inWorldRef.current && rootRef.current && ref.current) {
            rootRef.current.attach(ref.current);
            inWorldRef.current = false;
          }
          onRelease?.(index, wx, wz, wasDragging);
          if (!wasDragging) {
            // Select card on click and persist preview
            onSelectIndex?.(index);
            onHoverInfo?.({ slug, name, type: type ?? null });
          }
          // Snap back to tidy row
          resetToRow();
          targetLocalRef.current = null;
        }}
        onPointerOver={() => {
          if (disabled) return;
          hoveringRef.current = true;
          if (getTopRenderOrder) {
            const next = getTopRenderOrder();
            roRef.current = next;
          }
          onHoverInfo?.({ slug, name, type: type ?? null });
          onHoverIndexChange?.(index);
        }}
        onPointerMove={() => {
          if (disabled) return;
          // Continuously refresh hover while moving to avoid accidental clears
          onHoverInfo?.({ slug, name, type: type ?? null });
          onHoverIndexChange?.(index);
        }}
        onPointerOut={() => {
          hoveringRef.current = false;
          onHoverIndexChange?.(null);
        }}
      >
        <planeGeometry args={[CARD_SHORT * 1.2, CARD_LONG * 1.2]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {/* Visual card (upright). Sites rotate -90° for correct art orientation */}
      <group>
        {/* Selection indicator: subtle glow rectangle slightly larger than card */}
        {selected && !isDragging && (
          <mesh position={[0, 0.001, 0]} rotation-x={0} raycast={noopRaycast}>
            <planeGeometry args={[CARD_SHORT * 1.08, CARD_LONG * 1.08]} />
            <meshBasicMaterial color="#ffffff" opacity={0.16} transparent depthWrite={false} depthTest={false} />
          </mesh>
        )}
        <CardPlane
          slug={slug}
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={isSite ? -Math.PI / 2 : 0}
          upright
          depthWrite={isDragging}
          depthTest={isDragging}
          renderOrder={roRef.current}
          interactive={false}
          elevation={0.002 + (hoverWeightForRow(scale, isDragging) ? 0.018 : 0)}
        />
      </group>
    </group>
  );
}

// Small helper for a subtle row lift effect when dragging
function hoverWeightForRow(_scale: number, isDragging: boolean) {
  return !isDragging;
}
