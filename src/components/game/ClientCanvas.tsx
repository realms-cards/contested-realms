"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

/**
 * Client-only Canvas wrapper that prevents SSR issues with React Three Fiber.
 * The Canvas component from R3F uses hooks that don't work during SSR.
 */
function ClientCanvasImpl(props: CanvasProps & { children?: ReactNode }) {
  return <Canvas {...props} />;
}

// Export as dynamic with ssr: false to prevent server-side rendering
export const ClientCanvas = dynamic(() => Promise.resolve(ClientCanvasImpl), {
  ssr: false,
});

export default ClientCanvas;
