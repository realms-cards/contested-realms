"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import { XR } from "@react-three/xr";
import { useEffect, useState, type ReactNode } from "react";
import { xrStore } from "@/lib/vr/xrStore";

export interface ClientCanvasProps extends CanvasProps {
  children?: ReactNode;
  /** Enable XR (VR/AR) support for this canvas */
  enableXR?: boolean;
}

/**
 * Client-only Canvas wrapper that prevents SSR issues with React Three Fiber.
 * The Canvas component from R3F uses hooks that don't work during SSR.
 * Uses a mounted state to delay rendering until after hydration.
 *
 * When `enableXR` is true, the canvas content is wrapped with the XR provider
 * to enable VR/AR functionality.
 */
export function ClientCanvas({
  children,
  enableXR = false,
  ...props
}: ClientCanvasProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder with matching dimensions during SSR/hydration
    return <div style={{ width: "100%", height: "100%" }} />;
  }

  return (
    <Canvas {...props}>
      {enableXR ? <XR store={xrStore}>{children}</XR> : children}
    </Canvas>
  );
}

export default ClientCanvas;
