"use client";

import { OrbitControls } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useThree } from "@react-three/fiber";
import React, { useCallback, useEffect } from "react";
import { MOUSE, TOUCH } from "three";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ClientCanvas } from "@/components/game/ClientCanvas";
import TrackpadOrbitAdapter from "@/lib/controls/TrackpadOrbitAdapter";
import { BoardEnvironment } from "@/lib/game/components/BoardEnvironment";
import { BASE_TILE_SIZE, MAT_RATIO } from "@/lib/game/constants";
import { Physics } from "@/lib/game/physics";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";
import { useZoomKeyboardShortcuts } from "@/lib/hooks/useZoomKeyboardShortcuts";

// Default board dimensions (5x4 grid)
const BOARD_W = 5;
const BOARD_H = 4;
const baseGridW = BOARD_W * BASE_TILE_SIZE;
const baseGridH = BOARD_H * BASE_TILE_SIZE;
const matH = Math.max(baseGridH, baseGridW / MAT_RATIO);
const matW = matH === baseGridH ? baseGridH * MAT_RATIO : baseGridW;

// Marquee selection plane size — slightly larger than mat
const PLANE_W = matW + 4;
const PLANE_H = matH + 4;

interface EditorCanvasProps {
  children?: React.ReactNode;
  orbitLocked?: boolean;
  /** Marquee pointer callbacks from useMarqueeSelection */
  onMarqueePointerDown?: (
    screenX: number,
    screenY: number,
    worldX: number,
    worldZ: number,
  ) => void;
  onMarqueePointerMove?: (screenX: number, screenY: number) => void;
  onMarqueePointerUp?: (worldX: number, worldZ: number, shiftKey: boolean) => void;
  onMarqueeCancel?: () => void;
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
  onMarqueePointerDown,
  onMarqueePointerMove,
  onMarqueePointerUp,
  onMarqueeCancel,
}: EditorCanvasProps) {
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
        {/* Reduced ambient for more dramatic shadows */}
        <ambientLight intensity={0.4} />
        {/* Main directional light */}
        <directionalLight
          position={[10, 12, 8]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={50}
          shadow-camera-left={-15}
          shadow-camera-right={15}
          shadow-camera-top={15}
          shadow-camera-bottom={-15}
          shadow-bias={-0.0005}
        />
        {/* Soft fill light from opposite side */}
        <directionalLight
          position={[-8, 6, -3]}
          intensity={0.25}
          color="#b4c5e4"
        />
        <Physics gravity={[0, -9.81, 0]}>
          {/* Table + environment lighting (no game grid) */}
          <BoardEnvironment
            matW={matW}
            matH={matH}
            showPlaymat={false}
            showOverlay={false}
            showTable
          />
          {/* Marquee selection plane — invisible, catches left-click on empty surface */}
          <MarqueeSelectionPlane
            onMarqueePointerDown={onMarqueePointerDown}
            onMarqueePointerMove={onMarqueePointerMove}
            onMarqueePointerUp={onMarqueePointerUp}
            onMarqueeCancel={onMarqueeCancel}
          />
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

/**
 * Invisible plane at board level that detects left-click drag on empty surface
 * for marquee (rubber-band) selection in the editor.
 */
function MarqueeSelectionPlane({
  onMarqueePointerDown,
  onMarqueePointerMove,
  onMarqueePointerUp,
  onMarqueeCancel,
}: {
  onMarqueePointerDown?: (
    screenX: number,
    screenY: number,
    worldX: number,
    worldZ: number,
  ) => void;
  onMarqueePointerMove?: (screenX: number, screenY: number) => void;
  onMarqueePointerUp?: (worldX: number, worldZ: number, shiftKey: boolean) => void;
  onMarqueeCancel?: () => void;
}) {
  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.nativeEvent.button !== 0) return;
      onMarqueePointerDown?.(
        e.nativeEvent.clientX,
        e.nativeEvent.clientY,
        e.point.x,
        e.point.z,
      );
    },
    [onMarqueePointerDown],
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      onMarqueePointerMove?.(e.nativeEvent.clientX, e.nativeEvent.clientY);
    },
    [onMarqueePointerMove],
  );

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      onMarqueePointerUp?.(e.point.x, e.point.z, e.nativeEvent.shiftKey);
    },
    [onMarqueePointerUp],
  );

  return (
    <mesh
      position={[0, -0.01, 0]}
      rotation-x={-Math.PI / 2}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => onMarqueeCancel?.()}
    >
      <planeGeometry args={[PLANE_W, PLANE_H]} />
      <meshBasicMaterial visible={false} />
    </mesh>
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
  step = 0.8,
}: {
  enabled?: boolean;
  step?: number;
}) {
  const { controls } = useThree((s) => ({
    controls: s.controls as OrbitControlsImpl | undefined,
  }));
  useOrbitKeyboardPan(controls, { enabled, panStep: step });
  useZoomKeyboardShortcuts(controls, { enabled });
  return null;
}
