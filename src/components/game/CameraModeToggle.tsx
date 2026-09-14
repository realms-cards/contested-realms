"use client";

import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";

type Props = {
  disabled?: boolean;
  className?: string;
};

export default function CameraModeToggle({ disabled, className }: Props) {
  const cameraMode = useGameStore((s) => s.cameraMode);
  const toggleCameraMode = useGameStore((s) => s.toggleCameraMode);
  return (
    <RcButton
      variant="quiet"
      size="xs"
      tone="info"
      className={`h-[26px] rounded-full px-3 font-rc-mono uppercase tracking-[0.14em] ${className ?? ""}`}
      aria-pressed={cameraMode === "topdown"}
      onClick={() => toggleCameraMode()}
      disabled={!!disabled}
      title="Toggle camera controls: Orbit vs Top-down"
    >
      {cameraMode === "topdown" ? "Top-down" : "Orbit"}
    </RcButton>
  );
}
