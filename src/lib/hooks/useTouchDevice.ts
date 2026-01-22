/**
 * useTouchDevice - Hook for detecting touch/mobile devices and gamepads
 *
 * Uses CSS media query `(pointer: coarse)` which is the most reliable
 * way to detect touch-primary devices (phones, tablets).
 *
 * Also detects gamepad/controller input (e.g., Xbox browser) which
 * lacks hover capability similar to touch devices.
 *
 * Returns reactive state that updates if device capabilities change
 * (e.g., tablet with attached keyboard/mouse, gamepad connected).
 *
 * Supports manual override via localStorage for users who want to
 * switch between touch and mouse controls on touch devices.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

const TOUCH_OVERRIDE_KEY = "sorcery:forceTouchOverride";

// Simple external store for override state so all hooks stay in sync
let overrideValue: "touch" | "mouse" | null = null;
const listeners = new Set<() => void>();

function getOverride() {
  return overrideValue;
}

function subscribeOverride(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setOverrideValue(val: "touch" | "mouse" | null) {
  overrideValue = val;
  try {
    if (val === null) {
      localStorage.removeItem(TOUCH_OVERRIDE_KEY);
    } else {
      localStorage.setItem(TOUCH_OVERRIDE_KEY, val);
    }
  } catch {}
  listeners.forEach((cb) => cb());
}

// Initialize from localStorage on module load (client-side only)
if (typeof window !== "undefined") {
  try {
    const stored = localStorage.getItem(TOUCH_OVERRIDE_KEY);
    if (stored === "mouse" || stored === "touch") {
      overrideValue = stored;
    }
  } catch {}
}

/**
 * Detects if a gamepad/controller is connected
 * Used to detect Xbox browser, Steam Deck, etc.
 */
export function useGamepadConnected(): boolean {
  const [hasGamepad, setHasGamepad] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.getGamepads) return;

    // Check for existing gamepads on mount
    const checkGamepads = () => {
      const gamepads = navigator.getGamepads();
      const connected = gamepads.some((gp) => gp !== null);
      setHasGamepad(connected);
    };

    checkGamepads();

    const onConnect = () => setHasGamepad(true);
    const onDisconnect = () => {
      // Re-check in case other gamepads are still connected
      checkGamepads();
    };

    window.addEventListener("gamepadconnected", onConnect);
    window.addEventListener("gamepaddisconnected", onDisconnect);

    return () => {
      window.removeEventListener("gamepadconnected", onConnect);
      window.removeEventListener("gamepaddisconnected", onDisconnect);
    };
  }, []);

  return hasGamepad;
}

/**
 * Initial detection for SSR-safe initial state
 * Safari sometimes has issues with matchMedia on initial load
 */
function getInitialTouchState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Check multiple signals for better Safari compatibility
    const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const hasTouchEvents = "ontouchstart" in window;
    const hasTouchPoints = navigator.maxTouchPoints > 0;
    // iOS Safari specific check
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return hasCoarsePointer || (hasTouchEvents && hasTouchPoints) || isIOS;
  } catch {
    return false;
  }
}

/**
 * Detects if the device primarily uses touch input (coarse pointer)
 * or has a gamepad connected (no hover capability)
 * @returns boolean - true if touch/gamepad device, false if mouse/trackpad
 */
export function useTouchDevice(): boolean {
  const [isNativeTouchDevice, setIsNativeTouchDevice] = useState(getInitialTouchState);
  const hasGamepad = useGamepadConnected();
  const override = useSyncExternalStore(
    subscribeOverride,
    getOverride,
    () => null
  );

  useEffect(() => {
    // SSR guard
    if (typeof window === "undefined") return;

    try {
      const mediaQuery = window.matchMedia("(pointer: coarse)");
      // Also check touch events for Safari compatibility
      const hasTouchEvents = "ontouchstart" in window;
      const hasTouchPoints = navigator.maxTouchPoints > 0;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      const checkTouch = () => {
        const isCoarse = mediaQuery.matches;
        const isTouch = isCoarse || (hasTouchEvents && hasTouchPoints) || isIOS;
        setIsNativeTouchDevice(isTouch);
      };

      checkTouch();

      const handler = () => checkTouch();

      // Modern browsers
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
      }

      // Legacy browsers (Safari < 14)
      const legacyMq = mediaQuery as unknown as {
        addListener?: (cb: () => void) => void;
        removeListener?: (cb: () => void) => void;
      };
      legacyMq.addListener?.(handler);
      return () => legacyMq.removeListener?.(handler);
    } catch {
      // Fallback: check for touch events support
      setIsNativeTouchDevice("ontouchstart" in window);
      return;
    }
  }, []);

  // Apply override if set
  if (override === "mouse") return false;
  if (override === "touch") return true;
  // Gamepad users also need "touch-like" UI (always-visible buttons)
  return isNativeTouchDevice || hasGamepad;
}

/**
 * Hook to get and set the touch mode override.
 * Only shows toggle when native touch is detected.
 * @returns { isNativeTouch, override, setOverride, toggleOverride }
 */
export function useTouchOverride() {
  const [isNativeTouch, setIsNativeTouch] = useState(false);
  const override = useSyncExternalStore(
    subscribeOverride,
    getOverride,
    () => null
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const mq = window.matchMedia("(pointer: coarse)");
      setIsNativeTouch(mq.matches);
    } catch {
      setIsNativeTouch("ontouchstart" in window);
    }
  }, []);

  const setOverride = useCallback((val: "touch" | "mouse" | null) => {
    setOverrideValue(val);
  }, []);

  const toggleOverride = useCallback(() => {
    // If currently in touch mode (native or forced), switch to mouse
    // If currently in mouse mode (forced), switch back to native (clear override)
    if (override === "mouse") {
      setOverrideValue(null); // Back to native (touch)
    } else {
      setOverrideValue("mouse"); // Force mouse mode
    }
  }, [override]);

  // Effective mode: what the user is currently experiencing
  const effectiveMode: "touch" | "mouse" =
    override === "mouse"
      ? "mouse"
      : override === "touch"
      ? "touch"
      : isNativeTouch
      ? "touch"
      : "mouse";

  return {
    isNativeTouch,
    override,
    effectiveMode,
    setOverride,
    toggleOverride,
  };
}

/**
 * Detects if the device has a small screen (mobile phone)
 * @returns boolean - true if screen width < 768px
 */
export function useSmallScreen(): boolean {
  const [isSmall, setIsSmall] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkSize = () => setIsSmall(window.innerWidth < 768);
    checkSize();

    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  return isSmall;
}

/**
 * Combined hook for mobile-specific behavior
 * @returns { isTouchDevice, isSmallScreen, isMobile }
 */
export function useMobileDevice() {
  const isTouchDevice = useTouchDevice();
  const isSmallScreen = useSmallScreen();

  return {
    isTouchDevice,
    isSmallScreen,
    // Mobile = touch AND small screen (phones)
    // Tablet = touch AND large screen
    isMobile: isTouchDevice && isSmallScreen,
    isTablet: isTouchDevice && !isSmallScreen,
  };
}

export default useTouchDevice;
