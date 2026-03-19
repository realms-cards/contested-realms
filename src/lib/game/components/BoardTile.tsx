import { Text } from "@react-three/drei";
import type { MutableRefObject } from "react";
import { AreaSelectionOverlay3D } from "@/lib/game/components/AreaSelectionOverlay3D";
import { AtlanteanFateAreaOverlay } from "@/lib/game/components/AtlanteanFateAreaOverlay";
import { AuraPreviewOverlay } from "@/lib/game/components/AuraPreviewOverlay";
import { ChaosTwisterLandingOverlay } from "@/lib/game/components/ChaosTwisterLandingOverlay";
import { GeomancerTargetOverlay } from "@/lib/game/components/GeomancerTargetOverlay";
import { InquisitionSummonTargetOverlay } from "@/lib/game/components/InquisitionSummonTargetOverlay";
import { MagicTargetOverlay } from "@/lib/game/components/MagicTargetOverlay";
import { MephistophelesSummonTargetOverlay } from "@/lib/game/components/MephistophelesSummonTargetOverlay";
import { PathfinderTargetOverlay } from "@/lib/game/components/PathfinderTargetOverlay";
import {
  PermanentStack,
  type PermanentStackProps,
} from "@/lib/game/components/PermanentStack";
import { PortalOverlay } from "@/lib/game/components/PortalOverlay";
import { SiteCard } from "@/lib/game/components/SiteCard";
import {
  TileInteractionPlane,
  type TileInteractionPlaneProps,
} from "@/lib/game/components/TileInteractionPlane";
import type { BoardDragControls } from "@/lib/game/hooks/useBoardDragControls";
import type {
  BabelTowerMerge,
  BoardState,
  CellKey,
  GameState,
  Permanents,
  PlayerKey,
  PortalState,
} from "@/lib/game/store/types";

type BoardTileProps = {
  tileX: number;
  tileY: number;
  tileKey: CellKey;
  position: [number, number, number];
  site: GameState["board"]["sites"][CellKey];
  allowSiteDrag: boolean;
  draggingSite: GameState["draggingSite"];
  setDraggingSite: GameState["setDraggingSite"];
  boardSize: BoardState["size"];
  boardOffset: { x: number; y: number };
  showGrid: boolean;
  noRaycast: boolean;
  dragFromHand: boolean;
  dragFromPile: GameState["dragFromPile"];
  selectedCard: GameState["selectedCard"];
  boardDragContext: BoardDragControls;
  permanentDragContext: PermanentStackProps["dragContext"];
  hoverContext: PermanentStackProps["hoverContext"];
  touchContext: PermanentStackProps["touchContext"];
  selectionContext: PermanentStackProps["selectionContext"];
  combatContext: PermanentStackProps["combatContext"];
  magicContext: PermanentStackProps["magicContext"];
  chaosTwisterContext: PermanentStackProps["chaosTwisterContext"];
  shapeshiftContext: PermanentStackProps["shapeshiftContext"];
  earthquakeContext: {
    pendingEarthquake: GameState["pendingEarthquake"];
    selectEarthquakeArea: GameState["selectEarthquakeArea"];
    performEarthquakeSwap: GameState["performEarthquakeSwap"];
  };
  corpseExplosionContext: {
    pendingCorpseExplosion: GameState["pendingCorpseExplosion"];
    selectCorpseExplosionArea: GameState["selectCorpseExplosionArea"];
  };
  atlanteanFateContext: {
    pendingAtlanteanFate: GameState["pendingAtlanteanFate"];
    setAtlanteanFatePreview: GameState["setAtlanteanFatePreview"];
    selectAtlanteanFateCorner: GameState["selectAtlanteanFateCorner"];
  };
  mephistophelesSummonContext: {
    pendingMephistophelesSummon: GameState["pendingMephistophelesSummon"];
    selectMephistophelesSummonTarget: GameState["selectMephistophelesSummonTarget"];
  };
  pathfinderContext: {
    pendingPathfinderPlay: GameState["pendingPathfinderPlay"];
    selectPathfinderTarget: GameState["selectPathfinderTarget"];
  };
  geomancerContext: {
    pendingGeomancerPlay: GameState["pendingGeomancerPlay"];
    selectGeomancerTarget: GameState["selectGeomancerTarget"];
    pendingGeomancerFill: GameState["pendingGeomancerFill"];
    selectGeomancerFillTarget: GameState["selectGeomancerFillTarget"];
  };
  inquisitionSummonContext: {
    pendingInquisitionSummon: GameState["pendingInquisitionSummon"];
    placeInquisitionSummon: GameState["placeInquisitionSummon"];
  };
  counterHandlers: PermanentStackProps["counterHandlers"];
  movementHandlers: PermanentStackProps["movementHandlers"];
  handlePointerMove: (x: number, z: number) => void;
  handleTilePointerUp: TileInteractionPlaneProps["handleTilePointerUp"];
  emitBoardPing: (pos: { x: number; z: number }) => void;
  getRemoteHighlightColor: GameState["getRemoteHighlightColor"];
  isHandVisible: boolean;
  isSpectator: boolean;
  actorKey: PlayerKey | null;
  currentPlayer: 1 | 2;
  phase: GameState["phase"];
  lastDropAt: MutableRefObject<number>;
  pendingMagic: GameState["pendingMagic"];
  avatars: GameState["avatars"];
  magicHighlightColor: string;
  magicGuidesActive: GameState["magicGuidesActive"];
  clearBoardSelection: () => void;
  permanents: Permanents;
  permanentPositions: GameState["permanentPositions"];
  remotePermanentDragLookup: PermanentStackProps["remoteDragLookup"];
  highlightColors: PermanentStackProps["highlightColors"];
  stackConfig: PermanentStackProps["stackConfig"];
  playCardFlip: () => void;
  isPrimaryCardHit: PermanentStackProps["isPrimaryCardHit"];
  contextMenu: GameState["contextMenu"];
  openContextMenu: GameState["openContextMenu"];
  playerPositions: GameState["playerPositions"];
  calculateEdgePosition: GameState["calculateEdgePosition"];
  attackConfirm: GameState["attackConfirm"];
  attackTargetChoice: GameState["attackTargetChoice"];
  portalState: PortalState | null;
  // Switch site position support
  switchSiteSource: GameState["switchSiteSource"];
  onCompleteSwitchSite?: (targetX: number, targetY: number) => void;
  // Ownership overlay
  showOwnershipOverlay: boolean;
  // Tap controls mode
  tapControlsMode: boolean;
  // Card scale (for crowded tiles)
  cardScale: number;
  // Stolen cards for Pith Imp indicator
  stolenCards: GameState["stolenCards"];
  // Card metadata for Aura preview
  metaByCardId: GameState["metaByCardId"];
  // Babel Tower tracking for stacked card rendering
  babelTowers: BabelTowerMerge[];
  // Cast placement from context menu
  castPlacementMode?: GameState["castPlacementMode"];
};

export function BoardTile({
  tileX,
  tileY,
  tileKey,
  position,
  site,
  allowSiteDrag,
  draggingSite,
  setDraggingSite,
  boardSize,
  boardOffset,
  showGrid,
  noRaycast,
  dragFromHand,
  dragFromPile,
  selectedCard,
  boardDragContext,
  permanentDragContext,
  hoverContext,
  touchContext,
  selectionContext,
  combatContext,
  magicContext,
  chaosTwisterContext,
  shapeshiftContext,
  earthquakeContext,
  corpseExplosionContext,
  atlanteanFateContext,
  mephistophelesSummonContext,
  pathfinderContext,
  geomancerContext,
  inquisitionSummonContext,
  counterHandlers,
  movementHandlers,
  handlePointerMove,
  handleTilePointerUp,
  emitBoardPing,
  getRemoteHighlightColor,
  isHandVisible,
  isSpectator,
  actorKey,
  currentPlayer,
  phase: _phase,
  lastDropAt,
  pendingMagic,
  avatars,
  magicHighlightColor,
  magicGuidesActive,
  clearBoardSelection,
  permanents,
  permanentPositions,
  remotePermanentDragLookup,
  highlightColors,
  stackConfig,
  playCardFlip,
  isPrimaryCardHit,
  contextMenu,
  openContextMenu,
  playerPositions,
  calculateEdgePosition,
  attackConfirm,
  attackTargetChoice,
  portalState,
  switchSiteSource,
  onCompleteSwitchSite,
  showOwnershipOverlay,
  tapControlsMode,
  cardScale,
  stolenCards,
  metaByCardId,
  babelTowers,
  castPlacementMode,
}: BoardTileProps) {
  const items = permanents[tileKey] || [];
  const cellNumber = (boardSize.h - 1 - tileY) * boardSize.w + tileX + 1;

  return (
    <group position={position}>
      <TileInteractionPlane
        position={position}
        tileX={tileX}
        tileY={tileY}
        noRaycast={noRaycast}
        isSpectator={isSpectator}
        dragContext={boardDragContext}
        dragFromHand={dragFromHand}
        dragFromPile={dragFromPile}
        selectedCard={selectedCard}
        handlePointerMove={handlePointerMove}
        handleTilePointerUp={handleTilePointerUp}
        emitBoardPing={emitBoardPing}
        clearBoardSelection={clearBoardSelection}
        lastDropAt={lastDropAt}
        switchSiteSource={switchSiteSource}
        onCompleteSwitchSite={onCompleteSwitchSite}
        pendingChaosTwister={chaosTwisterContext.pendingChaosTwister}
        actorKey={actorKey}
        selectChaosTwisterSite={chaosTwisterContext.selectChaosTwisterSite}
        pendingEarthquake={earthquakeContext.pendingEarthquake}
        selectEarthquakeArea={earthquakeContext.selectEarthquakeArea}
        performEarthquakeSwap={earthquakeContext.performEarthquakeSwap}
        hasSiteAtTile={Boolean(site)}
        pendingAtlanteanFate={atlanteanFateContext.pendingAtlanteanFate}
        setAtlanteanFatePreview={atlanteanFateContext.setAtlanteanFatePreview}
        selectAtlanteanFateCorner={
          atlanteanFateContext.selectAtlanteanFateCorner
        }
        pendingMephistophelesSummon={
          mephistophelesSummonContext.pendingMephistophelesSummon
        }
        selectMephistophelesSummonTarget={
          mephistophelesSummonContext.selectMephistophelesSummonTarget
        }
        pendingPathfinderPlay={pathfinderContext.pendingPathfinderPlay}
        selectPathfinderTarget={pathfinderContext.selectPathfinderTarget}
        pendingGeomancerPlay={geomancerContext.pendingGeomancerPlay}
        selectGeomancerTarget={geomancerContext.selectGeomancerTarget}
        pendingGeomancerFill={geomancerContext.pendingGeomancerFill}
        selectGeomancerFillTarget={geomancerContext.selectGeomancerFillTarget}
        pendingInquisitionSummon={
          inquisitionSummonContext.pendingInquisitionSummon
        }
        placeInquisitionSummon={inquisitionSummonContext.placeInquisitionSummon}
        pendingCorpseExplosion={corpseExplosionContext.pendingCorpseExplosion}
        selectCorpseExplosionArea={
          corpseExplosionContext.selectCorpseExplosionArea
        }
        castPlacementMode={castPlacementMode}
      />

      {/* Portal overlay (Harbinger ability) - rendered under cards */}
      <PortalOverlay tileX={tileX} tileY={tileY} portalState={portalState} />

      {/* Chaos Twister landing site overlay - rendered under cards */}
      <ChaosTwisterLandingOverlay
        tileX={tileX}
        tileY={tileY}
        pendingChaosTwister={chaosTwisterContext.pendingChaosTwister}
      />

      {/* Atlantean Fate 2x2 area preview - rendered under cards */}
      <AtlanteanFateAreaOverlay
        tileX={tileX}
        tileY={tileY}
        pendingAtlanteanFate={atlanteanFateContext.pendingAtlanteanFate}
        permanents={permanents}
        boardWidth={boardSize.w}
        boardHeight={boardSize.h}
      />

      {/* Earthquake 2x2 area highlight */}
      <AreaSelectionOverlay3D
        tileX={tileX}
        tileY={tileY}
        affectedCells={earthquakeContext.pendingEarthquake?.affectedCells || []}
        color="#f59e0b"
        active={
          earthquakeContext.pendingEarthquake?.phase === "rearranging" ||
          earthquakeContext.pendingEarthquake?.phase === "resolving"
        }
      />

      {/* Corpse Explosion 2x2 area highlight */}
      <AreaSelectionOverlay3D
        tileX={tileX}
        tileY={tileY}
        affectedCells={
          corpseExplosionContext.pendingCorpseExplosion?.affectedCells || []
        }
        color={
          corpseExplosionContext.pendingCorpseExplosion?.assignments.some(
            (a) => a.cellKey === tileKey,
          )
            ? "#22c55e"
            : "#ef4444"
        }
        active={
          corpseExplosionContext.pendingCorpseExplosion?.phase ===
            "assigningCorpses" ||
          corpseExplosionContext.pendingCorpseExplosion?.phase ===
            "resolving" ||
          corpseExplosionContext.pendingCorpseExplosion?.phase === "resolved"
        }
        labelName={(() => {
          const ce = corpseExplosionContext.pendingCorpseExplosion;
          if (!ce) return undefined;
          if (ce.phase === "resolved" && ce.resolvedReport) {
            const entry = ce.resolvedReport.find((r) => r.cellKey === tileKey);
            return entry?.corpseName;
          }
          const a = ce.assignments.find((assign) => assign.cellKey === tileKey);
          return a?.corpse.name;
        })()}
        labelDamage={(() => {
          const ce = corpseExplosionContext.pendingCorpseExplosion;
          if (!ce) return undefined;
          if (ce.phase === "resolved" && ce.resolvedReport) {
            const entry = ce.resolvedReport.find((r) => r.cellKey === tileKey);
            if (!entry) return undefined;
            const hits =
              entry.unitsHit.length > 0
                ? entry.unitsHit
                    .map((u) => `${u.damageTaken} dmg → ${u.name}`)
                    .join("\n")
                : "No units hit";
            return `ATK ${entry.power}\n${hits}`;
          }
          const a = ce.assignments.find((assign) => assign.cellKey === tileKey);
          return a ? `ATK ${a.power}` : undefined;
        })()}
      />

      {/* Mephistopheles summon target overlay - rendered under cards */}
      <MephistophelesSummonTargetOverlay
        tileX={tileX}
        tileY={tileY}
        pendingMephistophelesSummon={
          mephistophelesSummonContext.pendingMephistophelesSummon
        }
      />

      {/* Pathfinder target overlay - rendered under cards */}
      <PathfinderTargetOverlay
        tileX={tileX}
        tileY={tileY}
        pendingPathfinderPlay={pathfinderContext.pendingPathfinderPlay}
      />

      {/* Geomancer target overlay - rendered under cards */}
      <GeomancerTargetOverlay
        tileX={tileX}
        tileY={tileY}
        pendingGeomancerPlay={geomancerContext.pendingGeomancerPlay}
        pendingGeomancerFill={geomancerContext.pendingGeomancerFill}
      />

      {/* Inquisition summon target overlay - rendered under cards */}
      <InquisitionSummonTargetOverlay
        tileX={tileX}
        tileY={tileY}
        pendingInquisitionSummon={
          inquisitionSummonContext.pendingInquisitionSummon
        }
      />

      {/* Generic Aura spell 2x2 preview - only when Magic Interactions enabled */}
      <AuraPreviewOverlay
        tileX={tileX}
        tileY={tileY}
        pendingMagic={pendingMagic}
        magicGuidesActive={magicGuidesActive}
        metaByCardId={metaByCardId}
        permanents={permanents}
        boardWidth={boardSize.w}
        boardHeight={boardSize.h}
      />

      {magicGuidesActive && (
        <MagicTargetOverlay
          tileX={tileX}
          tileY={tileY}
          pendingMagic={pendingMagic}
          avatars={avatars}
          highlightColor={magicHighlightColor}
          magicGuidesActive={magicGuidesActive}
        />
      )}

      <SiteCard
        tileX={tileX}
        tileY={tileY}
        tileKey={tileKey}
        site={site}
        contextMenu={contextMenu}
        openContextMenu={openContextMenu}
        allowSiteDrag={allowSiteDrag}
        draggingSite={draggingSite}
        setDraggingSite={setDraggingSite}
        playerPositions={playerPositions}
        calculateEdgePosition={calculateEdgePosition}
        getRemoteHighlightColor={getRemoteHighlightColor}
        isHandVisible={isHandVisible}
        attackConfirm={attackConfirm}
        attackTargetChoice={attackTargetChoice}
        setAttackConfirm={combatContext.setAttackConfirm}
        pendingCombat={combatContext.pendingCombat}
        pendingMagic={pendingMagic}
        avatars={avatars}
        magicGuidesActive={magicGuidesActive}
        dragFromHand={dragFromHand}
        dragFromPile={dragFromPile}
        dragging={permanentDragContext.dragging}
        dragAvatar={Boolean(permanentDragContext.dragAvatar)}
        beginHoverPreview={hoverContext.beginHoverPreview}
        clearHoverPreviewDebounced={hoverContext.clearHoverPreviewDebounced}
        clearTouchTimers={touchContext.clearTouchTimers}
        emitBoardPing={emitBoardPing}
        isSpectator={isSpectator}
        actorKey={actorKey}
        currentPlayer={currentPlayer}
        setMagicTargetChoice={magicContext.setMagicTargetChoice}
        touchPreviewTimerRef={touchContext.touchPreviewTimerRef}
        touchContextTimerRef={touchContext.touchContextTimerRef}
        lastTapTimeRef={touchContext.lastTapTimeRef}
        lastTouchedId={selectionContext.lastTouchedId}
        setLastTouchedId={selectionContext.setLastTouchedId}
        tapControlsMode={tapControlsMode}
        computeProjectileFirstHits={magicContext.computeProjectileFirstHits}
        switchSiteSource={switchSiteSource}
        onCompleteSwitchSite={onCompleteSwitchSite}
        babelTowers={babelTowers}
        pendingEarthquake={earthquakeContext.pendingEarthquake}
      />

      <PermanentStack
        tileKey={tileKey}
        tileX={tileX}
        tileY={tileY}
        boardSize={boardSize}
        boardOffset={boardOffset}
        items={items}
        permanents={permanents}
        permanentPositions={permanentPositions}
        remoteDragLookup={remotePermanentDragLookup}
        avatars={avatars}
        getRemoteHighlightColor={getRemoteHighlightColor}
        isHandVisible={isHandVisible}
        isSpectator={isSpectator}
        actorKey={actorKey}
        currentPlayer={currentPlayer}
        dragContext={permanentDragContext}
        hoverContext={hoverContext}
        touchContext={touchContext}
        selectionContext={selectionContext}
        combatContext={combatContext}
        magicContext={magicContext}
        chaosTwisterContext={chaosTwisterContext}
        shapeshiftContext={shapeshiftContext}
        counterHandlers={counterHandlers}
        movementHandlers={movementHandlers}
        emitBoardPing={emitBoardPing}
        handlePointerMove={handlePointerMove}
        highlightColors={highlightColors}
        stackConfig={stackConfig}
        playCardFlip={playCardFlip}
        isPrimaryCardHit={isPrimaryCardHit}
        showOwnershipOverlay={showOwnershipOverlay}
        tapControlsMode={tapControlsMode}
        cardScale={cardScale}
        stolenCards={stolenCards}
        hasSite={Boolean(site)}
        isBabelTower={babelTowers.some((t) => t.cellKey === tileKey)}
      />

      {showGrid && (
        <Text
          font="/fantaisie_artistiqu.ttf"
          position={[0, 0.02, 0]}
          rotation-x={-Math.PI / 2}
          fontSize={0.18}
          color="#cbd5e1"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.005}
          outlineColor="#000"
        >
          {cellNumber}
        </Text>
      )}
    </group>
  );
}
