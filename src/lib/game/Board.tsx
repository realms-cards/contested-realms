"use client";

import { useMemo, useRef, useState } from "react";
import { Text, useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { SRGBColorSpace, Color, AdditiveBlending } from "three";
import type { Object3D, Raycaster, Intersection } from "three";
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

function CardPlane({
  slug,
  width,
  height,
  rotationZ = 0,
  depthWrite = true,
  interactive = true,
  onContextMenu,
  elevation = 0.001,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  onClick,
}: {
  slug: string;
  width: number;
  height: number;
  rotationZ?: number;
  depthWrite?: boolean;
  interactive?: boolean;
  onContextMenu?: (e: ThreeEvent<PointerEvent>) => void;
  elevation?: number;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const tex = useTexture(`/api/images/${slug}`);
  tex.colorSpace = SRGBColorSpace;
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation, 0]}
      raycast={interactive ? undefined : noopRaycast}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      castShadow
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} toneMapped={false} depthWrite={depthWrite} />
    </mesh>
  );
}

function CardGlow({
  width,
  height,
  rotationZ = 0,
  elevation = 0,
  color = "#93c5fd",
}: {
  width: number;
  height: number;
  rotationZ?: number;
  elevation?: number;
  color?: string;
}) {
  const aspect = width / height;
  const uniforms = useMemo(
    () => ({
      u_color: { value: new Color(color) },
      u_aspect: { value: aspect },
      u_border: { value: 0.12 },
      u_softness: { value: 0.18 },
      u_radius: { value: 0.08 },
    }),
    [aspect, color]
  );
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation, 0]}
      raycast={noopRaycast}
    >
      {/* Slightly larger than the card so the glow sits outside the edges */}
      <planeGeometry args={[width * 1.06, height * 1.06]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          precision highp float;
          varying vec2 vUv;
          uniform vec3 u_color;
          uniform float u_aspect;
          uniform float u_border;
          uniform float u_softness;
          uniform float u_radius;

          float sdRoundedBox(in vec2 p, in vec2 b, in float r) {
            vec2 q = abs(p) - b + vec2(r);
            return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
          }

          void main() {
            // Normalize coords to [-0.5, 0.5] with aspect correction on X
            vec2 p = (vUv - 0.5) * 2.0;
            p.x *= u_aspect;

            // Card half-extents in this space
            vec2 b = vec2(u_aspect, 1.0) * 0.5;

            // Distance to the rounded-rect card silhouette (negative inside)
            float d = sdRoundedBox(p, b, u_radius);

            // Outside-only ring from the silhouette outward
            float border = 1.0 - smoothstep(u_border, u_border + u_softness, d);
            float outside = smoothstep(0.0, 0.0 + u_softness, d);
            float a = outside * border;

            // Soft glow falloff beyond the hard border
            float glow = 1.0 - smoothstep(0.0, u_border + u_softness, d);
            a = max(a, glow * 0.5);

            if (a <= 0.001) discard;
            gl_FragColor = vec4(u_color, a);
          }
        `}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        blending={AdditiveBlending}
        toneMapped={false}
      />
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
  const [selectedAvatar, setSelectedAvatar] = useState<"p1" | "p2" | null>(
    null
  );
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
    api.setTranslation({ x, y: lift ? DRAG_LIFT : 0.2, z }, true);
  }

  // Require some pointer travel before starting a drag (avoid click-move)
  const DRAG_THRESHOLD = TILE_SIZE * 0.08;
  // Require a tiny hold before allowing drag start (prevents right-click wiggle drags)
  const DRAG_HOLD_MS = 80;

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
                  // Track ghost while dragging from hand, board permanent, or avatar
                  if (dragFromHand || dragging || dragAvatar) {
                    const world = e.point;
                    setGhost({ x: world.x, z: world.z });
                    // Drive the currently dragged body's position (permanent or avatar)
                    if ((dragging || dragAvatar) && draggedBody.current) {
                      moveDraggedBody(world.x, world.z, true);
                    }
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
                    // Restore selection on the moved avatar
                    setSelectedAvatar(dragAvatar);
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
                      const type = (
                        (selected.card?.type || "") as string
                      ).toLowerCase();
                      if (!type.includes("site")) {
                        setPermanentOffset(dropKey, newIndex, [offX, offZ]);
                      }
                    } else if (dragFromPile?.card) {
                      const type = (
                        (dragFromPile.card.type || "") as string
                      ).toLowerCase();
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
                  // Treat tile left-click as background click: deselect and close menus
                  useGameStore.getState().clearSelection();
                  useGameStore.getState().closeContextMenu();
                  setSelectedAvatar(null);
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
                              setGhost({ x: e.point.x, z: e.point.z });
                              // Grab the rigid body for this permanent and lift/move it immediately
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
                            // While dragging and pointer is over the card, continue driving it
                            setGhost({ x: e.point.x, z: e.point.z });
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
                        // Left-click: arm potential drag; selection handled on pointer up if no drag starts
                        if (e.button !== 0) return;
                        if (dragFromHand || dragFromPile) return; // let tiles handle drops
                        e.stopPropagation();
                        avatarDragStartRef.current = {
                          who,
                          start: [e.point.x, e.point.z],
                          time: Date.now(),
                        };
                        clearHoverPreview();
                      }}
                      onPointerOver={(e) => {
                        if (dragFromHand || dragFromPile) return; // allow bubbling to tiles
                        e.stopPropagation();
                        beginHoverPreview(a.card);
                      }}
                      onPointerOut={(e) => {
                        if (dragFromHand || dragFromPile) return; // allow bubbling to tiles
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
                        if (dragFromHand || dragFromPile) return; // allow tiles to drive ghost/body
                        e.stopPropagation();
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
                            setGhost({ x: e.point.x, z: e.point.z });
                            setSelectedAvatar(null);
                            // hook the avatar rigid body so tiles/group moves drive it
                            draggedBody.current =
                              bodyMap.current.get(`avatar:${who}`) || null;
                            if (draggedBody.current) {
                              moveDraggedBody(e.point.x, e.point.z, true);
                            }
                          }
                        } else if (dragAvatar === who && draggedBody.current) {
                          setGhost({ x: e.point.x, z: e.point.z });
                          moveDraggedBody(e.point.x, e.point.z, true);
                        }
                      }}
                      onPointerUp={(e) => {
                        if (e.button !== 0) return;
                        // If releasing a card dragged from hand/pile over the avatar, let the tile handle the drop
                        if (dragFromHand || dragFromPile) return;
                        e.stopPropagation();
                        // If released on avatar itself while dragging, just end drag without moving
                        if (dragAvatar === who) {
                          setDragAvatar(null);
                          setDragFromHand(false);
                          avatarDragStartRef.current = null;
                          draggedBody.current = null;
                          return;
                        }
                        // Treat as selection if a press occurred but drag didn't start
                        if (
                          avatarDragStartRef.current &&
                          avatarDragStartRef.current.who === who
                        ) {
                          setSelectedAvatar(who);
                          avatarDragStartRef.current = null;
                        }
                      }}
                      onClick={(e) => {
                        if (dragFromHand || dragFromPile) return; // allow bubbling to tiles
                        e.stopPropagation();
                        if (dragAvatar === who) return;
                        setSelectedAvatar(who);
                      }}
                    >
                      {a.card?.slug ? (
                        <CardPlane
                          slug={a.card.slug!}
                          width={CARD_SHORT}
                          height={CARD_LONG}
                          rotationZ={rotZ}
                          interactive={
                            !dragFromHand && !dragFromPile && !dragAvatar
                          }
                          onClick={(e: ThreeEvent<PointerEvent>) => {
                            if (dragFromHand || dragFromPile) return;
                            e.stopPropagation();
                            if (dragAvatar === who) return;
                            setSelectedAvatar(who);
                          }}
                          onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                            e.stopPropagation();
                            e.nativeEvent.preventDefault();
                            openContextMenu(
                              { kind: "avatar", who },
                              { x: e.clientX, y: e.clientY }
                            );
                          }}
                        />
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
                  </RigidBody>
                </>
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
                (who === "p1" ? 0 : Math.PI) + (a.tapped ? Math.PI / 2 : 0);
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
              const ownerRot = currentPlayer === 1 ? 0 : Math.PI;
              const rotZ = isSite ? -Math.PI / 2 + ownerRot : 0;
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
            if (dragFromHand && dragFromPile?.card) {
              const c = dragFromPile.card;
              const isSite = (c.type || "").toLowerCase().includes("site");
              const ownerRot = currentPlayer === 1 ? 0 : Math.PI;
              const rotZ = isSite ? -Math.PI / 2 + ownerRot : 0;
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
