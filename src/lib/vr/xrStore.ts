"use client";

import { createXRStore } from "@react-three/xr";

/**
 * Global XR store for managing VR/AR sessions.
 * Created once and shared across the application.
 */
export const xrStore = createXRStore({
  // Optional: Configure hand tracking
  hand: {
    teleportPointer: false,
    rayPointer: true,
  },
  // Optional: Configure controller defaults
  controller: {
    teleportPointer: false,
    rayPointer: true,
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
