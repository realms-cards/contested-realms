"use client";

import { invalidate, useFrame, type ThreeEvent } from "@react-three/fiber";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { DoubleSide, type Group, type Intersection, MathUtils, Mesh, type MeshBasicMaterial, type Raycaster } from "three";
import CardOutline from "@/lib/game/components/CardOutline";
import {
  isPickable,
  pickUnit,
  registerUnitPickPulse,
  UNIT_PICK_COLORS,
  UNIT_PICK_FILL,
  unitPickDistance,
  type UnitPickOffset,
  type UnitPickState,
} from "@/lib/game/cpu/usePickUnit";

const SETTLED = 0.0005;

/** Moves a card to its pick offset (spread along x, lifted over its stack) once, and back when the pick ends.
 * The easing loop is mounted only while moving, so a settled board keeps no frame subscriber. */
export function UnitPickSpread({offset,children}: {offset: UnitPickOffset | undefined; children: ReactNode}) {
  const group = useRef<Group>(null);
  const x = offset?.x ?? 0, lift = offset?.lift ?? 0;
  const [moving,setMoving] = useState(false);
  useLayoutEffect(() => {
    const current = group.current;
    if (!current) return;
    if (Math.abs(current.position.x-x) > SETTLED || Math.abs(current.position.y-lift) > SETTLED) { setMoving(true); invalidate(); }
  },[x,lift]);
  return <group ref={group}>{moving && <SpreadMotion group={group} x={x} lift={lift} onSettled={() => setMoving(false)} />}{children}</group>;
}

function SpreadMotion({group,x,lift,onSettled}: {group: RefObject<Group | null>; x: number; lift: number; onSettled: () => void}) {
  const settled = useRef(false);
  useFrame((_,delta) => {
    const current = group.current;
    if (!current || settled.current) return;
    // Clamp: the first frame after an idle board reports a long delta and would skip the motion.
    const k = Math.min(1,Math.min(delta,1/30)*10);
    current.position.x = MathUtils.lerp(current.position.x,x,k);
    current.position.y = MathUtils.lerp(current.position.y,lift,k);
    if (Math.abs(current.position.x-x) <= SETTLED && Math.abs(current.position.y-lift) <= SETTLED) {
      current.position.x = x;
      current.position.y = lift;
      settled.current = true;
      onSettled();
    }
    invalidate();
  });
  return null;
}

/** Reports hits as if the card lay higher, so it wins over the tile layer's click planes and over cards stacked on it. */
function priorityRaycast(this: Mesh, raycaster: Raycaster, intersects: Intersection[]) {
  const start = intersects.length;
  Mesh.prototype.raycast.call(this,raycaster,intersects);
  for (let index = start; index < intersects.length; index++) intersects[index].distance = unitPickDistance(intersects[index].distance,raycaster.ray.direction.y);
}
const noRaycast = () => undefined;
const stop = (event: ThreeEvent<PointerEvent | MouseEvent>) => event.stopPropagation();

/** The tone outline on a board card, plus, for a candidate, a pulsing fill and the click plane that commits the pick.
 * The pick lands on click, not on press (R3F delivers the click to everything hit at pointerdown); press, release, double
 * click and context menu are swallowed so the card is not selected, dragged, previewed on tap or given a menu. */
export function UnitPickCapture({token,state,width,height,rotationZ,elevation = 0.004}: {
  token: string; state: UnitPickState; width: number; height: number; rotationZ: number; elevation?: number;
}) {
  if (!state) return null;
  const color = UNIT_PICK_COLORS[state];
  return <>
    <CardOutline width={width} height={height} rotationZ={rotationZ} elevation={elevation} color={color} renderOrder={1700} opacity={0.95} />
    {state === "candidate" && <PulsingFill width={width} height={height} rotationZ={rotationZ} elevation={elevation} color={color} />}
    {isPickable(state) && <mesh name={`unit-pick:${token}`} rotation-x={-Math.PI/2} rotation-z={rotationZ} position={[0,elevation+0.001,0]}
      raycast={priorityRaycast} onPointerDown={stop} onPointerUp={stop} onDoubleClick={stop}
      onContextMenu={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); event.nativeEvent.preventDefault(); }}
      onClick={(event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); pickUnit(token); }}>
      <planeGeometry args={[width,height]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>}
  </>;
}

function PulsingFill({width,height,rotationZ,elevation,color}: {width: number; height: number; rotationZ: number; elevation: number; color: string}) {
  const material = useRef<MeshBasicMaterial>(null);
  useEffect(() => {
    const fill = material.current;
    return fill ? registerUnitPickPulse(fill) : undefined;
  },[]);
  return <mesh rotation-x={-Math.PI/2} rotation-z={rotationZ} position={[0,elevation,0]} raycast={noRaycast} renderOrder={1690}>
    <planeGeometry args={[width,height]} />
    <meshBasicMaterial ref={material} color={color} transparent opacity={UNIT_PICK_FILL.opacity} depthWrite={false} toneMapped={false} side={DoubleSide} />
  </mesh>;
}
