"use client";

import { MapControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

type Props = {
  enabledPan?: boolean;
  enableZoom?: boolean;
  minDistance?: number;
  maxDistance?: number;
  target?: [number, number, number];
  initialHeight?: number;
};

export default function TopDownControls({
  enabledPan = true,
  enableZoom = true,
  minDistance = 5,
  maxDistance = 30,
  target = [0, 0, 0],
  initialHeight = 12,
}: Props) {
  const { camera } = useThree();

  // Ensure a strict top-down orientation (looking straight down onto XZ plane)
  useEffect(() => {
    try {
      // Position camera above target if it's not already roughly top-down
      if (Math.abs(camera.position.y) < 1e-3 || Math.abs(camera.position.x - target[0]) > 1e-3 || Math.abs(camera.position.z - target[2]) > 1e-3) {
        camera.position.set(target[0], initialHeight, target[2]);
      }
      camera.up.set(0, 1, 0);
      camera.lookAt(target[0], 0, target[2]);
      camera.updateProjectionMatrix?.();
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  return (
    <MapControls
      makeDefault
      target={target}
      enableRotate={false}
      enablePan={enabledPan}
      enableZoom={enableZoom}
      minDistance={minDistance}
      maxDistance={maxDistance}
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning={false}
    />
  );
}
