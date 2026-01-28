"use client";

import { Physics as BasePhysics } from "@react-three/rapier";
import type { ComponentProps } from "react";

let initPromise: Promise<void> | null = null;

function ensureRapierInit(): Promise<void> {
  if (initPromise) {
    return initPromise;
  }
  if (typeof window === "undefined") {
    initPromise = Promise.resolve();
    return initPromise;
  }
  initPromise = import("@dimforge/rapier3d-compat")
    .then(async (module) => {
      // Call init() with no parameters as per the new API
      // The function signature is: init(): Promise<void>
      if (typeof module?.init === "function") {
        await module.init();
      } else if (
        typeof (module as unknown as { default?: unknown }).default ===
        "function"
      ) {
        // If default export is the init function, call it without parameters
        await (module as unknown as { default: () => Promise<void> }).default();
      }
    })
    .catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[physics] Failed to initialize Rapier with stable options:",
          err,
        );
      }
    });
  return initPromise;
}

if (typeof window !== "undefined") {
  void ensureRapierInit();
}

/**
 * Physics wrapper with performance optimizations.
 *
 * - Reduced timestep (1/30) - 50% less physics calculations than default 1/60
 * - Interpolation enabled for smooth visuals despite lower update rate
 * - updatePriority set to run after render for better frame pacing
 */
export function Physics(props: ComponentProps<typeof BasePhysics>) {
  void ensureRapierInit();

  return (
    <BasePhysics
      timeStep={1 / 30} // 30 physics updates per second (half of default)
      interpolate={true} // Smooth visuals despite lower physics rate
      updatePriority={-50} // Run physics after other updates
      {...props}
    />
  );
}
