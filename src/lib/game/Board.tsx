"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Text, useTexture } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  SRGBColorSpace,
  Raycaster,
  type Object3D,
  type Intersection,
  type Group,
} from "three";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PermanentItem } from "@/lib/game/store";
import {
  RigidBody,
  CuboidCollider,
  useAfterPhysicsStep,
} from "@react-three/rapier";
import CardPlane from "@/lib/game/components/CardPlane";
import CardGlow from "@/lib/game/components/CardGlow";
import { TOKEN_BY_NAME, tokenTextureUrl } from "@/lib/game/tokens";
import {
  BASE_TILE_SIZE,
  TILE_SIZE,
  MAT_RATIO,
  CARD_LONG,
  CARD_SHORT,
  CARD_THICK,
  DRAG_LIFT,
  GROUND_HALF_THICK,
  EDGE_MARGIN,
  WALL_THICK,
  WALL_HALF_HEIGHT,
  DRAG_THRESHOLD,
  DRAG_HOLD_MS,
} from "@/lib/game/constants";

// Minimal shape of the rapier rigid body API we need (keep local to avoid import typing issues)
type BodyApi = {
  wakeUp: () => void;
  setLinvel: (v: { x: number; y: number; z: number }, wake: boolean) => void;
  setAngvel: (v: { x: number; y: number; z: number }, wake: boolean) => void;
  setTranslation: (
    v: { x: number; y: number; z: number },
    wake: boolean
  ) => void;
};

// No-op raycast handler to make a mesh ignore pointer events (lets objects above receive them)
function noopRaycast(
  this: Object3D,
  _raycaster: Raycaster,
  _intersects: Intersection[]
): void {
  // Reference params to satisfy lint rules while intentionally doing nothing
  void _raycaster;
  void _intersects;
}

// Isolated playmat that loads its texture and renders the background plane.
// Wrapped in Suspense by the parent so Board itself doesn't suspend.
function Playmat({ matW, matH }: { matW: number; matH: number }) {
  const tex = useTexture("/api/assets/playmat.jpg");
  tex.colorSpace = SRGBColorSpace;
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[0, 0, 0]}
      receiveShadow
      raycast={noopRaycast}
    >
      <planeGeometry args={[matW, matH]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

export default function Board() {
  const board = useGameStore((s) => s.board);
  const showGrid = useGameStore((s) => s.showGridOverlay);
  const showPlaymat = useGameStore((s) => s.showPlaymat);
  const playSelectedTo = useGameStore((s) => s.playSelectedTo);
  const moveSelectedPermanentToWithOffset = useGameStore(
    (s) => s.moveSelectedPermanentToWithOffset
  );
  const setPermanentOffset = useGameStore((s) => s.setPermanentOffset);
  const moveAvatarToWithOffset = useGameStore((s) => s.moveAvatarToWithOffset);
  const openContextMenu = useGameStore((s) => s.openContextMenu);
  const contextMenu = useGameStore((s) => s.contextMenu);
  const selected = useGameStore((s) => s.selectedCard);
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  // hover tracking disabled for tiles
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  // Hand visibility state to disable glows when hand is shown
  const mouseInHandZone = useGameStore((s) => s.mouseInHandZone);
  const handHoverCount = useGameStore((s) => s.handHoverCount);
  const isHandVisible = mouseInHandZone || handHoverCount > 0;
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const dragFromPile = useGameStore((s) => s.dragFromPile);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const playFromPileTo = useGameStore((s) => s.playFromPileTo);
  // Playmat texture is loaded inside the Playmat subcomponent via Suspense.

  // Removed baseline-shift helper to ensure only the moved card changes position

  // Continuously update the drag ghost position based on cursor ray -> ground plane (y=0)
  useFrame(() => {
    // Only drive ghost while dragging a card from hand/pile (not board/avatars)
    if (
      dragFromHand &&
      !dragAvatar &&
      !dragging &&
      (selected || dragFromPile?.card) &&
      ghostGroupRef.current &&
      camera
    ) {
      try {
        const rc = raycasterRef.current;
        // Use normalized device coords maintained by R3F
        rc.setFromCamera(pointer, camera);
        const { origin, direction } = rc.ray;
        const dy = direction.y;
        if (Math.abs(dy) > 1e-6) {
          const t = -origin.y / dy; // intersection with y=0 plane
          const px = origin.x + direction.x * t;
          const pz = origin.z + direction.z * t;
          // Smoothly approach target for a less jittery ghost
          const k = 0.3;
          lastGhostPosRef.current.x += (px - lastGhostPosRef.current.x) * k;
          lastGhostPosRef.current.z += (pz - lastGhostPosRef.current.z) * k;
          ghostGroupRef.current.position.set(
            lastGhostPosRef.current.x,
            0.1,
            lastGhostPosRef.current.z
          );
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ghost] Failed to update drag ghost:", err);
        }
      }
    }
  });

  // Compute mat world size using BASE tile size (keeps mat size unchanged even if TILE_SIZE changes)
  const baseGridW = board.size.w * BASE_TILE_SIZE;
  const baseGridH = board.size.h * BASE_TILE_SIZE;
  let matW = baseGridW;
  let matH = baseGridW / MAT_RATIO;
  if (matH < baseGridH) {
    matH = baseGridH;
    matW = baseGridH * MAT_RATIO;
  }

  const cells = useMemo(() => {
    const out: { x: number; y: number; key: string }[] = [];
    for (let y = 0; y < board.size.h; y++) {
      for (let x = 0; x < board.size.w; x++) {
        out.push({ x, y, key: `${x},${y}` });
      }
    }
    return out;
  }, [board.size.w, board.size.h]);

  const offsetX = -((board.size.w - 1) * TILE_SIZE) / 2;
  const offsetY = -((board.size.h - 1) * TILE_SIZE) / 2;

  // Local drag state for moving permanents across tiles
  const [dragging, setDragging] = useState<{
    from: string;
    index: number;
  } | null>(null);
  // Track a world-space ghost position while dragging (legacy state - setter used to clear on drop)
  const [, setGhost] = useState<{ x: number; z: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const [dragAvatar, setDragAvatar] = useState<"p1" | "p2" | null>(null);
  const avatarDragStartRef = useRef<{
    who: "p1" | "p2";
    start: [number, number];
    time: number;
  } | null>(null);
  const selectedAvatar = useGameStore((s) => s.selectedAvatar);
  const selectAvatar = useGameStore((s) => s.selectAvatar);
  const lastDropAt = useRef<number>(0);
  const dragStartRef = useRef<{
    at: string;
    index: number;
    start: [number, number];
    time: number;
  } | null>(null);
  // Map of cellKey:index -> RigidBody to drive during drag
  const bodyMap = useRef<Map<string, BodyApi>>(new Map());
  const draggedBody = useRef<BodyApi | null>(null);
  // Target world position for the currently dragged body (applied after physics step)
  const dragTarget = useRef<{ x: number; z: number; lift: boolean } | null>(
    null
  );
  // Pending snap operations queued to run safely after the physics step
  const pendingSnaps = useRef<
    Map<string, { x: number; z: number; attempts: number }>
  >(new Map());

  // Ghost that follows the cursor while dragging from hand/pile, even over the hand area
  const ghostGroupRef = useRef<Group | null>(null);
  const lastGhostPosRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const raycasterRef = useRef(new Raycaster());
  const { camera, pointer } = useThree();

  function moveDraggedBody(x: number, z: number, lift = true) {
    // Defer actual physics API calls to useAfterPhysicsStep
    dragTarget.current = { x, z, lift };
  }

  // Queue a snap of a body (by id) to an exact world position, applied after the physics step.
  function snapBodyTo(id: string, x: number, z: number) {
    // Allow a few frames of retries to handle remount timing
    pendingSnaps.current.set(id, { x, z, attempts: 8 });
  }

  // Apply queued drag moves and snap operations after each physics step to avoid recursive aliasing
  useAfterPhysicsStep(() => {
    // Apply drag target for the currently dragged body
    const target = dragTarget.current;
    const api = draggedBody.current;
    if (api && target) {
      try {
        api.wakeUp();
        api.setLinvel({ x: 0, y: 0, z: 0 }, true);
        api.setAngvel({ x: 0, y: 0, z: 0 }, true);
        api.setTranslation(
          { x: target.x, y: target.lift ? DRAG_LIFT : 0.25, z: target.z },
          true
        );
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[physics] Failed to move dragged body (afterStep):`,
            error
          );
        }
      } finally {
        // Consume this target so we only apply the latest request
        dragTarget.current = null;
      }
    }

    // Process pending snap requests
    if (pendingSnaps.current.size > 0) {
      const entries = Array.from(pendingSnaps.current.entries());
      for (const [id, job] of entries) {
        const snapApi = bodyMap.current.get(id);
        if (snapApi) {
          try {
            snapApi.wakeUp();
            snapApi.setLinvel({ x: 0, y: 0, z: 0 }, true);
            snapApi.setAngvel({ x: 0, y: 0, z: 0 }, true);
            snapApi.setTranslation({ x: job.x, y: 0.25, z: job.z }, false);
          } catch (error) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                `[physics] Failed to snap body ${id} (afterStep):`,
                error
              );
            }
          } finally {
            pendingSnaps.current.delete(id);
          }
        } else {
          // Retry on the next frame until attempts exhausted
          if (job.attempts > 0) {
            pendingSnaps.current.set(id, {
              x: job.x,
              z: job.z,
              attempts: job.attempts - 1,
            });
          } else {
            pendingSnaps.current.delete(id);
          }
        }
      }
    }
  });

  // Ensure local/global drag state is cleared on hard context loss (not every pointerup)
  useEffect(() => {
    const reset = (reason?: string) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[drag] board reset via ${reason || "unknown"}`);
      }
      // Defer so tile/card pointerup handlers run first
      setTimeout(() => {
        setDragging(null);
        setDragAvatar(null);
        setGhost(null);
        setDragFromHand(false);
        setDragFromPile(null);
        dragStartRef.current = null;
        avatarDragStartRef.current = null;
        draggedBody.current = null;
      }, 0);
    };

    // Only listen to hard-cancel contexts; avoid pointerup/mouseup which fire during normal drags
    const onPointerCancel = () => reset("pointercancel");
    const onBlur = () => reset("blur");
    const onVisibility = () => {
      if (document.visibilityState !== "visible") reset("visibilitychange");
    };
    const onPageHide = () => reset("pagehide");

    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [setDragging, setDragAvatar, setGhost, setDragFromHand, setDragFromPile]);

  function beginHoverPreview(card?: CardRef | null) {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (!card?.slug) return;
    hoverTimer.current = window.setTimeout(() => {
      setPreviewCard(card || null);
    }, 1000);
  }
  function clearHoverPreview() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPreviewCard(null);
  }

  return (
    <group>
      {/* Playmat background */}
      {showPlaymat && (
        <Suspense fallback={null}>
          <Playmat matW={matW} matH={matH} />
        </Suspense>
      )}

      {/* Physics ground collider matching the playmat extents */}
      <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
        {/* Floor: half-sizes [x, y, z]; expand with EDGE_MARGIN; top at y=0 */}
        <CuboidCollider
          args={[
            matW / 2 + EDGE_MARGIN,
            GROUND_HALF_THICK,
            matH / 2 + EDGE_MARGIN,
          ]}
          position={[0, -GROUND_HALF_THICK, 0]}
          friction={1}
          restitution={0}
        />
        {/* Boundary walls around the play area to prevent falling off */}
        {/* Left wall */}
        <CuboidCollider
          args={[WALL_THICK / 2, WALL_HALF_HEIGHT, matH / 2 + EDGE_MARGIN]}
          position={[
            -(matW / 2 + EDGE_MARGIN + WALL_THICK / 2),
            WALL_HALF_HEIGHT,
            0,
          ]}
          friction={1}
          restitution={0}
        />
        {/* Right wall */}
        <CuboidCollider
          args={[WALL_THICK / 2, WALL_HALF_HEIGHT, matH / 2 + EDGE_MARGIN]}
          position={[
            matW / 2 + EDGE_MARGIN + WALL_THICK / 2,
            WALL_HALF_HEIGHT,
            0,
          ]}
          friction={1}
          restitution={0}
        />
        {/* Bottom wall */}
        <CuboidCollider
          args={[matW / 2 + EDGE_MARGIN, WALL_HALF_HEIGHT, WALL_THICK / 2]}
          position={[
            0,
            WALL_HALF_HEIGHT,
            -(matH / 2 + EDGE_MARGIN + WALL_THICK / 2),
          ]}
          friction={1}
          restitution={0}
        />
        {/* Top wall */}
        <CuboidCollider
          args={[matW / 2 + EDGE_MARGIN, WALL_HALF_HEIGHT, WALL_THICK / 2]}
          position={[
            0,
            WALL_HALF_HEIGHT,
            matH / 2 + EDGE_MARGIN + WALL_THICK / 2,
          ]}
          friction={1}
          restitution={0}
        />
      </RigidBody>

      {/* Interactive tiles (keep at y=0 to stay lowest) */}
      <group position={[0, 0, 0]}>
        {" "}
        {/* slight lift to avoid z-fighting */}
        {cells.map(({ x, y, key }) => {
          const pos: [number, number, number] = [
            offsetX + x * TILE_SIZE,
            0,
            offsetY + y * TILE_SIZE,
          ];
          const site = board.sites[key];
          const isHover = false; // hover highlighting disabled
          const base = 0.16;
          const color = `hsl(210 10% ${base * 100}%)`;
          const opacity = 0; // fully transparent tile overlay to avoid distraction
          return (
            <group key={key} position={pos}>
              <mesh
                rotation-x={-Math.PI / 2}
                // hover tracking disabled to reduce interference
                onPointerMove={(e: ThreeEvent<PointerEvent>) => {
                  // Track ghost only for hand/pile drags; still drive bodies for board/avatar drags
                  const world = e.point;
                  if (
                    dragFromHand &&
                    !dragAvatar &&
                    !dragging &&
                    (selected || dragFromPile?.card)
                  ) {
                    setGhost({ x: world.x, z: world.z });
                  }
                  // Drive the currently dragged body's position (permanent or avatar)
                  if ((dragging || dragAvatar) && draggedBody.current) {
                    moveDraggedBody(world.x, world.z, true);
                  }
                }}
                onPointerUp={(e: ThreeEvent<PointerEvent>) => {
                  if (e.button !== 0) return; // only handle left-button releases for drops
                  e.stopPropagation();
                  // Handle drop from hand or moving a dragged permanent
                  if (dragAvatar) {
                    // Keep the avatar where it was dropped (use world drop position) and update pos+offset atomically
                    const wx = e.point.x;
                    const wz = e.point.z;
                    const baseX = pos[0];
                    const baseZ = pos[2];
                    const offX = wx - baseX;
                    const offZ = wz - baseZ;
                    if (draggedBody.current) moveDraggedBody(wx, wz, false);
                    moveAvatarToWithOffset(dragAvatar, x, y, [offX, offZ]);
                    // Snap avatar body to the final drop point on next frame
                    snapBodyTo(`avatar:${dragAvatar}`, wx, wz);
                    // Restore selection on the moved avatar
                    selectAvatar(dragAvatar);
                    // Clear drag refs/state
                    setDragAvatar(null);
                    setDragFromHand(false);
                    setGhost(null);
                    avatarDragStartRef.current = null;
                    lastDropAt.current = Date.now();
                    draggedBody.current = null;
                    return;
                  }
                  if (dragging) {
                    const dropKey = `${x},${y}`;
                    const world = e.point;
                    const dragged = permanents[dragging.from]?.[dragging.index];
                    const draggedId = dragged?.card.cardId;
                    // Compute offsets relative to the rendered slot baseline (row position + zBase)
                    const spacing = TILE_SIZE * 0.28;
                    const marginZ = TILE_SIZE * 0.1;
                    if (dragging.from === dropKey) {
                      const items = permanents[dropKey] || [];
                      const count = items.length;
                      const startX = -((Math.max(count, 1) - 1) * spacing) / 2;
                      const idxBase = dragging.index;
                      const owner =
                        items[idxBase]?.owner ??
                        permanents[dragging.from]?.[dragging.index]?.owner ??
                        1;
                      const zBase =
                        owner === 1
                          ? -TILE_SIZE * 0.5 + marginZ
                          : TILE_SIZE * 0.5 - marginZ;
                      const xPos = startX + idxBase * spacing;
                      const baseX = pos[0] + xPos;
                      const baseZ = pos[2] + zBase;
                      const offX = world.x - baseX;
                      const offZ = world.z - baseZ;
                      if (draggedBody.current)
                        moveDraggedBody(world.x, world.z, false);
                      setPermanentOffset(dropKey, dragging.index, [offX, offZ]);
                      // Ensure body is exactly at the world drop point after render
                      if (draggedId != null) {
                        snapBodyTo(`perm:${draggedId}`, world.x, world.z);
                      }
                    } else {
                      const toItems = permanents[dropKey] || [];
                      const newIndex = toItems.length; // push to end
                      const newCount = toItems.length + 1;
                      const startX =
                        -((Math.max(newCount, 1) - 1) * spacing) / 2;
                      const owner =
                        permanents[dragging.from]?.[dragging.index]?.owner ?? 1;
                      const zBase =
                        owner === 1
                          ? -TILE_SIZE * 0.5 + marginZ
                          : TILE_SIZE * 0.5 - marginZ;
                      const xPos = startX + newIndex * spacing;
                      const baseX = pos[0] + xPos;
                      const baseZ = pos[2] + zBase;
                      const offX = world.x - baseX;
                      const offZ = world.z - baseZ;
                      if (draggedBody.current)
                        moveDraggedBody(world.x, world.z, false);
                      moveSelectedPermanentToWithOffset(x, y, [offX, offZ]);
                      // Snap to the moved body's stable id
                      if (draggedId != null) {
                        snapBodyTo(`perm:${draggedId}`, world.x, world.z);
                      }
                    }
                    setDragging(null);
                    setDragFromHand(false);
                    setGhost(null);
                    dragStartRef.current = null;
                    lastDropAt.current = Date.now();
                    draggedBody.current = null;
                    return;
                  }
                  if (dragFromHand) {
                    const dropKey = `${x},${y}`;
                    const wx = e.point.x;
                    const wz = e.point.z;
                    const toItems = permanents[dropKey] || [];
                    const newIndex = toItems.length; // will be appended
                    const newCount = toItems.length + 1;
                    const spacing = TILE_SIZE * 0.28;
                    const startX = -((Math.max(newCount, 1) - 1) * spacing) / 2;
                    const marginZ = TILE_SIZE * 0.1;
                    const owner = currentPlayer as 1 | 2;
                    const zBase =
                      owner === 1
                        ? -TILE_SIZE * 0.5 + marginZ
                        : TILE_SIZE * 0.5 - marginZ;
                    const xPos = startX + newIndex * spacing;
                    const baseX = pos[0] + xPos;
                    const baseZ = pos[2] + zBase;
                    const offX = wx - baseX;
                    const offZ = wz - baseZ;

                    if (selected) {
                      playSelectedTo(x, y);
                      setDragFromHand(false); // Explicitly clear drag state after hand drop
                      setGhost(null); // Clear ghost
                      const type = (
                        (selected.card?.type || "") as string
                      ).toLowerCase();
                      const isToken = type.includes("token");
                      const tokenDef = isToken
                        ? TOKEN_BY_NAME[(selected.card?.name || "").toLowerCase()]
                        : undefined;
                      const tokenSiteReplace = !!tokenDef?.siteReplacement;
                      if (!type.includes("site") && !tokenSiteReplace) {
                        setPermanentOffset(dropKey, newIndex, [offX, offZ]);
                      }
                    } else if (dragFromPile?.card) {
                      const type = (
                        (dragFromPile.card.type || "") as string
                      ).toLowerCase();
                      playFromPileTo(x, y);
                      setDragFromPile(null);
                      setDragFromHand(false); // Also clear dragFromHand for pile drops
                      setGhost(null); // Also clear ghost immediately
                      const isToken = type.includes("token");
                      const tokenDef = isToken
                        ? TOKEN_BY_NAME[(dragFromPile.card.name || "").toLowerCase()]
                        : undefined;
                      const tokenSiteReplace = !!tokenDef?.siteReplacement;
                      if (!type.includes("site") && !tokenSiteReplace) {
                        setPermanentOffset(dropKey, newIndex, [offX, offZ]);
                      }
                    }
                    setDragFromHand(false);
                    setGhost(null);
                    lastDropAt.current = Date.now();
                  }
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  // Prevent duplicate actions when a drop just occurred on this tile
                  if (Date.now() - lastDropAt.current < 200) return;
                  // Treat tile left-click as background click: deselect and close menus
                  useGameStore.getState().clearSelection();
                  useGameStore.getState().closeContextMenu();
                  clearHoverPreview();
                }}
              >
                <planeGeometry args={[TILE_SIZE * 0.96, TILE_SIZE * 0.96]} />
                <meshStandardMaterial
                  color={color}
                  transparent
                  opacity={opacity}
                  metalness={0}
                  roughness={1}
                />
              </mesh>

              {site && (
                <group>
                  {(() => {
                    const rotZ =
                      -Math.PI / 2 +
                      (site.owner === 1 ? 0 : Math.PI) +
                      (site.tapped ? Math.PI / 2 : 0);
                    const isSel =
                      !!contextMenu &&
                      contextMenu.target.kind === "site" &&
                      contextMenu.target.x === x &&
                      contextMenu.target.y === y;
                    return (
                      <>
                        {isSel && !isHandVisible && (
                          <CardGlow
                            width={CARD_SHORT + 0.3}
                            height={CARD_LONG + 0.4}
                            rotationZ={rotZ}
                            elevation={0}
                            color={site.owner === 1 ? "#93c5fd" : "#fca5a5"}
                            renderOrder={500}
                          />
                        )}
                        {site.card?.slug ? (
                          <group
                            onPointerOver={(e) => {
                              e.stopPropagation();
                              beginHoverPreview(site.card!);
                            }}
                          >
                            <CardPlane
                              slug={site.card.slug!}
                              width={CARD_SHORT}
                              height={CARD_LONG}
                              depthWrite={false}
                              rotationZ={rotZ}
                              elevation={0.001}
                              onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                                e.stopPropagation();
                                e.nativeEvent.preventDefault();
                                openContextMenu(
                                  { kind: "site", x, y },
                                  { x: e.clientX, y: e.clientY }
                                );
                              }}
                            />
                          </group>
                        ) : (
                          <mesh
                            rotation-x={-Math.PI / 2}
                            rotation-z={rotZ}
                            position={[0, 0.001, 0]}
                            castShadow
                            onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                              e.stopPropagation();
                              e.nativeEvent.preventDefault();
                              openContextMenu(
                                { kind: "site", x, y },
                                { x: e.clientX, y: e.clientY }
                              );
                            }}
                          >
                            <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
                            <meshStandardMaterial
                              color={site.owner === 1 ? "#2f6fed" : "#d94e4e"}
                              depthWrite={false}
                            />
                          </mesh>
                        )}
                      </>
                    );
                  })()}
                </group>
              )}

              {/* Permanents on this tile */}
              {(() => {
                const items = permanents[key] || [];
                const marginZ = TILE_SIZE * 0.1; // distance from bottom/top edge
                return items.map((p, idx) => {
                  const owner = p.owner; // 1 or 2
                  const isSel =
                    selectedPermanent &&
                    selectedPermanent.at === key &&
                    selectedPermanent.index === idx;
                  const isToken = (p.card.type || "")
                    .toLowerCase()
                    .includes("token");
                  const tokenDef = isToken
                    ? TOKEN_BY_NAME[(p.card.name || "").toLowerCase()]
                    : undefined;
                  const tokenSiteReplace = !!tokenDef?.siteReplacement;
                  // Sites sit at tile center; rubble tokens (site replacements) should also snap to center
                  const zBase = tokenSiteReplace
                    ? 0
                    : owner === 1
                      ? -TILE_SIZE * 0.5 + marginZ
                      : TILE_SIZE * 0.5 - marginZ;
                  // Orientation: bottom toward owner; Rubble (site-like token) adds -90° like sites
                  const rotZ =
                    (owner === 1 ? 0 : Math.PI) +
                    (tokenSiteReplace ? -Math.PI / 2 : 0) +
                    (p.tapped ? Math.PI / 2 : 0) +
                    (p.tilt || 0);
                  const offX = p.offset?.[0] ?? 0;
                  const offZ = p.offset?.[1] ?? 0;
                  return (
                    <RigidBody
                      key={`perm-${key}-${idx}`}
                      ref={(api) => {
                        const id = `perm:${key}:${idx}`;
                        try {
                          if (api) {
                            bodyMap.current.set(id, api as unknown as BodyApi);
                          } else {
                            bodyMap.current.delete(id);
                          }
                        } catch (error) {
                          console.warn(
                            `[physics] Failed to update body map for ${id}:`,
                            error
                          );
                        }
                      }}
                      type={tokenSiteReplace ? "fixed" : "dynamic"}
                      ccd
                      colliders={false}
                      position={[0 + offX, 0.25, zBase + offZ]}
                      linearDamping={2}
                      angularDamping={2}
                      canSleep={false}
                      enabledRotations={[false, true, false]}
                    >
                      {/* Thin box collider to let cards stack physically */}
                      <CuboidCollider
                        args={[CARD_SHORT / 2, CARD_THICK / 2, CARD_LONG / 2]}
                        friction={0.9}
                        restitution={0}
                      />
                      <group
                        onPointerDown={(e) => {
                          // Only start potential drag on left-click
                          if (dragFromHand || dragFromPile) return; // let tiles handle drops during hand/pile drags
                          if (tokenSiteReplace) {
                            // Rubble behaves like a site for movement: no drag start
                            e.stopPropagation();
                            useGameStore.getState().selectPermanent(key, idx);
                            clearHoverPreview();
                            return;
                          }
                          if (e.button === 0) {
                            e.stopPropagation();
                            useGameStore.getState().selectPermanent(key, idx);
                            // wait for small hold + movement before starting drag
                            dragStartRef.current = {
                              at: key,
                              index: idx,
                              start: [e.point.x, e.point.z],
                              time: Date.now(),
                            };
                            clearHoverPreview();
                          }
                        }}
                        onPointerOver={(e) => {
                          if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                          e.stopPropagation();
                          beginHoverPreview(p.card);
                        }}
                        onPointerOut={(e) => {
                          if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                          e.stopPropagation();
                          clearHoverPreview();
                          // cancel pending drag if pointer leaves before threshold
                          if (
                            dragStartRef.current &&
                            dragStartRef.current.at === key &&
                            dragStartRef.current.index === idx
                          ) {
                            dragStartRef.current = null;
                          }
                        }}
                        onPointerMove={(e) => {
                          if (dragFromHand || dragFromPile) return; // let tiles drive ghost/body during hand/pile drags
                          if (tokenSiteReplace) return; // no drag for Rubble
                          e.stopPropagation();
                          // Start dragging once hold + threshold exceeded
                          if (
                            !dragging &&
                            dragStartRef.current &&
                            dragStartRef.current.at === key &&
                            dragStartRef.current.index === idx
                          ) {
                            const [sx, sz] = dragStartRef.current.start;
                            const dx = e.point.x - sx;
                            const dz = e.point.z - sz;
                            const dist = Math.hypot(dx, dz);
                            const heldFor =
                              Date.now() - dragStartRef.current.time;
                            if (
                              heldFor >= DRAG_HOLD_MS &&
                              dist > DRAG_THRESHOLD
                            ) {
                              setDragging({ from: key, index: idx });
                              setDragFromHand(true);
                              setGhost(null);
                              // No ghost for board permanent drags; just move the body
                              draggedBody.current =
                                bodyMap.current.get(`perm:${key}:${idx}`) ||
                                null;
                              if (draggedBody.current) {
                                moveDraggedBody(e.point.x, e.point.z, true);
                              }
                            }
                          } else if (
                            dragging &&
                            dragging.from === key &&
                            dragging.index === idx &&
                            draggedBody.current
                          ) {
                            // While dragging and pointer is over the card, continue driving it (no ghost)
                            moveDraggedBody(e.point.x, e.point.z, true);
                          }
                        }}
                        onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                          e.stopPropagation();
                          e.nativeEvent.preventDefault();
                          useGameStore.getState().selectPermanent(key, idx);
                          useGameStore
                            .getState()
                            .openContextMenu(
                              { kind: "permanent", at: key, index: idx },
                              { x: e.clientX, y: e.clientY }
                            );
                        }}
                        onPointerUp={(e) => {
                          if (e.button !== 0) return; // ignore non-left button releases
                          if (dragFromHand || dragFromPile) return; // let tile handle drop from hand/pile
                          if (tokenSiteReplace) { e.stopPropagation(); return; }
                          e.stopPropagation();
                          if (
                            dragging &&
                            dragging.from === key &&
                            dragging.index === idx
                          ) {
                            // Compute nearest tile from world position and preserve exact world drop
                            const wx = e.point.x;
                            const wz = e.point.z;
                            const draggedId = p.card.cardId;
                            let tx = Math.round((wx - offsetX) / TILE_SIZE);
                            let ty = Math.round((wz - offsetY) / TILE_SIZE);
                            tx = Math.max(0, Math.min(board.size.w - 1, tx));
                            ty = Math.max(0, Math.min(board.size.h - 1, ty));
                            const dropKey = `${tx},${ty}`;
                            const tileX = offsetX + tx * TILE_SIZE;
                            const tileZ = offsetY + ty * TILE_SIZE;
                            const spacing = TILE_SIZE * 0.28;
                            const marginZ = TILE_SIZE * 0.1;
                            const owner = permanents[key]?.[idx]?.owner ?? 1;
                            const zBase =
                              owner === 1
                                ? -TILE_SIZE * 0.5 + marginZ
                                : TILE_SIZE * 0.5 - marginZ;
                            if (dragging.from === dropKey) {
                              // Staying on same tile: compute baseline using current count and index
                              const baseX = tileX;
                              const baseZ = tileZ + zBase;
                              const offX = wx - baseX;
                              const offZ = wz - baseZ;
                              if (draggedBody.current)
                                moveDraggedBody(wx, wz, false);
                              setPermanentOffset(dropKey, idx, [offX, offZ]);
                              snapBodyTo(`perm:${dropKey}:${idx}`, wx, wz);
                            } else {
                              // Moving to another tile: baseline uses new count and new index at end
                              const toItems = permanents[dropKey] || [];
                              const newIndex = toItems.length;
                              const baseX = tileX;
                              const baseZ = tileZ + zBase;
                              const offX = wx - baseX;
                              const offZ = wz - baseZ;
                              if (draggedBody.current)
                                moveDraggedBody(wx, wz, false);
                              moveSelectedPermanentToWithOffset(tx, ty, [
                                offX,
                                offZ,
                              ]);
                              snapBodyTo(`perm:${dropKey}:${newIndex}`, wx, wz);
                            }
                            setDragging(null);
                            setDragFromHand(false);
                            setGhost(null);
                            dragStartRef.current = null;
                            lastDropAt.current = Date.now();
                            draggedBody.current = null;
                          }
                        }}
                      >
                        {/* Selection glow */}
                        {isSel && !isHandVisible && (
                          <CardGlow
                            width={
                              (tokenDef && tokenDef.size === "small"
                                ? CARD_SHORT * 0.5
                                : CARD_SHORT) + 0.3
                            }
                            height={
                              (tokenDef && tokenDef.size === "small"
                                ? CARD_LONG * 0.5
                                : CARD_LONG) + 0.4
                            }
                            rotationZ={rotZ}
                            elevation={0}
                            color={owner === 1 ? "#93c5fd" : "#fca5a5"}
                            renderOrder={500}
                          />
                        )}
                        <group
                          onClick={(e) => {
                            if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                            e.stopPropagation();
                            // If dragging this item, ignore clicks
                            if (
                              dragging &&
                              dragging.from === key &&
                              dragging.index === idx
                            )
                              return;
                            // Left-click selects only; context menu via right-click
                            useGameStore.getState().selectPermanent(key, idx);
                          }}
                          onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                            e.stopPropagation();
                            e.nativeEvent.preventDefault();
                            // Ensure the permanent is selected before opening the menu
                            useGameStore.getState().selectPermanent(key, idx);
                            useGameStore
                              .getState()
                              .openContextMenu(
                                { kind: "permanent", at: key, index: idx },
                                { x: e.clientX, y: e.clientY }
                              );
                          }}
                        >
                          {isToken ? (
                            (() => {
                              const w =
                                tokenDef && tokenDef.size === "small"
                                  ? CARD_SHORT * 0.5
                                  : CARD_SHORT;
                              const h =
                                tokenDef && tokenDef.size === "small"
                                  ? CARD_LONG * 0.5
                                  : CARD_LONG;
                              const texUrl = tokenDef
                                ? tokenTextureUrl(tokenDef)
                                : undefined;
                              return (
                                <CardPlane
                                  slug={""}
                                  textureUrl={texUrl}
                                  forceTextureUrl
                                  width={w}
                                  height={h}
                                  rotationZ={rotZ}
                                  elevation={0.02}
                                />
                              );
                            })()
                          ) : p.card.slug ? (
                            <>
                              {((selectedPermanent?.at === key &&
                                selectedPermanent?.index === idx) ||
                                (dragging?.from === key &&
                                  dragging?.index === idx)) &&
                                !isHandVisible && (
                                  <CardGlow
                                    width={CARD_SHORT}
                                    height={CARD_LONG}
                                    rotationZ={rotZ}
                                    elevation={0.001}
                                    color="#60a5fa"
                                    renderOrder={600}
                                  />
                                )}
                              <CardPlane
                                slug={p.card.slug!}
                                width={CARD_SHORT}
                                height={CARD_LONG}
                                rotationZ={rotZ}
                              />
                            </>
                          ) : (
                            <mesh rotation-x={-Math.PI / 2} rotation-z={rotZ}>
                              <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
                              <meshStandardMaterial
                                color={owner === 1 ? "#3b82f6" : "#ef4444"}
                                transparent
                                opacity={0}
                              />
                            </mesh>
                          )}
                        </group>
                      </group>
                    </RigidBody>
                  );
                });
              })()}

              {showGrid && isHover && (
                <Text
                  position={[0, 0.02, 0]}
                  rotation-x={-Math.PI / 2}
                  fontSize={0.18}
                  color={isHover ? "#fff" : "#cbd5e1"}
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.005}
                  outlineColor="#000"
                >
                  {(board.size.h - 1 - y) * board.size.w + x + 1}
                </Text>
              )}
            </group>
          );
        })}
      </group>

      {/* Avatars */}
      {(["p1", "p2"] as const).map((who) => {
        const a = avatars[who];
        if (!a.pos) return null;
        const [ax, ay] = a.pos;
        const baseX = offsetX + ax * TILE_SIZE;
        const baseZ = offsetY + ay * TILE_SIZE;
        const offX = a.offset?.[0] ?? 0;
        const offZ = a.offset?.[1] ?? 0;
        const worldX = baseX + offX;
        const worldZ = baseZ + offZ;
        // Avatars should behave like board permanents: render exactly at world drop position
        return (
          <group key={`avatar-${who}`}>
            {(() => {
              const rotZ =
                (who === "p1" ? 0 : Math.PI) + (a.tapped ? Math.PI / 2 : 0);
              const isSel =
                selectedAvatar === who ||
                (!!contextMenu &&
                  contextMenu.target.kind === "avatar" &&
                  contextMenu.target.who === who) ||
                dragAvatar === who;
              return (
                <>
                  <RigidBody
                    key={`avatar-${who}`}
                    ref={(api) => {
                      const id = `avatar:${who}`;
                      try {
                        if (api) {
                          bodyMap.current.set(id, api as unknown as BodyApi);
                        } else {
                          bodyMap.current.delete(id);
                        }
                      } catch (error) {
                        console.warn(
                          `[physics] Failed to update body map for ${id}:`,
                          error
                        );
                      }
                    }}
                    type="dynamic"
                    ccd
                    colliders={false}
                    position={[worldX, 0.25, worldZ]}
                    linearDamping={2}
                    angularDamping={2}
                    canSleep={false}
                    enabledRotations={[false, true, false]}
                  >
                    <CuboidCollider
                      args={[CARD_SHORT / 2, CARD_THICK / 2, CARD_LONG / 2]}
                      friction={0.9}
                      restitution={0}
                    />
                    {isSel && !isHandVisible && (
                      <CardGlow
                        width={CARD_SHORT + 0.3}
                        height={CARD_LONG + 0.4}
                        rotationZ={rotZ}
                        elevation={0}
                        color={who === "p1" ? "#93c5fd" : "#fca5a5"}
                        renderOrder={500}
                      />
                    )}
                    <group
                      onPointerDown={(e) => {
                        // Only start potential drag on left-click
                        if (dragFromHand || dragFromPile) return; // let tiles handle drops during hand/pile drags
                        if (e.button === 0) {
                          e.stopPropagation();
                          selectAvatar(who);
                          // wait for small hold + movement before starting drag
                          avatarDragStartRef.current = {
                            who,
                            start: [e.point.x, e.point.z],
                            time: Date.now(),
                          };
                          clearHoverPreview();
                        }
                      }}
                      onPointerOver={(e) => {
                        if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                        e.stopPropagation();
                        beginHoverPreview(a.card);
                      }}
                      onPointerOut={(e) => {
                        if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                        e.stopPropagation();
                        clearHoverPreview();
                        // cancel pending drag if pointer leaves before threshold
                        if (
                          avatarDragStartRef.current &&
                          avatarDragStartRef.current.who === who
                        ) {
                          avatarDragStartRef.current = null;
                        }
                      }}
                      onPointerMove={(e) => {
                        if (dragFromHand || dragFromPile) return; // let tiles drive ghost/body during hand/pile drags
                        e.stopPropagation();
                        // Start dragging once hold + threshold exceeded
                        if (
                          !dragAvatar &&
                          avatarDragStartRef.current &&
                          avatarDragStartRef.current.who === who
                        ) {
                          const [sx, sz] = avatarDragStartRef.current.start;
                          const dx = e.point.x - sx;
                          const dz = e.point.z - sz;
                          const dist = Math.hypot(dx, dz);
                          const heldFor =
                            Date.now() - avatarDragStartRef.current.time;
                          if (
                            heldFor >= DRAG_HOLD_MS &&
                            dist > DRAG_THRESHOLD
                          ) {
                            setDragAvatar(who);
                            setDragFromHand(true);
                            setGhost(null);
                            // No ghost for avatar drags; just move the body
                            draggedBody.current =
                              bodyMap.current.get(`avatar:${who}`) || null;
                            if (draggedBody.current) {
                              moveDraggedBody(e.point.x, e.point.z, true);
                            }
                          }
                        } else if (dragAvatar === who && draggedBody.current) {
                          // While dragging and pointer is over the avatar, continue driving it (no ghost)
                          moveDraggedBody(e.point.x, e.point.z, true);
                        }
                      }}
                      onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                        e.stopPropagation();
                        e.nativeEvent.preventDefault();
                        selectAvatar(who);
                        openContextMenu(
                          { kind: "avatar", who },
                          { x: e.clientX, y: e.clientY }
                        );
                      }}
                      onPointerUp={(e) => {
                        if (e.button !== 0) return; // ignore non-left button releases
                        if (dragFromHand || dragFromPile) return; // let tile handle drop from hand/pile
                        e.stopPropagation();
                        if (dragAvatar === who) {
                          // Compute nearest tile from world position and preserve exact world drop
                          const wx = e.point.x;
                          const wz = e.point.z;
                          let tx = Math.round((wx - offsetX) / TILE_SIZE);
                          let ty = Math.round((wz - offsetY) / TILE_SIZE);
                          tx = Math.max(0, Math.min(board.size.w - 1, tx));
                          ty = Math.max(0, Math.min(board.size.h - 1, ty));
                          const tileX = offsetX + tx * TILE_SIZE;
                          const tileZ = offsetY + ty * TILE_SIZE;
                          const offX = wx - tileX;
                          const offZ = wz - tileZ;
                          if (draggedBody.current)
                            moveDraggedBody(wx, wz, false);
                          moveAvatarToWithOffset(who, tx, ty, [offX, offZ]);
                          // Snap avatar body to the final drop point on next frame
                          snapBodyTo(`avatar:${who}`, wx, wz);
                          setDragAvatar(null);
                          setDragFromHand(false);
                          setGhost(null);
                          avatarDragStartRef.current = null;
                          lastDropAt.current = Date.now();
                          draggedBody.current = null;
                        }
                      }}
                    >
                      <group
                        onClick={(e) => {
                          if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                          e.stopPropagation();
                          // If dragging this avatar, ignore clicks
                          if (dragAvatar === who) return;
                          // Left-click selects only; context menu via right-click
                          selectAvatar(who);
                        }}
                        onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                          e.stopPropagation();
                          e.nativeEvent.preventDefault();
                          // Ensure the avatar is selected before opening the menu
                          selectAvatar(who);
                          openContextMenu(
                            { kind: "avatar", who },
                            { x: e.clientX, y: e.clientY }
                          );
                        }}
                      >
                        {a.card?.slug ? (
                          <>
                            {(selectedAvatar === who || dragAvatar === who) &&
                              !isHandVisible && (
                                <CardGlow
                                  width={CARD_SHORT}
                                  height={CARD_LONG}
                                  rotationZ={rotZ}
                                  elevation={0.001}
                                  color="#60a5fa"
                                  renderOrder={600}
                                />
                              )}
                            <CardPlane
                              slug={a.card.slug!}
                              width={CARD_SHORT}
                              height={CARD_LONG}
                              rotationZ={rotZ}
                            />
                          </>
                        ) : (
                          <mesh rotation-x={-Math.PI / 2} rotation-z={rotZ}>
                            <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
                            <meshStandardMaterial
                              color={who === "p1" ? "#60a5fa" : "#f87171"}
                              transparent
                              opacity={0}
                            />
                          </mesh>
                        )}
                      </group>
                    </group>
                  </RigidBody>
                </>
              );
            })()}
          </group>
        );
      })}

      {/* Drag ghost while dragging from hand or pile only (never during avatar or board drags) */}
      {dragFromHand &&
        !dragAvatar &&
        !dragging &&
        (selected || dragFromPile?.card) && (
          <group
            ref={ghostGroupRef}
            position={[
              lastGhostPosRef.current.x,
              0.1,
              lastGhostPosRef.current.z,
            ]}
          >
            {(() => {
              if (selected) {
                const isSite = (selected.card.type || "")
                  .toLowerCase()
                  .includes("site");
                const ownerRot = currentPlayer === 1 ? 0 : Math.PI;
                const rotZ = isSite ? -Math.PI / 2 + ownerRot : ownerRot;
                if (!selected.card.slug) return null;
                return (
                  <CardPlane
                    slug={selected.card.slug}
                    width={CARD_SHORT}
                    height={CARD_LONG}
                    rotationZ={rotZ}
                    interactive={false}
                  />
                );
              }
              if (dragFromPile?.card) {
                const c = dragFromPile.card;
                const isSite = (c.type || "").toLowerCase().includes("site");
                const ownerRot = currentPlayer === 1 ? 0 : Math.PI;
                const rotZ = isSite ? -Math.PI / 2 + ownerRot : ownerRot;
                if (!c.slug) return null;
                // Adjust ghost size for tokens
                let w = CARD_SHORT;
                let h = CARD_LONG;
                if ((c.slug || "").startsWith("token:")) {
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const { TOKEN_BY_KEY } = require("@/lib/game/tokens");
                    const key = c.slug.split(":")[1]?.toLowerCase();
                    const def = key ? TOKEN_BY_KEY[key] : undefined;
                    if (def && def.size === "small") {
                      w = CARD_SHORT * 0.5;
                      h = CARD_LONG * 0.5;
                    }
                    const ownerRotToken = dragFromPile?.who === 'p1' ? 0 : Math.PI;
                    const rotZToken = ownerRotToken + (def && def.siteReplacement ? -Math.PI / 2 : 0);
                    return (
                      <CardPlane
                        slug={c.slug}
                        width={w}
                        height={h}
                        rotationZ={rotZToken}
                        interactive={false}
                      />
                    );
                  } catch {}
                }
                return (
                  <CardPlane
                    slug={c.slug}
                    width={w}
                    height={h}
                    rotationZ={rotZ}
                    interactive={false}
                  />
                );
              }
              return null;
            })()}
          </group>
        )}
    </group>
  );
}
