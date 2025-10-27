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
      const maybeInit = module?.init;
      if (typeof maybeInit !== "function") {
        return;
      }
      const originalInit = maybeInit.bind(module);
      module.init = (options?: unknown) => {
        if (options === undefined || options === null) {
          return originalInit({});
        }
        if (typeof options !== "object") {
          return originalInit({ module_or_path: options });
        }
        return originalInit(options as Record<string, unknown>);
      };
      await module.init({});
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
