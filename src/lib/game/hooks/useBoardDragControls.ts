import { useFrame, useThree } from "@react-three/fiber";
import { useBeforePhysicsStep } from "@react-three/rapier";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Group, Raycaster } from "three";
import { BASE_CARD_ELEVATION, type BodyApi } from "@/lib/game/boardShared";
import { DRAG_LIFT } from "@/lib/game/constants";
import type { GameState, PlayerKey } from "@/lib/game/store/types";

type DragState = { from: string; index: number } | null;
type DragStart = {
  at: string;
  index: number;
  start: [number, number];
  time: number;
};

type PendingSnap = { x: number; z: number; attempts: number; delay: number };

type UseBoardDragControlsOptions = {
  currentPlayer: 1 | 2;
  playTurnGong: () => void;
  dragFromHand: boolean;
  dragFromPile: GameState["dragFromPile"];
  selectedCard: GameState["selectedCard"];
  setDragFromHand: GameState["setDragFromHand"];
  setDragFromPile: GameState["setDragFromPile"];
  setBoardDragActive: GameState["setBoardDragActive"];
  handlePointerMoveRef: MutableRefObject<(x: number, z: number) => void>;
  enableSnap: boolean;
  // Playmat bounds for clamping drag positions
  matBounds: { halfW: number; halfH: number };
};

export type BoardDragControls = {
  dragging: DragState;
  setDragging: Dispatch<SetStateAction<DragState>>;
  dragAvatar: PlayerKey | null;
  setDragAvatar: Dispatch<SetStateAction<PlayerKey | null>>;
  setGhost: Dispatch<SetStateAction<{ x: number; z: number } | null>>;
  dragStartRef: MutableRefObject<DragStart | null>;
  avatarDragStartRef: MutableRefObject<{
    who: PlayerKey;
    start: [number, number];
    time: number;
  } | null>;
  draggingRef: MutableRefObject<DragState>;
  ghostGroupRef: MutableRefObject<Group | null>;
  lastGhostPosRef: MutableRefObject<{ x: number; z: number }>;
  boardGhostRef: MutableRefObject<Group | null>;
  lastBoardGhostPosRef: MutableRefObject<{ x: number; z: number }>;
  bodyMap: MutableRefObject<Map<string, BodyApi>>;
  draggedBody: MutableRefObject<BodyApi | null>;
  bodiesAccessedThisFrame: MutableRefObject<Set<string>>;
  dragTarget: MutableRefObject<{ x: number; z: number; lift: boolean } | null>;
  moveDraggedBody: (x: number, z: number, lift?: boolean) => void;
  snapBodyTo: (id: string, x: number, z: number) => void;
  lastDropAt: MutableRefObject<number>;
};

export function useBoardDragControls({
  currentPlayer,
  playTurnGong,
  dragFromHand,
  dragFromPile,
  selectedCard,
  setDragFromHand,
  setDragFromPile,
  setBoardDragActive,
  handlePointerMoveRef,
  enableSnap,
  matBounds,
}: UseBoardDragControlsOptions): BoardDragControls {
  const [dragging, setDragging] = useState<DragState>(null);
  const [dragAvatar, setDragAvatar] = useState<PlayerKey | null>(null);
  const [, setGhost] = useState<{ x: number; z: number } | null>(null);
  const lastTurnPlayerRef = useRef<number | null>(null);
  const dragStartRef = useRef<DragStart | null>(null);
  const avatarDragStartRef = useRef<{
    who: PlayerKey;
    start: [number, number];
    time: number;
  } | null>(null);
  const draggingRef = useRef<DragState>(null);
  const bodyMap = useRef<Map<string, BodyApi>>(new Map());
  const draggedBody = useRef<BodyApi | null>(null);
  const bodiesAccessedThisFrame = useRef<Set<string>>(new Set());
  const dragTarget = useRef<{ x: number; z: number; lift: boolean } | null>(
    null
  );
  const pendingSnaps = useRef<Map<string, PendingSnap>>(new Map());
  const ghostGroupRef = useRef<Group | null>(null);
  const lastGhostPosRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const boardGhostRef = useRef<Group | null>(null);
  const lastBoardGhostPosRef = useRef<{ x: number; z: number }>({
    x: 0,
    z: 0,
  });
  const lastDropAt = useRef<number>(0);
  const raycasterRef = useRef(new Raycaster());
  const { camera, pointer } = useThree();

  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  // Sync board drag state to store for Hand3D visibility
  useEffect(() => {
    const isActive = Boolean(dragging || dragAvatar);
    setBoardDragActive(isActive);
  }, [dragging, dragAvatar, setBoardDragActive]);

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

  const moveDraggedBody = useCallback((x: number, z: number, lift = true) => {
    dragTarget.current = { x, z, lift };
  }, []);

  const snapBodyTo = useCallback(
    (id: string, x: number, z: number) => {
      if (!enableSnap) {
        if (process.env.NODE_ENV !== "production") {
          console.debug(
            `[snap] disabled ${id} -> x=${Number(x).toFixed(2)} z=${Number(
              z
            ).toFixed(2)}`
          );
        }
        return;
      }
      // Optimized: Single RAF instead of double RAF (was causing 33ms delay)
      requestAnimationFrame(() => {
        const prev = pendingSnaps.current.get(id);
        const attempts = prev ? Math.max(prev.attempts, 8) : 8;
        pendingSnaps.current.set(id, { x, z, attempts, delay: 1 });
        if (process.env.NODE_ENV !== "production") {
          console.debug(
            `[snap] queue ${id} -> x=${Number(x).toFixed(2)} z=${Number(
              z
            ).toFixed(2)}`
          );
        }
      });
    },
    [enableSnap]
  );

  useBeforePhysicsStep(() => {
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
          console.warn("[physics] Failed to move dragged body:", error);
        }
      } finally {
        dragTarget.current = null;
      }
    }

    if (pendingSnaps.current.size > 0) {
      for (const [id, job] of pendingSnaps.current.entries()) {
        if (job.delay && job.delay > 0) {
          pendingSnaps.current.set(id, { ...job, delay: job.delay - 1 });
          continue;
        }
        const snapApi = bodyMap.current.get(id);
        if (!snapApi) {
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
          continue;
        }
        if (bodiesAccessedThisFrame.current.has(id)) {
          if (process.env.NODE_ENV !== "production") {
            console.debug(`[snap] skip-frame-access ${id}`);
          }
          pendingSnaps.current.delete(id);
          continue;
        }
        bodiesAccessedThisFrame.current.add(id);
        if (snapApi === draggedBody.current) {
          if (process.env.NODE_ENV !== "production") {
            console.debug(`[snap] skip-dragged ${id}`);
          }
          pendingSnaps.current.delete(id);
          continue;
        }
        try {
          snapApi.setBodyType("kinematicPosition", false);
          snapApi.setNextKinematicTranslation({
            x: job.x,
            y: BASE_CARD_ELEVATION,
            z: job.z,
          });
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
            console.warn(`[physics] Failed to snap body ${id}:`, error);
          }
        } finally {
          pendingSnaps.current.delete(id);
        }
      }
    }
  });

  useFrame(() => {
    bodiesAccessedThisFrame.current.clear();

    if (
      dragFromHand &&
      !dragAvatar &&
      !dragging &&
      (selectedCard || dragFromPile?.card) &&
      ghostGroupRef.current &&
      camera
    ) {
      try {
        const rc = raycasterRef.current;
        rc.setFromCamera(pointer, camera);
        const { origin, direction } = rc.ray;
        const dy = direction.y;
        if (Math.abs(dy) > 1e-6) {
          const t = -origin.y / dy;
          // Clamp to playmat bounds
          const px = Math.max(
            -matBounds.halfW,
            Math.min(matBounds.halfW, origin.x + direction.x * t)
          );
          const pz = Math.max(
            -matBounds.halfH,
            Math.min(matBounds.halfH, origin.z + direction.z * t)
          );
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

    if ((dragging || dragAvatar) && boardGhostRef.current && camera) {
      try {
        const rc = raycasterRef.current;
        rc.setFromCamera(pointer, camera);
        const { origin, direction } = rc.ray;
        const dy = direction.y;
        if (Math.abs(dy) > 1e-6) {
          const t = -origin.y / dy;
          // Clamp to playmat bounds
          const px = Math.max(
            -matBounds.halfW,
            Math.min(matBounds.halfW, origin.x + direction.x * t)
          );
          const pz = Math.max(
            -matBounds.halfH,
            Math.min(matBounds.halfH, origin.z + direction.z * t)
          );
          handlePointerMoveRef.current(px, pz);
          const k2 = 0.4;
          lastBoardGhostPosRef.current.x +=
            (px - lastBoardGhostPosRef.current.x) * k2;
          lastBoardGhostPosRef.current.z +=
            (pz - lastBoardGhostPosRef.current.z) * k2;
          boardGhostRef.current.position.set(
            lastBoardGhostPosRef.current.x,
            0.26,
            lastBoardGhostPosRef.current.z
          );
        }
      } catch {}
    }
  });

  useEffect(() => {
    const resetState = (reason?: string) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[drag] board reset via ${reason || "unknown"}`);
      }
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

    const onPointerCancel = () => resetState("pointercancel");
    const onBlur = () => resetState("blur");
    const onVisibility = () => {
      if (document.visibilityState !== "visible")
        resetState("visibilitychange");
    };
    const onPageHide = () => resetState("pagehide");

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
  }, [setDragFromHand, setDragFromPile]);

  return {
    dragging,
    setDragging,
    dragAvatar,
    setDragAvatar,
    setGhost,
    dragStartRef,
    avatarDragStartRef,
    draggingRef,
    ghostGroupRef,
    lastGhostPosRef,
    boardGhostRef,
    lastBoardGhostPosRef,
    bodyMap,
    draggedBody,
    bodiesAccessedThisFrame,
    dragTarget,
    moveDraggedBody,
    snapBodyTo,
    lastDropAt,
  };
}
