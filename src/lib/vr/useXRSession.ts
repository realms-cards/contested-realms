"use client";

import { useXR } from "@react-three/xr";
import { useEffect, useState } from "react";
import { isXRSupported } from "./xrStore";

export interface XRSessionState {
  isPresenting: boolean;
  isVRSupported: boolean;
  isARSupported: boolean;
  sessionMode: "none" | "immersive-vr" | "immersive-ar";
}

/**
 * Hook to track XR session state and capabilities
 */
export function useXRSession(): XRSessionState {
  const session = useXR((state) => state.session);
  const mode = useXR((state) => state.mode);
  const [vrSupported, setVRSupported] = useState(false);
  const [arSupported, setARSupported] = useState(false);

  useEffect(() => {
    isXRSupported().then(({ vr, ar }) => {
      setVRSupported(vr);
      setARSupported(ar);
    });
  }, []);

  const isPresenting = session !== undefined;
  const sessionMode: XRSessionState["sessionMode"] = isPresenting
    ? mode === "immersive-ar"
      ? "immersive-ar"
      : "immersive-vr"
    : "none";

  return {
    isPresenting,
    isVRSupported: vrSupported,
    isARSupported: arSupported,
    sessionMode,
  };
}

/**
 * Hook to check if currently in an XR session (for conditional rendering)
 */
export function useIsXRPresenting(): boolean {
  const session = useXR((state) => state.session);
  return session !== undefined;
}
