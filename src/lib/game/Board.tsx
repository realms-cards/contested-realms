  "use client";

import { Text, useTexture, Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  RigidBody,
  CuboidCollider,
  useBeforePhysicsStep,
} from "@react-three/rapier";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from "react";
import { flushSync } from "react-dom";
import {
  SRGBColorSpace,
  Raycaster,
  type Object3D,
  type Intersection,
  type Group,
} from "three";
import { NumberBadge, type Digit } from "@/components/game/manacost";
import { useSound } from "@/lib/contexts/SoundContext";
import BoardCursorLayer from "@/lib/game/components/BoardCursorLayer";
import BoardPingLayer from "@/lib/game/components/BoardPingLayer";
import CardOutline from "@/lib/game/components/CardOutline";
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
  PLAYER_COLORS,
} from "@/lib/game/constants";
import {
  useGameStore,
  type CardRef,
  type BoardState,
  type RemoteCursorState,
} from "@/lib/game/store";
import type {
  RemoteCursorDragMeta,
  RemoteCursorHighlight,
} from "@/lib/game/store/remoteCursor";
import { TOKEN_BY_NAME, TOKEN_BY_KEY, tokenTextureUrl } from "@/lib/game/tokens";

// Feature flag to isolate snap effects while debugging rapier aliasing
const ENABLE_SNAP = true;
// Prefer ghost-only visual during board drags (do not move the real body until drop)
const USE_GHOST_ONLY_BOARD_DRAG = true;
const STACK_SPACING = TILE_SIZE * 0.32;
const STACK_MARGIN_Z = TILE_SIZE * 0.1;
const STACK_LAYER_LIFT = CARD_THICK * 0.12;
const BASE_CARD_ELEVATION = CARD_THICK * 0.55;
const BURROWED_ELEVATION = CARD_THICK * 0.08;
const TILE_OFFSET_LIMIT_X = TILE_SIZE * 0.35;
const TILE_OFFSET_LIMIT_Z = TILE_SIZE * 0.28;
const AVATAR_AVOID_Z = TILE_SIZE * 0.15;

function clampOffset(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

// Minimal shape of the rapier rigid body API we need (keep local to avoid import typing issues)
type BodyApi = {
  wakeUp: () => void;
  setLinvel: (v: { x: number; y: number; z: number }, wake: boolean) => void;
  setAngvel: (v: { x: number; y: number; z: number }, wake: boolean) => void;
  setTranslation: (
    v: { x: number; y: number; z: number },
    wake: boolean
  ) => void;
  setNextKinematicTranslation: (v: {
    x: number;
    y: number;
    z: number;
  }) => void;
  setBodyType: (
    t: "dynamic" | "fixed" | "kinematicPosition" | "kinematicVelocity",
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
  enableBoardPings?: boolean;
  interactionMode?: "normal" | "spectator";
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

export default function Board({
  noRaycast = false,
  enableBoardPings = false,
  interactionMode = "normal",
}: BoardProps = {}) {
  const isSpectator = interactionMode === "spectator";
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
  const contextMenu = useGameStore((s) => s.contextMenu);
  const openContextMenu = useGameStore((s) => s.openContextMenu);
  const selected = useGameStore((s) => s.selectedCard);
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const permanents = useGameStore((s) => s.permanents);
  const permanentPositions = useGameStore((s) => s.permanentPositions);
  const { playCardPlay, playTurnGong, playCardFlip } = useSound();
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const previewCard = useGameStore((s) => s.previewCard);
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
  const getRemoteHighlightColor = useGameStore(
    (s) => s.getRemoteHighlightColor
  );
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const actorKey = useGameStore((s) => s.actorKey);
  const remoteCursors = useGameStore((s) => s.remoteCursors);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const avatars = useGameStore((s) => s.avatars);
  const overlayBlocking = useGameStore((s) =>
    Boolean(s.peekDialog || s.searchDialog || s.placementDialog)
  );
  // Counter actions
  const incrementPermanentCounter = useGameStore(
    (s) => s.incrementPermanentCounter
  );
  const decrementPermanentCounter = useGameStore(
    (s) => s.decrementPermanentCounter
  );

  // Token attachment dialog state
  const [attachmentDialog, setAttachmentDialog] = useState<{
    token: CardRef;
    targetPermanent: { at: string; index: number; card: CardRef };
    dropCoords: { x: number; y: number };
    fromPile?: boolean;
    pileInfo?: {
      who: "p1" | "p2";
      from: "tokens" | "spellbook" | "atlas" | "graveyard";
      card: CardRef;
    } | null;
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
    // Reset frame-level body access tracker to prevent Rapier aliasing
    bodiesAccessedThisFrame.current.clear();
    
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
          handlePointerMoveRef.current(
            lastGhostPosRef.current.x,
            lastGhostPosRef.current.z
          );
        }
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ghost] Failed to update drag ghost:", err);
        }
      }
    }

    // Smoothly drive board-drag ghost (permanent/avatar) to the last pointer position
    if ((dragging || dragAvatar) && boardGhostRef.current) {
      const p = lastPointerRef.current;
      if (p) {
        const k2 = 0.4;
        lastBoardGhostPosRef.current.x += (p.x - lastBoardGhostPosRef.current.x) * k2;
        lastBoardGhostPosRef.current.z += (p.z - lastBoardGhostPosRef.current.z) * k2;
        boardGhostRef.current.position.set(
          lastBoardGhostPosRef.current.x,
          0.26,
          lastBoardGhostPosRef.current.z
        );
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

  const offsetX = useMemo(
    () => -((board.size.w - 1) * TILE_SIZE) / 2,
    [board.size.w]
  );
  const offsetY = useMemo(
    () => -((board.size.h - 1) * TILE_SIZE) / 2,
    [board.size.h]
  );

  const cells = useMemo(() => {
    const out: { x: number; y: number; key: string }[] = [];
    for (let y = 0; y < board.size.h; y++) {
      for (let x = 0; x < board.size.w; x++) {
        out.push({ x, y, key: `${x},${y}` });
      }
    }
    return out;
  }, [board.size.w, board.size.h]);

  // Build a list of opponent permanent-drag proxies to render at their live cursor positions
  const { remotePermanentDrags, remotePermanentDragLookup } = useMemo(() => {
    type RemotePermanentDrag = {
      key: string;
      pos: { x: number; z: number };
      rotZ: number;
      slug: string;
      color: string;
      width: number;
      height: number;
      textureUrl?: string;
      forceTextureUrl?: boolean;
      textureRotation?: number;
    };

    if (overlayBlocking) {
      return {
        remotePermanentDrags: [] as RemotePermanentDrag[],
        remotePermanentDragLookup: new Map<string, Set<number>>(),
      };
    }

    const drags: RemotePermanentDrag[] = [];
    const lookup = new Map<string, Set<number>>();

    try {
      const rc = remoteCursors || {};
      for (const entry of Object.values(rc)) {
        if (!entry) continue;
        if (!entry.position) continue;
        if (localPlayerId && entry.playerId === localPlayerId) continue;
        const drag = entry.dragging;
        if (!drag || drag.kind !== "permanent") continue;
        const from = String(drag.from || "");
        const index = Number(drag.index ?? -1);
        if (!from || index < 0) continue;
        const list = permanents[from] || [];
        const p = list[index];
        if (!p || !p.card) continue;

        // Determine card size (tokens may be smaller or site-replacement landscape)
        const isToken = ((p.card.type || "") as string)
          .toLowerCase()
          .includes("token");
        const tokenDef = isToken
          ? TOKEN_BY_NAME[(p.card.name || "").toLowerCase()]
          : undefined;
        let w = CARD_SHORT;
        let h = CARD_LONG;
        if (isToken && tokenDef?.size === "small") {
          w = CARD_SHORT * 0.5;
          h = CARD_LONG * 0.5;
        }

        // Orientation like board permanents (owner-facing + site-like -90° + tap + tilt)
        const ownerRot = p.owner === 1 ? 0 : Math.PI;
        const rotZ =
          ownerRot +
          (tokenDef?.siteReplacement ? -Math.PI / 2 : 0) +
          (p.tapped ? Math.PI / 2 : 0) +
          (p.tilt || 0);

        const color =
          entry.playerKey === "p1"
            ? PLAYER_COLORS.p1
            : entry.playerKey === "p2"
            ? PLAYER_COLORS.p2
            : PLAYER_COLORS.spectator;

        const existing = lookup.get(from);
        if (existing) existing.add(index);
        else lookup.set(from, new Set([index]));

        drags.push({
          key: `rdrag:${entry.playerId}:${from}:${index}`,
          pos: { x: entry.position.x, z: entry.position.z },
          rotZ,
          slug: isToken ? "" : p.card.slug || "",
          color,
          width: w,
          height: h,
          textureUrl:
            isToken && tokenDef ? tokenTextureUrl(tokenDef) : undefined,
          forceTextureUrl: Boolean(isToken && tokenDef),
          textureRotation:
            isToken && tokenDef ? tokenDef.textureRotation ?? 0 : 0,
        });
      }
    } catch {}

    return {
      remotePermanentDrags: drags,
      remotePermanentDragLookup: lookup,
    };
  }, [remoteCursors, localPlayerId, permanents, overlayBlocking]);

  const remoteHandDrags = useMemo(() => {
    type RemoteHandDrag = {
      key: string;
      pos: { x: number; z: number };
      rotZ: number;
      color: string;
    };

    if (overlayBlocking) {
      return [] as RemoteHandDrag[];
    }

    const drags: RemoteHandDrag[] = [];

    const halfTile = TILE_SIZE * 0.5;
    const boardMinX = offsetX - halfTile;
    const boardMaxX = offsetX + TILE_SIZE * (board.size.w - 0.5);
    const boardMinZ = offsetY - halfTile;
    const boardMaxZ = offsetY + TILE_SIZE * (board.size.h - 0.5);
    const boundaryEps = TILE_SIZE * 0.2;

    try {
      const rc = remoteCursors || {};
      for (const entry of Object.values(rc)) {
        if (!entry) continue;
        if (!entry.position) continue;
        if (localPlayerId && entry.playerId === localPlayerId) continue;
        const drag = entry.dragging;
        if (!drag || drag.kind !== "hand") continue;
        const { x, z } = entry.position;
        if (
          x < boardMinX - boundaryEps ||
          x > boardMaxX + boundaryEps ||
          z < boardMinZ - boundaryEps ||
          z > boardMaxZ + boundaryEps
        ) {
          continue;
        }

        const color =
          entry.playerKey === "p1"
            ? PLAYER_COLORS.p1
            : entry.playerKey === "p2"
            ? PLAYER_COLORS.p2
            : PLAYER_COLORS.spectator;
        const rotZ = entry.playerKey === "p2" ? Math.PI : 0;

        drags.push({
          key: `rhand:${entry.playerId ?? "unknown"}`,
          pos: { x, z },
          rotZ,
          color,
        });
      }
    } catch {}

    return drags;
  }, [
    overlayBlocking,
    remoteCursors,
    localPlayerId,
    offsetX,
    offsetY,
    board.size.w,
    board.size.h,
  ]);

  const { remoteAvatarDrags, remoteAvatarDragSet } = useMemo(() => {
    type RemoteAvatarDrag = {
      key: string;
      pos: { x: number; z: number };
      rotZ: number;
      slug: string;
      color: string;
    };

    if (overlayBlocking) {
      return {
        remoteAvatarDrags: [] as RemoteAvatarDrag[],
        remoteAvatarDragSet: new Set<"p1" | "p2">(),
      };
    }

    const drags: RemoteAvatarDrag[] = [];
    const dragging = new Set<"p1" | "p2">();
    try {
      const rc = remoteCursors || {};
      for (const entry of Object.values(rc)) {
        if (!entry) continue;
        if (!entry.position) continue;
        if (localPlayerId && entry.playerId === localPlayerId) continue;
        const drag = entry.dragging;
        if (!drag || drag.kind !== "avatar") continue;
        const who = drag.who === "p1" || drag.who === "p2" ? drag.who : null;
        if (!who) continue;
        const avatar = avatars?.[who];
        const slug = avatar?.card?.slug || "";
        const rotZ =
          (who === "p1" ? 0 : Math.PI) + (avatar?.tapped ? Math.PI / 2 : 0);
        const color =
          entry.playerKey === "p1"
            ? PLAYER_COLORS.p1
            : entry.playerKey === "p2"
            ? PLAYER_COLORS.p2
            : PLAYER_COLORS.spectator;
        dragging.add(who);
        drags.push({
          key: `rdrag:avatar:${entry.playerId}:${who}`,
          pos: { x: entry.position.x, z: entry.position.z },
          rotZ,
          slug,
          color,
        });
      }
    } catch {}
    return {
      remoteAvatarDrags: drags,
      remoteAvatarDragSet: dragging,
    };
  }, [remoteCursors, localPlayerId, avatars, overlayBlocking]);

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

  // Local drag state for moving permanents across tiles
  const lastTurnPlayerRef = useRef<number | null>(null);

  useEffect(() => {
    const seat = currentPlayer;
    if (lastTurnPlayerRef.current == null) {
      lastTurnPlayerRef.current = seat;
      return;
    }
    if (lastTurnPlayerRef.current !== seat) {
      try {
        playTurnGong();
      } catch {}
      lastTurnPlayerRef.current = seat;
    }
  }, [currentPlayer, playTurnGong]);

  const [dragging, setDragging] = useState<{
    from: string;
    index: number;
  } | null>(null);
  // Track a world-space ghost position while dragging (legacy state - setter used to clear on drop)
  const [, setGhost] = useState<{ x: number; z: number } | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const touchPreviewTimerRef = useRef<number | null>(null);
  const touchContextTimerRef = useRef<number | null>(null);
  const hoverClearTimerRef = useRef<number | null>(null);
  const hoverRequestIdRef = useRef(0);
  const hoverSourceRef = useRef<string | null>(null);
  const [dragAvatar, setDragAvatar] = useState<"p1" | "p2" | null>(null);
  const avatarDragStartRef = useRef<{
    who: "p1" | "p2";
    start: [number, number];
    time: number;
  } | null>(null);
  const selectedAvatar = useGameStore((s) => s.selectedAvatar);
  const selectAvatar = useGameStore((s) => s.selectAvatar);
  const lastAvatarCardsRef = useRef<Record<"p1" | "p2", CardRef | null>>({
    p1: null,
    p2: null,
  });
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
  // Track bodies accessed this frame to prevent Rapier aliasing
  const bodiesAccessedThisFrame = useRef<Set<string>>(new Set());
  // Target world position for the currently dragged body (applied after physics step)
  const dragTarget = useRef<{ x: number; z: number; lift: boolean } | null>(
    null
  );
  // Pending snap operations queued to run safely after the physics step
  const pendingSnaps = useRef<
    Map<string, { x: number; z: number; attempts: number; delay: number }>
  >(new Map());
  const slugCacheRef = useRef<Map<number, string | null>>(new Map());
  const pendingSlugFetchesRef = useRef<
    Map<number, Promise<string | null>>
  >(new Map());

  // Ghost that follows the cursor while dragging from hand/pile, even over the hand area
  const ghostGroupRef = useRef<Group | null>(null);
  const lastGhostPosRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const raycasterRef = useRef(new Raycaster());
  const { camera, pointer } = useThree();
  const handlePointerMoveRef = useRef<(x: number, z: number) => void>(() => {});

  // Local ghost for board/avatars drags (separate from hand/pile ghost)
  const boardGhostRef = useRef<Group | null>(null);
  const lastBoardGhostPosRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });

  function moveDraggedBody(x: number, z: number, lift = true) {
    // Defer actual physics API calls to useAfterPhysicsStep
    dragTarget.current = { x, z, lift };
  }

  // Queue a snap of a body (by id) to an exact world position, applied after the physics step.
  function snapBodyTo(id: string, x: number, z: number) {
    if (!ENABLE_SNAP) {
      if (process.env.NODE_ENV !== "production") {
        console.debug(
          `[snap] disabled ${id} -> x=${Number(x).toFixed(2)} z=${Number(z).toFixed(2)}`
        );
      }
      return;
    }
    // Add a small delay to make snap less aggressive and improve placement precision
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const prev = pendingSnaps.current.get(id);
        const attempts = prev ? Math.max(prev.attempts, 8) : 8;
        pendingSnaps.current.set(id, { x, z, attempts, delay: 1 });
        if (process.env.NODE_ENV !== "production") {
          console.debug(
            `[snap] queue ${id} -> x=${Number(x).toFixed(2)} z=${Number(z).toFixed(2)}`
          );
        }
      });
    });
  }

  // Apply queued drag moves and snap operations before each physics step to avoid aliasing
  useBeforePhysicsStep(() => {
    // Apply drag target for the currently dragged body
    const target = dragTarget.current;
    const api = draggedBody.current;
    if (api && target) {
      try {
        api.setNextKinematicTranslation({
          x: target.x,
          y: target.lift ? DRAG_LIFT : BASE_CARD_ELEVATION,
          z: target.z,
        });
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            `[physics] Failed to move dragged body (beforeStep):`,
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
        // Simple cooldown so we don't touch bodies in the same frame as React commit
        if (job.delay && job.delay > 0) {
          pendingSnaps.current.set(id, { ...job, delay: job.delay - 1 });
          continue;
        }
        const snapApi = bodyMap.current.get(id);
        if (snapApi) {
          // Skip if this body was already accessed this frame (prevents Rapier aliasing)
          if (bodiesAccessedThisFrame.current.has(id)) {
            if (process.env.NODE_ENV !== "production") {
              console.debug(`[snap] skip-frame-access ${id}`);
            }
            pendingSnaps.current.delete(id);
            continue;
          }
          bodiesAccessedThisFrame.current.add(id);
          
          // Don't snap the body we're actively dragging in this frame
          if (snapApi === draggedBody.current) {
            if (process.env.NODE_ENV !== "production") {
              console.debug(`[snap] skip-dragged ${id}`);
            }
            pendingSnaps.current.delete(id);
            continue;
          }
          try {
            // Temporarily set kinematic to snap precisely, then restore dynamic next tick
            snapApi.setBodyType("kinematicPosition", false);
            snapApi.setNextKinematicTranslation({ x: job.x, y: BASE_CARD_ELEVATION, z: job.z });
            setTimeout(() => {
              try {
                snapApi.setBodyType("dynamic", true);
              } catch {}
            }, 0);
            if (process.env.NODE_ENV !== "production") {
              console.debug(
                `[snap] apply ${id} -> x=${Number(job.x).toFixed(2)} z=${Number(
                  job.z
                ).toFixed(2)}`
              );
            }
          } catch (error) {
            if (process.env.NODE_ENV !== "production") {
              console.warn(
                `[physics] Failed to snap body ${id} (beforeStep):`,
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
              delay: 1,
            });
            if (process.env.NODE_ENV !== "production") {
              console.debug(
                `[snap] retry ${id} attempts=${job.attempts - 1} -> x=${Number(
                  job.x
                ).toFixed(2)} z=${Number(job.z).toFixed(2)}`
              );
            }
          } else {
            pendingSnaps.current.delete(id);
            if (process.env.NODE_ENV !== "production") {
              console.debug(`[snap] drop ${id}`);
            }
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

  const ensureCardSlug = useCallback(
    async (card: CardRef | null | undefined): Promise<CardRef | null> => {
      if (!card) return null;
      const rawSlug = typeof card.slug === "string" ? card.slug.trim() : "";
      if (rawSlug) return card;
      const cardId = Number(card.cardId);
      if (!Number.isFinite(cardId) || cardId <= 0) return null;
      const cache = slugCacheRef.current;
      if (cache.has(cardId)) {
        const cachedSlug = cache.get(cardId);
        return cachedSlug ? { ...card, slug: cachedSlug } : null;
      }
      const pendingMap = pendingSlugFetchesRef.current;
      let pending = pendingMap.get(cardId);
      if (!pending) {
        pending = fetch(`/api/cards/by-id?ids=${cardId}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const slug =
              Array.isArray(data) &&
              data.length > 0 &&
              data[0] &&
              typeof data[0].slug === "string" &&
              data[0].slug.trim().length > 0
                ? String(data[0].slug).trim()
                : null;
            cache.set(cardId, slug ?? null);
            return slug ?? null;
          })
          .catch(() => {
            cache.set(cardId, null);
            return null;
          })
          .finally(() => {
            pendingMap.delete(cardId);
          });
        pendingMap.set(cardId, pending);
      }
      const slug = await pending;
      if (!slug) return null;
      return { ...card, slug };
    },
    []
  );

  function beginHoverPreview(card?: CardRef | null, sourceKey?: string | null) {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (hoverClearTimerRef.current) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
    hoverSourceRef.current = sourceKey ?? null;
    const requestId = ++hoverRequestIdRef.current;
    if (card) {
      setPreviewCard(card);
      hoverTimer.current = window.setTimeout(() => {
        ensureCardSlug(card)
          .then((resolved) => {
            if (!resolved) return;
            if (hoverRequestIdRef.current !== requestId) return;
            if (hoverSourceRef.current !== (sourceKey ?? null)) return;
            setPreviewCard(resolved);
          })
          .catch(() => {
            // Ignore lookup failures; preview simply won't render.
          });
      }, 120);
    }
  }
  function clearHoverPreview(sourceKey?: string | null) {
    if (sourceKey != null && hoverSourceRef.current !== sourceKey) return;
    hoverSourceRef.current = null;
    hoverRequestIdRef.current++;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPreviewCard(null);
  }
  function clearHoverPreviewDebounced(sourceKey?: string | null, delay = 400) {
    if (sourceKey != null && hoverSourceRef.current !== sourceKey) return;
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (hoverClearTimerRef.current) window.clearTimeout(hoverClearTimerRef.current);
    const requestId = ++hoverRequestIdRef.current;
    const expectedSource = hoverSourceRef.current;
    hoverClearTimerRef.current = window.setTimeout(() => {
      hoverClearTimerRef.current = null;
      if (hoverRequestIdRef.current !== requestId) return;
      if (expectedSource != null && hoverSourceRef.current !== expectedSource) return;
      hoverSourceRef.current = null;
      setPreviewCard(null);
    }, delay) as unknown as number;
  }
  const clearTouchTimers = useCallback(() => {
    if (touchPreviewTimerRef.current) {
      window.clearTimeout(touchPreviewTimerRef.current);
      touchPreviewTimerRef.current = null;
    }
    if (touchContextTimerRef.current) {
      window.clearTimeout(touchContextTimerRef.current);
      touchContextTimerRef.current = null;
    }
  }, []);

  // --- Remote cursor telemetry (position + dragging meta + highlight) ---
  const lastCursorRef = useRef<RemoteCursorState | null>(null);
  const lastCursorSentAtRef = useRef<number>(0);
  const lastPointerRef = useRef<{ x: number; z: number } | null>(null);

  const resolveHighlight = useCallback((): RemoteCursorHighlight => {
    const state = useGameStore.getState();

    const deriveCardMeta = (
      card: CardRef | null | undefined,
      instanceKey?: string | null
    ) => {
      if (!card) return null;
      const slug =
        typeof card.slug === "string" && card.slug.length > 0
          ? card.slug
          : null;
      const cardId = Number.isFinite(card.cardId) ? Number(card.cardId) : null;
      const type = (card.type || "").toLowerCase();
      const isToken = type.includes("token");
      if (cardId === null && !isToken) {
        // Allow highlighting purely via slug when no numeric identifier exists
        if (!slug) return null;
      }
      // For tokens dragged from hand, synthesize a unique negative id so we can highlight only that instance.
      const baseId =
        cardId ?? -Math.abs(Number(card.variantId ?? Date.now() % 1000));
      const syntheticId = baseId || -1;
      return {
        slug,
        cardId: syntheticId,
        instanceKey: instanceKey ?? null,
      };
    };

    const selectedCard = state.selectedCard;
    if (state.dragFromHand) {
      if (selectedCard) {
        const key = `hand:${selectedCard.who}:${selectedCard.index}`;
        const meta = deriveCardMeta(selectedCard.card, key);
        if (meta) return meta;
      }
      const pileCard = state.dragFromPile?.card ?? null;
      if (pileCard) {
        const key = `pile:${state.dragFromPile?.from ?? "unknown"}`;
        const meta = deriveCardMeta(pileCard, key);
        if (meta) return meta;
      }
    } else if (selectedCard) {
      const key = `hand:${selectedCard.who}:${selectedCard.index}`;
      const meta = deriveCardMeta(selectedCard.card, key);
      if (meta) return meta;
    }

    const selPermanent = state.selectedPermanent;
    if (selPermanent) {
      const at = selPermanent.at;
      const index = selPermanent.index;
      const card = state.permanents?.[at]?.[index]?.card ?? null;
      const meta = deriveCardMeta(card, `perm:${at}:${index}`);
      if (meta) {
        return meta;
      }
    }

    const pileDragCard = state.dragFromPile?.card ?? null;
    const pileDragMeta = deriveCardMeta(
      pileDragCard,
      state.dragFromPile ? `pile:${state.dragFromPile.from ?? "unknown"}` : null
    );
    if (pileDragMeta) {
      return pileDragMeta;
    }

    return null;
  }, []);

  const resolveDraggingMeta = useCallback((): RemoteCursorDragMeta | null => {
    const s = useGameStore.getState();
    if (isSpectator) {
      return null;
    }
    // Avatar drag (local-only UI state here)
    if (dragAvatar as unknown as string | null) {
      return { kind: "avatar", who: dragAvatar };
    }
    // Prefer explicit board permanent drag metadata over generic flags
    if (dragging) {
      return { kind: "permanent", from: dragging.from, index: dragging.index };
    }
    if (s.dragFromHand) return { kind: "hand" };
    const pile = s.dragFromPile;
    if (pile) {
      if (pile.from === "tokens") return { kind: "token" };
      return { kind: "pile", source: pile.from ?? null };
    }
    return null;
  }, [dragAvatar, dragging, isSpectator]);

  function round3(n: number): number {
    return Number.isFinite(n) ? Number(n.toFixed(3)) : 0;
  }

  function positionsEqual(
    a: RemoteCursorState["position"],
    b: RemoteCursorState["position"]
  ) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.x === b.x && a.z === b.z;
  }

  function draggingEquals(
    a: RemoteCursorDragMeta | null,
    b: RemoteCursorDragMeta | null
  ) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
      case "permanent":
        return (
          b.kind === "permanent" && a.from === b.from && a.index === b.index
        );
      case "hand":
        return b.kind === "hand";
      case "pile":
        return b.kind === "pile" && a.source === b.source;
      case "token":
        return b.kind === "token";
      case "avatar":
        return b.kind === "avatar" && a.who === b.who;
      default:
        return false;
    }
  }

  const sendCursor = useCallback(
    (position: { x: number; z: number } | null) => {
      if (isSpectator) {
        return;
      }
      const s = useGameStore.getState();
      const playerId = s.localPlayerId;
      if (!playerId) return;
      const tr = s.transport;
      if (!tr?.sendMessage) return;

      const highlight = resolveHighlight();

      const payload: RemoteCursorState = {
        playerId,
        playerKey: s.actorKey,
        position: position
          ? { x: round3(position.x), z: round3(position.z) }
          : null,
        dragging: resolveDraggingMeta(),
        highlight,
        ts: Date.now(),
        displayName: undefined,
      };

      const prev = lastCursorRef.current;
      const now = Date.now();
      if (
        prev &&
        positionsEqual(prev.position, payload.position) &&
        draggingEquals(prev.dragging, payload.dragging) &&
        (prev.highlight?.slug || null) === (payload.highlight?.slug || null) &&
        (prev.highlight?.cardId || null) ===
          (payload.highlight?.cardId || null) &&
        (prev.highlight?.instanceKey || null) ===
          (payload.highlight?.instanceKey || null)
      ) {
        // unchanged
        lastCursorRef.current = { ...payload };
        return;
      }
      // Use env variable for cursor send throttle (default 66ms = 15 Hz)
      // Supports React 19 concurrent rendering with reduced network traffic
      const minInterval = typeof process.env.NEXT_PUBLIC_CURSOR_MS === 'string'
        ? parseInt(process.env.NEXT_PUBLIC_CURSOR_MS, 10)
        : 66;

      if (now - lastCursorSentAtRef.current < minInterval) {
        lastCursorRef.current = { ...payload };
        return;
      }
      lastCursorRef.current = { ...payload };
      lastCursorSentAtRef.current = now;
      try {
        tr.sendMessage({ type: "boardCursor", ...payload });
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[cursor] send failed", err);
        }
      }
    },
    [isSpectator, resolveDraggingMeta, resolveHighlight]
  );

  const handlePointerMove = useCallback(
    (x: number, z: number) => {
      const position = { x, z };
      setLastPointerWorldPos(position);
      lastPointerRef.current = position;
      if (!isSpectator) {
        sendCursor(position);
      }
    },
    [setLastPointerWorldPos, sendCursor, isSpectator]
  );

  const handlePointerOut = useCallback(() => {
    setLastPointerWorldPos(null);
    lastPointerRef.current = null;
    if (!isSpectator) {
      sendCursor(null);
    }
  }, [setLastPointerWorldPos, sendCursor, isSpectator]);

  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove;
  }, [handlePointerMove]);

  // Re-emit cursor when drag or highlight changes (using last known position)
  useEffect(() => {
    sendCursor(lastPointerRef.current ?? null);
  }, [
    actorKey,
    dragAvatar,
    dragging,
    previewCard,
    selected,
    selectedPermanent,
    sendCursor,
  ]);

  const emitBoardPing = useCallback(
    (position: { x: number; z: number } | null) => {
      if (!position || isSpectator) return;
      const x = Number(position.x);
      const z = Number(position.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const { actorKey, pushBoardPing, transport } = useGameStore.getState();
      const seat = actorKey === "p1" || actorKey === "p2" ? actorKey : "p1";
      const id = `ping_${Math.random()
        .toString(36)
        .slice(2, 8)}_${Date.now().toString(36)}`;
      const ts = Date.now();
      try {
        pushBoardPing({
          id,
          position: { x, z },
          playerId: null,
          playerKey: seat,
          ts,
        });
      } catch {}
      try {
        transport?.sendMessage?.({
          type: "boardPing",
          id,
          position: { x, z },
          playerKey: seat,
          ts,
        });
      } catch {}
    },
    [isSpectator]
  );

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
        if (isSpectator) return;
        e.preventDefault();
        const { lastPointerWorldPos } = useGameStore.getState();
        emitBoardPing(lastPointerWorldPos);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [emitBoardPing, isSpectator]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== "KeyT") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable)
      ) {
        return;
      }

      if (isSpectator || overlayBlocking) return;

      const {
        selectedPermanent,
        selectedAvatar,
        permanents,
        toggleTapPermanent,
        toggleTapAvatar,
        closeContextMenu,
      } = useGameStore.getState();

      let tapped = false;

      if (selectedPermanent) {
        const { at, index } = selectedPermanent;
        const items = permanents[at];
        if (items && items[index]) {
          event.preventDefault();
          toggleTapPermanent(at, index);
          tapped = true;
        }
      } else if (selectedAvatar) {
        event.preventDefault();
        toggleTapAvatar(selectedAvatar);
        tapped = true;
      }

      if (tapped) {
        try {
          playCardFlip();
        } catch {}
        closeContextMenu();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSpectator, overlayBlocking, playCardFlip]);

  // removed global pointerup fallback; drops are handled by tiles/cards precisely

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
                  if (isSpectator) {
                    return;
                  }
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
                  if (isSpectator) return;
                  if (dragFromHand || dragFromPile || dragging || dragAvatar)
                    return;
                  e.stopPropagation();
                  emitBoardPing({ x: e.point.x, z: e.point.z });
                }}
                onPointerUp={(e: ThreeEvent<PointerEvent>) => {
                  if (e.button !== 0) return; // only handle left-button releases for drops
                  if (isSpectator) return;
                  e.stopPropagation();
                  // Handle drop from hand or moving a dragged permanent
                  if (dragAvatar) {
                    // Keep the avatar where it was dropped (use world drop position) and update pos+offset atomically
                    const wx = e.point.x;
                    const wz = e.point.z;
                    const baseX = pos[0];
                    const baseZ = pos[2];
                    const offX = clampOffset(wx - baseX, TILE_OFFSET_LIMIT_X);
                    const offZ = clampOffset(wz - baseZ, TILE_OFFSET_LIMIT_Z);
                    if (process.env.NODE_ENV !== "production") {
                      console.debug(
                        `[drop] avatar ${dragAvatar} wx=${wx.toFixed(2)} wz=${wz.toFixed(2)} -> ${x},${y}`
                      );
                    }
                    const apiAtDrop: BodyApi | null = draggedBody.current;
                    dragTarget.current = null;
                    draggedBody.current = null;
                    requestAnimationFrame(() => {
                      moveAvatarToWithOffset(dragAvatar, x, y, [offX, offZ]);
                    });
                    if (!USE_GHOST_ONLY_BOARD_DRAG) {
                      // Snap avatar body to the final drop point on next frame
                      snapBodyTo(`avatar:${dragAvatar}`, wx, wz);
                      if (apiAtDrop) {
                        try {
                          setTimeout(() => {
                            try {
                              (apiAtDrop as BodyApi).setBodyType("dynamic", true);
                            } catch {}
                          }, 0);
                        } catch {}
                      }
                    }
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
                    const spacing = STACK_SPACING;
                    const marginZ = STACK_MARGIN_Z;
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
                      const offX = clampOffset(world.x - baseX, TILE_OFFSET_LIMIT_X);
                      const offZ = clampOffset(world.z - baseZ, TILE_OFFSET_LIMIT_Z);
                      if (process.env.NODE_ENV !== "production") {
                        console.debug(
                          `[drop] perm tile same ${dragging.from}[${dragging.index}] -> ${dropKey} wx=${world.x.toFixed(
                            2
                          )} wz=${world.z.toFixed(2)}`
                        );
                      }
                      const apiAtDrop: BodyApi | null = draggedBody.current;
                      if (!USE_GHOST_ONLY_BOARD_DRAG && apiAtDrop) {
                        try {
                          setTimeout(() => {
                            try {
                              (apiAtDrop as BodyApi).setBodyType("dynamic", true);
                            } catch {}
                          }, 0);
                        } catch {}
                      }
                      dragTarget.current = null;
                      draggedBody.current = null;
                      requestAnimationFrame(() => {
                        setPermanentOffset(dropKey, dragging.index, [offX, offZ]);
                      });
                      if (!USE_GHOST_ONLY_BOARD_DRAG) {
                        snapBodyTo(`perm:${dropKey}:${dragging.index}`, world.x, world.z);
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
                      const offX = clampOffset(world.x - baseX, TILE_OFFSET_LIMIT_X);
                      const offZ = clampOffset(world.z - baseZ, TILE_OFFSET_LIMIT_Z);
                      if (process.env.NODE_ENV !== "production") {
                        console.debug(
                          `[drop] perm tile cross ${dragging.from}[${dragging.index}] -> ${dropKey} newIndex=${newIndex} wx=${world.x.toFixed(
                            2
                          )} wz=${world.z.toFixed(2)}`
                        );
                      }
                      // No direct body API here; snap queue will position after render
                      dragTarget.current = null;
                      draggedBody.current = null;
                      requestAnimationFrame(() => {
                        moveSelectedPermanentToWithOffset(x, y, [offX, offZ]);
                      });
                      if (!USE_GHOST_ONLY_BOARD_DRAG) {
                        snapBodyTo(`perm:${dropKey}:${newIndex}`, world.x, world.z);
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
                      console.debug(
                        `[Board] Drag from hand - mouseInHandZone:`,
                        mouseInHandZone
                      );
                    }

                    // Check if mouse is in hand zone - if so, cancel the drag instead of playing
                    if (mouseInHandZone) {
                      // Cancel the drag - return card to hand
                      console.debug(
                        `[Board] Cancelling drag - returning to hand`
                      );
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
                      const cardType = (
                        (draggedCard as CardRef).type || ""
                      ).toLowerCase();
                      const isToken = cardType.includes("token");
                      const tokenName = (
                        (draggedCard as CardRef).name || ""
                      ).toLowerCase();

                      // Check if this is an attachable token and there are non-token permanents at this location
                      if (isToken && isAttachableToken(tokenName)) {
                        const nonTokenPermanents = toItems.filter(
                          (item) =>
                            !(item.card.type || "")
                              .toLowerCase()
                              .includes("token")
                        );

                        if (nonTokenPermanents.length > 0) {
                          // Find the closest permanent based on world position
                          const spacing = STACK_SPACING;
                          const marginZ = STACK_MARGIN_Z;
                          let closestPermanent = null;
                          let closestDistance = Infinity;

                          nonTokenPermanents.forEach((perm) => {
                            const realIdx = toItems.indexOf(perm);
                            const startX =
                              -((Math.max(toItems.length, 1) - 1) * spacing) /
                              2;
                            const owner = perm.owner;
                            const zBase =
                              owner === 1
                                ? -TILE_SIZE * 0.5 + marginZ
                                : TILE_SIZE * 0.5 - marginZ;
                            const xPos = startX + realIdx * spacing;
                            const permX =
                              pos[0] + xPos + (perm.offset?.[0] ?? 0);
                            const permZ =
                              pos[2] + zBase + (perm.offset?.[1] ?? 0);

                            const distance = Math.sqrt(
                              Math.pow(wx - permX, 2) + Math.pow(wz - permZ, 2)
                            );

                            if (distance < closestDistance) {
                              closestDistance = distance;
                              closestPermanent = {
                                at: dropKey,
                                index: realIdx,
                                card: perm.card,
                              };
                            }
                          });

                          // If we found a close permanent (within reasonable distance), show dialog
                          if (
                            closestPermanent &&
                            closestDistance < TILE_SIZE * 0.5
                          ) {
                            // Store whether this was from hand or pile before clearing state
                            const wasFromPile = !!dragFromPile?.card;
                            const pileInfo = dragFromPile?.card
                              ? (dragFromPile as {
                                  who: "p1" | "p2";
                                  from:
                                    | "tokens"
                                    | "spellbook"
                                    | "atlas"
                                    | "graveyard";
                                  card: CardRef;
                                })
                              : null;

                            setAttachmentDialog({
                              token: draggedCard as CardRef,
                              targetPermanent: closestPermanent,
                              dropCoords: { x, y },
                              fromPile: wasFromPile,
                              pileInfo,
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
                    const spacing = STACK_SPACING;
                    const startX = -((Math.max(newCount, 1) - 1) * spacing) / 2;
                    const marginZ = STACK_MARGIN_Z;
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

                    if (dragFromPile?.card) {
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
                    } else if (selected) {
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
                  clearHoverPreview(key);
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
                    const siteInstanceKey = `site:${x},${y}`;
                    const siteRemoteColor = getRemoteHighlightColor(
                      site.card ?? null,
                      {
                        instanceKey: siteInstanceKey,
                      }
                    );
                    const siteGlowColor =
                      siteRemoteColor ??
                      (site.owner === 1 ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2);
                    const renderSiteGlow =
                      !isHandVisible && (isSel || !!siteRemoteColor);

                    return (
                      <>
                        {renderSiteGlow && (
                          <group position={[edgeOffset.x, 0, edgeOffset.z]}>
                            <CardOutline
                              width={CARD_SHORT}
                              height={CARD_LONG}
                              rotationZ={rotZ}
                              elevation={0.0001}
                              color={siteGlowColor}
                              renderOrder={1000}
                            />
                          </group>
                        )}
                        {site.card?.slug ? (
                          <group
                            position={[edgeOffset.x, 0, edgeOffset.z]}
                            onPointerDown={(e) => {
                              if (dragFromHand || dragFromPile) return;
                              const pe = e.nativeEvent as PointerEvent | undefined;
                              if (pe && (pe as PointerEvent).pointerType === "touch") {
                                clearTouchTimers();
                                const cx = e.clientX;
                                const cy = e.clientY;
                                if (site.card) {
                                  touchPreviewTimerRef.current = window.setTimeout(() => {
                                    beginHoverPreview(site.card, key);
                                  }, 180) as unknown as number;
                                }
                                touchContextTimerRef.current = window.setTimeout(() => {
                                  openContextMenu(
                                    { kind: "site", x, y },
                                    { x: cx, y: cy }
                                  );
                                }, 500) as unknown as number;
                              }
                            }}
                            onPointerOver={(e) => {
                              if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                              e.stopPropagation();
                              if (site.card) beginHoverPreview(site.card, key);
                            }}
                            onPointerOut={(e) => {
                              if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                              e.stopPropagation();
                              clearHoverPreviewDebounced(key);
                              clearTouchTimers();
                            }}
                            onPointerMove={(e) => {
                              const pe = e.nativeEvent as PointerEvent | undefined;
                              if (pe && (pe as PointerEvent).pointerType === "touch") {
                                clearTouchTimers();
                              }
                            }}
                            onDoubleClick={(e) => {
                              if (dragFromHand || dragFromPile) return;
                              if (isSpectator) return;
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
                                if (isSpectator) return;
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
                            onPointerDown={(e) => {
                              if (dragFromHand || dragFromPile) return;
                              const pe = e.nativeEvent as PointerEvent | undefined;
                              if (pe && (pe as PointerEvent).pointerType === "touch") {
                                clearTouchTimers();
                                const cx = e.clientX;
                                const cy = e.clientY;
                                touchContextTimerRef.current = window.setTimeout(() => {
                                  openContextMenu(
                                    { kind: "site", x, y },
                                    { x: cx, y: cy }
                                  );
                                }, 500) as unknown as number;
                              }
                            }}
                            onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                              if (isSpectator) return;
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
                return items.map((p, idx) => {
                  const remoteDragSet = remotePermanentDragLookup.get(key);
                  if (remoteDragSet?.has(idx)) {
                    return null;
                  }
                  // Skip rendering if this token is attached to another permanent
                  if (p.attachedTo) {
                    return null;
                  }
                  const hoverKey = `${key}:${idx}`;

                  const owner = p.owner; // 1 or 2
                  const ownerKeyForTile = owner === 1 ? "p1" : "p2";
                  const ownerAvatar = avatars?.[ownerKeyForTile];
                  const avatarOnThisTile =
                    ownerAvatar?.pos &&
                    ownerAvatar.pos[0] === x &&
                    ownerAvatar.pos[1] === y;
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
                  const marginZ =
                    STACK_MARGIN_Z + (avatarOnThisTile ? TILE_SIZE * 0.08 : 0);
                  const avatarShiftZ = avatarOnThisTile
                    ? owner === 1
                      ? -AVATAR_AVOID_Z
                      : AVATAR_AVOID_Z
                    : 0;
                  // Sites sit at tile center; rubble tokens (site replacements) should also snap to center
                  const zBase = tokenSiteReplace
                    ? 0
                    : owner === 1
                    ? -TILE_SIZE * 0.5 + marginZ + avatarShiftZ
                    : TILE_SIZE * 0.5 - marginZ + avatarShiftZ;
                  // Orientation: bottom toward owner; Rubble (site-like token) adds -90° like sites
                  const rotZ =
                    (owner === 1 ? 0 : Math.PI) +
                    (tokenSiteReplace ? -Math.PI / 2 : 0) +
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

    // Adjust Y position: normal cards stack upward slightly to avoid clipping
    const baseY = isBurrowed ? BURROWED_ELEVATION : BASE_CARD_ELEVATION;
    const stackIndex = idx;
    const stackLift = !isBurrowed ? stackIndex * STACK_LAYER_LIFT : 0;
    const yPos = baseY + stackLift;

    const permanentInstanceKey = p.instanceId ?? `perm:${key}:${idx}`;
    const remotePermanentColor = getRemoteHighlightColor(
      p.card ?? null,
      {
        instanceKey: permanentInstanceKey,
      }
    );
    const permanentGlowColor =
      remotePermanentColor ??
      (owner === 1 ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2);
    const renderPermanentGlow =
      !isHandVisible && (isSel || !!remotePermanentColor);
    const isLocalDragGhost =
      USE_GHOST_ONLY_BOARD_DRAG &&
      dragging &&
      dragging.from === key &&
      dragging.index === idx;
    const showPermanentGlow = renderPermanentGlow && !isLocalDragGhost;
    const isDraggingPermanent = dragging && dragging.from === key && dragging.index === idx;

    const bodyType =
      USE_GHOST_ONLY_BOARD_DRAG || tokenSiteReplace ? "fixed" : "dynamic";
    const gravityScale = USE_GHOST_ONLY_BOARD_DRAG ? 0 : 1;

    return (
      <RigidBody
        key={`perm-${key}-${idx}`}
        ref={(api) => {
          const id = (p.instanceId ?? `perm:${key}:${idx}`) as string;
          try {
            if (api) {
              bodyMap.current.set(id, api as unknown as BodyApi);
              if (process.env.NODE_ENV !== "production") {
                console.debug(`[physics] Body mapped: ${id} for card ${p.card.name} at ${key}[${idx}]`);
              }
            } else {
              bodyMap.current.delete(id);
              if (process.env.NODE_ENV !== "production") {
                console.debug(`[physics] Body unmapped: ${id} for card ${p.card.name} at ${key}[${idx}]`);
              }
            }
          } catch (error) {
            console.warn(
              `[physics] Failed to update body map for ${id}:`,
              error
            );
          }
        }}
        type={bodyType}
        ccd
        colliders={false}
        position={[0 + offX, yPos, zBase + offZ]}
        linearDamping={2}
        angularDamping={2}
        canSleep={false}
        enabledRotations={[false, true, false]}
        gravityScale={gravityScale}
      >
        <CuboidCollider
          args={[CARD_SHORT / 2, CARD_THICK / 2, CARD_LONG / 2]}
          friction={0.9}
          restitution={0}
          sensor
        />
        <group
          visible={!isLocalDragGhost}
          onPointerDown={(e) => {
            if (isSpectator) {
              e.stopPropagation();
              return;
            }
            // Only start potential drag on left-click
            if (dragFromHand || dragFromPile) return; // let tiles handle drops during hand/pile drags
            if (tokenSiteReplace) {
              // Rubble behaves like a site for movement: no drag start
              e.stopPropagation();
              useGameStore.getState().selectPermanent(key, idx);
              clearHoverPreview(hoverKey);
              return;
            }
            const pe = e.nativeEvent as PointerEvent | undefined;
            if (pe && (pe as PointerEvent).pointerType === "touch") {
              clearTouchTimers();
              const cx = e.clientX;
              const cy = e.clientY;
              touchPreviewTimerRef.current = window.setTimeout(() => {
                beginHoverPreview(p.card, hoverKey);
              }, 180) as unknown as number;
              touchContextTimerRef.current = window.setTimeout(() => {
                useGameStore.getState().selectPermanent(key, idx);
                openContextMenu(
                  { kind: "permanent", at: key, index: idx },
                  { x: cx, y: cy }
                );
              }, 500) as unknown as number;
            }
            if (e.button === 0) {
              e.stopPropagation();
              useGameStore.getState().selectPermanent(key, idx);
              if (!isSpectator && actorKey) {
                const mine =
                  (actorKey === "p1" && owner === 1) ||
                  (actorKey === "p2" && owner === 2);
                if (!mine) {
                  if (process.env.NODE_ENV !== "production") {
                    console.debug(
                      `[drag] perm:denied ${key}[${idx}] owner=${owner} actor=${actorKey}`
                    );
                  }
                  clearHoverPreview(hoverKey);
                  return;
                }
              }
              // wait for small hold + movement before starting drag
              dragStartRef.current = {
                at: key,
                index: idx,
                start: [e.point.x, e.point.z],
                time: Date.now(),
              };
              if (process.env.NODE_ENV !== "production") {
                console.debug(`[drag] perm:down ${key}[${idx}]`);
              }
              clearHoverPreview(hoverKey);
            }
          }}
          onPointerOver={(e) => {
            if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
            e.stopPropagation();
                beginHoverPreview(p.card, hoverKey);
          }}
          onPointerOut={(e) => {
            if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
            e.stopPropagation();
            clearHoverPreviewDebounced(hoverKey);
            // cancel pending drag if pointer leaves before threshold
            if (
              dragStartRef.current &&
              dragStartRef.current.at === key &&
              dragStartRef.current.index === idx
            ) {
              dragStartRef.current = null;
            }
            clearTouchTimers();
          }}
          onDoubleClick={(e) => {
            if (dragFromHand || dragFromPile) return;
            if (tokenSiteReplace) return;
            if (isSpectator) return;
            e.stopPropagation();
            emitBoardPing({ x: e.point.x, z: e.point.z });
          }}
          onPointerMove={(e) => {
            if (dragFromHand || dragFromPile) return; // let tiles drive ghost/body during hand/pile drags
            if (tokenSiteReplace) return; // no drag for Rubble
            e.stopPropagation();
            const pe = e.nativeEvent as PointerEvent | undefined;
            if (pe && pe.pointerType === "touch") {
              clearTouchTimers();
            }
            // Always feed cursor telemetry with current world coordinates
            handlePointerMove(e.point.x, e.point.z);
            if (isSpectator) return;
            // Start dragging once hold + threshold exceeded
            if (
              !dragging &&
              dragStartRef.current &&
              dragStartRef.current.at === key &&
              dragStartRef.current.index === idx
            ) {
              if (!pe || (pe.buttons & 1) !== 1) {
                return;
              }
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
                flushSync(() => {
                  setDragging({ from: key, index: idx });
                });
                dragStartRef.current = null;
                if (process.env.NODE_ENV !== "production") {
                  console.debug(
                    `[drag] perm:start ${key}[${idx}] held=${heldFor} dist=${dist.toFixed(
                      2
                    )}`
                  );
                }
                if (USE_GHOST_ONLY_BOARD_DRAG) {
                  lastBoardGhostPosRef.current.x = e.point.x;
                  lastBoardGhostPosRef.current.z = e.point.z;
                  if (boardGhostRef.current) {
                    boardGhostRef.current.position.set(
                      e.point.x,
                      0.26,
                      e.point.z
                    );
                  }
                }
                // Start visual drag. If ghost-only mode, do not move body.
                if (!USE_GHOST_ONLY_BOARD_DRAG) {
                  const bodyId = (p.instanceId ?? `perm:${key}:${idx}`) as string;
                  // Skip if this body was already accessed this frame
                  if (bodiesAccessedThisFrame.current.has(bodyId)) {
                    if (process.env.NODE_ENV !== "production") {
                      console.debug(`[drag] skip-frame-access ${bodyId}`);
                    }
                    draggedBody.current = null;
                  } else {
                    bodiesAccessedThisFrame.current.add(bodyId);
                    draggedBody.current = bodyMap.current.get(bodyId) || null;
                    if (draggedBody.current) {
                      try {
                        draggedBody.current.setBodyType(
                          "kinematicPosition",
                          false
                        );
                      } catch {}
                      moveDraggedBody(e.point.x, e.point.z, true);
                    }
                  }
                } else {
                  draggedBody.current = null;
                }
              }
            } else if (
              dragging &&
              dragging.from === key &&
              dragging.index === idx &&
              draggedBody.current &&
              !USE_GHOST_ONLY_BOARD_DRAG
            ) {
              if (pe && (pe.buttons & 1) !== 1) {
                return;
              }
              // While dragging and pointer is over the card, continue driving it (no ghost)
              moveDraggedBody(e.point.x, e.point.z, true);
            }
          }}
          onPointerUp={(e) => {
            if (e.button !== 0) return; // ignore non-left button releases
            if (dragAvatar) return; // allow avatar drops to bubble to tile
            if (dragFromHand || dragFromPile) return; // let tile handle drop from hand/pile
            if (tokenSiteReplace) {
              e.stopPropagation();
              return;
            }
            if (isSpectator) {
              e.stopPropagation();
              return;
            }
            e.stopPropagation();
            clearTouchTimers();
            if (dragging) {
              // Drop the currently dragged permanent based on pointer world position
              const wx = e.point.x;
              const wz = e.point.z;
              let tx = Math.round((wx - offsetX) / TILE_SIZE);
              let ty = Math.round((wz - offsetY) / TILE_SIZE);
              tx = Math.max(0, Math.min(board.size.w - 1, tx));
              ty = Math.max(0, Math.min(board.size.h - 1, ty));
              const dropKey = `${tx},${ty}`;
              const tileX = offsetX + tx * TILE_SIZE;
              const tileZ = offsetY + ty * TILE_SIZE;
              const marginZ = STACK_MARGIN_Z;
              const spacing = STACK_SPACING;
              const draggedOwner =
                permanents[dragging.from]?.[dragging.index]?.owner ?? 1;
              const draggedInstId =
                permanents[dragging.from]?.[dragging.index]?.instanceId || null;
              const zBase =
                draggedOwner === 1
                  ? -TILE_SIZE * 0.5 + marginZ
                  : TILE_SIZE * 0.5 - marginZ;
              if (process.env.NODE_ENV !== "production") {
                console.debug(
                  `[drop] perm ${dragging.from}->${dropKey} wx=${wx.toFixed(2)} wz=${wz.toFixed(2)}`
                );
              }
              if (dragging.from === dropKey) {
                // Staying on same tile: baseline uses current count and original index
                const baseX = tileX + (-((Math.max((permanents[dropKey] || []).length, 1) - 1) * spacing) / 2 + dragging.index * spacing);
                const baseZ = tileZ + zBase;
                const offX = wx - baseX;
                const offZ = wz - baseZ;
                dragTarget.current = null;
                draggedBody.current = null;
                requestAnimationFrame(() => {
                  setPermanentOffset(dropKey, dragging.index, [offX, offZ]);
                });
                if (!USE_GHOST_ONLY_BOARD_DRAG) {
                  const targetId = (draggedInstId || `perm:${dropKey}:${dragging.index}`) as string;
                  snapBodyTo(targetId, wx, wz);
                }
              } else {
                // Moving to another tile: baseline uses new count and index at end
                const toItems = permanents[dropKey] || [];
                const newIndex = toItems.length;
                const startX = -((Math.max(newIndex + 1, 1) - 1) * spacing) / 2;
                const baseX = tileX + (startX + newIndex * spacing);
                const baseZ = tileZ + zBase;
                const offX = wx - baseX;
                const offZ = wz - baseZ;
                // No direct body API here; snap queue will position after render
                dragTarget.current = null;
                draggedBody.current = null;
                requestAnimationFrame(() => {
                  moveSelectedPermanentToWithOffset(tx, ty, [offX, offZ]);
                });
                if (!USE_GHOST_ONLY_BOARD_DRAG) {
                  const targetId = (draggedInstId || `perm:${dropKey}:${newIndex}`) as string;
                  snapBodyTo(targetId, wx, wz);
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
          }}
        >
          {/* Selection / remote highlight outline */}
{showPermanentGlow && (
  <CardOutline
    width={
      tokenDef && tokenDef.size === "small"
        ? CARD_SHORT * 0.5
        : CARD_SHORT
    }
    height={
      tokenDef && tokenDef.size === "small"
        ? CARD_LONG * 0.5
        : CARD_LONG
    }
    rotationZ={rotZ}
    elevation={isDraggingPermanent ? DRAG_LIFT + 0.0001 : 0.0001}
    color={permanentGlowColor}
    renderOrder={1000}
  />
)}
          <group
            visible={true}
            onClick={(e) => {
              if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
              e.stopPropagation();
              if (isSpectator) return;
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
              if (isSpectator) return;
              e.stopPropagation();
              e.nativeEvent.preventDefault();
              // Ensure the permanent is selected before opening the menu
              useGameStore.getState().selectPermanent(key, idx);
              openContextMenu(
                { kind: "permanent", at: key, index: idx },
                { x: e.clientX, y: e.clientY }
              );
            }}
          >
            {isToken ? (
              <CardPlane
                slug={""}
                textureUrl={
                  tokenDef ? tokenTextureUrl(tokenDef) : undefined
                }
                forceTextureUrl
                width={
                  tokenDef && tokenDef.size === "small"
                    ? CARD_SHORT * 0.5
                    : CARD_SHORT
                }
                height={
                  tokenDef && tokenDef.size === "small"
                    ? CARD_LONG * 0.5
                    : CARD_LONG
                }
                rotationZ={rotZ}
                elevation={0.005}
              />
            ) : p.card.slug ? (
              <>
                {showPermanentGlow && (
                  <CardOutline
                    width={CARD_SHORT}
                    height={CARD_LONG}
                    rotationZ={rotZ}
                    elevation={isDraggingPermanent ? DRAG_LIFT + 0.0001 : 0.0001}
                    color={permanentGlowColor}
                    renderOrder={1000}
                  />
                )}
                <CardPlane
                  slug={p.card?.slug || ""}
                  width={CARD_SHORT}
                  height={CARD_LONG}
                  rotationZ={rotZ}
                  renderOrder={isBurrowed ? -10 : 100}
                  depthWrite={!isBurrowed}
                  depthTest={true}
                  textureUrl={
                    !p.card?.slug ? "/api/assets/air.png" : undefined
                  }
                />
              </>
            ) : (
              <CardPlane
                slug={p.card?.slug || ""}
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={rotZ}
                renderOrder={isBurrowed ? -10 : 100}
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
                            textAsSvg
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
                const tokenName = (
                  token.card.name || ""
                ).toLowerCase();
                const attachTokenDef = TOKEN_BY_NAME[tokenName];

                // Position attached tokens slightly offset on the card
                const offsetX =
                  CARD_SHORT *
                  0.3 *
                  (attachIdx - (attachedTokens.length - 1) / 2);
                const offsetZ = -CARD_LONG * 0.3;

                if (attachTokenDef) {
                  const texUrl = tokenTextureUrl(attachTokenDef);
                  const tokenW =
                    attachTokenDef.size === "small"
                      ? CARD_SHORT * 0.4
                      : CARD_SHORT * 0.6;
                  const tokenH =
                    attachTokenDef.size === "small"
                      ? CARD_LONG * 0.4
                      : CARD_LONG * 0.6;

                  return (
                    <group
                      key={`attached-${attachIdx}`}
                      position={[offsetX, BASE_CARD_ELEVATION + CARD_THICK * 0.3, offsetZ]}
                    >
                      <CardPlane
                        slug=""
                        textureUrl={texUrl}
                        forceTextureUrl
                        width={tokenW}
                        height={tokenH}
                        rotationZ={0}
                        elevation={0.005}
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
      {enableBoardPings ? <BoardPingLayer /> : null}

      {/* Remote cursors */}
      <BoardCursorLayer />

      {/* Remote hand drag proxies (card backs while hovering over board) */}
      {remoteHandDrags.length > 0 && (
        <group>
          {remoteHandDrags.map((d) => (
            <group key={d.key} position={[d.pos.x, 0.33, d.pos.z]}>
              <CardOutline
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={d.rotZ}
                elevation={0.0001}
                color={d.color}
                renderOrder={1000}
              />
              <CardPlane
                slug=""
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={d.rotZ}
                elevation={0.005}
                renderOrder={540}
                interactive={false}
                textureUrl="/api/assets/cardback_spellbook.png"
                forceTextureUrl
              />
            </group>
          ))}
        </group>
      )}

      {/* Remote permanent drag proxies (opponent live drags) */}
      {remotePermanentDrags.length > 0 && (
        <group>
          {remotePermanentDrags.map((d) => (
            <group key={d.key} position={[d.pos.x, 0.26, d.pos.z]}>
              <CardOutline
                width={d.width}
                height={d.height}
                rotationZ={d.rotZ}
                elevation={0.0001}
                color={d.color}
                renderOrder={1000}
              />
              <CardPlane
                slug={d.slug}
                width={d.width}
                height={d.height}
                rotationZ={d.rotZ}
                elevation={0.001}
                renderOrder={530}
                interactive={false}
                textureUrl={d.textureUrl}
                forceTextureUrl={Boolean(d.textureUrl)}
                textureRotation={d.textureRotation ?? 0}
              />
            </group>
          ))}
        </group>
      )}

      {/* Remote avatar drag proxies */}
      {remoteAvatarDrags.length > 0 && (
        <group>
          {remoteAvatarDrags.map((d) => (
            <group key={d.key} position={[d.pos.x, 0.26, d.pos.z]}>
              <CardOutline
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={d.rotZ}
                elevation={0.0001}
                color={d.color}
                renderOrder={1000}
              />
              <CardPlane
                slug={d.slug}
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={d.rotZ}
                elevation={0.002}
                polygonOffsetUnits={-1.25}
                polygonOffsetFactor={-0.75}
                renderOrder={550}
                interactive={false}
                textureUrl={
                  d.slug ? undefined : "/api/assets/cardback_spellbook.png"
                }
              />
            </group>
          ))}
        </group>
      )}

      {/* Avatars */}
      {(["p1", "p2"] as const).map((who) => {
        const a = avatars?.[who];
        if (!a || !a.pos) return null;
        if (remoteAvatarDragSet.has(who)) {
          return null;
        }
        const [ax, ay] = a.pos;
        const baseX = offsetX + ax * TILE_SIZE;
        const baseZ = offsetY + ay * TILE_SIZE;
        const offX = a.offset?.[0] ?? 0;
        const offZ = a.offset?.[1] ?? 0;
        const worldX = baseX + offX;
        const worldZ = baseZ + offZ;
        const hideAvatar =
          USE_GHOST_ONLY_BOARD_DRAG && dragAvatar === who;
        const avatarBodyType = USE_GHOST_ONLY_BOARD_DRAG ? "fixed" : "dynamic";
        const avatarGravityScale = USE_GHOST_ONLY_BOARD_DRAG ? 0 : 1;
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
                  ccd
                  colliders={false}
                  position={[worldX, BASE_CARD_ELEVATION, worldZ]}
                  linearDamping={2}
                  angularDamping={2}
                  canSleep={false}
                  enabledRotations={[false, true, false]}
                  gravityScale={avatarGravityScale}
                  type={avatarBodyType}
                >
                  <CuboidCollider
                    args={[CARD_SHORT / 2, CARD_THICK / 2, CARD_LONG / 2]}
                    friction={0.9}
                    restitution={0}
                    sensor
                  />
                  {isSel && !isHandVisible && !hideAvatar && (
                    <CardOutline
                      width={CARD_SHORT}
                      height={CARD_LONG}
                      rotationZ={rotZ}
                      elevation={0.0001}
                      color={who === "p1" ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2}
                      renderOrder={1000}
                    />
                  )}
                  <group
                    visible={!hideAvatar}
                    onPointerDown={(e) => {
                      if (isSpectator) {
                        e.stopPropagation();
                        return;
                      }
                      // Only start potential drag on left-click
                      if (dragFromHand || dragFromPile) return; // let tiles handle drops during hand/pile drags
                      const pe = e.nativeEvent as PointerEvent | undefined;
                      if (pe && (pe as PointerEvent).pointerType === "touch") {
                        clearTouchTimers();
                        const cx = e.clientX;
                        const cy = e.clientY;
                        if (a.card) {
                          touchPreviewTimerRef.current = window.setTimeout(() => {
                            beginHoverPreview(a.card, who);
                          }, 180) as unknown as number;
                        }
                        touchContextTimerRef.current = window.setTimeout(() => {
                          selectAvatar(who);
                          openContextMenu(
                            { kind: "avatar", who },
                            { x: cx, y: cy }
                          );
                        }, 500) as unknown as number;
                      }
                      if (e.button === 0) {
                    e.stopPropagation();
                    selectAvatar(who);
                    // wait for small hold + movement before starting drag
                    avatarDragStartRef.current = {
                      who,
                          start: [e.point.x, e.point.z],
                          time: Date.now(),
                        };
                        clearHoverPreview(who);
                      }
                    }}
                    onPointerOver={(e) => {
                      if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                      e.stopPropagation();
                      beginHoverPreview(a.card, who);
                    }}
                    onPointerOut={(e) => {
                      if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                      e.stopPropagation();
                      clearHoverPreview(who);
                      // cancel pending drag if pointer leaves before threshold
                      if (
                        avatarDragStartRef.current &&
                        avatarDragStartRef.current.who === who
                      ) {
                        avatarDragStartRef.current = null;
                      }
                      clearTouchTimers();
                    }}
                    onDoubleClick={(e) => {
                      if (dragFromHand || dragFromPile) return;
                      if (dragAvatar) return;
                      if (isSpectator) return;
                      e.stopPropagation();
                      emitBoardPing({ x: e.point.x, z: e.point.z });
                    }}
                    onPointerMove={(e) => {
                      if (dragFromHand || dragFromPile) return; // let tiles drive ghost/body during hand/pile drags
                      e.stopPropagation();
                      const pe = e.nativeEvent as PointerEvent | undefined;
                      if (pe && pe.pointerType === "touch") {
                        clearTouchTimers();
                      }
                      handlePointerMove(e.point.x, e.point.z);
                      if (isSpectator) {
                        return;
                      }
                      // Start dragging once hold + threshold exceeded
                      if (
                        !dragAvatar &&
                        avatarDragStartRef.current &&
                        avatarDragStartRef.current.who === who
                      ) {
                        if (!pe || (pe.buttons & 1) !== 1) {
                          return;
                        }
                        const [sx, sz] = avatarDragStartRef.current.start;
                        const dx = e.point.x - sx;
                        const dz = e.point.z - sz;
                        const dist = Math.hypot(dx, dz);
                        const heldFor =
                          Date.now() - avatarDragStartRef.current.time;
                        if (heldFor >= DRAG_HOLD_MS && dist > DRAG_THRESHOLD) {
                          flushSync(() => {
                            setDragAvatar(who);
                          });
                          setGhost(null);
                          if (process.env.NODE_ENV !== "production") {
                            console.debug(`[drag] avatar:start ${who}`);
                          }
                          if (USE_GHOST_ONLY_BOARD_DRAG) {
                            lastBoardGhostPosRef.current.x = e.point.x;
                            lastBoardGhostPosRef.current.z = e.point.z;
                            if (boardGhostRef.current) {
                              boardGhostRef.current.position.set(
                                e.point.x,
                                0.26,
                                e.point.z
                              );
                            }
                          }
                          if (!USE_GHOST_ONLY_BOARD_DRAG) {
                            // Move the real body during drag
                            const avatarId = `avatar:${who}`;
                            // Skip if this body was already accessed this frame
                            if (bodiesAccessedThisFrame.current.has(avatarId)) {
                              if (process.env.NODE_ENV !== "production") {
                                console.debug(`[drag] avatar:skip-frame-access ${avatarId}`);
                              }
                              draggedBody.current = null;
                            } else {
                              bodiesAccessedThisFrame.current.add(avatarId);
                              draggedBody.current = bodyMap.current.get(avatarId) || null;
                              if (draggedBody.current) {
                                moveDraggedBody(e.point.x, e.point.z, true);
                              }
                            }
                          } else {
                            // Ghost-only: don't move a body
                            draggedBody.current = null;
                          }
                        }
                      } else if (
                        dragAvatar === who &&
                        draggedBody.current &&
                        !USE_GHOST_ONLY_BOARD_DRAG
                      ) {
                        if (pe && (pe.buttons & 1) !== 1) {
                          return;
                        }
                        // While dragging and pointer is over the avatar, continue driving it (no ghost)
                        moveDraggedBody(e.point.x, e.point.z, true);
                      }
                    }}
                    onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                      if (isSpectator) return;
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
                      if (dragging || dragFromHand || dragFromPile) {
                        // allow underlying board/tile handlers to process permanent/token drops
                        return;
                      }
                      if (isSpectator) {
                        e.stopPropagation();
                        return;
                      }
                      if (dragAvatar === who) {
                        e.stopPropagation();
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
                        const apiAtDrop: BodyApi | null = draggedBody.current;
                        dragTarget.current = null;
                        draggedBody.current = null;
                        requestAnimationFrame(() => {
                          moveAvatarToWithOffset(who, tx, ty, [offX, offZ]);
                        });
                        if (!USE_GHOST_ONLY_BOARD_DRAG) {
                          // Snap avatar body to the final drop point on next frame
                          snapBodyTo(`avatar:${who}`, wx, wz);
                          if (apiAtDrop) {
                            try {
                              setTimeout(() => {
                                try {
                                  (apiAtDrop as BodyApi).setBodyType("dynamic", true);
                                } catch {}
                              }, 0);
                            } catch {}
                          }
                        }
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
                      visible={true}
                      onClick={(e) => {
                        if (dragFromHand || dragFromPile) return; // allow bubbling to tiles during hand/pile drags
                        e.stopPropagation();
                        if (isSpectator) return;
                        // If dragging this avatar, ignore clicks
                        if (dragAvatar === who) return;
                        // Left-click selects only; context menu via right-click
                        selectAvatar(who);
                      }}
                      onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                        if (isSpectator) return;
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
                        !isHandVisible &&
                        !hideAvatar && (
                          <CardOutline
                            width={CARD_SHORT}
                            height={CARD_LONG}
                            rotationZ={rotZ}
                            elevation={dragAvatar === who ? DRAG_LIFT + 0.0001 : 0.0001}
                            color={
                              who === "p1" ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2
                            }
                            renderOrder={1000}
                          />
                        )}
                      <CardPlane
                        slug={activeCard?.slug || cachedCard?.slug || ""}
                        width={CARD_SHORT}
                        height={CARD_LONG}
                        rotationZ={rotZ}
                        elevation={dragAvatar === who ? DRAG_LIFT + 0.002 : 0.002}
                        polygonOffsetUnits={-1.25}
                        polygonOffsetFactor={-0.75}
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
                const isTokenSel = ((selected.card.type || "") as string)
                  .toLowerCase()
                  .includes("token");
                const ownerRot = currentPlayer === 1 ? 0 : Math.PI;
                if ((selected.card.slug || "").startsWith("token:") || isTokenSel) {
                  try {
                    const key = (selected.card.slug || "").split(":")[1]?.toLowerCase();
                    const def = key ? TOKEN_BY_KEY[key] : undefined;
                    let w = CARD_SHORT;
                    let h = CARD_LONG;
                    if (def && def.size === "small") {
                      w = CARD_SHORT * 0.5;
                      h = CARD_LONG * 0.5;
                    }
                    const rotZToken = ownerRot + (def && def.siteReplacement ? -Math.PI / 2 : 0);
                    if (!selected.card.slug) return null;
                    return (
                      <CardPlane
                        slug=""
                        width={w}
                        height={h}
                        rotationZ={rotZToken}
                        interactive={false}
                        textureUrl={def ? tokenTextureUrl(def) : undefined}
                        forceTextureUrl
                      />
                    );
                  } catch {}
                }
                const isSite = (selected.card.type || "").toLowerCase().includes("site");
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
                    const key = c.slug.split(":")[1]?.toLowerCase();
                    const def = key ? TOKEN_BY_KEY[key] : undefined;
                    if (def && def.size === "small") {
                      w = CARD_SHORT * 0.5;
                      h = CARD_LONG * 0.5;
                    }
                    const ownerRotToken =
                      dragFromPile?.who === "p1" ? 0 : Math.PI;
                    const rotZToken =
                      ownerRotToken +
                      (def && def.siteReplacement ? -Math.PI / 2 : 0);
                    return (
                      <CardPlane
                        slug=""
                        width={w}
                        height={h}
                        rotationZ={rotZToken}
                        interactive={false}
                        textureUrl={def ? tokenTextureUrl(def) : undefined}
                        forceTextureUrl
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

      {/* Local ghost while dragging permanents or avatars on the board */}
      {(dragFromHand || dragFromPile || (USE_GHOST_ONLY_BOARD_DRAG && (dragging || dragAvatar))) && (
        <group
          ref={boardGhostRef}
          position={[lastBoardGhostPosRef.current.x, 0.26, lastBoardGhostPosRef.current.z]}
        >
          {(() => {
            if (dragAvatar) {
              const who = dragAvatar;
              const a = avatars?.[who];
              const active = a?.card;
              const ownerRot = who === "p1" ? 0 : Math.PI;
              const rotZ = ownerRot + (a?.tapped ? Math.PI / 2 : 0);
              const slug = active?.slug || "";
              if (!slug) return null;
              return (
                <>
                  <CardOutline
                    width={CARD_SHORT}
                    height={CARD_LONG}
                    rotationZ={rotZ}
                    elevation={0.0001}
                    color={who === "p1" ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2}
                    renderOrder={1000}
                  />
                  <CardPlane
                    slug={slug}
                    width={CARD_SHORT}
                    height={CARD_LONG}
                    rotationZ={rotZ}
                    interactive={false}
                  />
                </>
              );
            }
            if (dragging) {
              const list = permanents[dragging.from] || [];
              const p = list[dragging.index];
              if (!p || !p.card) return null;
              const isToken = (p.card.type || "").toLowerCase().includes("token");
              const tokenDef = isToken
                ? TOKEN_BY_NAME[(p.card.name || "").toLowerCase()]
                : undefined;
              let w = CARD_SHORT;
              let h = CARD_LONG;
              if (isToken && tokenDef?.size === "small") {
                w = CARD_SHORT * 0.5;
                h = CARD_LONG * 0.5;
              }
              const ownerRot = p.owner === 1 ? 0 : Math.PI;
              const rotZ =
                ownerRot +
                (tokenDef?.siteReplacement ? -Math.PI / 2 : 0) +
                (p.tapped ? Math.PI / 2 : 0) +
                (p.tilt || 0);
              const slug = isToken ? "" : p.card.slug || "";
              const textureUrl = isToken && tokenDef ? tokenTextureUrl(tokenDef) : undefined;
              const glowW = w;
              const glowH = h;
              const glowColor = p.owner === 1 ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2;
              return (
                <>
                  <CardOutline
                    width={glowW}
                    height={glowH}
                    rotationZ={rotZ}
                    elevation={0.0001}
                    color={glowColor}
                    renderOrder={1000}
                  />
                  <CardPlane
                    slug={slug}
                    width={w}
                    height={h}
                    rotationZ={rotZ}
                    interactive={false}
                    textureUrl={textureUrl}
                    textureRotation={tokenDef?.textureRotation ?? 0}
                  />
                </>
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
              const { token, targetPermanent, dropCoords, fromPile, pileInfo } =
                attachmentDialog;

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
                  if (
                    (item.card.type || "").toLowerCase().includes("token") &&
                    (item.card.name || "").toLowerCase() ===
                      ((token as CardRef).name || "").toLowerCase() &&
                    !item.attachedTo
                  ) {
                    tokenIndex = i;
                    break;
                  }
                }

                if (tokenIndex >= 0) {
                  // Use the store's attach action
                  const store = useGameStore.getState();
                  if (store.attachTokenToPermanent) {
                    store.attachTokenToPermanent(
                      dropKey,
                      tokenIndex,
                      targetPermanent.index
                    );
                  }
                }
              }, 200); // Increase timeout slightly for better reliability

              setAttachmentDialog(null);
              try {
                playCardPlay();
              } catch {}
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
              try {
                playCardPlay();
              } catch {}
            }}
          />
        </Html>
      )}
    </group>
  );
}
