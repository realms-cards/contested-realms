"use client";

import { useXR, useXRInputSourceState } from "@react-three/xr";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useXRDeviceCapabilities } from "./xrDeviceCapabilities";

export interface VRGrabState {
  isGrabbing: boolean;
  grabbedCardId: number | null;
  grabHand: "left" | "right" | null;
  grabPosition: THREE.Vector3 | null;
  grabStartTime: number;
}

interface VRCardInteractionProps {
  onCardGrab?: (cardId: number, hand: "left" | "right") => void;
  onCardRelease?: (cardId: number, position: THREE.Vector3) => void;
  onCardHover?: (cardId: number | null) => void;
}

/**
 * VR Card Interaction component that handles card grabbing and manipulation
 * in VR mode using both controllers and hand tracking.
 *
 * Supports:
 * - Controller grip button for grabbing
 * - Hand pinch gesture for grabbing
 * - Haptic feedback on grab/release
 * - Card movement tracking
 */
export function VRCardInteraction({
  onCardGrab,
  onCardRelease,
  onCardHover,
}: VRCardInteractionProps) {
  const session = useXR((state) => state.session);
  const capabilities = useXRDeviceCapabilities();
  const leftController = useXRInputSourceState("controller", "left");
  const rightController = useXRInputSourceState("controller", "right");
  const _leftHand = useXRInputSourceState("hand", "left");
  const _rightHand = useXRInputSourceState("hand", "right");

  const [grabState, setGrabState] = useState<VRGrabState>({
    isGrabbing: false,
    grabbedCardId: null,
    grabHand: null,
    grabPosition: null,
    grabStartTime: 0,
  });

  const hoveredCardRef = useRef<number | null>(null);
  const lastHapticTime = useRef<number>(0);

  // Trigger haptic feedback (no-op on devices without haptics)
  const triggerHaptic = useCallback(
    (
      hand: "left" | "right",
      intensity: number = 0.5,
      duration: number = 50,
    ) => {
      if (!capabilities.hasHaptics) return;

      const now = Date.now();
      // Debounce haptics
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

  // Handle card grab start (exported via context for use in card components)
  const _handleGrabStart = useCallback(
    (cardId: number, hand: "left" | "right", position: THREE.Vector3) => {
      setGrabState({
        isGrabbing: true,
        grabbedCardId: cardId,
        grabHand: hand,
        grabPosition: position.clone(),
        grabStartTime: Date.now(),
      });

      // Haptic feedback on grab
      triggerHaptic(hand, 0.7, 100);

      onCardGrab?.(cardId, hand);
    },
    [onCardGrab, triggerHaptic],
  );

  // Handle card release (exported via context for use in card components)
  const _handleGrabEnd = useCallback(
    (position: THREE.Vector3) => {
      if (grabState.grabbedCardId !== null && grabState.grabHand) {
        // Haptic feedback on release
        triggerHaptic(grabState.grabHand, 0.3, 50);

        onCardRelease?.(grabState.grabbedCardId, position);
      }

      setGrabState({
        isGrabbing: false,
        grabbedCardId: null,
        grabHand: null,
        grabPosition: null,
        grabStartTime: 0,
      });
    },
    [grabState.grabbedCardId, grabState.grabHand, onCardRelease, triggerHaptic],
  );

  // Handle card hover (exported via context for use in card components)
  const _handleCardHover = useCallback(
    (cardId: number | null) => {
      if (hoveredCardRef.current !== cardId) {
        hoveredCardRef.current = cardId;
        onCardHover?.(cardId);

        // Light haptic on hover
        if (cardId !== null && grabState.grabHand) {
          triggerHaptic(grabState.grabHand, 0.1, 20);
        }
      }
    },
    [onCardHover, grabState.grabHand, triggerHaptic],
  );

  // Log grab state changes for debugging
  useEffect(() => {
    if (grabState.isGrabbing) {
      console.log("[VR] Card grabbed:", grabState.grabbedCardId);
    }
  }, [grabState.isGrabbing, grabState.grabbedCardId]);

  if (!session) {
    return null;
  }

  return null;
}

/**
 * Hook for accessing VR grab state in other components
 */
export function useVRGrabState(): VRGrabState {
  const [state, _setState] = useState<VRGrabState>({
    isGrabbing: false,
    grabbedCardId: null,
    grabHand: null,
    grabPosition: null,
    grabStartTime: 0,
  });

  return state;
}

export default VRCardInteraction;
