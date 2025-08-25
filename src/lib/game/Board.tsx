"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Text, useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import {
  SRGBColorSpace,
  type Object3D,
  type Raycaster,
  type Intersection,
} from "three";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PermanentItem } from "@/lib/game/store";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import CardPlane from "@/lib/game/components/CardPlane";
import CardGlow from "@/lib/game/components/CardGlow";
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

export default function Board() {
  const board = useGameStore((s) => s.board);
  const showGrid = useGameStore((s) => s.showGridOverlay);
  const showPlaymat = useGameStore((s) => s.showPlaymat);
  const playSelectedTo = useGameStore((s) => s.playSelectedTo);
  const moveSelectedPermanentToWithOffset = useGameStore(
    (s) => s.moveSelectedPermanentToWithOffset
  );
  const setPermanentOffset = useGameStore((s) => s.setPermanentOffset);
  // tap toggles are handled via context menu in PlayPage
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
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const dragFromPile = useGameStore((s) => s.dragFromPile);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const playFromPileTo = useGameStore((s) => s.playFromPileTo);
  const tex = useTexture("/api/assets/playmat.jpg");
  tex.colorSpace = SRGBColorSpace;

  // Helper function to update offsets for existing cards when a new card is added
  const updateExistingCardOffsets = (
    tileKey: string,
    existingItems: PermanentItem[],
    newTotalCount: number
  ) => {
    const spacing = TILE_SIZE * 0.28;

    // Calculate old baseline (before new card was added)
    const oldCount = existingItems.length;
    const oldStartX = -((Math.max(oldCount, 1) - 1) * spacing) / 2;

    // Calculate new baseline (with new card added)
    const newStartX = -((Math.max(newTotalCount, 1) - 1) * spacing) / 2;

    // Update offsets for each existing card
    existingItems.forEach((item, idx) => {
      if (item && item.offset) {
        const oldBaselineX = oldStartX + idx * spacing;
        const newBaselineX = newStartX + idx * spacing;
        const baselineDiff = newBaselineX - oldBaselineX;

        // Adjust the offset to maintain the same world position
        const newOffsetX = item.offset[0] - baselineDiff;
        setPermanentOffset(tileKey, idx, [newOffsetX, item.offset[1]]);
      }
    });
  };

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
  // Track a world-space ghost position while dragging (from board or hand)
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null);
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

  function moveDraggedBody(x: number, z: number, lift = true) {
    const api = draggedBody.current;
    if (!api) return;
    api.wakeUp();
    api.setLinvel({ x: 0, y: 0, z: 0 }, true);
    api.setAngvel({ x: 0, y: 0, z: 0 }, true);
    api.setTranslation({ x, y: lift ? DRAG_LIFT : 0.25, z }, true);
  }

  // Snap a body (by id) to an exact world position on the next frame.
  function snapBodyTo(id: string, x: number, z: number) {
    requestAnimationFrame(() => {
      const api = bodyMap.current.get(id);
      if (!api) return;
      api.wakeUp();
      api.setLinvel({ x: 0, y: 0, z: 0 }, true);
      api.setAngvel({ x: 0, y: 0, z: 0 }, true);
      api.setTranslation({ x, y: 0.25, z }, false);
    });
  }

  // Ensure local drag state is cleared even if mouse is released outside the canvas
  useEffect(() => {
    const onUp = () => {
      setDragging(null);
      setDragAvatar(null);
      setGhost(null);
      setDragFromHand(false);
      setDragFromPile(null);
      dragStartRef.current = null;
      avatarDragStartRef.current = null;
      draggedBody.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
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
        <mesh
          rotation-x={-Math.PI / 2}
          position={[0, 0, 0]}
          receiveShadow
          raycast={noopRaycast}
        >
          <planeGeometry args={[matW, matH]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
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
                      snapBodyTo(
                        `${dropKey}:${dragging.index}`,
                        world.x,
                        world.z
                      );
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
                      // Snap to the new body's id at its new index
                      snapBodyTo(`${dropKey}:${newIndex}`, world.x, world.z);
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
                      if (!type.includes("site")) {
                        setPermanentOffset(dropKey, newIndex, [offX, offZ]);
                        // Update offsets for existing cards to maintain their world positions
                        updateExistingCardOffsets(dropKey, toItems, newCount);
                      }
                    } else if (dragFromPile?.card) {
                      const type = (
                        (dragFromPile.card.type || "") as string
                      ).toLowerCase();
                      playFromPileTo(x, y);
                      setDragFromPile(null);
                      setDragFromHand(false); // Also clear dragFromHand for pile drops
                      setGhost(null); // Also clear ghost immediately
                      if (!type.includes("site")) {
                        setPermanentOffset(dropKey, newIndex, [offX, offZ]);
                        // Update offsets for existing cards to maintain their world positions
                        updateExistingCardOffsets(dropKey, toItems, newCount);
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
                        {isSel && (
                          <CardGlow
                            width={CARD_SHORT + 0.3}
                            height={CARD_LONG + 0.4}
                            rotationZ={rotZ}
                            elevation={0}
                            color={site.owner === 1 ? "#93c5fd" : "#fca5a5"}
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
                const count = items.length;
                const spacing = TILE_SIZE * 0.28;
                const startX = -((Math.max(count, 1) - 1) * spacing) / 2;
                const marginZ = TILE_SIZE * 0.1; // distance from bottom/top edge
                return items.map((p, idx) => {
                  const owner = p.owner; // 1 or 2
                  const zBase =
                    owner === 1
                      ? -TILE_SIZE * 0.5 + marginZ
                      : TILE_SIZE * 0.5 - marginZ;
                  const xPos = startX + idx * spacing;
                  const isSel =
                    selectedPermanent &&
                    selectedPermanent.at === key &&
                    selectedPermanent.index === idx;
                  const rotZ =
                    (owner === 1 ? 0 : Math.PI) +
                    (p.tapped ? Math.PI / 2 : 0) +
                    (p.tilt || 0); // orient bottom to owner + tap + slight random tilt
                  const offX = p.offset?.[0] ?? 0;
                  const offZ = p.offset?.[1] ?? 0;
                  return (
                    <RigidBody
                      key={`perm-${idx}`}
                      ref={(api) => {
                        const id = `${key}:${idx}`;
                        if (api)
                          bodyMap.current.set(id, api as unknown as BodyApi);
                        else bodyMap.current.delete(id);
                      }}
                      type="dynamic"
                      ccd
                      colliders={false}
                      position={[xPos + offX, 0.25, zBase + offZ]}
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
                                bodyMap.current.get(`${key}:${idx}`) || null;
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
                          e.stopPropagation();
                          if (
                            dragging &&
                            dragging.from === key &&
                            dragging.index === idx
                          ) {
                            // Compute nearest tile from world position and preserve exact world drop
                            const wx = e.point.x;
                            const wz = e.point.z;
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
                              const items = permanents[dropKey] || [];
                              const count = items.length;
                              const startX =
                                -((Math.max(count, 1) - 1) * spacing) / 2;
                              const xPos = startX + idx * spacing;
                              const baseX = tileX + xPos;
                              const baseZ = tileZ + zBase;
                              const offX = wx - baseX;
                              const offZ = wz - baseZ;
                              if (draggedBody.current)
                                moveDraggedBody(wx, wz, false);
                              setPermanentOffset(dropKey, idx, [offX, offZ]);
                              snapBodyTo(`${dropKey}:${idx}`, wx, wz);
                            } else {
                              // Moving to another tile: baseline uses new count and new index at end
                              const toItems = permanents[dropKey] || [];
                              const newIndex = toItems.length;
                              const newCount = toItems.length + 1;
                              const startX =
                                -((Math.max(newCount, 1) - 1) * spacing) / 2;
                              const xPos = startX + newIndex * spacing;
                              const baseX = tileX + xPos;
                              const baseZ = tileZ + zBase;
                              const offX = wx - baseX;
                              const offZ = wz - baseZ;
                              if (draggedBody.current)
                                moveDraggedBody(wx, wz, false);
                              moveSelectedPermanentToWithOffset(tx, ty, [
                                offX,
                                offZ,
                              ]);
                              snapBodyTo(`${dropKey}:${newIndex}`, wx, wz);
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
                        {isSel && (
                          <CardGlow
                            width={CARD_SHORT + 0.3}
                            height={CARD_LONG + 0.4}
                            rotationZ={rotZ}
                            elevation={0}
                            color={owner === 1 ? "#93c5fd" : "#fca5a5"}
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
                          {p.card.slug ? (
                            <>
                              {((selectedPermanent?.at === key &&
                                selectedPermanent?.index === idx) ||
                                (dragging?.from === key &&
                                  dragging?.index === idx)) && (
                                <CardGlow
                                  width={CARD_SHORT}
                                  height={CARD_LONG}
                                  rotationZ={rotZ}
                                  elevation={0.001}
                                  color="#60a5fa"
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
                    key={`avatar-${who}-${ax}-${ay}-${offX}-${offZ}`}
                    ref={(api) => {
                      const id = `avatar:${who}`;
                      if (api)
                        bodyMap.current.set(id, api as unknown as BodyApi);
                      else bodyMap.current.delete(id);
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
                    {isSel && (
                      <CardGlow
                        width={CARD_SHORT + 0.3}
                        height={CARD_LONG + 0.4}
                        rotationZ={rotZ}
                        elevation={0}
                        color={who === "p1" ? "#93c5fd" : "#fca5a5"}
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
                            {(selectedAvatar === who || dragAvatar === who) && (
                              <CardGlow
                                width={CARD_SHORT}
                                height={CARD_LONG}
                                rotationZ={rotZ}
                                elevation={0.001}
                                color="#60a5fa"
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
      {ghost &&
        dragFromHand &&
        !dragAvatar &&
        !dragging &&
        (selected || dragFromPile?.card) && (
          <group position={[ghost.x, 0.1, ghost.z]}>
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
                  />
                );
              }
              if (dragFromPile?.card) {
                const c = dragFromPile.card;
                const isSite = (c.type || "").toLowerCase().includes("site");
                const ownerRot = currentPlayer === 1 ? 0 : Math.PI;
                const rotZ = isSite ? -Math.PI / 2 + ownerRot : ownerRot;
                if (!c.slug) return null;
                return (
                  <CardPlane
                    slug={c.slug}
                    width={CARD_SHORT}
                    height={CARD_LONG}
                    rotationZ={rotZ}
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
