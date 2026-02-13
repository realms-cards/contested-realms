"use client";

import { useFrame } from "@react-three/fiber";
import { useXR, useXRInputSourceState } from "@react-three/xr";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

export interface PinchState {
  isPinching: boolean;
  hand: "left" | "right";
  position: THREE.Vector3;
  strength: number;
}

interface VRHandTrackingProps {
  onPinchStart?: (hand: "left" | "right", position: THREE.Vector3) => void;
  onPinchEnd?: (hand: "left" | "right", position: THREE.Vector3) => void;
  onPinchMove?: (hand: "left" | "right", position: THREE.Vector3) => void;
  /** Pinch threshold (0-1), lower = easier to trigger */
  pinchThreshold?: number;
}

/**
 * VR Hand Tracking component that detects pinch gestures.
 * Uses the index finger tip and thumb tip positions to detect pinch.
 */
export function VRHandTracking({
  onPinchStart,
  onPinchEnd,
  onPinchMove,
  pinchThreshold = 0.02,
}: VRHandTrackingProps) {
  const session = useXR((state) => state.session);
  const leftHand = useXRInputSourceState("hand", "left");
  const rightHand = useXRInputSourceState("hand", "right");

  const [leftPinching, setLeftPinching] = useState(false);
  const [rightPinching, setRightPinching] = useState(false);

  const lastLeftPinchPos = useRef(new THREE.Vector3());
  const lastRightPinchPos = useRef(new THREE.Vector3());

  // Get pinch position (midpoint between thumb and index finger)
  const getPinchPosition = useCallback(
    (hand: "left" | "right"): THREE.Vector3 | null => {
      const handState = hand === "left" ? leftHand : rightHand;
      if (!handState?.object) return null;

      // In @react-three/xr, hand joints can be accessed via the hand's object children
      // The index-finger-tip and thumb-tip are standard XRHandJoint names
      const indexTip = handState.object.getObjectByName("index-finger-tip");
      const thumbTip = handState.object.getObjectByName("thumb-tip");

      if (!indexTip || !thumbTip) return null;

      const indexPos = new THREE.Vector3();
      const thumbPos = new THREE.Vector3();
      indexTip.getWorldPosition(indexPos);
      thumbTip.getWorldPosition(thumbPos);

      // Return midpoint
      return indexPos.clone().add(thumbPos).multiplyScalar(0.5);
    },
    [leftHand, rightHand],
  );

  // Get distance between thumb and index finger
  const getPinchDistance = useCallback(
    (hand: "left" | "right"): number => {
      const handState = hand === "left" ? leftHand : rightHand;
      if (!handState?.object) return Infinity;

      const indexTip = handState.object.getObjectByName("index-finger-tip");
      const thumbTip = handState.object.getObjectByName("thumb-tip");

      if (!indexTip || !thumbTip) return Infinity;

      const indexPos = new THREE.Vector3();
      const thumbPos = new THREE.Vector3();
      indexTip.getWorldPosition(indexPos);
      thumbTip.getWorldPosition(thumbPos);

      return indexPos.distanceTo(thumbPos);
    },
    [leftHand, rightHand],
  );

  // Check for pinch gestures each frame
  useFrame(() => {
    if (!session) return;

    // Check left hand
    if (leftHand?.object) {
      const distance = getPinchDistance("left");
      const isPinching = distance < pinchThreshold;

      if (isPinching && !leftPinching) {
        // Pinch started
        const pos = getPinchPosition("left");
        if (pos) {
          lastLeftPinchPos.current.copy(pos);
          setLeftPinching(true);
          onPinchStart?.("left", pos);
        }
      } else if (!isPinching && leftPinching) {
        // Pinch ended
        const pos = getPinchPosition("left") ?? lastLeftPinchPos.current;
        setLeftPinching(false);
        onPinchEnd?.("left", pos);
      } else if (isPinching && leftPinching) {
        // Pinch ongoing
        const pos = getPinchPosition("left");
        if (pos) {
          lastLeftPinchPos.current.copy(pos);
          onPinchMove?.("left", pos);
        }
      }
    }

    // Check right hand
    if (rightHand?.object) {
      const distance = getPinchDistance("right");
      const isPinching = distance < pinchThreshold;

      if (isPinching && !rightPinching) {
        // Pinch started
        const pos = getPinchPosition("right");
        if (pos) {
          lastRightPinchPos.current.copy(pos);
          setRightPinching(true);
          onPinchStart?.("right", pos);
        }
      } else if (!isPinching && rightPinching) {
        // Pinch ended
        const pos = getPinchPosition("right") ?? lastRightPinchPos.current;
        setRightPinching(false);
        onPinchEnd?.("right", pos);
      } else if (isPinching && rightPinching) {
        // Pinch ongoing
        const pos = getPinchPosition("right");
        if (pos) {
          lastRightPinchPos.current.copy(pos);
          onPinchMove?.("right", pos);
        }
      }
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    const leftPos = lastLeftPinchPos.current.clone();
    const rightPos = lastRightPinchPos.current.clone();
    return () => {
      if (leftPinching) {
        onPinchEnd?.("left", leftPos);
      }
      if (rightPinching) {
        onPinchEnd?.("right", rightPos);
      }
    };
  }, [leftPinching, rightPinching, onPinchEnd]);

  return null;
}

/**
 * Hook for using hand tracking pinch detection
 */
export function useHandPinch(hand: "left" | "right"): PinchState | null {
  const handState = useXRInputSourceState("hand", hand);
  const [pinchState, setPinchState] = useState<PinchState | null>(null);

  useFrame(() => {
    if (!handState?.object) {
      if (pinchState !== null) setPinchState(null);
      return;
    }

    const indexTip = handState.object.getObjectByName("index-finger-tip");
    const thumbTip = handState.object.getObjectByName("thumb-tip");

    if (!indexTip || !thumbTip) {
      if (pinchState !== null) setPinchState(null);
      return;
    }

    const indexPos = new THREE.Vector3();
    const thumbPos = new THREE.Vector3();
    indexTip.getWorldPosition(indexPos);
    thumbTip.getWorldPosition(thumbPos);

    const distance = indexPos.distanceTo(thumbPos);
    const isPinching = distance < 0.02;
    const strength = Math.max(0, 1 - distance / 0.05);
    const position = indexPos.clone().add(thumbPos).multiplyScalar(0.5);

    setPinchState({
      isPinching,
      hand,
      position,
      strength,
    });
  });

  return pinchState;
}

export default VRHandTracking;
