import type { ThreeEvent } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { TILE_SIZE } from "@/lib/game/constants";
import type { BoardDragControls } from "@/lib/game/hooks/useBoardDragControls";
import type { GameState } from "@/lib/game/store/types";

export type TileInteractionPlaneProps = {
  position: [number, number, number];
  tileX: number;
  tileY: number;
  noRaycast: boolean;
  isSpectator: boolean;
  dragContext: BoardDragControls;
  dragFromHand: boolean;
  dragFromPile: GameState["dragFromPile"];
  selectedCard: GameState["selectedCard"];
  handlePointerMove: (x: number, z: number) => void;
  handleTilePointerUp: (args: {
    event: ThreeEvent<PointerEvent>;
    tileX: number;
    tileY: number;
    tileWorldPosition: [number, number, number];
  }) => void;
  emitBoardPing: (pos: { x: number; z: number }) => void;
  clearBoardSelection: () => void;
  lastDropAt: MutableRefObject<number>;
};

export function TileInteractionPlane({
  position,
  tileX,
  tileY,
  noRaycast,
  isSpectator,
  dragContext,
  dragFromHand,
  dragFromPile,
  selectedCard,
  handlePointerMove,
  handleTilePointerUp,
  emitBoardPing,
  clearBoardSelection,
  lastDropAt,
}: TileInteractionPlaneProps) {
  const {
    dragAvatar,
    dragging,
    setGhost,
    draggedBody,
    moveDraggedBody,
  } = dragContext;

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      raycast={noRaycast ? () => [] : undefined}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        const world = e.point;
        handlePointerMove(world.x, world.z);
        if (isSpectator) return;
        if (
          dragFromHand &&
          !dragAvatar &&
          !dragging &&
          (selectedCard || dragFromPile?.card)
        ) {
          setGhost({ x: world.x, z: world.z });
        }
        if ((dragging || dragAvatar) && draggedBody.current) {
          moveDraggedBody(world.x, world.z, true);
        }
      }}
      onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
        if (isSpectator) return;
        if (dragFromHand || dragFromPile || dragging || dragAvatar) return;
        e.stopPropagation();
        emitBoardPing({ x: e.point.x, z: e.point.z });
      }}
      onPointerUp={(e: ThreeEvent<PointerEvent>) =>
        handleTilePointerUp({
          event: e,
          tileX,
          tileY,
          tileWorldPosition: position,
        })
      }
      onClick={(e) => {
        e.stopPropagation();
        if (Date.now() - lastDropAt.current < 200) return;
        clearBoardSelection();
      }}
    >
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshStandardMaterial
        color={"#000"}
        opacity={0}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}
