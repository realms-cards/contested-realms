import { useEffect } from "react";
import { Vector3, Spherical } from "three";
import type { OrbitControls } from "three-stdlib";

type Options = {
  enabled?: boolean;
  panStep?: number;
};

const PAN_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

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

export function useOrbitKeyboardPan(
  controls: OrbitControls | null | undefined,
  options: Options = {}
): void {
  const { enabled = true, panStep = 20 } = options;

  useEffect(() => {
    if (!controls || !enabled) return;

    const pressed = new Set<string>();
    let frame: number | null = null;
    const controlsAny = controls as OrbitControls & {
      update?: () => void;
      object?: { position?: Vector3 };
      minPolarAngle?: number;
      maxPolarAngle?: number;
    };

    const tick = () => {
      let dx = 0;
      let dy = 0;
      if (pressed.has("KeyA") || pressed.has("ArrowLeft")) dx += 1;
      if (pressed.has("KeyD") || pressed.has("ArrowRight")) dx -= 1;
      if (pressed.has("KeyS") || pressed.has("ArrowDown")) dy -= 1;
      if (pressed.has("KeyW") || pressed.has("ArrowUp")) dy += 1;

      if (dx !== 0 || dy !== 0) {
        // Pan relative to camera orientation on the XZ plane
        const t = controls.target as Vector3;
        const cam = controlsAny.object as unknown as
          | { position: Vector3; getWorldDirection?: (v: Vector3) => Vector3 }
          | undefined;
        if (cam && cam.position) {
          const forward = new Vector3();
          if (typeof cam.getWorldDirection === "function") {
            cam.getWorldDirection(forward);
          } else {
            forward.copy(t).sub(cam.position);
          }
          forward.y = 0;
          if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
          forward.normalize();
          // Right vector: up × forward (right-handed)
          const up = new Vector3(0, 1, 0);
          const right = new Vector3().crossVectors(up, forward).normalize();

          const scale = panStep * 0.1;
          const panDelta = new Vector3()
            .addScaledVector(right, dx * scale)
            .addScaledVector(forward, dy * scale);

          t.add(panDelta);
          cam.position.add(panDelta);
          controls.update?.();
        }
      }

      const tiltUp = pressed.has("KeyQ");
      const tiltDown = pressed.has("KeyE");
      if (tiltUp || tiltDown) {
        const t = controls.target as Vector3;
        const cam = controlsAny.object;
        if (cam && cam.position) {
          const offset = new Vector3().copy(cam.position).sub(t);
          const sph = new Spherical().setFromVector3(offset);
          const minPhi = controlsAny.minPolarAngle ?? 0;
          const maxPhi = controlsAny.maxPolarAngle ?? Math.PI;
          const step = 0.02;
          sph.phi += tiltDown ? step : -step;
          if (sph.phi < minPhi) sph.phi = minPhi;
          if (sph.phi > maxPhi) sph.phi = maxPhi;
          offset.setFromSpherical(sph);
          cam.position.copy(new Vector3().copy(t).add(offset));
          controls.update?.();
        }
      }

      if (pressed.size > 0) {
        frame = window.requestAnimationFrame(tick);
      } else {
        frame = null;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabled) return;
      if (!PAN_KEYS.has(event.code)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (shouldIgnoreTarget(event.target)) return;
      if (pressed.has(event.code)) return;
      event.preventDefault();
      pressed.add(event.code);
      if (frame === null) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!PAN_KEYS.has(event.code)) return;
      pressed.delete(event.code);
      if (pressed.size === 0 && frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [controls, enabled, panStep]);
}
