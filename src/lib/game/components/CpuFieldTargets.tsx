"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";
import { TILE_SIZE } from "@/lib/game/constants";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { requestCosmeticFrame } from "@/lib/game/render/cosmeticFrame";
import { useGameStore } from "@/lib/game/store";

type Tone = "candidate" | "selected" | "target" | "source";
type Fills = RefObject<Map<string, THREE.MeshBasicMaterial>>;
// Outline-led like MagicTargetOverlay: the border does the work, a faint pulsing fill keeps the tile readable.
const TONES: Record<Tone, {color: string; opacity: number; pulse: number}> = {
  candidate:{color:"#f59e0b",opacity:0.07,pulse:0.04},
  selected:{color:"#22c55e",opacity:0.16,pulse:0.05},
  target:{color:"#22c55e",opacity:0.1,pulse:0.03},
  source:{color:"#22d3ee",opacity:0.08,pulse:0.03},
};
const HALF = TILE_SIZE/2-0.01;
const OUTLINE = new Float32Array([-HALF,HALF,0.001,HALF,HALF,0.001,HALF,-HALF,0.001,-HALF,-HALF,0.001]);
// Above stacked cards, so a clickable tile wins the raycast (as the previous flat planes did).
const LIFT = 0.3;
const noRaycast = () => undefined;
const stop = (event: ThreeEvent<PointerEvent | MouseEvent>) => event.stopPropagation();
/** The pick lands on click, not on press: R3F delivers the click to everything hit at pointerdown, so the plane must still be
 * mounted to swallow it (a pick usually removes the tile from the next step's candidates). */
const pick = (event: ThreeEvent<MouseEvent>, tile: string) => { event.stopPropagation(); useCpuBoardPicker.getState().select(tile); };

export default function CpuFieldTargets({offsetX,offsetY}: {offsetX:number;offsetY:number}) {
  const cpu = useGameStore(state => state.opponentPlayerId?.startsWith("cpu_") === true);
  const {tiles,selected,glow,sources} = useCpuBoardPicker(useShallow(picker => ({tiles:picker.tiles,selected:picker.selected,glow:picker.glow,sources:picker.sources})));
  if (!cpu) return null;
  // One highlight per tile: a clickable candidate outranks a chosen target, which outranks a caster or source.
  const tones = new Map<string, Tone>();
  for (const tile of sources) tones.set(tile,"source");
  for (const tile of glow) tones.set(tile,"target");
  for (const tile of tiles) tones.set(tile,tile === selected ? "selected" : "candidate");
  return tones.size ? <TileHighlights offsetX={offsetX} offsetY={offsetY} tones={tones} /> : null;
}

function TileHighlights({offsetX,offsetY,tones}: {offsetX:number;offsetY:number;tones:Map<string, Tone>}) {
  const fills = useRef(new Map<string, THREE.MeshBasicMaterial>());
  // Only tiles awaiting a click pulse; chosen targets and idle ability sources stay static, so an idle board renders nothing.
  const pulsing = [...tones.values()].some(tone => tone === "candidate" || tone === "selected");
  return <group>{pulsing && <Pulse fills={fills} tones={tones} />}{[...tones].map(([tile,tone]) => {
    const [x,y] = tile.split(",").map(Number), {color,opacity} = TONES[tone];
    return <group key={tile} position={[offsetX+x*TILE_SIZE,LIFT,offsetY+y*TILE_SIZE]} rotation-x={-Math.PI/2}>
      <mesh raycast={noRaycast} renderOrder={1100}>
        <planeGeometry args={[TILE_SIZE-0.02,TILE_SIZE-0.02]} />
        {/* Remounted when the pulse stops, so no tile keeps a mid-pulse opacity. */}
        <meshBasicMaterial key={pulsing ? "pulse" : "still"} ref={(material: THREE.MeshBasicMaterial | null) => { if (material) fills.current.set(tile,material); else fills.current.delete(tile); }}
          color={color} transparent opacity={opacity} depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
      </mesh>
      <lineLoop raycast={noRaycast} renderOrder={1101}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[OUTLINE,3]} /></bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.9} depthTest={false} />
      </lineLoop>
      {(tone === "candidate" || tone === "selected") && <mesh name={`cpu-pick:${tile}`} onPointerDown={stop} onPointerUp={stop} onClick={event => pick(event,tile)}>
        <planeGeometry args={[TILE_SIZE-0.02,TILE_SIZE-0.02]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>}
    </group>;
  })}</group>;
}

/** Mounted only while a tile awaits a click (frameloop="demand"): the pulse asks for cosmetic frames, never invalidate(). */
function Pulse({fills,tones}: {fills: Fills; tones: Map<string, Tone>}) {
  useFrame(({clock}) => {
    const wave = Math.sin(clock.getElapsedTime()*3);
    for (const [tile,tone] of tones) {
      const material = fills.current.get(tile);
      if (material) material.opacity = TONES[tone].opacity+wave*TONES[tone].pulse;
    }
    requestCosmeticFrame();
  });
  return null;
}
