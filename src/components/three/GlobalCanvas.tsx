"use client";

import { PerspectiveCamera, View } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Global Canvas Architecture
 *
 * This provides a single shared WebGL context for the entire application,
 * eliminating context loss issues from multiple Canvas instances.
 *
 * Usage:
 * 1. Wrap your app with <GlobalCanvasProvider> in the root layout
 * 2. Use <SceneView> instead of <Canvas> in your pages
 * 3. The global Canvas renders all Views via View.Port
 *
 * Benefits:
 * - Single WebGL context (no context loss from navigation)
 * - Shared textures and shaders across pages
 * - Faster page transitions (context already exists)
 * - Lazy initialization (Canvas only created when SceneView mounts)
 */

interface GlobalCanvasContextType {
  containerRef: RefObject<HTMLDivElement | null>;
  isReady: boolean;
  requestCanvas: () => void;
  hasActiveViews: boolean;
}

const GlobalCanvasContext = createContext<GlobalCanvasContextType | null>(null);

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

/**
 * Root provider that creates the shared Canvas.
 * Place this in your root layout, wrapping all page content.
 * Canvas is lazy - only created when a SceneView mounts.
 */
export function GlobalCanvasProvider({ children }: GlobalCanvasProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [viewCount, setViewCount] = useState(0);

  const requestCanvas = useCallback(() => {
    setViewCount((c) => c + 1);
  }, []);

  const releaseCanvas = useCallback(() => {
    setViewCount((c) => Math.max(0, c - 1));
  }, []);

  // Store releaseCanvas in a ref so SceneView can access it
  const releaseRef = useRef(releaseCanvas);
  releaseRef.current = releaseCanvas;

  const hasActiveViews = viewCount > 0;

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => setIsReady(true), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GlobalCanvasContext.Provider
      value={{ containerRef, isReady, requestCanvas, hasActiveViews }}
    >
      {/* Container that holds both HTML content and Canvas */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          minHeight: "100vh",
        }}
      >
        {/* Black background - lowest layer */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "#0b0b0c",
            zIndex: 1,
          }}
        />

        {/* Global Canvas layer - renders 3D content */}
        {/* z-index: 10 - above background, below HUD */}
        {isReady && containerRef.current && (
          <Canvas
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              zIndex: 10,
              pointerEvents: "none",
            }}
            eventSource={containerRef.current}
            eventPrefix="client"
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: "high-performance",
              preserveDrawingBuffer: false,
            }}
            dpr={[1, 1.5]}
            onCreated={({ gl }) => {
              // Make canvas transparent so HTML shows through
              gl.setClearColor(0x000000, 0);
              // Monitor context loss
              const canvas = gl.domElement;
              canvas.addEventListener("webglcontextlost", (e) => {
                console.warn("[GlobalCanvas] WebGL context lost", e);
              });
              canvas.addEventListener("webglcontextrestored", () => {
                console.info("[GlobalCanvas] WebGL context restored");
              });
            }}
          >
            {/* View.Port renders all View components */}
            <View.Port />
          </Canvas>
        )}

        {/* Page content - z-index: 20 above Canvas (10), below modals */}
        {/* SceneView areas are transparent so 3D shows through */}
        <div
          style={{
            position: "relative",
            zIndex: 20,
            minHeight: "100vh",
          }}
        >
          {children}
        </div>
      </div>
    </GlobalCanvasContext.Provider>
  );
}

interface SceneViewProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Set to true if this view needs pointer events (e.g., for OrbitControls) */
  interactive?: boolean;
  /** Skip the default camera - use when providing custom PerspectiveCamera */
  noDefaultCamera?: boolean;
}

/**
 * A 3D scene view that renders into the global Canvas.
 * Use this instead of <Canvas> in your page components.
 *
 * @example
 * ```tsx
 * <SceneView className="w-full h-full" interactive>
 *   <OrbitControls />
 *   <Board />
 *   <ambientLight />
 * </SceneView>
 * ```
 */
export function SceneView({
  children,
  className,
  style,
  interactive = true,
  noDefaultCamera = false,
}: SceneViewProps) {
  const { isReady } = useGlobalCanvas();

  // Strip background styles - SceneView should be transparent
  // Page containers should set their own background
  const { background: _bg, backgroundColor: _bgc, ...restStyle } = style || {};
  void _bg;
  void _bgc;

  if (!isReady) {
    return <div className={className} style={restStyle} />;
  }

  return (
    <View
      className={className}
      style={{
        ...restStyle,
        pointerEvents: interactive ? "auto" : "none",
        position: "relative",
      }}
    >
      {!noDefaultCamera && (
        <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
      )}
      {children}
    </View>
  );
}

/**
 * Fallback Canvas for pages that can't use the global Canvas.
 * Use sparingly - prefer SceneView when possible.
 */
export { Canvas as FallbackCanvas } from "@react-three/fiber";
