"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useXR, useXRInputSourceState } from "@react-three/xr";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BASE_TILE_SIZE } from "@/lib/game/constants";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import {
  VRCardHighlight,
  VRDropZone,
  VRTileHighlight,
} from "./VRCardHighlight";
import { VRHandTracking } from "./VRHandTracking";
import { VRRadialMenu, defaultCardMenuItems } from "./VRRadialMenu";

interface VRBoardIntegrationProps {
  /** Current player seat (p1 or p2) */
  viewPlayerKey?: PlayerKey | null;
  /** Whether this is a spectator view */
  isSpectator?: boolean;
  /** Board dimensions */
  boardWidth?: number;
  boardHeight?: number;
  /** Tile size in world units */
  tileSize?: number;
  /** Enable hand tracking pinch gestures */
  enableHandTracking?: boolean;
  /** Enable radial menu for card actions */
  enableRadialMenu?: boolean;
  /** Callback when a card action is selected from radial menu */
  onCardAction?: (action: string, cardId: number) => void;
}

interface VRDragState {
  isDragging: boolean;
  cardId: number | null;
  cardSlug: string | null;
  hand: "left" | "right" | null;
  startPosition: THREE.Vector3 | null;
  currentTile: { row: number; col: number } | null;
}

/**
 * VR Board Integration - Main component that wires up all VR interactions
 * with the game board. This component should be placed inside the Canvas
 * alongside the Board component.
 */
export function VRBoardIntegration({
  viewPlayerKey = "p1",
  isSpectator = false,
  boardWidth = 7,
  boardHeight = 5,
  tileSize = BASE_TILE_SIZE,
  enableHandTracking = true,
  enableRadialMenu = true,
  onCardAction,
}: VRBoardIntegrationProps) {
  const session = useXR((state) => state.session);
  const { scene, raycaster } = useThree();

  const leftController = useXRInputSourceState("controller", "left");
  const rightController = useXRInputSourceState("controller", "right");

  // Local VR drag state
  const [vrDragState, setVrDragState] = useState<VRDragState>({
    isDragging: false,
    cardId: null,
    cardSlug: null,
    hand: null,
    startPosition: null,
    currentTile: null,
  });

  // Hovered card state for highlights
  const [hoveredCard, setHoveredCard] = useState<{
    cardId: number;
    position: THREE.Vector3;
  } | null>(null);

  // Selected card for radial menu
  const [selectedCardForMenu, setSelectedCardForMenu] = useState<number | null>(
    null,
  );

  // Drop zone preview
  const [dropZone, setDropZone] = useState<{
    position: [number, number, number];
    visible: boolean;
  }>({ position: [0, 0, 0], visible: false });

  // Valid drop tiles (for highlighting)
  const [validDropTiles, setValidDropTiles] = useState<
    Array<{ row: number; col: number; x: number; z: number }>
  >([]);

  const lastHapticTime = useRef(0);

  // Connect to game store
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const playSelectedTo = useGameStore((s) => s.playSelectedTo);
  const boardSize = useGameStore((s) => s.board.size);

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

  // Convert world position to board tile
  const worldToTile = useCallback(
    (
      worldPos: THREE.Vector3,
    ): { row: number; col: number; x: number; z: number } | null => {
      const halfWidth = (boardWidth * tileSize) / 2;
      const halfHeight = (boardHeight * tileSize) / 2;

      // Assume board is centered at origin
      const relX = worldPos.x;
      const relZ = worldPos.z;

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

      const clampedCol = Math.max(0, Math.min(boardWidth - 1, col));
      const clampedRow = Math.max(0, Math.min(boardHeight - 1, row));

      const tileCenterX = -halfWidth + clampedCol * tileSize + tileSize / 2;
      const tileCenterZ = -halfHeight + clampedRow * tileSize + tileSize / 2;

      return {
        row: clampedRow,
        col: clampedCol,
        x: tileCenterX,
        z: tileCenterZ,
      };
    },
    [boardWidth, boardHeight, tileSize],
  );

  // Find card under controller ray
  const findCardUnderRay = useCallback(
    (
      hand: "left" | "right",
    ): { cardId: number; slug: string; position: THREE.Vector3 } | null => {
      const controller = hand === "left" ? leftController : rightController;
      if (!controller?.object) return null;

      const origin = new THREE.Vector3();
      const direction = new THREE.Vector3(0, 0, -1);
      controller.object.getWorldPosition(origin);
      controller.object.getWorldDirection(direction);

      raycaster.set(origin, direction);

      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const intersect of intersects) {
        const userData = intersect.object.userData as {
          cardId?: number;
          slug?: string;
        };

        if (userData.cardId && userData.slug) {
          return {
            cardId: userData.cardId,
            slug: userData.slug,
            position: intersect.point.clone(),
          };
        }
      }

      return null;
    },
    [leftController, rightController, raycaster, scene],
  );

  // Trigger haptic feedback
  const triggerHaptic = useCallback(
    (
      hand: "left" | "right",
      intensity: number = 0.5,
      duration: number = 50,
    ) => {
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
    [leftController, rightController],
  );

  // Handle card grab start
  const handleGrabStart = useCallback(
    (hand: "left" | "right") => {
      if (vrDragState.isDragging || isSpectator) return;

      const card = findCardUnderRay(hand);
      if (!card) return;

      const position = getControllerPosition(hand);
      if (!position) return;

      // Set VR drag state
      setVrDragState({
        isDragging: true,
        cardId: card.cardId,
        cardSlug: card.slug,
        hand,
        startPosition: position.clone(),
        currentTile: null,
      });

      // Trigger haptic on grab
      triggerHaptic(hand, 0.7, 100);

      console.log(
        `[VR] Grabbed card ${card.cardId} (${card.slug}) with ${hand} hand`,
      );
    },
    [
      vrDragState.isDragging,
      isSpectator,
      findCardUnderRay,
      getControllerPosition,
      triggerHaptic,
    ],
  );

  // Handle card grab end (drop)
  const handleGrabEnd = useCallback(() => {
    if (!vrDragState.isDragging || !vrDragState.hand || !vrDragState.cardId)
      return;

    const position = getControllerPosition(vrDragState.hand);
    const tile = position ? worldToTile(position) : null;

    if (tile && dragFromHand) {
      // Play card from hand to board (x = col, y = row)
      playSelectedTo(tile.col, tile.row);
      setDragFromHand(false);
      console.log(
        `[VR] Dropped card ${vrDragState.cardId} at tile (${tile.col}, ${tile.row})`,
      );
    }

    triggerHaptic(vrDragState.hand, 0.3, 50);

    // Clear VR drag state
    setVrDragState({
      isDragging: false,
      cardId: null,
      cardSlug: null,
      hand: null,
      startPosition: null,
      currentTile: null,
    });

    // Clear drop zone
    setDropZone({ position: [0, 0, 0], visible: false });
  }, [
    vrDragState,
    getControllerPosition,
    worldToTile,
    dragFromHand,
    playSelectedTo,
    viewPlayerKey,
    setDragFromHand,
    triggerHaptic,
  ]);

  // Handle pinch gesture from hand tracking
  const handlePinchStart = useCallback(
    (hand: "left" | "right", position: THREE.Vector3) => {
      if (isSpectator) return;

      // Use pinch position to find card
      raycaster.set(position, new THREE.Vector3(0, -1, 0)); // Ray downward from pinch
      const intersects = raycaster.intersectObjects(scene.children, true);

      for (const intersect of intersects) {
        const userData = intersect.object.userData as {
          cardId?: number;
          slug?: string;
        };
        if (userData.cardId && userData.slug) {
          setVrDragState({
            isDragging: true,
            cardId: userData.cardId,
            cardSlug: userData.slug,
            hand,
            startPosition: position.clone(),
            currentTile: null,
          });
          console.log(`[VR] Pinch grabbed card ${userData.cardId}`);
          break;
        }
      }
    },
    [isSpectator, raycaster, scene],
  );

  const handlePinchEnd = useCallback(
    (_hand: "left" | "right", position: THREE.Vector3) => {
      if (!vrDragState.isDragging) return;

      const tile = worldToTile(position);
      if (tile && vrDragState.cardId) {
        playSelectedTo(tile.col, tile.row);
        console.log(`[VR] Pinch dropped card at (${tile.col}, ${tile.row})`);
      }

      setVrDragState({
        isDragging: false,
        cardId: null,
        cardSlug: null,
        hand: null,
        startPosition: null,
        currentTile: null,
      });
      setDropZone({ position: [0, 0, 0], visible: false });
    },
    [vrDragState, worldToTile, playSelectedTo],
  );

  // Handle radial menu action
  const handleMenuAction = useCallback(
    (actionId: string) => {
      if (selectedCardForMenu === null) return;

      console.log(
        `[VR] Card action: ${actionId} on card ${selectedCardForMenu}`,
      );
      onCardAction?.(actionId, selectedCardForMenu);

      // Handle built-in actions via callbacks
      // The actual action handling is delegated to the parent component
      // via onCardAction callback since game state methods vary

      setSelectedCardForMenu(null);
    },
    [selectedCardForMenu, onCardAction],
  );

  // Update hover state and drop zone each frame
  useFrame(() => {
    if (!session) return;

    // Check for hovered cards
    for (const hand of ["left", "right"] as const) {
      const card = findCardUnderRay(hand);
      if (card && !vrDragState.isDragging) {
        setHoveredCard({ cardId: card.cardId, position: card.position });
        break;
      } else if (!card) {
        setHoveredCard(null);
      }
    }

    // Update drop zone during drag
    if (vrDragState.isDragging && vrDragState.hand) {
      const position = getControllerPosition(vrDragState.hand);
      if (position) {
        const tile = worldToTile(position);
        if (tile) {
          setDropZone({
            position: [tile.x, 0.01, tile.z],
            visible: true,
          });

          // Update current tile and trigger haptic on tile change
          if (
            !vrDragState.currentTile ||
            vrDragState.currentTile.row !== tile.row ||
            vrDragState.currentTile.col !== tile.col
          ) {
            setVrDragState((prev) => ({
              ...prev,
              currentTile: { row: tile.row, col: tile.col },
            }));
            if (vrDragState.hand) triggerHaptic(vrDragState.hand, 0.15, 30);
          }
        } else {
          setDropZone({ position: [0, 0, 0], visible: false });
        }
      }
    }
  });

  // Listen for XR controller events
  useEffect(() => {
    if (!session) return;

    const handleSelectStart = (event: XRInputSourceEvent) => {
      const hand = event.inputSource.handedness === "left" ? "left" : "right";
      handleGrabStart(hand);
    };

    const handleSelectEnd = () => {
      handleGrabEnd();
    };

    const handleSqueezeStart = (_event: XRInputSourceEvent) => {
      // Squeeze opens radial menu on hovered card
      if (hoveredCard && !vrDragState.isDragging) {
        setSelectedCardForMenu(hoveredCard.cardId);
      }
    };

    session.addEventListener("selectstart", handleSelectStart);
    session.addEventListener("selectend", handleSelectEnd);
    session.addEventListener("squeezestart", handleSqueezeStart);

    return () => {
      session.removeEventListener("selectstart", handleSelectStart);
      session.removeEventListener("selectend", handleSelectEnd);
      session.removeEventListener("squeezestart", handleSqueezeStart);
    };
  }, [
    session,
    handleGrabStart,
    handleGrabEnd,
    hoveredCard,
    vrDragState.isDragging,
  ]);

  // Calculate valid drop tiles based on game state
  useEffect(() => {
    if (!vrDragState.isDragging) {
      setValidDropTiles([]);
      return;
    }

    // Highlight all tiles within board bounds as potential drop zones
    const validTiles: Array<{
      row: number;
      col: number;
      x: number;
      z: number;
    }> = [];
    const bw = boardSize.w;
    const bh = boardSize.h;
    const halfWidth = (bw * tileSize) / 2;
    const halfHeight = (bh * tileSize) / 2;

    for (let row = 0; row < bh; row++) {
      for (let col = 0; col < bw; col++) {
        const x = -halfWidth + col * tileSize + tileSize / 2;
        const z = -halfHeight + row * tileSize + tileSize / 2;
        validTiles.push({ row, col, x, z });
      }
    }

    setValidDropTiles(validTiles);
  }, [vrDragState.isDragging, boardSize.w, boardSize.h, tileSize]);

  // Don't render anything if not in VR
  if (!session) {
    return null;
  }

  return (
    <group name="vr-board-integration">
      {/* Hand tracking for pinch gestures */}
      {enableHandTracking && (
        <VRHandTracking
          onPinchStart={handlePinchStart}
          onPinchEnd={handlePinchEnd}
        />
      )}

      {/* Card hover highlight */}
      {hoveredCard && !vrDragState.isDragging && (
        <group position={hoveredCard.position.toArray()}>
          <VRCardHighlight isHovered />
        </group>
      )}

      {/* Drop zone preview */}
      <VRDropZone position={dropZone.position} visible={dropZone.visible} />

      {/* Valid drop tile highlights */}
      {vrDragState.isDragging &&
        validDropTiles.map((tile) => (
          <VRTileHighlight
            key={`${tile.row}-${tile.col}`}
            position={[tile.x, 0.005, tile.z]}
            isValid
            isHovered={
              vrDragState.currentTile?.row === tile.row &&
              vrDragState.currentTile?.col === tile.col
            }
            size={tileSize}
          />
        ))}

      {/* Radial menu for card actions */}
      {enableRadialMenu && selectedCardForMenu !== null && (
        <VRRadialMenu
          items={defaultCardMenuItems}
          onSelect={handleMenuAction}
          onClose={() => setSelectedCardForMenu(null)}
          controlHand="right"
        />
      )}
    </group>
  );
}

export default VRBoardIntegration;
