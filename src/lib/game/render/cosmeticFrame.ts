import { invalidate } from "@react-three/fiber";

/**
 * Shared low-frequency render pump for purely-decorative pulse/glow loops.
 *
 * The match canvas runs with `frameloop="demand"`, so the scene only re-renders
 * when something calls `invalidate()`. Decorative "breathing" effects (token-copy
 * glow, remote cursor pulse, portal shimmer, target-tile highlights) can stay
 * mounted for the entire match. If each of them called `invalidate()` every frame
 * they would drive a full-scene re-render at display refresh rate (~70-120fps) for
 * the whole game — which is exactly what spins up the GPU/fan while "idle".
 *
 * Motion animations (card moves, permanents settling, dice, drag, camera) still use
 * `invalidate()` directly so they stay smooth. Cosmetic loops instead call
 * `requestCosmeticFrame()`, which coalesces every caller into a single timer and
 * caps the decorative refresh to ~12fps. When no cosmetic loop is mounted, nothing
 * is scheduled and the scene goes fully idle (0 renders).
 */
let scheduled = false;

export function requestCosmeticFrame(intervalMs = 80): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    invalidate();
  }, intervalMs);
}
