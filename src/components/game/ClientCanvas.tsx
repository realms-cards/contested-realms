"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import { useEffect, useState, type ReactNode } from "react";

export interface ClientCanvasProps extends CanvasProps {
  children?: ReactNode;
}

/**
 * Client-only Canvas wrapper that prevents SSR issues with React Three Fiber.
 * The Canvas component from R3F uses hooks that don't work during SSR.
 * Uses a mounted state to delay rendering until after hydration.
 */
export function ClientCanvas({ children, ...props }: ClientCanvasProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Keep a visible scene shell during client hydration to avoid blank flashes.
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0b0b0c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#cbd5e1",
          fontSize: "14px",
        }}
      >
        Loading 3D scene...
      </div>
    );
  }

  return <Canvas {...props}>{children}</Canvas>;
}

export default ClientCanvas;
