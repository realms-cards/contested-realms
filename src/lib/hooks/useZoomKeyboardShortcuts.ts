import { useEffect } from "react";
import type { OrbitControls } from "three-stdlib";

type Options = {
  enabled?: boolean;
  zoomStep?: number;
};

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON"
  );
}

/**
 * Hook to enable +/- keyboard shortcuts for zooming in/out with OrbitControls.
 * Works with both "+" and "=" keys (for keyboards where + requires shift).
 */
export function useZoomKeyboardShortcuts(
  controls: OrbitControls | null | undefined,
  options: Options = {}
): void {
  const { enabled = true, zoomStep = 1.5 } = options;

  useEffect(() => {
    if (!controls || !enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabled) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (shouldIgnoreTarget(event.target)) return;

      const cam = controls.object;
      if (!cam) return;

      // Check for zoom in: + or = (for keyboards where + requires shift)
      const isZoomIn =
        event.key === "+" || event.key === "=" || event.code === "Equal";
      // Check for zoom out: - or _
      const isZoomOut =
        event.key === "-" || event.key === "_" || event.code === "Minus";

      if (!isZoomIn && !isZoomOut) return;

      event.preventDefault();

      // Get current distance from target
      const target = controls.target;
      const offset = cam.position.clone().sub(target);
      const currentDist = offset.length();

      // Calculate new distance
      let newDist: number;
      if (isZoomIn) {
        newDist = currentDist / zoomStep;
      } else {
        newDist = currentDist * zoomStep;
      }

      // Clamp to min/max distance if set on controls
      const controlsAny = controls as OrbitControls & {
        minDistance?: number;
        maxDistance?: number;
      };
      const minDist = controlsAny.minDistance ?? 0.1;
      const maxDist = controlsAny.maxDistance ?? Infinity;
      newDist = Math.max(minDist, Math.min(maxDist, newDist));

      // Apply new distance
      offset.normalize().multiplyScalar(newDist);
      cam.position.copy(target).add(offset);
      controls.update?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [controls, enabled, zoomStep]);
}
