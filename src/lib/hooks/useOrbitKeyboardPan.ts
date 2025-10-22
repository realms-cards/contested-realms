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
        if (typeof panFn === "function") {
          panFn(dx * panStep, dy * panStep);
        } else {
          if (dx !== 0 && typeof controlsAny.panLeft === "function") {
            controlsAny.panLeft(dx * (panStep / 10));
          }
          if (dy !== 0 && typeof controlsAny.panUp === "function") {
            controlsAny.panUp(dy * (panStep / 10));
          }
        }
        controls.update();
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
