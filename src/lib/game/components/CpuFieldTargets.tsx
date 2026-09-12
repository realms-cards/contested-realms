"use client";

import { TILE_SIZE } from "@/lib/game/constants";
import { useCpuBoardPicker } from "@/lib/game/cpu/boardPicker";
import { useGameStore } from "@/lib/game/store";

export default function CpuFieldTargets({offsetX,offsetY}: {offsetX:number;offsetY:number}) {
  const picker = useCpuBoardPicker();
  const cpu = useGameStore(state => state.opponentPlayerId?.startsWith("cpu_"));
  if (!cpu) return null;
  return <group>{picker.tiles.map(tile => {
    const [x,y] = tile.split(",").map(Number);
    return <mesh key={tile} position={[offsetX+x*TILE_SIZE,0.3,offsetY+y*TILE_SIZE]} rotation-x={-Math.PI/2}
      onPointerDown={event => {event.stopPropagation();useCpuBoardPicker.getState().select(tile);}}
      onPointerUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <planeGeometry args={[TILE_SIZE-0.02,TILE_SIZE-0.02]} />
      <meshBasicMaterial color={picker.selected === tile ? "#22c55e" : "#f59e0b"} transparent opacity={0.3} depthWrite={false} />
    </mesh>;
  })}</group>;
}
