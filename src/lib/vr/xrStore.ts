"use client";

import { createXRStore } from "@react-three/xr";

/**
 * Global XR store for managing VR/AR sessions.
 * Created once and shared across the application.
 */
export const xrStore = createXRStore({
  // Disable default Enter XR button and emulator - we use our own VREntryButton in MatchInfoPopup
  emulate: false,
  // Request hand tracking (no-op on Quest, enables AVP hand joint permission prompt)
  handTracking: true,
  // Configure hand tracking with grab and touch pointers for card interactions
  hand: {
    teleportPointer: false,
    rayPointer: true,
    grabPointer: {
      // Pinch gesture radius for grabbing cards
      radius: 0.05,
    },
    touchPointer: {
      // Finger tip touch for tapping cards
      hoverRadius: 0.03,
      downRadius: 0.01,
    },
  },
  // Configure controller with grab and ray pointers (Quest, Index, etc.)
  controller: {
    teleportPointer: false,
    rayPointer: true,
    grabPointer: {
      // Grip button grab radius
      radius: 0.08,
    },
  },
  // Enable transient-pointer for Apple Vision Pro gaze+pinch interaction
  transientPointer: true,
});

/**
 * Check if WebXR is supported in the current browser
 */
export async function isXRSupported(): Promise<{
  vr: boolean;
  ar: boolean;
}> {
  if (typeof navigator === "undefined" || !navigator.xr) {
    return { vr: false, ar: false };
  }

  const [vr, ar] = await Promise.all([
    navigator.xr.isSessionSupported("immersive-vr").catch(() => false),
    navigator.xr.isSessionSupported("immersive-ar").catch(() => false),
  ]);

  return { vr, ar };
}

/**
 * Enter VR mode
 */
export function enterVR() {
  return xrStore.enterVR();
}

/**
 * Enter AR mode
 */
export function enterAR() {
  return xrStore.enterAR();
}
