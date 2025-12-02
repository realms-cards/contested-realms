"use client";

import { lazy } from "react";

/**
 * Lazy-loaded Three.js components from @react-three/drei
 *
 * These components are commonly used but not needed on initial page load.
 * Lazy loading them reduces the initial bundle size significantly.
 *
 * Bundle sizes (approximate):
 * - @react-three/drei: ~200KB
 * - three: ~600KB
 * - Total savings: ~800KB when not immediately needed
 */

/**
 * Lazy-loaded OrbitControls
 *
 * Camera controls for orbiting around a target point.
 * Only loaded when actually used in a scene.
 *
 * @example
 * ```tsx
 * import { LazyOrbitControls } from '@/components/three/LazyThreeComponents';
 *
 * <LazyCanvas>
 *   <LazyOrbitControls />
 *   <mesh />
 * </LazyCanvas>
 * ```
 */
export const LazyOrbitControls = lazy(() =>
  import("@react-three/drei").then((mod) => ({ default: mod.OrbitControls }))
);

/**
 * Lazy-loaded Environment component
 *
 * Provides environment lighting and reflections.
 * Only loaded when needed for realistic lighting.
 */
export const LazyEnvironment = lazy(() =>
  import("@react-three/drei").then((mod) => ({ default: mod.Environment }))
);

/**
 * Lazy-loaded Sky component
 *
 * Procedural sky background.
 * Only loaded when outdoor scenes need sky rendering.
 */
export const LazySky = lazy(() =>
  import("@react-three/drei").then((mod) => ({ default: mod.Sky }))
);

/**
 * Lazy-loaded PerspectiveCamera component
 *
 * Custom perspective camera.
 * Only loaded when non-default camera needed.
 */
export const LazyPerspectiveCamera = lazy(() =>
  import("@react-three/drei").then((mod) => ({
    default: mod.PerspectiveCamera,
  }))
);

/**
 * Lazy-loaded Text component
 *
 * 3D text rendering (troika-three-text).
 * Heavy component (~100KB), only load when rendering text.
 */
export const LazyText = lazy(() =>
  import("@react-three/drei").then((mod) => ({ default: mod.Text }))
);

/**
 * Lazy-loaded Html component
 *
 * Render HTML inside 3D scene.
 * Only load when mixing HTML with WebGL.
 */
export const LazyHtml = lazy(() =>
  import("@react-three/drei").then((mod) => ({ default: mod.Html }))
);

/**
 * Lazy-loaded ContactShadows component
 *
 * Ground contact shadows for objects.
 * Only load when realistic shadows needed.
 */
export const LazyContactShadows = lazy(() =>
  import("@react-three/drei").then((mod) => ({ default: mod.ContactShadows }))
);

/**
 * Lazy-loaded Loader component
 *
 * Progress loader for async assets.
 * Only load when showing loading progress.
 */
export const LazyLoader = lazy(() =>
  import("@react-three/drei").then((mod) => ({ default: mod.Loader }))
);
