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
    <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-auto max-w-[92vw]">
      <div className="rounded-rc-lg border border-rc-accent/45 bg-[rgba(9,13,25,0.95)] px-4 py-3 text-center font-rc-sans text-rc-fg shadow-rc-panel max-w-xs">
        <p className="rc-eyebrow mb-1">
          Touch Controls
        </p>
        <p className="font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
          Tap bottom of screen to show hand.
          <br />
          Tap a card to preview, tap again to play.
        </p>
        <button
          onClick={dismissHint}
          className="rc-link mt-2 font-rc-mono text-xs underline"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
