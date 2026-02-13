/**
 * Type augmentation for three.js Object3D to include pointer event methods
 * added by @react-three/xr. This resolves type compatibility issues between
 * the XR library's augmented Object3D and the base three.js types.
 */

import "three";

declare module "three" {
  interface Object3D {
    setPointerCapture?(pointerId: number): void;
    releasePointerCapture?(pointerId: number): void;
    hasPointerCapture?(pointerId: number): boolean;
  }
}
