"use client";

import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { type RefObject, type SyntheticEvent, useMemo, useRef } from "react";
import * as THREE from "three";
import { useShallow } from "zustand/react/shallow";
import { RcButton } from "@/components/ui/rc-button";
import { useVisualAid } from "@/hooks/useGraphicsSettings";
import { TILE_SIZE } from "@/lib/game/constants";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { ARROW_STEPS, fieldTargets, toneColors, type ArrowDirection, type ArrowTarget, type FieldTone, type OptionRow } from "@/lib/game/cpu/fieldTargets";
import { requestCosmeticFrame } from "@/lib/game/render/cosmeticFrame";
import { useGameStore } from "@/lib/game/store";

type Level = {opacity: number; pulse: number};
type Fills = RefObject<Map<string, THREE.MeshBasicMaterial>>;
// Amber = something you could start. Violet = the next step of something you already began,
// so a target prompt never looks like a fresh choice. Green = picked. Cyan = where it comes from.
// Under a visual aid the whole set is swapped — see toneColors in fieldTargets.ts.
// Outline-led like MagicTargetOverlay: the border does the work, a faint pulsing fill keeps the tile readable.
// `area` is the heaviest static wash: it has to read as one block of ground, not four tiles.
const TILE_LEVELS: Record<FieldTone, Level> = {candidate:{opacity:0.07,pulse:0.04},continue:{opacity:0.12,pulse:0.07},selected:{opacity:0.16,pulse:0.05},target:{opacity:0.1,pulse:0.03},source:{opacity:0.08,pulse:0.03},area:{opacity:0.2,pulse:0}};
// Arrows are small, so their fill carries the signal.
const ARROW_LEVELS: Record<FieldTone, Level> = {candidate:{opacity:0.5,pulse:0.18},continue:{opacity:0.6,pulse:0.22},selected:{opacity:0.85,pulse:0.1},target:{opacity:0.7,pulse:0},source:{opacity:0.5,pulse:0},area:{opacity:0.5,pulse:0}};
// Exactly the cell boundary: the playmat's grid line is centred on it, so the outline lands
// ON the line rather than a hair inside it. Any inset here reads as a visible misalignment.
const HALF = TILE_SIZE/2;
const OUTLINE = new Float32Array([-HALF,HALF,0.001,HALF,HALF,0.001,HALF,-HALF,0.001,-HALF,-HALF,0.001]);
// A target-lock sigil instead of a plain box: four corner brackets, so the tile reads as
// "aimed at" rather than merely shaded, and the card art in the middle stays unobscured.
const BRACKET_ARM = TILE_SIZE*0.26;
const BRACKETS = new Float32Array([-1,-1,1,-1,1,1,-1,1].reduce<number[]>((out,_,index,signs) => {
  if (index % 2) return out;
  const sx = signs[index], sy = signs[index+1];
  const corner: [number, number] = [sx*HALF,sy*HALF];
  out.push(...corner,0.001, sx*(HALF-BRACKET_ARM),sy*HALF,0.001);
  out.push(...corner,0.001, sx*HALF,sy*(HALF-BRACKET_ARM),0.001);
  return out;
},[]));
// A small diamond at the centre that breathes with the pulse — the "drop it here" beacon.
const PIP = TILE_SIZE*0.085;
const PIP_SHAPE = new Float32Array([0,PIP,0.0015, PIP,0,0.0015, 0,-PIP,0.0015, -PIP,0,0.0015]);
// The invisible click plane sits above stacked cards, so a clickable tile wins the raycast
// (as the previous flat planes did).
const LIFT = 0.3;
/**
 * The VISUALS sit just above the board, level with the grid. Drawing them at LIFT too made
 * them miss their own cell by several pixels: with the camera tilted, anything raised off the
 * board parallaxes away from the grid line it is meant to trace.
 *
 * They are depth-TESTED on purpose: a tile highlight belongs to the table, so a card standing
 * on that tile occludes it. Painting them through the cards (depthTest:false) read as the
 * outline being drawn on top of the artwork rather than under it.
 */
const VISUAL_LIFT = 0.002;
/** Local +z inside the flattened group is world +y, so this raises the click plane back up. */
const CLICK_PLANE_Z = LIFT - VISUAL_LIFT;
/** CPU matches: must stay UNDER the board-covering overlays that start at z-40/z-50
 *  (DefensePanel, ElementChoiceOverlay, RevealOverlay, PlacementDialog, HandPeekDialog…). */
const HTML_Z: [number, number] = [20,0];
/** Rules-Engine matches have no such low overlays (their lowest is CpuPlayReveal at z-95), and
 *  these buttons ARE the interaction — they must sit above the passive HUD readouts at z-150,
 *  but below the prompt shell at z-200 which can legitimately supersede them. */
const HTML_Z_ENGINE: [number, number] = [158,0];

// An arrow pointing along +Y in its own plane; the group turns it to face N/E/S/W on the board.
const ARROW_LENGTH = TILE_SIZE*0.3, ARROW_HEAD = TILE_SIZE*0.15, ARROW_SHAFT = TILE_SIZE*0.06, ARROW_HEAD_LENGTH = TILE_SIZE*0.14;
const ARROW_POINTS: [number, number][] = [
  [-ARROW_SHAFT,-ARROW_LENGTH/2],[ARROW_SHAFT,-ARROW_LENGTH/2],[ARROW_SHAFT,ARROW_LENGTH/2-ARROW_HEAD_LENGTH],[ARROW_HEAD,ARROW_LENGTH/2-ARROW_HEAD_LENGTH],
  [0,ARROW_LENGTH/2],[-ARROW_HEAD,ARROW_LENGTH/2-ARROW_HEAD_LENGTH],[-ARROW_SHAFT,ARROW_LENGTH/2-ARROW_HEAD_LENGTH],
];
const ARROW_SHAPE = new THREE.Shape(ARROW_POINTS.map(([x,y]) => new THREE.Vector2(x,y)));
const ARROW_OUTLINE = new Float32Array(ARROW_POINTS.flatMap(([x,y]) => [x,y,0.001]));
// The press area is a little larger than the arrow; four arrows on one tile still never overlap.
const ARROW_HIT: [number, number] = [ARROW_HEAD*2+TILE_SIZE*0.04,ARROW_LENGTH+TILE_SIZE*0.04];
/** The arrow's centre sits this far from the tile centre, its tip at the tile edge, so it shows even when the path beyond is off the board. */
const ARROW_REACH = TILE_SIZE/2-ARROW_LENGTH/2-TILE_SIZE*0.02;
const ARROW_TURN: Record<ArrowDirection, number> = {N:0,E:-Math.PI/2,S:Math.PI,W:Math.PI/2};

const noRaycast = () => undefined;
const stop = (event: ThreeEvent<PointerEvent | MouseEvent>) => event.stopPropagation();
/** The pick lands on click, not on press: R3F delivers the click to everything hit at pointerdown, so the plane must still be
 * mounted to swallow it (a pick usually removes the tile from the next step's candidates). */
const pick = (event: ThreeEvent<MouseEvent>, token: string) => { event.stopPropagation(); useCpuBoardPicker.getState().select(token); };
/** Html buttons live in the canvas container: keep their presses from reaching the board's pointer handlers underneath. */
const stopDom = (event: SyntheticEvent) => event.stopPropagation();
const cell = (at: string) => at.split(",").map(Number) as [number, number];
const pulses = (tone: FieldTone) => tone === "candidate" || tone === "continue" || tone === "selected";

export default function CpuFieldTargets({offsetX,offsetY}: {offsetX:number;offsetY:number}) {
  const cpu = useGameStore(state => state.opponentPlayerId?.startsWith("cpu_") === true);
  const {request,tiles,selected,glow,sources,labels,sequence,areas,hovered} = useCpuBoardPicker(useShallow(picker => ({request:picker.request,tiles:picker.tiles,selected:picker.selected,glow:picker.glow,sources:picker.sources,labels:picker.labels,sequence:picker.sequence,areas:picker.areas,hovered:picker.hovered})));
  // `hovered` only feeds the area preview, so a board with no areas never re-derives on hover.
  const anchor = Object.keys(areas).length ? hovered : null;
  const COLORS = toneColors(useVisualAid());
  const targets = useMemo(() => fieldTargets({tiles,selected,glow,sources,labels,sequence,areas,hovered:anchor}),[tiles,selected,glow,sources,labels,sequence,areas,anchor]);
  // Rules Engine matches (src/lib/engine-mode) drive the same picker; their requests start with "engine".
  if (!cpu && !request.startsWith("engine")) return null;
  const zRange = request.startsWith("engine") ? HTML_Z_ENGINE : HTML_Z;
  return <>
    {(targets.tiles.size > 0 || targets.arrows.length > 0) && <TargetMeshes offsetX={offsetX} offsetY={offsetY} tones={targets.tiles} arrows={targets.arrows} labels={labels} zRange={zRange} colors={COLORS} />}
    {Object.keys(areas).length > 0 && <AreaMarkers offsetX={offsetX} offsetY={offsetY} areas={areas} hovered={hovered} selected={selected} colors={COLORS} />}
    {targets.rows.length > 0 && <OptionRows offsetX={offsetX} offsetY={offsetY} rows={targets.rows} zRange={zRange} />}
  </>;
}

function TargetMeshes({offsetX,offsetY,tones,arrows,labels,zRange,colors}: {offsetX:number;offsetY:number;tones:Map<string, FieldTone>;arrows:ArrowTarget[];labels:Readonly<Record<string, string>>;zRange:[number, number];colors:Record<FieldTone, string>}) {
  const fills = useRef(new Map<string, THREE.MeshBasicMaterial>());
  // Hover lives in the picker store, not locally: a caller can then preview what the hovered
  // token would do (the engine's direction prompt lights that direction's whole lane).
  const hovered = useCpuBoardPicker(picker => picker.hovered);
  const setHovered = useCpuBoardPicker.getState().setHovered;
  // Only targets awaiting a click pulse; chosen targets and idle ability sources stay static, so an idle board renders nothing.
  const levels = new Map<string, Level>();
  for (const [tile,tone] of tones) if (pulses(tone)) {
    levels.set(tile,TILE_LEVELS[tone]);
    // the centre pip swings wider than the tile wash, so the beacon reads from across the board
    levels.set(`${tile}:pip`,{opacity:0.55,pulse:0.4});
  }
  for (const arrow of arrows) if (pulses(arrow.tone)) levels.set(arrow.token,ARROW_LEVELS[arrow.tone]);
  const pulsing = levels.size > 0;
  // any tile awaiting the next step of a started choice puts the whole board on the slow rhythm
  const slow = [...tones.values()].some((tone) => tone === "continue") || arrows.some((a) => a.tone === "continue");
  const fill = (token: string) => (material: THREE.MeshBasicMaterial | null) => { if (material) fills.current.set(token,material); else fills.current.delete(token); };
  return <group>{pulsing && <Pulse fills={fills} levels={levels} slow={slow} />}{[...tones].map(([tile,tone]) => {
    const [x,y] = cell(tile), color = colors[tone];
    return <group key={tile} position={[offsetX+x*TILE_SIZE,VISUAL_LIFT,offsetY+y*TILE_SIZE]} rotation-x={-Math.PI/2}>
      <mesh raycast={noRaycast} renderOrder={1100}>
        <planeGeometry args={[TILE_SIZE,TILE_SIZE]} />
        {/* Remounted when the pulse stops, so no tile keeps a mid-pulse opacity. */}
        <meshBasicMaterial key={pulsing ? "pulse" : "still"} ref={fill(tile)} color={color} transparent opacity={TILE_LEVELS[tone].opacity} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* a chosen target or an ability source keeps the quiet full box; a tile awaiting a
          click wears the sigil: corner brackets plus a breathing centre pip */}
      {pulses(tone) ? <>
        {/* keep the full box so a clickable tile is never less prominent than a lit one… */}
        <lineLoop raycast={noRaycast} renderOrder={1101}>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[OUTLINE,3]} /></bufferGeometry>
          <lineBasicMaterial color={color} transparent opacity={0.45} />
        </lineLoop>
        {/* …and add the target-lock brackets and centre pip on top of it */}
        <lineSegments raycast={noRaycast} renderOrder={1101}>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[BRACKETS,3]} /></bufferGeometry>
          <lineBasicMaterial color={color} transparent opacity={0.95} />
        </lineSegments>
        <lineLoop raycast={noRaycast} renderOrder={1101}>
          <bufferGeometry><bufferAttribute attach="attributes-position" args={[PIP_SHAPE,3]} /></bufferGeometry>
          <lineBasicMaterial key={pulsing ? "pulse" : "still"} ref={fill(`${tile}:pip`)} color={color} transparent opacity={0.85} />
        </lineLoop>
      </> : <lineLoop raycast={noRaycast} renderOrder={1101}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[OUTLINE,3]} /></bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.9} />
      </lineLoop>}
      {pulses(tone) && <mesh name={`cpu-pick:${tile}`} position={[0,0,CLICK_PLANE_Z]} onPointerDown={stop} onPointerUp={stop} onClick={event => pick(event,tile)}
        onPointerOver={event => { event.stopPropagation(); setHovered(tile); }} onPointerOut={() => { if (useCpuBoardPicker.getState().hovered === tile) setHovered(null); }}>
        <planeGeometry args={[TILE_SIZE,TILE_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>}
      {/* what clicking here will do — the board says where, the tooltip says what */}
      {hovered === tile && labels[tile] && <Html center zIndexRange={zRange} position={[0,0,LIFT]} style={{pointerEvents:"none"}}>
        <div role="tooltip" className="rc-toast whitespace-nowrap px-2 py-1 font-rc-sans text-xs text-rc-fg">{labels[tile]}</div>
      </Html>}
    </group>;
  })}{arrows.map(({token,at,dir,tone,clickable}) => {
    const [x,y] = cell(at), [dx,dy] = ARROW_STEPS[dir], color = colors[tone], label = labels[token];
    return <group key={token} position={[offsetX+(x*TILE_SIZE)+dx*ARROW_REACH,VISUAL_LIFT+0.001,offsetY+(y*TILE_SIZE)+dy*ARROW_REACH]} rotation={[-Math.PI/2,0,ARROW_TURN[dir]]}>
      <mesh raycast={noRaycast} renderOrder={1102}>
        <shapeGeometry args={[ARROW_SHAPE]} />
        <meshBasicMaterial key={pulsing ? "pulse" : "still"} ref={fill(token)} color={color} transparent opacity={ARROW_LEVELS[tone].opacity} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineLoop raycast={noRaycast} renderOrder={1103}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[ARROW_OUTLINE,3]} /></bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.95} />
      </lineLoop>
      {clickable && <mesh name={`cpu-pick:${token}`} position={[0,0,CLICK_PLANE_Z]} onPointerDown={stop} onPointerUp={stop} onClick={event => pick(event,token)}
        onPointerOver={event => { event.stopPropagation(); setHovered(token); }} onPointerOut={() => { if (useCpuBoardPicker.getState().hovered === token) setHovered(null); }}>
        <planeGeometry args={ARROW_HIT} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>}
      {hovered === token && label && <Html center zIndexRange={zRange} style={{pointerEvents:"none"}}>
        <div role="tooltip" className="rc-toast whitespace-nowrap px-2 py-1 font-rc-sans text-xs text-rc-fg">{label}</div>
      </Html>}
    </group>;
  })}</group>;
}

/** Real buttons anchored above a tile, one row per tile, only while the picker offers `opt:` choices. */
// A 2x2 area is anchored on an INTERSECTION — the point four squares meet at — not on a square.
// Auras go there strictly, so the board has to say so: a diamond sits on the crossing itself,
// and hovering it washes the four squares it would cover. Drawing the anchor as a tile instead
// invited the player to read it as "choose this square", which is a different thing entirely.
const DIAMOND_R = TILE_SIZE * 0.17;
const DIAMOND = new Float32Array([0,DIAMOND_R,0, DIAMOND_R,0,0, 0,-DIAMOND_R,0, -DIAMOND_R,0,0]);
// Exactly one tile across, so the markers' hit boxes TILE the board: wherever the pointer is,
// it falls inside the box of the crossing nearest to it and that crossing previews itself. The
// preview therefore follows the cursor around the board instead of waiting to be hovered.
const MARKER_HIT = TILE_SIZE;

function AreaMarkers({offsetX,offsetY,areas,hovered,selected,colors}: {offsetX:number;offsetY:number;areas:Record<string, string[]>;hovered:string | null;selected:string | null;colors:Record<FieldTone, string>}) {
  const setHovered = useCpuBoardPicker.getState().setHovered;
  const rings = useRef(new Map<string, THREE.LineBasicMaterial>());
  // The crossing is the CENTRE of the covered squares, which stays correct however the board is
  // rotated relative to the engine, and degrades sensibly for an area clipped at the edge.
  const anchors = useMemo(() => Object.entries(areas).map(([token,cells]) => {
    const points = cells.map(cell);
    const cx = points.reduce((sum,[x]) => sum+x,0)/(points.length || 1);
    const cy = points.reduce((sum,[,y]) => sum+y,0)/(points.length || 1);
    return {token,cx,cy};
  }),[areas]);
  // One loop for every marker, like Pulse: no per-marker subscription.
  useFrame(({clock}) => {
    const wave = (Math.sin(clock.getElapsedTime()*2.2)+1)/2;
    for (const [token,material] of rings.current) {
      const lit = token === hovered || token === selected;
      material.opacity = lit ? 1 : 0.5+0.35*wave;
    }
    requestCosmeticFrame();
  });
  const ring = (token: string) => (material: THREE.LineBasicMaterial | null) => { if (material) rings.current.set(token,material); else rings.current.delete(token); };
  return <group>{anchors.map(({token,cx,cy}) => {
    const lit = token === hovered || token === selected;
    const color = token === selected ? colors.selected : lit ? colors.area : colors.candidate;
    return <group key={token} position={[offsetX+cx*TILE_SIZE,VISUAL_LIFT+0.001,offsetY+cy*TILE_SIZE]} rotation-x={-Math.PI/2}>
      <mesh raycast={noRaycast} renderOrder={1104}>
        <circleGeometry args={[DIAMOND_R*0.42,4]} />
        <meshBasicMaterial color={color} transparent opacity={lit ? 0.9 : 0.5} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <lineLoop raycast={noRaycast} renderOrder={1105}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[DIAMOND,3]} /></bufferGeometry>
        <lineBasicMaterial ref={ring(token)} color={color} transparent opacity={0.8} />
      </lineLoop>
      <mesh name={`cpu-pick:${token}`} position={[0,0,CLICK_PLANE_Z]} onPointerDown={stop} onPointerUp={stop} onClick={event => pick(event,token)}
        onPointerOver={event => { event.stopPropagation(); setHovered(token); }} onPointerOut={() => { if (useCpuBoardPicker.getState().hovered === token) setHovered(null); }}>
        <planeGeometry args={[MARKER_HIT,MARKER_HIT]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>;
  })}</group>;
}

function OptionRows({offsetX,offsetY,rows,zRange}: {offsetX:number;offsetY:number;rows:OptionRow[];zRange:[number, number]}) {
  return <>{rows.map(({at,options}) => {
    const [x,y] = cell(at);
    return <Html key={at} center zIndexRange={zRange} position={[offsetX+x*TILE_SIZE,LIFT+0.4,offsetY+y*TILE_SIZE]}>
      <div role="group" aria-label="Choices" data-cpu-options={at} onPointerDown={stopDom} onPointerUp={stopDom} onClick={stopDom} onContextMenu={stopDom}
        className="pointer-events-auto flex w-max max-w-[min(22rem,80vw)] flex-wrap items-center justify-center gap-1.5 rounded-rc-md border border-rc-line/22 bg-[rgba(7,10,20,0.85)] p-1 shadow-rc-panel">
        {options.map(option => <RcButton key={option.token} size="xs" variant={option.variant === "commit" ? "default" : option.variant} tone="success"
          aria-label={option.label} aria-pressed={option.pressed} className="h-9 touch-manipulation sm:h-7"
          onClick={event => { event.stopPropagation(); if (option.clickable) useCpuBoardPicker.getState().select(option.token); }}>
          {option.label}
        </RcButton>)}
      </div>
    </Html>;
  })}</>;
}

/** Mounted only while a target awaits a click (frameloop="demand"): the pulse asks for cosmetic frames, never invalidate(). */
function Pulse({fills,levels,slow}: {fills: Fills; levels: Map<string, Level>; slow?: boolean}) {
  useFrame(({clock}) => {
    // A choice in progress breathes at roughly half speed. The slower rhythm reads as "this is
    // waiting on you" rather than "look here", which is what stops players stalling mid-action.
    const wave = Math.sin(clock.getElapsedTime()*(slow ? 1.4 : 3));
    for (const [token,{opacity,pulse}] of levels) {
      const material = fills.current.get(token);
      if (material) material.opacity = opacity+wave*pulse;
    }
    requestCosmeticFrame();
  });
  return null;
}
