/**
 * Lazy-loaded Three.js components
 *
 * Import from this module to automatically benefit from code splitting:
 *
 * @example
 * ```tsx
 * import { LazyCanvas, LazyOrbitControls } from '@/components/three';
 *
 * function MyScene() {
 *   return (
 *     <LazyCanvas>
 *       <LazyOrbitControls />
 *       <mesh />
 *     </LazyCanvas>
 *   );
 * }
 * ```
 *
 * Bundle size impact:
 * - Without lazy loading: ~800KB loaded immediately
 * - With lazy loading: ~800KB loaded only when Canvas renders
 */

export { LazyCanvas, type CanvasProps } from "./LazyCanvas";
export {
  LazyOrbitControls,
  LazyEnvironment,
  LazySky,
  LazyPerspectiveCamera,
  LazyText,
  LazyHtml,
  LazyContactShadows,
  LazyLoader,
} from "./LazyThreeComponents";
