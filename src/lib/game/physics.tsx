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
      const initFn =
        typeof module?.init === "function"
          ? module.init
          : typeof (module as unknown as { default?: unknown }).default ===
              "function"
            ? ((module as unknown as { default: () => Promise<void> }).default)
            : null;
      if (initFn) {
        await initFn();
      }
    })
    .catch((err) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[physics] Failed to initialize Rapier with stable options:", err);
      }
    });
  return initPromise;
}

if (typeof window !== "undefined") {
  void ensureRapierInit();
}

export function Physics(props: ComponentProps<typeof BasePhysics>) {
  void ensureRapierInit();
  return <BasePhysics {...props} />;
}
