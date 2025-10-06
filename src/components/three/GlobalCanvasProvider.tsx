"use client";

import { Canvas } from "@react-three/fiber";
import { createContext, useContext, useRef, type ReactNode } from "react";

/**
 * Global WebGL Canvas Provider
 * 
 * Creates a single shared WebGL context for all 3D scenes in the app.
 * This prevents "WebGL Context Lost" errors from creating multiple contexts.
 * 
 * Usage:
 * 1. Wrap your app in <GlobalCanvasProvider>
 * 2. Use <SceneView> instead of <Canvas> in your components
 * 3. Each SceneView renders into the shared context
 */

interface GlobalCanvasContextValue {
  containerRef: React.RefObject<HTMLDivElement>;
}

const GlobalCanvasContext = createContext<GlobalCanvasContextValue | null>(null);

export function useGlobalCanvas() {
  const ctx = useContext(GlobalCanvasContext);
  if (!ctx) {
    throw new Error("useGlobalCanvas must be used within GlobalCanvasProvider");
  }
  return ctx;
}

interface GlobalCanvasProviderProps {
  children: ReactNode;
}

export function GlobalCanvasProvider({ children }: GlobalCanvasProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <GlobalCanvasContext.Provider value={{ containerRef }}>
      {children}
      {/* Single global Canvas that all scenes render into */}
      <div
        ref={containerRef}
        className="fixed inset-0 pointer-events-none"
        style={{ zIndex: -1 }}
      >
        <Canvas
          // Optimized settings for shared context
          gl={{
            preserveDrawingBuffer: false,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false,
          }}
          dpr={[1, 1.5]}
          // Single event source for all views
          eventSource={containerRef}
          // Single event prefix
          eventPrefix="client"
        >
          {/* Views will be added here dynamically */}
        </Canvas>
      </div>
    </GlobalCanvasContext.Provider>
  );
}
