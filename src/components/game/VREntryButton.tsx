"use client";

import { Glasses } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { enterVR, isXRSupported } from "@/lib/vr";

interface VREntryButtonProps {
  className?: string;
  disabled?: boolean;
}

/**
 * Button to enter VR mode. Only visible when WebXR VR is supported.
 */
export function VREntryButton({ className, disabled }: VREntryButtonProps) {
  const [vrSupported, setVRSupported] = useState(false);
  const [isEntering, setIsEntering] = useState(false);

  useEffect(() => {
    isXRSupported().then(({ vr }) => {
      setVRSupported(vr);
    });
  }, []);

  if (!vrSupported) {
    return null;
  }

  const handleEnterVR = async () => {
    if (disabled || isEntering) return;

    setIsEntering(true);
    try {
      await enterVR();
    } catch (error) {
      console.error("Failed to enter VR:", error);
    } finally {
      setIsEntering(false);
    }
  };

  return (
    <button
      onClick={handleEnterVR}
      disabled={disabled || isEntering}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-purple-600 hover:bg-purple-700 text-white",
        "transition-colors duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      title="Enter VR Mode"
    >
      <Glasses className="w-5 h-5" />
      <span className="text-sm font-medium">
        {isEntering ? "Entering VR..." : "Enter VR"}
      </span>
    </button>
  );
}

export default VREntryButton;
