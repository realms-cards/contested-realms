"use client";

import type {
  XRInputSourceState,
  XRControllerState,
} from "@pmndrs/xr/internals";
import { useXR, useXRInputSourceStates } from "@react-three/xr";
import { useMemo } from "react";

/**
 * Runtime-detected XR device capabilities.
 * Derived from live input source states — works for Quest, AVP, and future devices.
 */
export interface XRDeviceCapabilities {
  /** Device has physical controllers (Quest, Index, etc.) */
  hasControllers: boolean;
  /** Device supports squeeze/grip events */
  hasSqueeze: boolean;
  /** Device has thumbstick input */
  hasThumbstick: boolean;
  /** Device supports haptic feedback */
  hasHaptics: boolean;
  /** Device uses transient-pointer (AVP gaze+pinch) */
  hasTransientPointer: boolean;
  /** Device has hand tracking available */
  hasHandTracking: boolean;
  /** Detected device family */
  device: "quest" | "visionpro" | "generic";
}

const DEFAULT_CAPABILITIES: XRDeviceCapabilities = {
  hasControllers: false,
  hasSqueeze: false,
  hasThumbstick: false,
  hasHaptics: false,
  hasTransientPointer: false,
  hasHandTracking: false,
  device: "generic",
};

/**
 * Derive device capabilities from an array of XR input source states.
 */
function deriveCapabilities(
  sources: ReadonlyArray<XRInputSourceState>,
): XRDeviceCapabilities {
  if (sources.length === 0) return DEFAULT_CAPABILITIES;

  let hasControllers = false;
  let hasSqueeze = false;
  let hasThumbstick = false;
  let hasHaptics = false;
  let hasTransientPointer = false;
  let hasHandTracking = false;

  for (const source of sources) {
    if (source.type === "controller") {
      hasControllers = true;
      const controllerSource = source as XRControllerState;
      const gamepad = controllerSource.inputSource.gamepad;
      if (gamepad) {
        if ((gamepad.buttons?.length ?? 0) > 1) hasSqueeze = true;
        if ((gamepad.axes?.length ?? 0) >= 4) hasThumbstick = true;
        if ((gamepad.hapticActuators?.length ?? 0) > 0) hasHaptics = true;
      }
    } else if (source.type === "transientPointer") {
      hasTransientPointer = true;
    } else if (source.type === "hand") {
      hasHandTracking = true;
    }
  }

  const device: XRDeviceCapabilities["device"] =
    hasTransientPointer && !hasControllers
      ? "visionpro"
      : hasControllers
        ? "quest"
        : "generic";

  return {
    hasControllers,
    hasSqueeze,
    hasThumbstick,
    hasHaptics,
    hasTransientPointer,
    hasHandTracking,
    device,
  };
}

/**
 * Hook that reactively detects XR device capabilities from live input sources.
 * Returns stable capabilities that only change when source types change.
 *
 * Must be called inside a React Three Fiber canvas with an XR session.
 */
export function useXRDeviceCapabilities(): XRDeviceCapabilities {
  const session = useXR((state) => state.session);
  const inputSourceStates = useXRInputSourceStates();

  // Build a stable key from source types to avoid re-deriving on every render
  const sourceTypeKey = inputSourceStates.map((s) => s.type).join(",");

  return useMemo(() => {
    if (!session) return DEFAULT_CAPABILITIES;
    return deriveCapabilities(inputSourceStates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, sourceTypeKey]);
}
