"use client";

import {
  useXRInputSourceState,
  useXR,
  useXRInputSourceEvent,
} from "@react-three/xr";
import { useCallback } from "react";
import * as THREE from "three";
import { useXRDeviceCapabilities } from "./xrDeviceCapabilities";

interface VRControllersProps {
  onSelect?: (hand: "left" | "right", point: THREE.Vector3 | null) => void;
  onSqueeze?: (hand: "left" | "right", point: THREE.Vector3 | null) => void;
}

/**
 * VR Controllers component that handles input events for VR interactions.
 * Controller models are automatically rendered by the XR component.
 * Squeeze events are only bound on devices that support them (Quest).
 */
export function VRControllers({ onSelect, onSqueeze }: VRControllersProps) {
  const session = useXR((state) => state.session);
  const capabilities = useXRDeviceCapabilities();
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

  // Select events work on all devices (Quest controllers, AVP transient-pointer)
  useXRInputSourceEvent(leftController?.inputSource, "select", handleSelect, [
    handleSelect,
  ]);

  useXRInputSourceEvent(rightController?.inputSource, "select", handleSelect, [
    handleSelect,
  ]);

  // Squeeze events only on devices that support them — pass undefined to disable
  const leftSqueezeSource = capabilities.hasSqueeze
    ? leftController?.inputSource
    : undefined;
  const rightSqueezeSource = capabilities.hasSqueeze
    ? rightController?.inputSource
    : undefined;

  useXRInputSourceEvent(leftSqueezeSource, "squeeze", handleSqueeze, [
    handleSqueeze,
    leftSqueezeSource,
  ]);

  useXRInputSourceEvent(rightSqueezeSource, "squeeze", handleSqueeze, [
    handleSqueeze,
    rightSqueezeSource,
  ]);

  if (!session) {
    return null;
  }

  return null;
}

export default VRControllers;
