/**
 * useGamepadControls - Hook for gamepad button input
 *
 * Provides callbacks for gamepad button presses (shoulder buttons, etc.)
 * Uses polling since gamepad events only fire on connect/disconnect.
 *
 * Standard Gamepad Button Mapping:
 * - 4: LB (Left Bumper)
 * - 5: RB (Right Bumper)
 * - 6: LT (Left Trigger)
 * - 7: RT (Right Trigger)
 */

import { useEffect, useRef } from "react";

export interface GamepadCallbacks {
  onLB?: () => void; // Left bumper (button 4)
  onRB?: () => void; // Right bumper (button 5)
  onLT?: () => void; // Left trigger (button 6)
  onRT?: () => void; // Right trigger (button 7)
}

const POLL_INTERVAL_MS = 100; // Poll every 100ms
const BUTTON_THRESHOLD = 0.5; // Analog trigger threshold

export function useGamepadControls(
  callbacks: GamepadCallbacks,
  enabled: boolean = true
) {
  const prevButtonStates = useRef<Record<number, boolean>>({});
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    if (
      !enabled ||
      typeof navigator === "undefined" ||
      !navigator.getGamepads
    ) {
      return;
    }

    const pollGamepad = () => {
      const gamepads = navigator.getGamepads();
      const gamepad = gamepads.find((gp) => gp !== null);
      if (!gamepad) return;

      const checkButton = (
        buttonIndex: number,
        callback: (() => void) | undefined
      ) => {
        if (!callback) return;

        const button = gamepad.buttons[buttonIndex];
        if (!button) return;

        const isPressed =
          typeof button === "object"
            ? button.pressed || button.value > BUTTON_THRESHOLD
            : button > BUTTON_THRESHOLD;

        const wasPressed = prevButtonStates.current[buttonIndex] || false;

        // Fire on press (not hold)
        if (isPressed && !wasPressed) {
          callback();
        }

        prevButtonStates.current[buttonIndex] = isPressed;
      };

      checkButton(4, callbacksRef.current.onLB);
      checkButton(5, callbacksRef.current.onRB);
      checkButton(6, callbacksRef.current.onLT);
      checkButton(7, callbacksRef.current.onRT);
    };

    const intervalId = setInterval(pollGamepad, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [enabled]);
}

export default useGamepadControls;
