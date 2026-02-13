"use client";

import { createXRStore } from "@react-three/xr";

/**
 * Global XR store for managing VR/AR sessions.
 * Created once and shared across the application.
 */
export const xrStore = createXRStore({
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
  // Configure controller with grab and ray pointers
  controller: {
    teleportPointer: false,
    rayPointer: true,
    grabPointer: {
      // Grip button grab radius
      radius: 0.08,
    },
  },
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
