"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useXR, useXRInputSourceState } from "@react-three/xr";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useXRDeviceCapabilities } from "./xrDeviceCapabilities";

interface VRDragState {
  isDragging: boolean;
  cardId: number | null;
  cardSlug: string | null;
  sourceZone: "hand" | "board" | "pile" | null;
  sourceIndex: number | null;
  hand: "left" | "right" | null;
  startPosition: THREE.Vector3 | null;
  currentPosition: THREE.Vector3 | null;
}

interface VRDragBridgeProps {
  onDragStart?: (state: VRDragState) => void;
  onDragMove?: (
    position: THREE.Vector3,
    tileCoords: { row: number; col: number } | null,
  ) => void;
  onDragEnd?: (state: VRDragState, dropPosition: THREE.Vector3) => void;
  onDragCancel?: () => void;
  /** Reference to the board drag controls for integration */
  moveDraggedBody?: (x: number, z: number, lift?: boolean) => void;
  setDragging?: (state: { from: string; index: number } | null) => void;
  /** Board dimensions for tile calculation */
  boardSize?: { width: number; height: number };
  tileSize?: number;
}

/**
 * VR Drag Bridge - Connects VR controller/hand grab events to the existing
 * board drag control system. Supports both Quest controllers and
 * AVP transient-pointer (gaze+pinch).
 */
export function VRDragBridge({
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  moveDraggedBody,
  setDragging,
  boardSize = { width: 7, height: 5 },
  tileSize = 1.0,
}: VRDragBridgeProps) {
  const session = useXR((state) => state.session);
  const { scene, raycaster } = useThree();
  const capabilities = useXRDeviceCapabilities();
  const leftController = useXRInputSourceState("controller", "left");
  const rightController = useXRInputSourceState("controller", "right");

  const [dragState, setDragState] = useState<VRDragState>({
    isDragging: false,
    cardId: null,
    cardSlug: null,
    sourceZone: null,
    sourceIndex: null,
    hand: null,
    startPosition: null,
    currentPosition: null,
  });

  const lastHapticTime = useRef(0);
  const lastValidTile = useRef<{ row: number; col: number } | null>(null);

  // Get controller world position
  const getControllerPosition = useCallback(
    (hand: "left" | "right"): THREE.Vector3 | null => {
      const controller = hand === "left" ? leftController : rightController;
      if (!controller?.object) return null;

      const position = new THREE.Vector3();
      controller.object.getWorldPosition(position);
      return position;
    },
    [leftController, rightController],
  );

  // Get position from transient-pointer input source via XR frame
  const getTransientPointerPosition = useCallback(
    (gl: THREE.WebGLRenderer): THREE.Vector3 | null => {
      const xrManager = gl.xr;
      const xrSession = xrManager.getSession();
      const refSpace = xrManager.getReferenceSpace();
      if (!xrSession || !refSpace) return null;

      const frame = xrManager.getFrame?.();
      if (!frame) return null;

      for (const source of xrSession.inputSources) {
        if (source.targetRayMode === "transient-pointer") {
          const pose = frame.getPose(source.targetRaySpace, refSpace);
          if (pose) {
            return new THREE.Vector3(
              pose.transform.position.x,
              pose.transform.position.y,
              pose.transform.position.z,
            );
          }
        }
      }
      return null;
    },
    [],
  );

  // Convert world position to board tile
  const worldToTile = useCallback(
    (
      worldPos: THREE.Vector3,
    ): { row: number; col: number; x: number; z: number } | null => {
      const playmat = scene.getObjectByName("playmat-mesh");
      if (!playmat) return null;

      const playmatWorld = new THREE.Vector3();
      playmat.getWorldPosition(playmatWorld);

      const relX = worldPos.x - playmatWorld.x;
      const relZ = worldPos.z - playmatWorld.z;

      const halfWidth = (boardSize.width * tileSize) / 2;
      const halfHeight = (boardSize.height * tileSize) / 2;

      if (
        relX < -halfWidth ||
        relX > halfWidth ||
        relZ < -halfHeight ||
        relZ > halfHeight
      ) {
        return null;
      }

      const col = Math.floor((relX + halfWidth) / tileSize);
      const row = Math.floor((relZ + halfHeight) / tileSize);

      const clampedCol = Math.max(0, Math.min(boardSize.width - 1, col));
      const clampedRow = Math.max(0, Math.min(boardSize.height - 1, row));

      const tileX =
        playmatWorld.x - halfWidth + clampedCol * tileSize + tileSize / 2;
      const tileZ =
        playmatWorld.z - halfHeight + clampedRow * tileSize + tileSize / 2;

      return { row: clampedRow, col: clampedCol, x: tileX, z: tileZ };
    },
    [scene, boardSize.width, boardSize.height, tileSize],
  );

  // Find card under controller ray
  const findCardUnderRay = useCallback(
    (
      hand: "left" | "right",
    ): {
      cardId: number;
      slug: string;
      zone: string;
      index: number;
    } | null => {
      const controller = hand === "left" ? leftController : rightController;
      if (!controller?.object) return null;

      // Get ray direction from controller
      const origin = new THREE.Vector3();
      const direction = new THREE.Vector3(0, 0, -1);
      controller.object.getWorldPosition(origin);
      controller.object.getWorldDirection(direction);

      raycaster.set(origin, direction);

      // Find all intersectable objects with card data
      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const intersect of intersects) {
        const userData = intersect.object.userData as {
          cardId?: number;
          slug?: string;
          zone?: string;
          index?: number;
        };

        if (userData.cardId && userData.slug) {
          return {
            cardId: userData.cardId,
            slug: userData.slug,
            zone: userData.zone ?? "board",
            index: userData.index ?? 0,
          };
        }
      }

      return null;
    },
    [leftController, rightController, raycaster, scene],
  );

  // Trigger haptic feedback (no-op on devices without haptics)
  const triggerHaptic = useCallback(
    (
      hand: "left" | "right",
      intensity: number = 0.5,
      duration: number = 50,
    ) => {
      if (!capabilities.hasHaptics) return;

      const now = Date.now();
      if (now - lastHapticTime.current < 50) return;
      lastHapticTime.current = now;

      const controller = hand === "left" ? leftController : rightController;
      const gamepad = controller?.inputSource?.gamepad;

      if (gamepad?.hapticActuators?.[0]) {
        (gamepad.hapticActuators[0] as GamepadHapticActuator).pulse?.(
          intensity,
          duration,
        );
      }
    },
    [leftController, rightController, capabilities.hasHaptics],
  );

  // Handle grab start (called from pointer events)
  const handleGrabStart = useCallback(
    (hand: "left" | "right") => {
      if (dragState.isDragging) return;

      const card = findCardUnderRay(hand);
      if (!card) return;

      const position = getControllerPosition(hand);
      if (!position) return;

      const newState: VRDragState = {
        isDragging: true,
        cardId: card.cardId,
        cardSlug: card.slug,
        sourceZone: card.zone as "hand" | "board" | "pile",
        sourceIndex: card.index,
        hand,
        startPosition: position.clone(),
        currentPosition: position.clone(),
      };

      setDragState(newState);
      triggerHaptic(hand, 0.7, 100);

      // Integrate with existing drag system
      if (setDragging && card.zone === "board") {
        setDragging({ from: `board-${card.cardId}`, index: card.index });
      }

      onDragStart?.(newState);
    },
    [
      dragState.isDragging,
      findCardUnderRay,
      getControllerPosition,
      triggerHaptic,
      setDragging,
      onDragStart,
    ],
  );

  // Handle grab end
  const handleGrabEnd = useCallback(() => {
    if (!dragState.isDragging || !dragState.hand) return;

    const position = getControllerPosition(dragState.hand);
    if (!position) {
      onDragCancel?.();
      setDragState({
        isDragging: false,
        cardId: null,
        cardSlug: null,
        sourceZone: null,
        sourceIndex: null,
        hand: null,
        startPosition: null,
        currentPosition: null,
      });
      return;
    }

    triggerHaptic(dragState.hand, 0.3, 50);

    // Clear drag state in existing system
    if (setDragging) {
      setDragging(null);
    }

    onDragEnd?.(dragState, position);

    setDragState({
      isDragging: false,
      cardId: null,
      cardSlug: null,
      sourceZone: null,
      sourceIndex: null,
      hand: null,
      startPosition: null,
      currentPosition: null,
    });
  }, [
    dragState,
    getControllerPosition,
    triggerHaptic,
    setDragging,
    onDragEnd,
    onDragCancel,
  ]);

  // Update drag position each frame
  useFrame((_state) => {
    if (!dragState.isDragging || !dragState.hand) return;

    // Try controller position first (Quest), fall back to transient-pointer (AVP)
    let position = getControllerPosition(dragState.hand);
    if (!position && capabilities.hasTransientPointer) {
      position = getTransientPointerPosition(_state.gl);
    }
    if (!position) return;

    // Update current position
    setDragState((prev) => ({
      ...prev,
      currentPosition: position.clone(),
    }));

    // Calculate tile under current position
    const tile = worldToTile(position);

    // Notify of position change
    onDragMove?.(position, tile ? { row: tile.row, col: tile.col } : null);

    // Integrate with physics-based drag
    if (moveDraggedBody && tile) {
      moveDraggedBody(tile.x, tile.z, true);
    }

    // Haptic feedback when entering new tile
    if (
      tile &&
      (!lastValidTile.current ||
        tile.row !== lastValidTile.current.row ||
        tile.col !== lastValidTile.current.col)
    ) {
      lastValidTile.current = { row: tile.row, col: tile.col };
      triggerHaptic(dragState.hand, 0.15, 30);
    }
  });

  // Listen for controller/session events
  useEffect(() => {
    if (!session) return;

    const handleSelectStart = (event: XRInputSourceEvent) => {
      const hand =
        event.inputSource.handedness === "left" ? "left" : ("right" as const);
      handleGrabStart(hand);
    };

    const handleSelectEnd = () => {
      handleGrabEnd();
    };

    session.addEventListener("selectstart", handleSelectStart);
    session.addEventListener("selectend", handleSelectEnd);

    // Only add squeeze listeners if device supports them (Quest)
    if (capabilities.hasSqueeze) {
      session.addEventListener("squeezestart", handleSelectStart);
      session.addEventListener("squeezeend", handleSelectEnd);
    }

    return () => {
      session.removeEventListener("selectstart", handleSelectStart);
      session.removeEventListener("selectend", handleSelectEnd);
      if (capabilities.hasSqueeze) {
        session.removeEventListener("squeezestart", handleSelectStart);
        session.removeEventListener("squeezeend", handleSelectEnd);
      }
    };
  }, [session, handleGrabStart, handleGrabEnd, capabilities.hasSqueeze]);

  if (!session) {
    return null;
  }

  return null;
}

export type { VRDragState };
export default VRDragBridge;
