"use client";

import {
  useXRInputSourceState,
  useXR,
  useXRInputSourceEvent,
} from "@react-three/xr";
import { useCallback } from "react";
import * as THREE from "three";

interface VRControllersProps {
  onSelect?: (hand: "left" | "right", point: THREE.Vector3 | null) => void;
  onSqueeze?: (hand: "left" | "right", point: THREE.Vector3 | null) => void;
}

/**
 * VR Controllers component that handles input events for VR interactions.
 * Controller models are automatically rendered by the XR component.
 * This component provides callback hooks for select/squeeze events.
 */
export function VRControllers({ onSelect, onSqueeze }: VRControllersProps) {
  const session = useXR((state) => state.session);
  const leftController = useXRInputSourceState("controller", "left");
  const rightController = useXRInputSourceState("controller", "right");

  const handleSelect = useCallback(
    (event: XRInputSourceEvent) => {
      if (!onSelect) return;
      const hand = event.inputSource.handedness === "left" ? "left" : "right";
      onSelect(hand, null);
    },
    [onSelect],
  );

  const handleSqueeze = useCallback(
    (event: XRInputSourceEvent) => {
      if (!onSqueeze) return;
      const hand = event.inputSource.handedness === "left" ? "left" : "right";
      onSqueeze(hand, null);
    },
    [onSqueeze],
  );

  useXRInputSourceEvent(leftController?.inputSource, "select", handleSelect, [
    handleSelect,
  ]);

  useXRInputSourceEvent(rightController?.inputSource, "select", handleSelect, [
    handleSelect,
  ]);

  useXRInputSourceEvent(leftController?.inputSource, "squeeze", handleSqueeze, [
    handleSqueeze,
  ]);

  useXRInputSourceEvent(
    rightController?.inputSource,
    "squeeze",
    handleSqueeze,
    [handleSqueeze],
  );

  if (!session) {
    return null;
  }

  return null;
}

export default VRControllers;
