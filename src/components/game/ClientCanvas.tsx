"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Client-only Canvas wrapper that prevents SSR issues with React Three Fiber.
 * The Canvas component from R3F uses hooks that don't work during SSR.
 * Uses a mounted state to delay rendering until after hydration.
 */
export function ClientCanvas(props: CanvasProps & { children?: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Return a placeholder with matching dimensions during SSR/hydration
    return <div style={{ width: "100%", height: "100%" }} />;
  }

  return <Canvas {...props} />;
}

export default ClientCanvas;
