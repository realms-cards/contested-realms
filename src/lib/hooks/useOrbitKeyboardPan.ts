import { useEffect } from "react";
import { Vector3, Spherical } from "three";
import type { OrbitControls } from "three-stdlib";

type Options = {
  enabled?: boolean;
  panStep?: number;
  /** Player seat (1 or 2) - affects fallback direction in top-down mode */
  viewPlayerNumber?: 1 | 2;
  /** Control scheme - TTS mode repurposes Q/E for card rotation */
  controlScheme?: "default" | "tts";
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

// Use event.key (character) for rotation to support different keyboard layouts (QWERTY/QWERTZ)
const ROTATE_KEYS = new Set(["y", "Y", "c", "C"]);

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
  const {
    enabled = true,
    panStep = 20,
    viewPlayerNumber = 1,
    controlScheme = "default",
  } = options;

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
          // In top-down mode, forward becomes near-zero; use seat-aware fallback
          // Player 1 views from +Z (forward = -Z), Player 2 views from -Z (forward = +Z)
          if (forward.lengthSq() < 1e-6) {
            forward.set(0, 0, viewPlayerNumber === 2 ? 1 : -1);
          }
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

      // In TTS mode, Q/E are repurposed for card rotation — skip camera tilt
      const tiltUp = controlScheme !== "tts" && pressed.has("KeyQ");
      const tiltDown = controlScheme !== "tts" && pressed.has("KeyE");
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

      const rotateLeft = pressed.has("y") || pressed.has("Y");
      const rotateRight = pressed.has("c") || pressed.has("C");
      if (rotateLeft || rotateRight) {
        const t = controls.target as Vector3;
        const cam = controlsAny.object;
        if (cam && cam.position) {
          const offset = new Vector3().copy(cam.position).sub(t);
          const sph = new Spherical().setFromVector3(offset);
          const step = 0.02;
          // Player 2 views from opposite side, so invert rotation direction
          const dir = viewPlayerNumber === 2 ? -1 : 1;
          sph.theta += rotateLeft ? step * dir : -step * dir;
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
      const isPanKey = PAN_KEYS.has(event.code);
      const isRotateKey = ROTATE_KEYS.has(event.key);
      if (!isPanKey && !isRotateKey) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (shouldIgnoreTarget(event.target)) return;
      // Use event.key for rotation keys, event.code for others
      const keyId = isRotateKey ? event.key : event.code;
      if (pressed.has(keyId)) return;
      event.preventDefault();
      pressed.add(keyId);
      if (frame === null) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const isPanKey = PAN_KEYS.has(event.code);
      const isRotateKey = ROTATE_KEYS.has(event.key);
      if (!isPanKey && !isRotateKey) return;
      const keyId = isRotateKey ? event.key : event.code;
      pressed.delete(keyId);
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
  }, [controls, enabled, panStep, viewPlayerNumber, controlScheme]);
}
