"use client";

/**
 * The 3D board for Rules Engine matches. Renders our regular board from the
 * store, which the engine session keeps projected; all input goes through the
 * board picker (useEngineInteraction / EnginePromptPanel).
 *
 * Its own file so it can be dynamically imported with ssr:false.
 */

import { OrbitControls } from "@react-three/drei";
import { invalidate, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ClientCanvas } from "@/components/game/ClientCanvas";
import {
  DynamicBoard as Board,
  DynamicHand3D as Hand3D,
  DynamicHud3D as Hud3D,
  DynamicPiles3D as Piles3D,
} from "@/components/game/dynamic-3d";
import TrackpadOrbitAdapter from "@/lib/controls/TrackpadOrbitAdapter";
import { useEngineSession } from "@/lib/engine-mode/session";
import { computeTopdownFitDistance } from "@/lib/game/cameraFit";
import TextureCache from "@/lib/game/components/TextureCache";
import { MAT_PIXEL_W, MAT_PIXEL_H, BASE_TILE_SIZE, MAT_RATIO, TILE_SIZE } from "@/lib/game/constants";
import { Physics } from "@/lib/game/physics";
import { useGameStore } from "@/lib/game/store";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";
import { useViewportSize } from "@/lib/hooks/useTouchDevice";
import { useZoomKeyboardShortcuts } from "@/lib/hooks/useZoomKeyboardShortcuts";
import EngineDamageMarks from "./EngineDamageMarks";
import EngineEventReveal from "./EngineEventReveal";
import EngineLayerOverlay from "./EngineLayerOverlay";

/**
 * Lighting per board layer. The subsurface view is literally below the waterline, so it gets
 * a cold, green-blue key as if the light were filtering down through water, a lifted ambient
 * (water scatters light rather than letting it fall off), and exponential fog so the far edge
 * of the realm dissolves instead of ending crisply.
 *
 * All static values: switching layers is one React render, so the demand frameloop draws a
 * single frame and then goes idle again — no animation budget spent on the mood.
 */
interface BoardLight {
  background: string;
  ambient: number;
  ambientColor: string;
  key: number;
  keyColor: string;
  fill: number;
  fillColor: string;
  rim: number;
  rimColor: string;
  /** fogExp2 density; 0 disables fog entirely */
  fog: number;
  fog1: string;
}

const LAYER_LIGHT: Record<"surface" | "subsurface", BoardLight> = {
  surface: {
    background: "#0b0b0c",
    ambient: 0.5,
    ambientColor: "#ffffff",
    key: 1.6,
    keyColor: "#ffffff",
    fill: 0.3,
    fillColor: "#b4c5e4",
    rim: 0.2,
    rimColor: "#e8d5c4",
    fog: 0,
    fog1: "#000000",
  },
  subsurface: {
    background: "#05202c",
    ambient: 0.72,
    ambientColor: "#5fd2e0",
    key: 1.0,
    keyColor: "#8ef0ff",
    fill: 0.42,
    fillColor: "#1d7fa8",
    rim: 0.3,
    rimColor: "#0f5f7a",
    fog: 0.028,
    fog1: "#06293a",
  },
};

/**
 * What the engine HUD really covers, so the opening camera can frame the grid as large as
 * the free space allows: the turn pill above, the button bar below, and the life / resource
 * panels hugging the far left and right edges. The prompt banner and the raised hand are
 * deliberately NOT reserved — they are transient, and reserving them would shrink the board
 * for the whole match.
 */
const ENGINE_HUD_INSETS = { top: 56, bottom: 64, left: 96, right: 96 };
/** Almost straight down, with just enough tilt to read the cards. */
/** Orbit sits slightly off straight-down; top-down is flat on the table, like /play's 2D. */
const BASELINE_TILT = 0.14;
const TOPDOWN_TILT = 0.0001;

export default function EngineBoard3D({
  controlsRef: externalControls,
  cameraLocked = false,
}: {
  controlsRef?: React.RefObject<OrbitControlsImpl | null>;
  /** Mirrors /play's `canPanCamera`: while a pick or a drag is in progress the table holds
   *  still, so dragging onto a target cannot spin the board out from under you. */
  cameraLocked?: boolean;
} = {}) {
  const boardSize = useGameStore((s) => s.board.size);
  const layer = useEngineSession((s) => s.layer);
  // the same orbit/top-down switch the other modes use
  const cameraMode = useGameStore((s) => s.cameraMode);
  const light = LAYER_LIGHT[layer === "subsurface" ? "subsurface" : "surface"];
  const viewport = useViewportSize();
  const ownControls = useRef<OrbitControlsImpl | null>(null);
  const controlsRef = externalControls ?? ownControls;

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

  // Frame the playable grid, not the whole playmat: the old "1.1 × mat" heuristic leaves the
  // board small and distant. Falls back to it until the viewport has been measured.
  const baselineDist = useMemo(() => {
    if (!viewport.width || !viewport.height) return Math.max(matW, matH) * 1.1;
    return computeTopdownFitDistance({
      gridW: boardSize.w * TILE_SIZE,
      gridH: boardSize.h * TILE_SIZE,
      viewportW: viewport.width,
      viewportH: viewport.height,
      fovDeg: 50,
      insets: ENGINE_HUD_INSETS,
      margin: 1.0,
    });
  }, [viewport.width, viewport.height, boardSize.w, boardSize.h, matW, matH]);

  // Top-down with a slight tilt, from P1's (the human's) side.
  const gotoBaseline = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    c.target.set(0, 0, 0);
    const cam = c.object;
    const dist = baselineDist;
    const tilt = BASELINE_TILT;
    cam.position.set(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    c.update();
  }, [baselineDist, controlsRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(t.tagName))) return;
      e.preventDefault();
      gotoBaseline();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gotoBaseline]);

  const clampControls = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    const t = c.target;
    const halfW = matW / 2;
    const halfH = matH / 2;
    const x = Math.min(halfW, Math.max(-halfW, t.x));
    const z = Math.min(halfH, Math.max(-halfH, t.z));
    if (x !== t.x || z !== t.z || t.y !== 0) {
      t.set(x, 0, z);
      c.update();
    }
  }, [matW, matH, controlsRef]);

  return (
    <ClientCanvas
      camera={{ position: [0, 10, 0], fov: 50 }}
      shadows
      frameloop="demand"
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={[light.background]} />
      {/* Underwater, the whole realm sits in suspended water: haze swallows the far edge. */}
      {light.fog > 0 && <fogExp2 attach="fog" args={[light.fog1, light.fog]} />}
      <ambientLight intensity={light.ambient} color={light.ambientColor} />
      <directionalLight
        position={[5, 12, 5]}
        intensity={light.key}
        color={light.keyColor}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-8, 6, -3]} intensity={light.fill} color={light.fillColor} />
      <directionalLight position={[0, 3, -10]} intensity={light.rim} color={light.rimColor} />

      {/* Catch scene suspensions (lazy board chunks, textures) inside the canvas: R3F otherwise
          re-throws them into the DOM tree, which unmounts and remounts the Canvas, and its
          deferred teardown then kills the new WebGL context. */}
      <Suspense fallback={null}>
        <Physics gravity={[0, -9.81, 0]}>
          <Board />
        </Physics>

        <Piles3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
        <Piles3D owner="p2" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
        <Hud3D owner="p1" />
        <Hud3D owner="p2" />
          {/* steady: slides down out of the way like always, but only the pointer moves it —
            a draw or an open pick never shoves it over the board */}
        <Hand3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} steadyReveal />
        {/* The computer's hand, face down along their edge — the same second Hand3D the online
            view mounts. Without it there was no way to see how many cards they are holding, which
            is public information in this game. The projection already fills their hand with one
            hidden card per held card, so the count is right. */}
        <Hand3D owner="p2" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} showCardBacks viewerPlayerNumber={1} />

        <TextureCache />
        <EngineLayerOverlay />
      </Suspense>

      {/* Outside the Suspense boundary on purpose: this layer loads nothing, and a sibling
          suspending on a card texture would otherwise unmount it mid-animation and kill the
          damage numbers it is in the middle of floating. */}
      <EngineEventReveal />
      <EngineDamageMarks />

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0, 0]}
        mouseButtons={{ MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
        touches={{ TWO: THREE.TOUCH.PAN }}
        enabled={!cameraLocked}
        enablePan={!cameraLocked}
        enableRotate={!cameraLocked && cameraMode === "orbit"}
        enableDamping={false}
        zoomSpeed={0.6}
        onChange={clampControls}
        minDistance={minDist}
        maxDistance={maxDist}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.4}
      />
      <CameraBaseline dist={baselineDist} tilt={cameraMode === "topdown" ? TOPDOWN_TILT : BASELINE_TILT} />
      <KeyboardPanControls />
      <TrackpadOrbitAdapter />
    </ClientCanvas>
  );
}

/**
 * Puts the camera on its opening framing. This has to live INSIDE the Canvas: `OrbitControls`
 * mounts in the Canvas's own React root, so a ref read from the page-level effect is still
 * null when that effect runs — which is why the board used to open at the Canvas's default
 * position instead of the framing we computed. Re-applies if the viewport (and so the fit)
 * changes, but never after the player has moved the camera themselves.
 */
function CameraBaseline({ dist, tilt }: { dist: number; tilt: number }) {
  const controls = useThree((state) => state.controls as OrbitControlsImpl | undefined);
  const camera = useThree((state) => state.camera);
  const touched = useRef(false);
  const lastTilt = useRef(tilt);

  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      touched.current = true;
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener("start", onStart);
  }, [controls]);

  useEffect(() => {
    // Asking for a different camera mode is an explicit request to be re-framed, so it
    // overrides "the player has moved the camera, leave it alone".
    const modeChanged = lastTilt.current !== tilt;
    lastTilt.current = tilt;
    if (!controls || (touched.current && !modeChanged)) return;
    controls.target.set(0, 0, 0);
    camera.position.set(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    controls.update();
    invalidate();
  }, [controls, camera, dist, tilt]);

  return null;
}

function KeyboardPanControls() {
  const { controls } = useThree((state) => ({ controls: state.controls as OrbitControlsImpl | undefined }));
  useOrbitKeyboardPan(controls, { enabled: true, panStep: 0.8, viewPlayerNumber: 1 });
  useZoomKeyboardShortcuts(controls, { enabled: true });
  return null;
}
