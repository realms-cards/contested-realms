"use client";

import { Suspense, lazy } from "react";
import type { Canvas as CanvasType } from "@react-three/fiber";
import type { ComponentProps } from "react";

/**
 * Lazy-loaded Three.js Canvas component
 *
 * Delays loading of Three.js (~600KB) until the Canvas is actually rendered.
 * This significantly reduces initial bundle size for pages that don't use 3D.
 *
 * Usage:
 * ```tsx
 * import { LazyCanvas } from '@/components/three/LazyCanvas';
 *
 * function MyPage() {
 *   return (
 *     <LazyCanvas>
 *       <mesh>
 *         <boxGeometry />
 *         <meshStandardMaterial />
 *       </mesh>
 *     </LazyCanvas>
 *   );
 * }
 * ```
 *
 * Performance impact:
 * - Without lazy loading: Three.js loaded on every page (~600KB)
 * - With lazy loading: Three.js only loaded when Canvas renders
 * - Initial bundle reduction: ~600KB (20-30% for most pages)
 */

// Lazy load the Canvas component from @react-three/fiber
const Canvas = lazy(() =>
  import("@react-three/fiber").then((mod) => ({ default: mod.Canvas }))
);

type CanvasProps = ComponentProps<typeof CanvasType>;

/**
 * Loading fallback displayed while Three.js loads
 * Matches the typical Canvas background to avoid layout shift
 */
function CanvasLoadingFallback() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#666",
        fontSize: "14px",
        fontFamily: "monospace",
      }}
    >
      Loading 3D scene...
    </div>
  );
}

/**
 * Lazy-loaded Canvas with loading state
 *
 * @param props - All standard Canvas props from @react-three/fiber
 */
export function LazyCanvas(props: CanvasProps) {
  return (
    <Suspense fallback={<CanvasLoadingFallback />}>
      <Canvas {...props} />
    </Suspense>
  );
}

/**
 * Export type for Canvas props (useful for component typing)
 */
export type { CanvasProps };
