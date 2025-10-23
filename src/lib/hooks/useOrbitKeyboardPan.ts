import { useEffect } from "react";
import type { OrbitControls } from "three-stdlib";
import { Vector3 } from "three";

type Options = {
  enabled?: boolean;
  panStep?: number;
};

const PAN_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);

function shouldIgnoreTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON";
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
      panLeft?: (deltaX: number) => void;
      panUp?: (deltaY: number) => void;
      update?: () => void;
      object?: { isPerspectiveCamera?: boolean; position?: Vector3 };
    };
    const panFn = (controlsAny as unknown as { pan?: (deltaX: number, deltaY: number) => void }).pan;

    const tick = () => {
      let dx = 0;
      let dy = 0;
      if (pressed.has("KeyA")) dx += 1;
      if (pressed.has("KeyD")) dx -= 1;
      if (pressed.has("KeyW")) dy -= 1;
      if (pressed.has("KeyS")) dy += 1;

      if (dx !== 0 || dy !== 0) {
        // OrbitControls from drei uses the target property directly
        // We need to modify the target position instead of using pan methods
        const currentTarget = controls.target;

        // Calculate screen-space panning based on camera position
        const camera = controlsAny.object;
        if (camera && camera.position) {
          const cameraDirection = new Vector3()
            .copy(camera.position)
            .sub(currentTarget)
            .normalize();

          // Get right vector (perpendicular to camera direction)
          const right = new Vector3(1, 0, 0);
          const up = new Vector3(0, 1, 0);

          // For top-down camera, pan in XZ plane
          const panDelta = new Vector3();
          panDelta.x += dx * panStep * 0.1;
          panDelta.z += dy * panStep * 0.1;

          currentTarget.add(panDelta);
          controls.update();
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
