import { Text } from "@react-three/drei";
import type { MutableRefObject } from "react";
import { ChaosTwisterLandingOverlay } from "@/lib/game/components/ChaosTwisterLandingOverlay";
import { MagicTargetOverlay } from "@/lib/game/components/MagicTargetOverlay";
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
  earthquakeContext: {
    pendingEarthquake: GameState["pendingEarthquake"];
    selectEarthquakeArea: GameState["selectEarthquakeArea"];
    performEarthquakeSwap: GameState["performEarthquakeSwap"];
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
  // Card scale (for crowded tiles)
  cardScale: number;
  // Stolen cards for Pith Imp indicator
  stolenCards: GameState["stolenCards"];
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
  earthquakeContext,
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
  cardScale,
  stolenCards,
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
      />

      {/* Portal overlay (Harbinger ability) - rendered under cards */}
      <PortalOverlay tileX={tileX} tileY={tileY} portalState={portalState} />

      {/* Chaos Twister landing site overlay - rendered under cards */}
      <ChaosTwisterLandingOverlay
        tileX={tileX}
        tileY={tileY}
        pendingChaosTwister={chaosTwisterContext.pendingChaosTwister}
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
        computeProjectileFirstHits={magicContext.computeProjectileFirstHits}
        switchSiteSource={switchSiteSource}
        onCompleteSwitchSite={onCompleteSwitchSite}
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
        counterHandlers={counterHandlers}
        movementHandlers={movementHandlers}
        emitBoardPing={emitBoardPing}
        handlePointerMove={handlePointerMove}
        highlightColors={highlightColors}
        stackConfig={stackConfig}
        playCardFlip={playCardFlip}
        isPrimaryCardHit={isPrimaryCardHit}
        showOwnershipOverlay={showOwnershipOverlay}
        cardScale={cardScale}
        stolenCards={stolenCards}
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
