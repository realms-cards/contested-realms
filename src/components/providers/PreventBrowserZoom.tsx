"use client";

import { useEffect } from "react";

export default function PreventBrowserZoom() {
  useEffect(() => {
    const preventKeyboardZoom = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "+" || e.key === "-" || e.key === "=" || e.key === "0")
      ) {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", preventKeyboardZoom);

    // Safari exposes GestureEvent for trackpad pinch; use it to prevent zoom
    // without adding a non-passive wheel listener (which blocks Safari scroll).
    if (
      typeof (window as Window & { GestureEvent?: unknown }).GestureEvent !==
      "undefined"
    ) {
      const preventGesture = (e: Event) => e.preventDefault();
      document.addEventListener("gesturestart", preventGesture);
      document.addEventListener("gesturechange", preventGesture);
      return () => {
        document.removeEventListener("keydown", preventKeyboardZoom);
        document.removeEventListener("gesturestart", preventGesture);
        document.removeEventListener("gesturechange", preventGesture);
      };
    }

    // Chrome/Firefox: trackpad pinch-to-zoom fires as wheel events with ctrlKey
    const preventZoom = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    document.addEventListener("wheel", preventZoom, { passive: false });

    return () => {
      document.removeEventListener("wheel", preventZoom);
      document.removeEventListener("keydown", preventKeyboardZoom);
    };
  }, []);

  return null;
}
