"use client";

import { useMemo, useRef, useState } from "react";
import { Text, useTexture } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { SRGBColorSpace } from "three";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store";

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

function CardPlane({
  slug,
  width,
  height,
  rotationZ = 0,
}: {
  slug: string;
  width: number;
  height: number;
  rotationZ?: number;
}) {
  const tex = useTexture(`/api/images/${slug}`);
  tex.colorSpace = SRGBColorSpace;
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, 0.06, 0]}
      castShadow
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

export default function Board() {
  const board = useGameStore((s) => s.board);
  const sitePlacementMode = useGameStore((s) => s.sitePlacementMode);
  const showGrid = useGameStore((s) => s.showGridOverlay);
  const showPlaymat = useGameStore((s) => s.showPlaymat);
  const placeSite = useGameStore((s) => s.placeSite);
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
          const base = sitePlacementMode ? 0.22 : 0.16;
          const color = isHover
            ? `hsl(210 40% ${base * 100 + 10}%)`
            : `hsl(210 10% ${base * 100}%)`;
          const opacity = sitePlacementMode || isHover ? 0.25 : 0.08;
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
                    // Compute local offset within tile from center
                    const world = e.point; // r3f ThreeEvent has .point
                    const offX = world.x - pos[0];
                    const offZ = world.z - pos[2];
                    if (dragging.from === dropKey) {
                      // Nudge in place
                      setPermanentOffset(dropKey, dragging.index, [offX, offZ]);
                    } else {
                      // Move to another tile with offset
                      moveSelectedPermanentToWithOffset(x, y, [offX, offZ]);
                    }
                    setDragging(null);
                    setDragFromHand(false);
                    setGhost(null);
                    dragStartRef.current = null;
                    lastDropAt.current = Date.now();
                    return;
                  }
                  if (dragFromHand) {
                    if (selected) {
                      playSelectedTo(x, y);
                    } else if (dragFromPile?.card) {
                      playFromPileTo(x, y);
                      setDragFromPile(null);
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
                  if (sitePlacementMode) {
                    placeSite(x, y);
                  } else if (site) {
                    openContextMenu(
                      { kind: "site", x, y },
                      { x: e.clientX, y: e.clientY }
                    );
                  }
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
                      onClick={(e) => {
                        e.stopPropagation();
                        openContextMenu(
                          { kind: "site", x, y },
                          { x: e.clientX, y: e.clientY }
                        );
                      }}
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
                        rotationZ={
                          -Math.PI / 2 +
                          (site.owner === 1 ? 0 : Math.PI) +
                          (site.tapped ? Math.PI / 2 : 0)
                        }
                      />
                    </group>
                  ) : (
                    <mesh
                      position={[0, 0.07, 0]}
                      castShadow
                      rotation-z={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        openContextMenu(
                          { kind: "site", x, y },
                          { x: e.clientX, y: e.clientY }
                        );
                      }}
                    >
                      <cylinderGeometry
                        args={[TILE_SIZE * 0.22, TILE_SIZE * 0.22, 0.25, 16]}
                      />
                      <meshStandardMaterial
                        color={site.owner === 1 ? "#2f6fed" : "#d94e4e"}
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
                    <group
                      key={`perm-${idx}`}
                      position={[xPos + offX, 0.08 + idx * 0.001, zBase + offZ]}
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
                          }
                        }
                      }}
                    >
                      {/* Selection ring */}
                      {isSel && (
                        <mesh rotation-x={-Math.PI / 2} position={[0, 0.12, 0]}>
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
                          useGameStore.getState().selectPermanent(key, idx);
                          useGameStore
                            .getState()
                            .openContextMenu(
                              { kind: "permanent", at: key, index: idx },
                              { x: e.clientX, y: e.clientY }
                            );
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
            position={[wx, 0.12, wy]}
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragAvatar(who);
              useGameStore.getState().setDragFromHand(true);
              clearHoverPreview();
            }}
            onClick={(e) => {
              e.stopPropagation();
              openContextMenu(
                { kind: "avatar", who },
                { x: e.clientX, y: e.clientY }
              );
            }}
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
            <mesh rotation-x={-Math.PI / 2} position={[0, -0.06, 0]}>
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
        <group position={[ghost.x, 0.12, ghost.z]}>
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
