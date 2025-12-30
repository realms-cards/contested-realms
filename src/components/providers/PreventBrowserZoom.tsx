"use client";

import { useEffect } from "react";

/**
 * Prevents browser zoom from trackpad pinch gestures and Ctrl+scroll.
 * This is necessary because CSS touch-action doesn't prevent desktop trackpad zoom.
 */
export default function PreventBrowserZoom() {
  useEffect(() => {
    const preventZoom = (e: WheelEvent) => {
      // Trackpad pinch-to-zoom fires as wheel events with ctrlKey
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    // Prevent Ctrl+Plus/Minus keyboard zoom
    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")
      ) {
        e.preventDefault();
      }
    };

    // Must use passive: false to be able to preventDefault on wheel
    document.addEventListener("wheel", preventZoom, { passive: false });
    document.addEventListener("keydown", preventKeyboardZoom);

    return () => {
      document.removeEventListener("wheel", preventZoom);
      document.removeEventListener("keydown", preventKeyboardZoom);
    };
  }, []);

  return null;
}
