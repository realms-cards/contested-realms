"use client";

import { useEffect, useState } from "react";
import { useTouchDevice } from "@/lib/hooks/useTouchDevice";

/**
 * MobileHandHint - Shows a dismissible hint for mobile users on how to interact with hand cards.
 * Only appears on touch devices and can be dismissed permanently via localStorage.
 */
export default function MobileHandHint() {
  const isTouchDevice = useTouchDevice();
  const [showHint, setShowHint] = useState(false);
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    if (!isTouchDevice) return;

    try {
      const dismissed = localStorage.getItem("sorcery:mobileHandHintDismissed");
      if (dismissed !== "1") {
        setIsDismissed(false);
        // Show hint after a short delay
        const timer = setTimeout(() => setShowHint(true), 2000);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage not available
    }
    return; // Explicit return for all paths
  }, [isTouchDevice]);

  const dismissHint = () => {
    setShowHint(false);
    setIsDismissed(true);
    try {
      localStorage.setItem("sorcery:mobileHandHintDismissed", "1");
    } catch {
      // localStorage not available
    }
  };

  if (!isTouchDevice || isDismissed || !showHint) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
      <div className="bg-slate-900/95 border border-cyan-500/50 rounded-lg px-4 py-3 shadow-lg max-w-xs text-center">
        <p className="text-cyan-200 text-sm font-medium mb-1">
          📱 Touch Controls
        </p>
        <p className="text-slate-300 text-xs leading-relaxed">
          Tap bottom of screen to show hand.
          <br />
          Tap a card to preview, tap again to play.
        </p>
        <button
          onClick={dismissHint}
          className="mt-2 text-xs text-cyan-400 hover:text-cyan-300 underline"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
