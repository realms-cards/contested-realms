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
  // Switch site position support
  switchSiteSource: GameState["switchSiteSource"];
  onCompleteSwitchSite?: (targetX: number, targetY: number) => void;
  // Chaos Twister site selection support
  pendingChaosTwister: GameState["pendingChaosTwister"];
  actorKey: GameState["actorKey"];
  selectChaosTwisterSite?: GameState["selectChaosTwisterSite"];
  // Earthquake site rearrangement support
  pendingEarthquake?: GameState["pendingEarthquake"];
  selectEarthquakeArea?: GameState["selectEarthquakeArea"];
  performEarthquakeSwap?: GameState["performEarthquakeSwap"];
  hasSiteAtTile: boolean;
  // Atlantean Fate 4x4 area selection support
  pendingAtlanteanFate?: GameState["pendingAtlanteanFate"];
  setAtlanteanFatePreview?: GameState["setAtlanteanFatePreview"];
  selectAtlanteanFateCorner?: GameState["selectAtlanteanFateCorner"];
  // Mephistopheles summon target selection support
  pendingMephistophelesSummon?: GameState["pendingMephistophelesSummon"];
  selectMephistophelesSummonTarget?: GameState["selectMephistophelesSummonTarget"];
  // Pathfinder target selection support
  pendingPathfinderPlay?: GameState["pendingPathfinderPlay"];
  selectPathfinderTarget?: GameState["selectPathfinderTarget"];
  // Cast placement from context menu
  castPlacementMode?: GameState["castPlacementMode"];
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
  switchSiteSource,
  onCompleteSwitchSite,
  pendingChaosTwister,
  actorKey,
  selectChaosTwisterSite,
  pendingEarthquake,
  selectEarthquakeArea,
  performEarthquakeSwap,
  hasSiteAtTile,
  pendingAtlanteanFate,
  setAtlanteanFatePreview,
  selectAtlanteanFateCorner,
  pendingMephistophelesSummon,
  selectMephistophelesSummonTarget,
  pendingPathfinderPlay,
  selectPathfinderTarget,
  castPlacementMode,
}: TileInteractionPlaneProps) {
  const { dragAvatar, dragging, setGhost, draggedBody, moveDraggedBody } =
    dragContext;

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      raycast={noRaycast ? () => [] : undefined}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        const world = e.point;
        handlePointerMove(world.x, world.z);
        if (isSpectator) return;
        // Atlantean Fate preview - update preview corner on hover
        if (
          pendingAtlanteanFate &&
          pendingAtlanteanFate.phase === "selectingCorner" &&
          (pendingAtlanteanFate.casterSeat === actorKey || !actorKey) &&
          setAtlanteanFatePreview
        ) {
          const cellKey = `${tileX},${tileY}`;
          setAtlanteanFatePreview(cellKey);
        }
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
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        // Complete switch site if a source is selected - check this first before other handlers
        // (Skip during earthquake rearranging - earthquake has its own swap handler below)
        if (switchSiteSource && onCompleteSwitchSite &&
            !(pendingEarthquake?.phase === "rearranging")) {
          e.stopPropagation();
          onCompleteSwitchSite(tileX, tileY);
          return;
        }
        // Chaos Twister site selection - click on any site tile
        if (
          pendingChaosTwister &&
          pendingChaosTwister.phase === "selectingSite" &&
          pendingChaosTwister.casterSeat === actorKey &&
          selectChaosTwisterSite &&
          hasSiteAtTile
        ) {
          e.stopPropagation();
          selectChaosTwisterSite({ x: tileX, y: tileY });
          return;
        }
        // Earthquake area selection - click on any tile to select 2x2 area corner
        if (
          pendingEarthquake &&
          pendingEarthquake.phase === "selectingArea" &&
          (pendingEarthquake.casterSeat === actorKey || !actorKey) &&
          selectEarthquakeArea
        ) {
          e.stopPropagation();
          selectEarthquakeArea({ x: tileX, y: tileY });
          return;
        }
        // Atlantean Fate corner selection - click on any tile to select 2x2 area (cursor is lower-right)
        if (
          pendingAtlanteanFate &&
          pendingAtlanteanFate.phase === "selectingCorner" &&
          (pendingAtlanteanFate.casterSeat === actorKey || !actorKey) &&
          selectAtlanteanFateCorner
        ) {
          e.stopPropagation();
          const cellKey = `${tileX},${tileY}`;
          selectAtlanteanFateCorner(cellKey);
          return;
        }
        // Mephistopheles summon target selection - click on valid target tiles
        if (
          pendingMephistophelesSummon &&
          pendingMephistophelesSummon.phase === "selectingSite" &&
          (pendingMephistophelesSummon.ownerSeat === actorKey || !actorKey) &&
          selectMephistophelesSummonTarget
        ) {
          const cellKey = `${tileX},${tileY}`;
          if (pendingMephistophelesSummon.validTargets.includes(cellKey)) {
            e.stopPropagation();
            selectMephistophelesSummonTarget(cellKey);
            return;
          }
        }
        // Pathfinder target selection - click on valid target tiles (void or Rubble)
        if (
          pendingPathfinderPlay &&
          pendingPathfinderPlay.phase === "selectingTarget" &&
          (pendingPathfinderPlay.ownerSeat === actorKey || !actorKey) &&
          selectPathfinderTarget
        ) {
          const cellKey = `${tileX},${tileY}`;
          if (pendingPathfinderPlay.validTargets.includes(cellKey)) {
            e.stopPropagation();
            selectPathfinderTarget(cellKey);
            return;
          }
        }
        // Earthquake swap - click on tiles within the 2x2 area to swap
        if (
          pendingEarthquake &&
          pendingEarthquake.phase === "rearranging" &&
          pendingEarthquake.areaCorner &&
          (pendingEarthquake.casterSeat === actorKey || !actorKey) &&
          performEarthquakeSwap
        ) {
          const { areaCorner } = pendingEarthquake;
          const inArea =
            tileX >= areaCorner.x &&
            tileX < areaCorner.x + 2 &&
            tileY >= areaCorner.y &&
            tileY < areaCorner.y + 2;
          if (inArea && hasSiteAtTile) {
            e.stopPropagation();
            // Dispatch custom event for the overlay to handle swap selection
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("earthquake:tileClick", {
                  detail: { x: tileX, y: tileY },
                })
              );
            }
            return;
          }
        }
        handleTilePointerUp({
          event: e,
          tileX,
          tileY,
          tileWorldPosition: position,
        });
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (Date.now() - lastDropAt.current < 200) return;
        // Cast placement from context menu - handle click-to-place
        if (castPlacementMode && selectedCard && !dragFromHand) {
          handleTilePointerUp({
            event: e as unknown as ThreeEvent<PointerEvent>,
            tileX,
            tileY,
            tileWorldPosition: position,
          });
          return;
        }
        // Switch site is now handled in onPointerUp
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
