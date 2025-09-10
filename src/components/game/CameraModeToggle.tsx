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
        "rounded-full px-3 py-1 disabled:opacity-40",
        cameraMode === "topdown"
          ? "bg-indigo-500 text-white"
          : "bg-white/15 hover:bg-white/25",
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
