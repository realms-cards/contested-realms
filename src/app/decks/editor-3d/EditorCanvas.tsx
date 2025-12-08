"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import React, { useEffect, useMemo } from "react";
import { MOUSE, TOUCH } from "three";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ClientCanvas } from "@/components/game/ClientCanvas";
import { DynamicBoard as Board } from "@/components/game/dynamic-3d";
import TrackpadOrbitAdapter from "@/lib/controls/TrackpadOrbitAdapter";
import { Physics } from "@/lib/game/physics";
import { createGameStore } from "@/lib/game/store";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";

interface EditorCanvasProps {
  children?: React.ReactNode;
  orbitLocked?: boolean;
}

interface PanBoundsProps {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export default function EditorCanvas({
  children,
  orbitLocked = false,
}: EditorCanvasProps) {
  const storeApi = useMemo<ReturnType<typeof createGameStore>>(
    () => createGameStore(),
    []
  );

  useEffect(() => {
    storeApi.getState().resetGameState();
  }, [storeApi]);

  return (
    <div className="absolute inset-0 w-full h-full">
      <ClientCanvas
        camera={{ position: [0, 10, 0], fov: 50 }}
        shadows
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <color attach="background" args={["#0b0b0c"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 12, 8]} intensity={1.35} castShadow />
        <Physics gravity={[0, -9.81, 0]}>
          <Board noRaycast interactionMode="spectator" storeApi={storeApi} />
          {children}
        </Physics>
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          // Drag-to-pan on left mouse; disable rotate on single click
          enableRotate={false}
          enablePan={!orbitLocked}
          enableZoom
          mouseButtons={{
            MIDDLE: MOUSE.DOLLY,
            RIGHT: MOUSE.PAN,
          }}
          touches={{ TWO: TOUCH.PAN }}
          enableDamping
          dampingFactor={0.08}
          screenSpacePanning
          panSpeed={1.2}
          zoomSpeed={0.75}
          minDistance={2}
          maxDistance={28}
          rotateSpeed={0}
          minAzimuthAngle={0}
          maxAzimuthAngle={0}
          minPolarAngle={0.05}
          maxPolarAngle={0.35}
        />
        <KeyboardPanControls enabled={!orbitLocked} />
        {/* Clamp panning to board bounds */}
        <PanBounds minX={-8} maxX={8} minZ={-6} maxZ={8} />
        <TrackpadOrbitAdapter />
      </ClientCanvas>
    </div>
  );
}

function PanBounds({ minX, maxX, minZ, maxZ }: PanBoundsProps) {
  const { camera, controls, invalidate } = useThree((s) => ({
    camera: s.camera as THREE.PerspectiveCamera,
    controls: s.controls as OrbitControlsImpl | undefined,
    invalidate: s.invalidate,
  }));
  useEffect(() => {
    if (!controls) return;
    let offset = camera.position
      .clone()
      .sub((controls as OrbitControlsImpl).target.clone());
    const updateOffset = () => {
      offset = camera.position
        .clone()
        .sub((controls as OrbitControlsImpl).target.clone());
    };
    const clampTarget = () => {
      const t = (controls as OrbitControlsImpl).target;
      const clampedX = Math.max(minX, Math.min(maxX, t.x));
      const clampedZ = Math.max(minZ, Math.min(maxZ, t.z));
      if (clampedX !== t.x || clampedZ !== t.z) {
        t.set(clampedX, t.y, clampedZ);
        camera.position.copy(t.clone().add(offset));
        (controls as OrbitControlsImpl).update();
        invalidate();
      }
    };
    (controls as OrbitControlsImpl).addEventListener("start", updateOffset);
    (controls as OrbitControlsImpl).addEventListener("change", clampTarget);
    return () => {
      (controls as OrbitControlsImpl).removeEventListener(
        "start",
        updateOffset
      );
      (controls as OrbitControlsImpl).removeEventListener(
        "change",
        clampTarget
      );
    };
  }, [controls, camera, minX, maxX, minZ, maxZ, invalidate]);
  return null;
}

function KeyboardPanControls({
  enabled = true,
  step = 0.4,
}: {
  enabled?: boolean;
  step?: number;
}) {
  const { controls } = useThree((s) => ({
    controls: s.controls as OrbitControlsImpl | undefined,
  }));
  useOrbitKeyboardPan(controls, { enabled, panStep: step });
  return null;
}
