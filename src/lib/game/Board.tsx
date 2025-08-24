"use client";

import { useMemo, useRef, useState } from "react";
import { Text, useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { SRGBColorSpace } from "three";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store";
import { RigidBody, CuboidCollider } from "@react-three/rapier";

// Base tile size (playmat uses this); visual grid previously reduced by 15%.
// Increase grid size by ~10% while keeping playmat size unchanged.
const BASE_TILE_SIZE = 1.5;
const TILE_SIZE = BASE_TILE_SIZE * 0.85 * 1.1; // world units per cell (slightly increased)
// Playmat native pixel size and aspect ratio (must be preserved)
const MAT_PIXEL_W = 2556;
const MAT_PIXEL_H = 1663;
const MAT_RATIO = MAT_PIXEL_W / MAT_PIXEL_H; // ~1.5385

// Standard card size (keep long edge consistent across spells and sites)
const CARD_LONG = TILE_SIZE * 0.55; // long edge
const CARD_SHORT = CARD_LONG * 0.75; // 3:4 ratio
// Thin physical thickness for card collisions
const CARD_THICK = Math.max(0.012, CARD_LONG * 0.02);
// Height to lift a card while dragging so it clears neighbors and the ground
const DRAG_LIFT = CARD_THICK * 2 + 0.15;
// Ground collider half-thickness; keep robust to avoid tunneling through a too-thin floor
const GROUND_HALF_THICK = 0.05;
const EDGE_MARGIN = TILE_SIZE * 0.5; // expand ground beyond mat a little
const WALL_THICK = 0.06;
const WALL_HALF_HEIGHT = 0.6; // 1.2 units tall walls

// Minimal shape of the rapier rigid body API we need (keep local to avoid import typing issues)
type BodyApi = {
  wakeUp: () => void;
  setLinvel: (v: { x: number; y: number; z: number }, wake: boolean) => void;
  setAngvel: (v: { x: number; y: number; z: number }, wake: boolean) => void;
  setTranslation: (v: { x: number; y: number; z: number }, wake: boolean) => void;
};

function CardPlane({
  slug,
  width,
  height,
  rotationZ = 0,
  depthWrite = true,
}: {
  slug: string;
  width: number;
  height: number;
  rotationZ?: number;
  depthWrite?: boolean;
}) {
  const tex = useTexture(`/api/images/${slug}`);
  tex.colorSpace = SRGBColorSpace;
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, 0.001, 0]}
      castShadow
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} toneMapped={false} depthWrite={depthWrite} />
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
  // tap toggles are handled via context menu in PlayPage
  const moveAvatarTo = useGameStore((s) => s.moveAvatarTo);
  const openContextMenu = useGameStore((s) => s.openContextMenu);
  const selected = useGameStore((s) => s.selectedCard);
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const hoverCell = useGameStore((s) => s.hoverCell);
  const setHoverCell = useGameStore((s) => s.setHoverCell);
  const clearHoverCell = useGameStore((s) => s.clearHoverCell);
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const dragFromPile = useGameStore((s) => s.dragFromPile);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const playFromPileTo = useGameStore((s) => s.playFromPileTo);
  const tex = useTexture("/api/assets/playmat.jpg");
  tex.colorSpace = SRGBColorSpace;
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
  const lastDropAt = useRef<number>(0);
  const dragStartRef = useRef<{
    at: string;
    index: number;
    start: [number, number];
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
    api.setTranslation({ x, y: lift ? DRAG_LIFT : 0.2, z }, true);
  }

  // Require some pointer travel before starting a drag (avoid click-move)
  const DRAG_THRESHOLD = TILE_SIZE * 0.08;

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
        <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[matW, matH]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
      )}

      {/* Physics ground collider matching the playmat extents */}
      <RigidBody type="fixed" colliders={false} position={[0, 0, 0]}>
        {/* Floor: half-sizes [x, y, z]; expand with EDGE_MARGIN; top at y=0 */}
        <CuboidCollider
          args={[matW / 2 + EDGE_MARGIN, GROUND_HALF_THICK, matH / 2 + EDGE_MARGIN]}
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

      {/* Interactive tiles */}
      <group position={[0, 0.01, 0]}>
        {" "}
        {/* slight lift to avoid z-fighting */}
        {cells.map(({ x, y, key }) => {
          const pos: [number, number, number] = [
            offsetX + x * TILE_SIZE,
            0,
            offsetY + y * TILE_SIZE,
          ];
          const site = board.sites[key];
          const isHover = !!(
            hoverCell &&
            hoverCell[0] === x &&
            hoverCell[1] === y
          );
          const base = 0.16;
          const color = isHover
            ? `hsl(210 40% ${base * 100 + 10}%)`
            : `hsl(210 10% ${base * 100}%)`;
          const opacity = isHover ? 0.25 : 0.08;
          return (
            <group key={key} position={pos}>
              <mesh
                rotation-x={-Math.PI / 2}
                onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                  e.stopPropagation();
                  setHoverCell(x, y);
                }}
                onPointerOut={(e: ThreeEvent<PointerEvent>) => {
                  e.stopPropagation();
                  if (hoverCell && hoverCell[0] === x && hoverCell[1] === y)
                    clearHoverCell();
                  setGhost(null);
                }}
                onPointerMove={(e: ThreeEvent<PointerEvent>) => {
                  // Track ghost while dragging from hand, board permanent, or avatar
                  if (dragFromHand || dragging || dragAvatar) {
                    const world = e.point;
                    setGhost({ x: world.x, z: world.z });
                    // If dragging a permanent, drive its rigid body with the pointer
                    if (dragging && draggedBody.current) {
                      moveDraggedBody(world.x, world.z, true);
                    }
                  }
                }}
                onPointerUp={(e: ThreeEvent<PointerEvent>) => {
                  e.stopPropagation();
                  // Handle drop from hand or moving a dragged permanent
                  if (dragAvatar) {
                    moveAvatarTo(dragAvatar, x, y);
                    setDragAvatar(null);
                    setDragFromHand(false);
                    setGhost(null);
                    lastDropAt.current = Date.now();
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
                      const owner = (items[idxBase]?.owner) ?? (permanents[dragging.from]?.[dragging.index]?.owner) ?? 1;
                      const zBase = owner === 1 ? -TILE_SIZE * 0.5 + marginZ : TILE_SIZE * 0.5 - marginZ;
                      const xPos = startX + idxBase * spacing;
                      const baseX = pos[0] + xPos;
                      const baseZ = pos[2] + zBase;
                      const offX = world.x - baseX;
                      const offZ = world.z - baseZ;
                      if (draggedBody.current) moveDraggedBody(world.x, world.z, false);
                      setPermanentOffset(dropKey, dragging.index, [offX, offZ]);
                    } else {
                      const toItems = permanents[dropKey] || [];
                      const newIndex = toItems.length; // push to end
                      const newCount = toItems.length + 1;
                      const startX = -((Math.max(newCount, 1) - 1) * spacing) / 2;
                      const owner = (permanents[dragging.from]?.[dragging.index]?.owner) ?? 1;
                      const zBase = owner === 1 ? -TILE_SIZE * 0.5 + marginZ : TILE_SIZE * 0.5 - marginZ;
                      const xPos = startX + newIndex * spacing;
                      const baseX = pos[0] + xPos;
                      const baseZ = pos[2] + zBase;
                      const offX = world.x - baseX;
                      const offZ = world.z - baseZ;
                      if (draggedBody.current) moveDraggedBody(world.x, world.z, false);
                      moveSelectedPermanentToWithOffset(x, y, [offX, offZ]);
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
                    const zBase = owner === 1 ? -TILE_SIZE * 0.5 + marginZ : TILE_SIZE * 0.5 - marginZ;
                    const xPos = startX + newIndex * spacing;
                    const baseX = pos[0] + xPos;
                    const baseZ = pos[2] + zBase;
                    const offX = wx - baseX;
                    const offZ = wz - baseZ;

                    if (selected) {
                      playSelectedTo(x, y);
                      const type = ((selected.card?.type || "") as string).toLowerCase();
                      if (!type.includes("site")) {
                        setPermanentOffset(dropKey, newIndex, [offX, offZ]);
                      }
                    } else if (dragFromPile?.card) {
                      const type = ((dragFromPile.card.type || "") as string).toLowerCase();
                      playFromPileTo(x, y);
                      setDragFromPile(null);
                      if (!type.includes("site")) {
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
                  // No default left-click action on tiles
                }}
                onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                  e.stopPropagation();
                  e.nativeEvent.preventDefault();
                  if (site) {
                    openContextMenu(
                      { kind: "site", x, y },
                      { x: e.clientX, y: e.clientY }
                    );
                  }
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
                  {site.card?.slug ? (
                    <group
                      onPointerOver={(e) => {
                        e.stopPropagation();
                        beginHoverPreview(site.card!);
                      }}
                      // Left-click no longer opens context menu on sites
                      onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                        e.stopPropagation();
                        e.nativeEvent.preventDefault();
                        openContextMenu(
                          { kind: "site", x, y },
                          { x: e.clientX, y: e.clientY }
                        );
                      }}
                    >
                      <CardPlane
                        slug={site.card.slug!}
                        width={CARD_SHORT}
                        height={CARD_LONG}
                        depthWrite={false}
                        rotationZ={
                          -Math.PI / 2 +
                          (site.owner === 1 ? 0 : Math.PI) +
                          (site.tapped ? Math.PI / 2 : 0)
                        }
                      />
                    </group>
                  ) : (
                    <mesh
                      position={[0, 0.01, 0]}
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
                      <cylinderGeometry
                        args={[TILE_SIZE * 0.22, TILE_SIZE * 0.22, 0.02, 24]}
                      />
                      <meshStandardMaterial
                        color={site.owner === 1 ? "#2f6fed" : "#d94e4e"}
                        depthWrite={false}
                      />
                    </mesh>
                  )}
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
                        if (api) bodyMap.current.set(id, api as unknown as BodyApi);
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
                        e.stopPropagation();
                        useGameStore.getState().selectPermanent(key, idx);
                        // wait for movement beyond threshold before starting drag
                        dragStartRef.current = {
                          at: key,
                          index: idx,
                          start: [e.point.x, e.point.z],
                        };
                        clearHoverPreview();
                      }}
                      onPointerOver={(e) => {
                        e.stopPropagation();
                        beginHoverPreview(p.card);
                      }}
                      onPointerOut={(e) => {
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
                        e.stopPropagation();
                        // Start dragging once threshold exceeded
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
                          if (dist > DRAG_THRESHOLD) {
                            setDragging({ from: key, index: idx });
                            setDragFromHand(true);
                            setGhost({ x: e.point.x, z: e.point.z });
                            // Grab the rigid body for this permanent and lift/move it immediately
                            draggedBody.current = bodyMap.current.get(`${key}:${idx}`) || null;
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
                          // While dragging and pointer is over the card, continue driving it
                          setGhost({ x: e.point.x, z: e.point.z });
                          moveDraggedBody(e.point.x, e.point.z, true);
                        }
                      }}
                      onPointerUp={(e) => {
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
                          const owner = (permanents[key]?.[idx]?.owner) ?? 1;
                          const zBase = owner === 1 ? -TILE_SIZE * 0.5 + marginZ : TILE_SIZE * 0.5 - marginZ;
                          if (dragging.from === dropKey) {
                            // Staying on same tile: compute baseline using current count and index
                            const items = permanents[dropKey] || [];
                            const count = items.length;
                            const startX = -((Math.max(count, 1) - 1) * spacing) / 2;
                            const xPos = startX + idx * spacing;
                            const baseX = tileX + xPos;
                            const baseZ = tileZ + zBase;
                            const offX = wx - baseX;
                            const offZ = wz - baseZ;
                            if (draggedBody.current) moveDraggedBody(wx, wz, false);
                            setPermanentOffset(dropKey, idx, [offX, offZ]);
                          } else {
                            // Moving to another tile: baseline uses new count and new index at end
                            const toItems = permanents[dropKey] || [];
                            const newIndex = toItems.length;
                            const newCount = toItems.length + 1;
                            const startX = -((Math.max(newCount, 1) - 1) * spacing) / 2;
                            const xPos = startX + newIndex * spacing;
                            const baseX = tileX + xPos;
                            const baseZ = tileZ + zBase;
                            const offX = wx - baseX;
                            const offZ = wz - baseZ;
                            if (draggedBody.current) moveDraggedBody(wx, wz, false);
                            moveSelectedPermanentToWithOffset(tx, ty, [offX, offZ]);
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
                        {/* Selection ring */}
                        {isSel && (
                          <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
                            <ringGeometry
                              args={[TILE_SIZE * 0.2, TILE_SIZE * 0.22, 24]}
                            />
                            <meshBasicMaterial
                              color={owner === 1 ? "#93c5fd" : "#fca5a5"}
                            />
                          </mesh>
                        )}
                        <group
                        onClick={(e) => {
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
                          <CardPlane
                            slug={p.card.slug!}
                            width={CARD_SHORT}
                            height={CARD_LONG}
                            rotationZ={rotZ}
                          />
                        ) : (
                          <mesh rotation-x={-Math.PI / 2} rotation-z={rotZ}>
                            <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
                            <meshStandardMaterial
                              color={owner === 1 ? "#3b82f6" : "#ef4444"}
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
        const wx = offsetX + ax * TILE_SIZE;
        const wy = offsetY + ay * TILE_SIZE;
        return (
          <group
            key={`avatar-${who}`}
            position={[wx, 0.05, wy]}
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragAvatar(who);
              useGameStore.getState().setDragFromHand(true);
              clearHoverPreview();
            }}
            // Left-click no longer opens context menu on avatars
            onContextMenu={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation();
              e.nativeEvent.preventDefault();
              openContextMenu(
                { kind: "avatar", who },
                { x: e.clientX, y: e.clientY }
              );
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (a.card) beginHoverPreview(a.card);
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              clearHoverPreview();
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              // If released on avatar itself, just end drag without moving
              if (dragAvatar) {
                setDragAvatar(null);
                setDragFromHand(false);
              }
            }}
          >
            <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 0]}>
              <ringGeometry args={[TILE_SIZE * 0.18, TILE_SIZE * 0.2, 24]} />
              <meshBasicMaterial color={who === "p1" ? "#60a5fa" : "#f87171"} />
            </mesh>
            {(() => {
              const rotZ =
                (who === "p2" ? Math.PI : 0) + (a.tapped ? Math.PI / 2 : 0);
              return a.card?.slug ? (
                <CardPlane
                  slug={a.card.slug!}
                  width={CARD_SHORT}
                  height={CARD_LONG}
                  rotationZ={rotZ}
                />
              ) : (
                <mesh rotation-x={-Math.PI / 2} rotation-z={rotZ}>
                  <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
                  <meshStandardMaterial
                    color={who === "p1" ? "#60a5fa" : "#f87171"}
                  />
                </mesh>
              );
            })()}
          </group>
        );
      })}

      {/* Drag ghost while dragging */}
      {ghost && (
        <group position={[ghost.x, 0.1, ghost.z]}>
          {(() => {
            if (dragging && selectedPermanent) {
              const sel = selectedPermanent;
              const item = permanents[sel.at]?.[sel.index];
              if (!item) return null;
              const owner = item.owner;
              const rotZ =
                (owner === 1 ? 0 : Math.PI) +
                (item.tapped ? Math.PI / 2 : 0) +
                (item.tilt || 0);
              return item.card.slug ? (
                <CardPlane
                  slug={item.card.slug!}
                  width={CARD_SHORT}
                  height={CARD_LONG}
                  rotationZ={rotZ}
                />
              ) : (
                <mesh rotation-x={-Math.PI / 2} rotation-z={rotZ}>
                  <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
                  <meshStandardMaterial
                    color={owner === 1 ? "#3b82f6" : "#ef4444"}
                    transparent
                    opacity={0.6}
                  />
                </mesh>
              );
            }
            // Avatar drag ghost (unified behavior with permanents)
            if (dragAvatar) {
              const who = dragAvatar;
              const a = avatars[who];
              if (!a) return null;
              const rotZ =
                (who === "p2" ? Math.PI : 0) + (a.tapped ? Math.PI / 2 : 0);
              return a.card?.slug ? (
                <CardPlane
                  slug={a.card.slug!}
                  width={CARD_SHORT}
                  height={CARD_LONG}
                  rotationZ={rotZ}
                />
              ) : (
                <mesh rotation-x={-Math.PI / 2} rotation-z={rotZ}>
                  <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
                  <meshStandardMaterial
                    color={who === "p1" ? "#60a5fa" : "#f87171"}
                  />
                </mesh>
              );
            }
            if (dragFromHand && selected) {
              const isSite = (selected.card.type || "")
                .toLowerCase()
                .includes("site");
              const rotZ = isSite ? Math.PI / 2 : 0;
              const w = isSite ? CARD_LONG : CARD_SHORT;
              const h = isSite ? CARD_SHORT : CARD_LONG;
              if (!selected.card.slug) return null;
              return (
                <CardPlane
                  slug={selected.card.slug}
                  width={w}
                  height={h}
                  rotationZ={rotZ}
                />
              );
            }
            if (dragFromHand && dragFromPile?.card) {
              const c = dragFromPile.card;
              const isSite = (c.type || "").toLowerCase().includes("site");
              const rotZ = isSite ? Math.PI / 2 : 0;
              const w = isSite ? CARD_LONG : CARD_SHORT;
              const h = isSite ? CARD_SHORT : CARD_LONG;
              if (!c.slug) return null;
              return (
                <CardPlane
                  slug={c.slug}
                  width={w}
                  height={h}
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
