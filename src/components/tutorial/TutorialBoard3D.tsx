"use client";

/**
 * 3D game board for tutorial lessons.
 *
 * Extracted into its own file so it can be dynamically imported with ssr:false,
 * preventing Three.js / R3F / @pmndrs packages from being bundled server-side.
 */

import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ClientCanvas } from "@/components/game/ClientCanvas";
import {
  DynamicBoard as Board,
  DynamicHand3D as Hand3D,
  DynamicHud3D as Hud3D,
  DynamicPiles3D as Piles3D,
} from "@/components/game/dynamic-3d";
import { TutorialHighlight3D } from "@/components/tutorial/TutorialHighlight3D";
import type { TutorialHudVisibility } from "@/components/tutorial/useTutorialSession";
import TextureCache from "@/lib/game/components/TextureCache";
import {
  MAT_PIXEL_W,
  MAT_PIXEL_H,
  BASE_TILE_SIZE,
  MAT_RATIO,
} from "@/lib/game/constants";
import { Physics } from "@/lib/game/physics";
import { useGameStore } from "@/lib/game/store";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";
import { useZoomKeyboardShortcuts } from "@/lib/hooks/useZoomKeyboardShortcuts";
import type { TutorialHighlightTarget } from "@/lib/tutorial/types";

interface TutorialBoard3DProps {
  visibleHud: TutorialHudVisibility;
  highlightTarget?: TutorialHighlightTarget;
  highlightVisible?: boolean;
}

/** The full 3D game board rendered inside a Canvas. */
export default function TutorialBoard3D({ visibleHud, highlightTarget, highlightVisible }: TutorialBoard3DProps) {
  const boardSize = useGameStore((s) => s.board.size);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  // Compute playmat extents for camera
  const baseGridW = boardSize.w * BASE_TILE_SIZE;
  const baseGridH = boardSize.h * BASE_TILE_SIZE;
  let matW = baseGridW;
  let matH = baseGridW / MAT_RATIO;
  if (matH < baseGridH) {
    matH = baseGridH;
    matW = baseGridH * MAT_RATIO;
  }

  const minDist = Math.max(1, Math.min(matW, matH) * 0.15);
  const maxDist = Math.max(14, Math.hypot(matW, matH) * 1.3);

  // Set up camera baseline (top-down with slight tilt, P1 perspective)
  const gotoBaseline = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    c.target.set(0, 0, 0);
    const cam = c.object as THREE.Camera;
    const dist = Math.max(matW, matH) * 1.1;
    const tilt = 0.14;
    cam.position.set(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    c.update();
  }, [matW, matH]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!controlsRef.current) {
        setTimeout(gotoBaseline, 0);
      } else {
        gotoBaseline();
      }
    });
    return () => cancelAnimationFrame(id);
  }, [gotoBaseline]);

  // Tab key to reset camera
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.tagName === "BUTTON")) return;
      e.preventDefault();
      gotoBaseline();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gotoBaseline]);

  // Clamp controls to prevent flying off
  const isClampingRef = useRef(false);
  const clampControls = useCallback(() => {
    if (isClampingRef.current) return;
    isClampingRef.current = true;
    try {
      const c = controlsRef.current;
      if (!c) return;
      const halfW = matW / 2;
      const halfH = matH / 2;
      const t = c.target;
      if (t.x < -halfW) t.x = -halfW;
      else if (t.x > halfW) t.x = halfW;
      if (t.z < -halfH) t.z = -halfH;
      else if (t.z > halfH) t.z = halfH;
      if (t.y !== 0) t.y = 0;
      c.update();
    } finally {
      isClampingRef.current = false;
    }
  }, [matW, matH]);

  return (
    <ClientCanvas
      camera={{ position: [0, 10, 0], fov: 50 }}
      shadows
      gl={{
        preserveDrawingBuffer: true,
        antialias: true,
        alpha: false,
      }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#0b0b0c"]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[5, 12, 5]}
        intensity={1.6}
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
      <directionalLight
        position={[-8, 6, -3]}
        intensity={0.3}
        color="#b4c5e4"
      />
      <directionalLight
        position={[0, 3, -10]}
        intensity={0.2}
        color="#e8d5c4"
      />

      <Physics gravity={[0, -9.81, 0]}>
        <Board />
      </Physics>

      {/* 3D tutorial highlight — rendered on the board surface */}
      <TutorialHighlight3D
        target={highlightTarget}
        visible={highlightVisible ?? false}
      />

      {/* 3D piles — shown from lesson 2+ (decks introduced) */}
      {/* Token piles excluded from tutorial — introduced later as a realms.cards QOL feature */}
      {visibleHud.piles && (
        <>
          <Piles3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
          <Piles3D owner="p2" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
        </>
      )}

      <Hud3D owner="p1" />
      <Hud3D owner="p2" />

      {/* Hand — shown from lesson 2+ (cards drawn) */}
      {visibleHud.hand && (
        <Hand3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
      )}

      <TextureCache />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0, 0]}
        mouseButtons={{
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{ TWO: THREE.TOUCH.PAN }}
        enableRotate={false}
        enableDamping={false}
        zoomSpeed={0.6}
        onChange={clampControls}
        minDistance={minDist}
        maxDistance={maxDist}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.4}
      />
      <KeyboardPanControls />
    </ClientCanvas>
  );
}

/** Keyboard pan/zoom controls inside the Canvas context. */
function KeyboardPanControls() {
  const { controls } = useThree((state) => ({
    controls: state.controls as OrbitControlsImpl | undefined,
  }));
  useOrbitKeyboardPan(controls, { enabled: true, panStep: 0.8, viewPlayerNumber: 1 });
  useZoomKeyboardShortcuts(controls, { enabled: true });
  return null;
}
