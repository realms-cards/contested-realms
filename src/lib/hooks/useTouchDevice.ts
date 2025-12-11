/**
 * useTouchDevice - Hook for detecting touch/mobile devices
 *
 * Uses CSS media query `(pointer: coarse)` which is the most reliable
 * way to detect touch-primary devices (phones, tablets).
 *
 * Returns reactive state that updates if device capabilities change
 * (e.g., tablet with attached keyboard/mouse).
 */

import { useEffect, useState } from "react";

/**
 * Detects if the device primarily uses touch input (coarse pointer)
 * @returns boolean - true if touch device, false if mouse/trackpad
 */
export function useTouchDevice(): boolean {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    // SSR guard
    if (typeof window === "undefined") return;

    try {
      const mediaQuery = window.matchMedia("(pointer: coarse)");
      setIsTouchDevice(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);

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
      setIsTouchDevice("ontouchstart" in window);
      return;
    }
  }, []);

  return isTouchDevice;
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
