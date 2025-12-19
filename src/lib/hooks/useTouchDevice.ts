/**
 * useTouchDevice - Hook for detecting touch/mobile devices
 *
 * Uses CSS media query `(pointer: coarse)` which is the most reliable
 * way to detect touch-primary devices (phones, tablets).
 *
 * Returns reactive state that updates if device capabilities change
 * (e.g., tablet with attached keyboard/mouse).
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
 * Detects if the device primarily uses touch input (coarse pointer)
 * @returns boolean - true if touch device, false if mouse/trackpad
 */
export function useTouchDevice(): boolean {
  const [isNativeTouchDevice, setIsNativeTouchDevice] = useState(false);
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
      setIsNativeTouchDevice(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) =>
        setIsNativeTouchDevice(e.matches);

      // Modern browsers
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handler);
        return () => mediaQuery.removeEventListener("change", handler);
      }

      // Legacy browsers (Safari < 14)
      const legacyMq = mediaQuery as unknown as {
        addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
        removeListener?: (cb: (e: MediaQueryListEvent) => void) => void;
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
  return isNativeTouchDevice;
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
