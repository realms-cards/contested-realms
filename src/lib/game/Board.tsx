"use client";

import { Text, useTexture, Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  RigidBody,
  CuboidCollider,
  useAfterPhysicsStep,
} from "@react-three/rapier";
import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import {
  SRGBColorSpace,
  Raycaster,
  type Object3D,
  type Intersection,
  type Group,
} from "three";
import { NumberBadge, type Digit } from "@/components/game/manacost";
import { useSound } from "@/lib/contexts/SoundContext";
import BoardPingLayer from "@/lib/game/components/BoardPingLayer";
import CardGlow from "@/lib/game/components/CardGlow";
import CardPlane from "@/lib/game/components/CardPlane";
import TokenAttachmentDialog from "@/lib/game/components/TokenAttachmentDialog";
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
import { useGameStore } from "@/lib/game/store";
import type { CardRef, BoardState, PlayerKey } from "@/lib/game/store";
import { TOKEN_BY_NAME, tokenTextureUrl } from "@/lib/game/tokens";

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

// Component prop interfaces
interface PlaymatProps {
  matW: number;
  matH: number;
}

interface BoardProps {
  noRaycast?: boolean;
}

const DEFAULT_BOARD_STATE: BoardState = { size: { w: 5, h: 4 }, sites: {} };

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
function Playmat({ matW, matH }: PlaymatProps) {
  // Try to load playmat with fallback handling for different formats
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

export default function Board({ noRaycast = false }: BoardProps = {}) {
  const boardState = useGameStore((s) => s.board);
  const board = boardState ?? DEFAULT_BOARD_STATE;
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
  const permanentPositions = useGameStore((s) => s.permanentPositions);
  const avatars = useGameStore((s) => s.avatars);
  const lastAvatarCardsRef = useRef<Record<PlayerKey, CardRef | null>>({
    p1: null,
    p2: null,
  });
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
  const setLastPointerWorldPos = useGameStore((s) => s.setLastPointerWorldPos);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const playFromPileTo = useGameStore((s) => s.playFromPileTo);
  // Counter actions
  const incrementPermanentCounter = useGameStore(
    (s) => s.incrementPermanentCounter
  );
  const decrementPermanentCounter = useGameStore(
    (s) => s.decrementPermanentCounter
  );
  const { playCardPlay } = useSound();

  // Token attachment dialog state
  const [attachmentDialog, setAttachmentDialog] = useState<{
    token: CardRef;
    targetPermanent: { at: string; index: number; card: CardRef };
    dropCoords: { x: number; y: number };
    fromPile?: boolean;
    pileInfo?: { who: "p1" | "p2"; from: "tokens" | "spellbook" | "atlas" | "graveyard"; card: CardRef } | null;
  } | null>(null);

  // Helper to check if a token can be attached
  const isAttachableToken = (tokenName: string): boolean => {
    const name = tokenName.toLowerCase();
    return name === "lance" || name === "stealth" || name === "disabled";
  };

  // Site edge placement functions
  const calculateEdgePosition = useGameStore((s) => s.calculateEdgePosition);
  const playerPositions = useGameStore((s) => s.playerPositions);
  const setPlayerPosition = useGameStore((s) => s.setPlayerPosition);

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

  // Set up player positions based on board layout
  useEffect(() => {
    // Set player positions relative to board - P1 at bottom, P2 at top
    const boardCenterX = (board.size.w - 1) / 2;
    const boardCenterY = (board.size.h - 1) / 2;

    // P1 is positioned "south" of the board center (higher Y in game coords)
    const p1Position = {
      playerId: 1,
      position: { x: boardCenterX, z: boardCenterY + 3 }, // 3 tiles south of center
    };

    // P2 is positioned "north" of the board center (lower Y in game coords)
    const p2Position = {
      playerId: 2,
      position: { x: boardCenterX, z: boardCenterY - 3 }, // 3 tiles north of center
    };

    // Only set player positions if the function is available (not in draft mode)
    if (setPlayerPosition) {
      setPlayerPosition("p1", p1Position);
      setPlayerPosition("p2", p2Position);
    }
  }, [board.size.w, board.size.h, setPlayerPosition]);

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
    }, 10);
  }
  function clearHoverPreview() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPreviewCard(null);
  }

  const handlePointerMove = useCallback(
    (x: number, z: number) => {
      setLastPointerWorldPos({ x, z });
    },
    [setLastPointerWorldPos]
  );

  const handlePointerOut = useCallback(() => {
    setLastPointerWorldPos(null);
  }, [setLastPointerWorldPos]);

  const emitBoardPing = useCallback((position: { x: number; z: number } | null) => {
    if (!position) return;
    const x = Number(position.x);
    const z = Number(position.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const { actorKey, pushBoardPing, transport } = useGameStore.getState();
    const id = `ping_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
    const ts = Date.now();
    try {
      pushBoardPing({
        id,
        position: { x, z },
        playerId: null,
        playerKey: actorKey,
        ts,
      });
    } catch {}
    try {
      transport?.sendMessage?.({
        type: "boardPing",
        id,
        position: { x, z },
        playerKey: actorKey,
        ts,
      });
    } catch {}
  }, []);

  // Global keyboard: Space to ping at current pointer position
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.key === " " || e.key === "Spacebar") {
        const ae = (document.activeElement as HTMLElement | null) || null;
        if (
          ae &&
          (ae.tagName === "INPUT" ||
            ae.tagName === "TEXTAREA" ||
            ae.isContentEditable)
        ) {
          return; // don't interfere with typing
        }
        e.preventDefault();
        const { lastPointerWorldPos } = useGameStore.getState();
        emitBoardPing(lastPointerWorldPos);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [emitBoardPing]);

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
                raycast={noRaycast ? () => [] : undefined}
                onPointerMove={(e: ThreeEvent<PointerEvent>) => {
                  // Track ghost only for hand/pile drags; still drive bodies for board/avatar drags
                  const world = e.point;
                  handlePointerMove(world.x, world.z);
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
                onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
                  if (dragFromHand || dragFromPile || dragging || dragAvatar) return;
                  e.stopPropagation();
                  emitBoardPing({ x: e.point.x, z: e.point.z });
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
                    // Debug logging for drag cancellation
                    if (process.env.NODE_ENV !== "production") {
                      console.debug(`[Board] Drag from hand - mouseInHandZone:`, mouseInHandZone);
                    }

                    // Check if mouse is in hand zone - if so, cancel the drag instead of playing
                    if (mouseInHandZone) {
                      // Cancel the drag - return card to hand
                      console.debug(`[Board] Cancelling drag - returning to hand`);
                      setDragFromHand(false);
                      setGhost(null);
                      lastDropAt.current = Date.now();
                      return; // Don't play the card, just cancel the drag
                    }

                    const dropKey = `${x},${y}`;
                    const wx = e.point.x;
                    const wz = e.point.z;
                    const toItems = permanents[dropKey] || [];

                    // Check if we're dropping an attachable token on a tile with permanents
                    const draggedCard = selected || dragFromPile?.card;
                    if (draggedCard) {
                      const cardType = ((draggedCard as CardRef).type || "").toLowerCase();
                      const isToken = cardType.includes("token");
                      const tokenName = ((draggedCard as CardRef).name || "").toLowerCase();

                      // Check if this is an attachable token and there are non-token permanents at this location
                      if (isToken && isAttachableToken(tokenName)) {
                        const nonTokenPermanents = toItems.filter(
                          item => !((item.card.type || "").toLowerCase().includes("token"))
                        );

                        if (nonTokenPermanents.length > 0) {
                          // Find the closest permanent based on world position
                          const spacing = TILE_SIZE * 0.28;
                          const marginZ = TILE_SIZE * 0.1;
                          let closestPermanent = null;
                          let closestDistance = Infinity;

                          nonTokenPermanents.forEach((perm) => {
                            const realIdx = toItems.indexOf(perm);
                            const startX = -((Math.max(toItems.length, 1) - 1) * spacing) / 2;
                            const owner = perm.owner;
                            const zBase = owner === 1
                              ? -TILE_SIZE * 0.5 + marginZ
                              : TILE_SIZE * 0.5 - marginZ;
                            const xPos = startX + realIdx * spacing;
                            const permX = pos[0] + xPos + (perm.offset?.[0] ?? 0);
                            const permZ = pos[2] + zBase + (perm.offset?.[1] ?? 0);

                            const distance = Math.sqrt(
                              Math.pow(wx - permX, 2) + Math.pow(wz - permZ, 2)
                            );

                            if (distance < closestDistance) {
                              closestDistance = distance;
                              closestPermanent = { at: dropKey, index: realIdx, card: perm.card };
                            }
                          });

                          // If we found a close permanent (within reasonable distance), show dialog
                          if (closestPermanent && closestDistance < TILE_SIZE * 0.5) {
                            // Store whether this was from hand or pile before clearing state
                            const wasFromPile = !!dragFromPile?.card;
                            const pileInfo = dragFromPile?.card ? dragFromPile as { who: "p1" | "p2"; from: "tokens" | "spellbook" | "atlas" | "graveyard"; card: CardRef } : null;

                            setAttachmentDialog({
                              token: draggedCard as CardRef,
                              targetPermanent: closestPermanent,
                              dropCoords: { x, y },
                              fromPile: wasFromPile,
                              pileInfo
                            });
                            setDragFromHand(false);
                            setGhost(null);
                            setDragFromPile(null);
                            lastDropAt.current = Date.now();
                            return; // Don't play the card yet, wait for dialog response
                          }
                        }
                      }
                    }

                    // Normal drop logic (no attachment)
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
                      try {
                        playCardPlay();
                      } catch {}
                      setDragFromHand(false); // Explicitly clear drag state after hand drop
                      setGhost(null); // Clear ghost
                      const type = (
                        (selected.card?.type || "") as string
                      ).toLowerCase();
                      const isToken = type.includes("token");
                      const tokenDef = isToken
                        ? TOKEN_BY_NAME[
                            (selected.card?.name || "").toLowerCase()
                          ]
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
                      try {
                        playCardPlay();
                      } catch {}
                      setDragFromPile(null);
                      setDragFromHand(false); // Also clear dragFromHand for pile drops
                      setGhost(null); // Also clear ghost immediately
                      const isToken = type.includes("token");
                      const tokenDef = isToken
                        ? TOKEN_BY_NAME[
                            (dragFromPile.card.name || "").toLowerCase()
                          ]
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
                onPointerOut={() => {
                  handlePointerOut();
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

                    // Calculate edge-based positioning toward owning player
                    const ownerKey = site.owner === 1 ? "p1" : "p2";
                    const playerPos = playerPositions[ownerKey];
                    const tileCoords = { x, z: y };
                    const edgeOffset = calculateEdgePosition(
                      tileCoords,
                      playerPos.position
                    );

                    return (
                      <>
                        {isSel && !isHandVisible && (
                          <group position={[edgeOffset.x, 0, edgeOffset.z]}>
                            <CardGlow
                              width={CARD_SHORT + 0.3}
                              height={CARD_LONG + 0.4}
                              rotationZ={rotZ}
                              elevation={0}
                              color={site.owner === 1 ? "#93c5fd" : "#fca5a5"}
                              renderOrder={500}
                            />
                          </group>
                        )}
                        {site.card?.slug ? (
                          <group
                            position={[edgeOffset.x, 0, edgeOffset.z]}
                            onPointerOver={(e) => {
                              if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                              e.stopPropagation();
                              if (site.card) beginHoverPreview(site.card);
                            }}
                            onPointerOut={(e) => {
                              if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                              e.stopPropagation();
                              clearHoverPreview();
                            }}
                            onDoubleClick={(e) => {
                              if (dragFromHand || dragFromPile) return;
                              e.stopPropagation();
                              emitBoardPing({ x: e.point.x, z: e.point.z });
                            }}
                          >
                            <CardPlane
                              slug={site.card?.slug || ""}
                              width={CARD_SHORT}
                              height={CARD_LONG}
                              depthWrite={true}
                              depthTest={true}
                              rotationZ={rotZ}
                              elevation={0.001}
                              renderOrder={10}
                              textureUrl={
                                !site.card?.slug
                                  ? "/api/assets/earth.png"
                                  : undefined
                              }
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
                            position={[edgeOffset.x, 0.001, edgeOffset.z]}
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
                  // Skip rendering if this token is attached to another permanent
                  if (p.attachedTo) {
                    return null;
                  }

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
                    (tokenSiteReplace ? Math.PI * 2 : 0) +
                    (p.tapped ? Math.PI / 2 : 0) +
                    (p.tilt || 0);
                  const offX = p.offset?.[0] ?? 0;
                  const offZ = p.offset?.[1] ?? 0;

                  // Check if this permanent is burrowed/submerged
                  const permanentId = p.card.cardId;
                  const permanentPosition = permanentPositions[permanentId];
                  const isBurrowed =
                    permanentPosition?.state === "burrowed" ||
                    permanentPosition?.state === "submerged";

                  // Adjust Y position: normal cards at 0.25, burrowed cards at 0.0005 (below sites at 0.001)
                  // This puts burrowed cards under sites but still visible
                  const yPos = isBurrowed ? 0.0005 : 0.25;

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
                      position={[0 + offX, yPos, zBase + offZ]}
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
                        onDoubleClick={(e) => {
                          if (dragFromHand || dragFromPile) return;
                          if (tokenSiteReplace) return;
                          e.stopPropagation();
                          emitBoardPing({ x: e.point.x, z: e.point.z });
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
                          if (tokenSiteReplace) {
                            e.stopPropagation();
                            return;
                          }
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
                              let w =
                                tokenDef && tokenDef.size === "small"
                                  ? CARD_SHORT * 0.5
                                  : CARD_SHORT;
                              let h =
                                tokenDef && tokenDef.size === "small"
                                  ? CARD_LONG * 0.5
                                  : CARD_LONG;
                              // Swap dimensions for site replacement tokens so they appear landscape when rotated
                              if (tokenSiteReplace) {
                                [w, h] = [h, w];
                              }
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
                                slug={p.card?.slug || ""}
                                width={CARD_SHORT}
                                height={CARD_LONG}
                                rotationZ={rotZ}
                                renderOrder={isBurrowed ? -10 : 0}
                                depthWrite={!isBurrowed}
                                depthTest={true}
                              />
                            </>
                          ) : (
                            <CardPlane
                              slug={p.card?.slug || ""}
                              width={CARD_SHORT}
                              height={CARD_LONG}
                              rotationZ={rotZ}
                              renderOrder={isBurrowed ? -10 : 0}
                              depthWrite={!isBurrowed}
                              depthTest={true}
                              textureUrl={
                                !p.card?.slug
                                  ? "/api/assets/air.png"
                                  : undefined
                              }
                            />
                          )}
                          {/* Counter overlay (follows card) */}
                          {(() => {
                            const count = Math.max(0, Number(p.counters || 0));
                            if (count <= 0) return null;
                            const digits = Math.floor(count)
                              .toString()
                              .split("")
                              .map((d) => Number(d) as Digit);
                            // Left side center: place the badge center on the left edge so it sits half-in/half-out
                            const leftEdgeX = -CARD_SHORT * 0.5; // center on left edge
                            const centerZ = 0;
                            return (
                              <Html
                                position={[leftEdgeX, 0.004, centerZ]}
                                transform
                                rotation-x={-Math.PI / 2}
                                rotation-z={rotZ}
                                zIndexRange={[0, 0]}
                              >
                                <div className="pointer-events-auto select-none">
                                  <div className="relative inline-flex group">
                                    <div className="flex items-center gap-0.5">
                                      {digits.map((d, i) => (
                                        <NumberBadge
                                          key={i}
                                          value={d}
                                          size={8}
                                          strokeWidth={2}
                                          backgroundOpacity={0.5}
                                        />
                                      ))}
                                    </div>
                                    {/* Overlay click zones: top half increment, bottom half decrement */}
                                    <div className="absolute inset-0 flex flex-col opacity-80">
                                      <button
                                        type="button"
                                        aria-label="Increment counter"
                                        title="Increment counter"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          incrementPermanentCounter(key, idx);
                                        }}
                                        className="flex-1 transition-opacity rounded-t-sm cursor-pointer opacity-0 group-hover:opacity-100 bg-transparent group-hover:bg-emerald-500/20 hover:bg-emerald-500/30"
                                      >
                                        <span className="sr-only">+</span>
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Decrement counter"
                                        title="Decrement counter"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          decrementPermanentCounter(key, idx);
                                        }}
                                        className="flex-1 transition-opacity rounded-b-sm cursor-pointer opacity-0 group-hover:opacity-100 bg-transparent group-hover:bg-rose-500/20 hover:bg-rose-500/30"
                                      >
                                        <span className="sr-only">-</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </Html>
                            );
                          })()}

                          {/* Render attached tokens on top of this permanent */}
                          {(() => {
                            const attachedTokens = items.filter(
                              (item) =>
                                item.attachedTo &&
                                item.attachedTo.at === key &&
                                item.attachedTo.index === idx
                            );

                            return attachedTokens.map((token, attachIdx) => {
                              const tokenName = (token.card.name || "").toLowerCase();
                              const attachTokenDef = TOKEN_BY_NAME[tokenName];

                              // Position attached tokens slightly offset on the card
                              const offsetX = CARD_SHORT * 0.3 * (attachIdx - (attachedTokens.length - 1) / 2);
                              const offsetZ = -CARD_LONG * 0.3;

                              if (attachTokenDef) {
                                const texUrl = tokenTextureUrl(attachTokenDef);
                                const tokenW = attachTokenDef.size === "small" ? CARD_SHORT * 0.4 : CARD_SHORT * 0.6;
                                const tokenH = attachTokenDef.size === "small" ? CARD_LONG * 0.4 : CARD_LONG * 0.6;

                                return (
                                  <group key={`attached-${attachIdx}`} position={[offsetX, 0.05, offsetZ]}>
                                    <CardPlane
                                      slug=""
                                      textureUrl={texUrl}
                                      forceTextureUrl
                                      width={tokenW}
                                      height={tokenH}
                                      rotationZ={0}
                                      elevation={0.02}
                                      renderOrder={700 + attachIdx}
                                    />
                                  </group>
                                );
                              }
                              return null;
                            });
                          })()}
                        </group>
                      </group>
                    </RigidBody>
                  );
                });
              })()}

              {showGrid && isHover && (
                <Text
                  font="/fantaisie_artistiqu.ttf"
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

      {/* Board ping markers */}
      <BoardPingLayer />

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
              const cachedCard = lastAvatarCardsRef.current[who];
              const activeCard = a.card?.slug ? a.card : cachedCard;
              if (a.card?.slug) {
                lastAvatarCardsRef.current[who] = a.card;
              }
              const rotZ =
                (who === "p1" ? 0 : Math.PI) + (a.tapped ? Math.PI / 2 : 0);
              const isSel =
                selectedAvatar === who ||
                (!!contextMenu &&
                  contextMenu.target.kind === "avatar" &&
                  contextMenu.target.who === who) ||
                dragAvatar === who;
              return (
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
                    onDoubleClick={(e) => {
                      if (dragFromHand || dragFromPile) return;
                      if (dragAvatar) return;
                      e.stopPropagation();
                      emitBoardPing({ x: e.point.x, z: e.point.z });
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
                        if (heldFor >= DRAG_HOLD_MS && dist > DRAG_THRESHOLD) {
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
                        if (draggedBody.current) moveDraggedBody(wx, wz, false);
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
                        slug={activeCard?.slug || cachedCard?.slug || ""}
                        width={CARD_SHORT}
                        height={CARD_LONG}
                        rotationZ={rotZ}
                        textureUrl={
                          activeCard || cachedCard
                            ? undefined
                            : "/api/assets/cardback_spellbook.png"
                        }
                      />
                    </group>
                  </group>
                </RigidBody>
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
                    // Swap dimensions for site replacement tokens so they appear landscape when rotated
                    if (def && def.siteReplacement) {
                      [w, h] = [h, w];
                    }
                    const ownerRotToken =
                      dragFromPile?.who === "p1" ? 0 : Math.PI;
                    const rotZToken =
                      ownerRotToken +
                      (def && def.siteReplacement ? -Math.PI / 2 : 0);
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
                    rotationZ={isSite ? -Math.PI / 2 + ownerRot : ownerRot}
                    interactive={false}
                  />
                );
              }
              return null;
            })()}
          </group>
        )}

      {/* Token attachment dialog */}
      {attachmentDialog && (
        <Html center>
          <TokenAttachmentDialog
            token={attachmentDialog.token as CardRef}
            targetPermanent={attachmentDialog.targetPermanent}
            onConfirm={() => {
              const { token, targetPermanent, dropCoords, fromPile, pileInfo } = attachmentDialog;

              // Play the token at the target location
              if (!fromPile && selected) {
                playSelectedTo(dropCoords.x, dropCoords.y);
              } else if (fromPile && pileInfo) {
                // We need to use the store directly to play from pile
                const store = useGameStore.getState();
                // Temporarily set dragFromPile in the store directly
                store.dragFromPile = pileInfo;
                store.playFromPileTo(dropCoords.x, dropCoords.y);
                store.dragFromPile = null;
              }

              // Wait a bit for the token to be added to permanents, then attach it
              setTimeout(() => {
                const dropKey = `${dropCoords.x},${dropCoords.y}`;
                const items = useGameStore.getState().permanents[dropKey] || [];
                // Find the token that was just added (should be the last one added)
                let tokenIndex = -1;
                for (let i = items.length - 1; i >= 0; i--) {
                  const item = items[i];
                  if ((item.card.type || "").toLowerCase().includes("token") &&
                      (item.card.name || "").toLowerCase() === ((token as CardRef).name || "").toLowerCase() &&
                      !item.attachedTo) {
                    tokenIndex = i;
                    break;
                  }
                }

                if (tokenIndex >= 0) {
                  // Use the store's attach action
                  const store = useGameStore.getState();
                  if (store.attachTokenToPermanent) {
                    store.attachTokenToPermanent(dropKey, tokenIndex, targetPermanent.index);
                  }
                }
              }, 200); // Increase timeout slightly for better reliability

              setAttachmentDialog(null);
              try { playCardPlay(); } catch {}
            }}
            onCancel={() => {
              const { dropCoords, fromPile, pileInfo } = attachmentDialog;
              // Play the token normally without attachment
              if (!fromPile && selected) {
                playSelectedTo(dropCoords.x, dropCoords.y);
              } else if (fromPile && pileInfo) {
                // We need to use the store directly to play from pile
                const store = useGameStore.getState();
                // Temporarily set dragFromPile in the store directly
                store.dragFromPile = pileInfo;
                store.playFromPileTo(dropCoords.x, dropCoords.y);
                store.dragFromPile = null;
              }
              setAttachmentDialog(null);
              try { playCardPlay(); } catch {}
            }}
          />
        </Html>
      )}
    </group>
  );
}
