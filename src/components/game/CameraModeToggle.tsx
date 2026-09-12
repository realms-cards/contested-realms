"use client";

import { clsx } from "clsx";
import { useGameStore } from "@/lib/game/store";

type Props = {
  disabled?: boolean;
  className?: string;
};

export default function CameraModeToggle({ disabled, className }: Props) {
  const cameraMode = useGameStore((s) => s.cameraMode);
  const toggleCameraMode = useGameStore((s) => s.toggleCameraMode);
  return (
    <button
      className={clsx(
        "cursor-pointer rounded-full px-3 py-1 font-rc-mono text-xs uppercase tracking-[0.14em] transition-colors disabled:opacity-50",
        cameraMode === "topdown"
          ? "bg-rc-accent text-rc-accent-fg"
          : "border border-rc-line/22 bg-black/35 text-rc-fg-muted hover:border-rc-accent hover:text-rc-accent-ring",
        className
      )}
      onClick={() => toggleCameraMode()}
      disabled={!!disabled}
      title="Toggle camera controls: Orbit vs Top-down"
    >
      {cameraMode === "topdown" ? "Top-down" : "Orbit"}
    </button>
  );
}
