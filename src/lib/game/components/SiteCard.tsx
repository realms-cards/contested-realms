import type { ThreeEvent } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import { getGraphicsSettings } from "@/hooks/useGraphicsSettings";
import { BASE_CARD_ELEVATION } from "@/lib/game/boardShared";
import CardOutline from "@/lib/game/components/CardOutline";
import CardPlane from "@/lib/game/components/CardPlane";
import ResolverOutline from "@/lib/game/components/ResolverOutline";
import { CARD_LONG, CARD_SHORT, PLAYER_COLORS } from "@/lib/game/constants";
import { hasCustomResolver } from "@/lib/game/resolverRegistry";
import { useGameStore } from "@/lib/game/store";
import type {
  BabelTowerMerge,
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  SiteTile,
} from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";

const HIGHLIGHT_TARGET = "#ef4444";
const HIGHLIGHT_SWITCH_SOURCE = "#f59e0b"; // amber for switch site selection

type ProjectileHit = {
  kind: "permanent" | "avatar";
  at: CellKey;
  index?: number;
};

type ComputeProjectileHits = () => Record<
  "N" | "E" | "S" | "W",
  ProjectileHit | null | undefined
>;

export type SiteCardProps = {
  tileX: number;
  tileY: number;
  tileKey: CellKey;
  site: SiteTile | undefined;
  contextMenu: GameState["contextMenu"];
  openContextMenu: GameState["openContextMenu"];
  allowSiteDrag: boolean;
  draggingSite: GameState["draggingSite"];
  setDraggingSite: GameState["setDraggingSite"];
  playerPositions: GameState["playerPositions"];
  calculateEdgePosition: GameState["calculateEdgePosition"];
  getRemoteHighlightColor: GameState["getRemoteHighlightColor"];
  isHandVisible: boolean;
  attackConfirm: GameState["attackConfirm"];
  attackTargetChoice: GameState["attackTargetChoice"];
  setAttackConfirm: GameState["setAttackConfirm"];
  pendingCombat: GameState["pendingCombat"];
  pendingMagic: GameState["pendingMagic"];
  magicGuidesActive: GameState["magicGuidesActive"];
  avatars: GameState["avatars"];
  dragFromHand: GameState["dragFromHand"];
  dragFromPile: GameState["dragFromPile"];
  dragging: { from: string; index: number } | null;
  dragAvatar: boolean;
  beginHoverPreview: (card?: CardRef | null, sourceKey?: string | null) => void;
  clearHoverPreviewDebounced: (
    sourceKey?: string | null,
    delay?: number,
  ) => void;
  clearTouchTimers: () => void;
  emitBoardPing: (pos: { x: number; z: number }) => void;
  isSpectator: boolean;
  actorKey: PlayerKey | null;
  currentPlayer: 1 | 2;
  setMagicTargetChoice: GameState["setMagicTargetChoice"];
  touchPreviewTimerRef: MutableRefObject<number | null>;
  touchContextTimerRef: MutableRefObject<number | null>;
  computeProjectileFirstHits: ComputeProjectileHits;
  // Switch site position selection
  switchSiteSource: GameState["switchSiteSource"];
  onCompleteSwitchSite?: (targetX: number, targetY: number) => void;
  // Babel Tower tracking for stacked card rendering
  babelTowers: BabelTowerMerge[];
  // Earthquake rearrangement highlighting
  pendingEarthquake?: GameState["pendingEarthquake"];
};

export function SiteCard({
  tileX,
  tileY,
  tileKey,
  site: maybeSite,
  contextMenu,
  openContextMenu,
  allowSiteDrag,
  draggingSite,
  setDraggingSite,
  playerPositions,
  calculateEdgePosition,
  getRemoteHighlightColor,
  isHandVisible,
  attackConfirm,
  attackTargetChoice,
  setAttackConfirm,
  pendingCombat,
  pendingMagic,
  magicGuidesActive,
  avatars,
  dragFromHand,
  dragFromPile,
  dragging,
  dragAvatar,
  beginHoverPreview,
  clearHoverPreviewDebounced,
  clearTouchTimers,
  emitBoardPing: _emitBoardPing,
  isSpectator,
  actorKey,
  currentPlayer,
  setMagicTargetChoice,
  touchPreviewTimerRef: _touchPreviewTimerRef,
  touchContextTimerRef,
  computeProjectileFirstHits,
  switchSiteSource,
  onCompleteSwitchSite,
  babelTowers,
  pendingEarthquake,
}: SiteCardProps) {
  // These props are kept for future re-enablement of magic targeting hints
  void magicGuidesActive;
  void computeProjectileFirstHits;
  void avatars;
  void _touchPreviewTimerRef;
  void _emitBoardPing;
  if (!maybeSite) return null;
  const site = maybeSite;

  // Hide site if it's currently being dragged
  const isBeingDragged = draggingSite?.sourceKey === tileKey;
  if (isBeingDragged) return null;

  const rotZ =
    -Math.PI / 2 +
    (site.owner === 1 ? 0 : Math.PI) +
    (site.tapped ? -Math.PI / 2 : 0);
  const ownerSeat = seatFromOwner(site.owner);
  const playerPos = playerPositions[ownerSeat];
  const edgeOffset = calculateEdgePosition(
    { x: tileX, z: tileY },
    playerPos.position,
  );
  const siteInstanceKey = `site:${tileX},${tileY}`;
  const siteRemoteColor = getRemoteHighlightColor(site.card ?? null, {
    instanceKey: siteInstanceKey,
  });
  const siteGlowColor = siteRemoteColor ?? PLAYER_COLORS[ownerSeat];
  const renderSiteGlow = !isHandVisible && (siteRemoteColor || isSelected());

  const canInteract =
    !dragFromHand && !dragFromPile && !dragAvatar && !dragging && !isSpectator;

  const canDragSite =
    canInteract && allowSiteDrag && !switchSiteSource && !draggingSite;

  function handleBeginSiteDrag(e: ThreeEvent<PointerEvent>) {
    if (!canDragSite) return;
    e.stopPropagation();
    const pe = e.nativeEvent as PointerEvent | undefined;
    if (pe && pe.button !== 0) return;
    clearTouchTimers();
    // Start board-wide drag with world coordinates
    setDraggingSite({
      sourceKey: tileKey,
      site,
      worldPos: { x: e.point.x, z: e.point.z },
    });
  }

  function isSelected(): boolean {
    if (!contextMenu) return false;
    return (
      contextMenu.target.kind === "site" &&
      contextMenu.target.x === tileX &&
      contextMenu.target.y === tileY
    );
  }

  // Check if this tile is within the earthquake 2x2 area
  const isInEarthquakeArea = !!(
    pendingEarthquake?.phase === "rearranging" &&
    pendingEarthquake.areaCorner &&
    tileX >= pendingEarthquake.areaCorner.x &&
    tileX <= pendingEarthquake.areaCorner.x + 1 &&
    tileY >= pendingEarthquake.areaCorner.y &&
    tileY <= pendingEarthquake.areaCorner.y + 1
  );

  function highlightColor(): string | null {
    let hl: string | null = null;

    // Earthquake rearranging highlights
    if (isInEarthquakeArea && pendingEarthquake) {
      const isSource =
        switchSiteSource &&
        switchSiteSource.x === tileX &&
        switchSiteSource.y === tileY;
      if (isSource) {
        // Selected source site: pulsing highlight in caster's player color
        hl = PLAYER_COLORS[pendingEarthquake.casterSeat];
      } else if (switchSiteSource) {
        // Other sites in area when a source is selected: subtle guide highlight
        hl = HIGHLIGHT_SWITCH_SOURCE; // amber guide
      }
    }

    // Switch site source highlight (non-earthquake)
    if (
      !isInEarthquakeArea &&
      switchSiteSource &&
      switchSiteSource.x === tileX &&
      switchSiteSource.y === tileY
    ) {
      hl = HIGHLIGHT_SWITCH_SOURCE;
    }
    if (
      attackConfirm &&
      attackConfirm.target.kind === "site" &&
      attackConfirm.target.at === tileKey
    ) {
      hl = HIGHLIGHT_TARGET;
    }
    if (
      pendingCombat?.target &&
      pendingCombat.target.kind === "site" &&
      pendingCombat.target.at === tileKey
    ) {
      hl = HIGHLIGHT_TARGET;
    }
    // NOTE: Magic target site highlighting is disabled until we can provide
    // accurate hints for every spell type. See reference/SorceryRulebook.pdf.
    // The magic interaction flow (caster/target selection) still works.
    return hl;
  }

  function handleTouchPreview(e: ThreeEvent<PointerEvent>) {
    const pe = e.nativeEvent as PointerEvent | undefined;
    // Long-press for touch AND coarse-pointer devices (AVP gaze+pinch
    // reports pointerType "mouse" but has no right-click)
    const needsLongPress =
      pe &&
      (pe.pointerType === "touch" ||
        !window.matchMedia("(pointer: fine)").matches);
    if (needsLongPress) {
      clearTouchTimers();
      touchContextTimerRef.current = window.setTimeout(() => {
        openContextMenu(
          { kind: "site", x: tileX, y: tileY },
          { x: e.clientX, y: e.clientY },
        );
      }, 500) as unknown as number;
    }
  }

  function handleMagicTargeting(e: ThreeEvent<PointerEvent>) {
    if (!pendingMagic || pendingMagic.guidesSuppressed) return;
    const ownerSeat = seatFromOwner(pendingMagic.spell.owner);
    const amActor = actorKey === ownerSeat;
    const actorIsActive =
      (actorKey === "p1" && currentPlayer === 1) ||
      (actorKey === "p2" && currentPlayer === 2);
    if (!amActor || !actorIsActive) return;
    e.stopPropagation();
    if (pendingMagic.status === "choosingTarget") {
      // Allow targeting any location on the board without scope restrictions
      // The actual spell effect validation happens server-side during resolution
      setMagicTargetChoice({ kind: "location", at: tileKey });
    }
  }

  function handleAttackTargeting(e: ThreeEvent<PointerEvent>) {
    if (!attackTargetChoice) return;
    e.stopPropagation();
    const isEnemySite =
      site.owner === (attackTargetChoice.attacker.owner === 1 ? 2 : 1);
    const onTile =
      attackTargetChoice.tile.x === tileX &&
      attackTargetChoice.tile.y === tileY;
    let sameTileAsAttacker = false;
    try {
      const [ax, ay] = String(attackTargetChoice.attacker.at)
        .split(",")
        .map(Number);
      sameTileAsAttacker =
        Number.isFinite(ax) &&
        Number.isFinite(ay) &&
        ax === tileX &&
        ay === tileY;
    } catch {}
    if (isEnemySite && onTile && sameTileAsAttacker) {
      const label = site.card?.name || "Site";
      setAttackConfirm({
        tile: attackTargetChoice.tile,
        attacker: attackTargetChoice.attacker,
        target: { kind: "site", at: tileKey, index: null },
        targetLabel: label,
      });
    }
  }

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!canInteract) return;
    handleTouchPreview(e);
    handleMagicTargeting(e);
    handleAttackTargeting(e);
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    // If switching sites, complete the switch when clicking on this site
    // (Skip during earthquake rearranging - earthquake has its own swap handler)
    if (switchSiteSource && onCompleteSwitchSite && !isInEarthquakeArea) {
      e.stopPropagation();
      onCompleteSwitchSite(tileX, tileY);
    }
  };

  const highlight = highlightColor();
  // Pulse for source selection; static for earthquake guide targets
  const isEarthquakeSource =
    isInEarthquakeArea &&
    !!switchSiteSource &&
    switchSiteSource.x === tileX &&
    switchSiteSource.y === tileY;
  const shouldPulse = !isInEarthquakeArea || isEarthquakeSource;

  // Check if this is a merged Tower of Babel (Base + Apex stacked)
  // Match by cellKey - Tower of Babel is a concept, not a separate card
  const towerMerge = babelTowers.find((t) => t.cellKey === tileKey);
  const CARD_STACK_OFFSET = 0.008; // Vertical offset between stacked cards

  return (
    <group>
      {renderSiteGlow && (
        <group position={[edgeOffset.x, 0, edgeOffset.z]}>
          <CardOutline
            width={CARD_SHORT}
            height={CARD_LONG}
            rotationZ={rotZ}
            elevation={0.0001}
            color={siteGlowColor}
            renderOrder={1000}
          />
        </group>
      )}
      {highlight && (
        <group position={[edgeOffset.x, 0, edgeOffset.z]}>
          <CardOutline
            width={CARD_SHORT}
            height={CARD_LONG}
            rotationZ={rotZ}
            elevation={0.0002}
            color={highlight}
            renderOrder={1202}
            pulse={shouldPulse}
          />
        </group>
      )}
      {/* Purple outline for sites with custom resolvers */}
      {!highlight &&
        !useGameStore.getState().resolversDisabled &&
        getGraphicsSettings().showResolverGlow &&
        hasCustomResolver(site.card?.name) && (
          <group position={[edgeOffset.x, 0, edgeOffset.z]}>
            <ResolverOutline
              width={CARD_SHORT}
              height={CARD_LONG}
              rotationZ={rotZ}
              elevation={0.0001}
              renderOrder={1100}
              pulse
            />
          </group>
        )}
      {/* Tower of Babel: render both Base (bottom) and Apex (top) cards stacked */}
      {/* Base is offset slightly so both cards are visible when stacked */}
      {towerMerge && towerMerge.baseCard && towerMerge.apexCard ? (
        <group position={[edgeOffset.x, 0, edgeOffset.z]}>
          {/* Base of Babel (bottom card - offset to show card bottom text under Apex) */}
          <group position={[0, 0, -0.06]}>
            <CardPlane
              slug={towerMerge.baseCard.slug || ""}
              width={CARD_SHORT}
              height={CARD_LONG}
              depthWrite
              depthTest
              rotationZ={rotZ}
              elevation={BASE_CARD_ELEVATION}
              renderOrder={9}
              onPointerDown={(e) => {
                handlePointerDown(e);
                handleBeginSiteDrag(e);
              }}
              onPointerUp={handlePointerUp}
              onPointerMove={(e) => {
                const pe = e.nativeEvent as PointerEvent | undefined;
                if (
                  pe &&
                  (pe.pointerType === "touch" ||
                    !window.matchMedia("(pointer: fine)").matches)
                )
                  clearTouchTimers();
              }}
              onPointerOver={(e) => {
                if (dragFromHand || dragFromPile) return;
                e.stopPropagation();
                if (towerMerge.baseCard)
                  beginHoverPreview(towerMerge.baseCard, tileKey);
              }}
              onPointerOut={(e) => {
                if (dragFromHand || dragFromPile) return;
                e.stopPropagation();
                clearTouchTimers();
                clearHoverPreviewDebounced(tileKey);
              }}
              onContextMenu={(e) => {
                if (isSpectator) return;
                e.stopPropagation();
                e.nativeEvent.preventDefault();
                openContextMenu(
                  { kind: "site", x: tileX, y: tileY },
                  { x: e.clientX, y: e.clientY },
                );
              }}
            />
          </group>
          {/* Apex of Babel (top card) */}
          <CardPlane
            slug={towerMerge.apexCard?.slug || ""}
            width={CARD_SHORT}
            height={CARD_LONG}
            depthWrite
            depthTest
            rotationZ={rotZ}
            elevation={BASE_CARD_ELEVATION + CARD_STACK_OFFSET}
            renderOrder={10}
            onPointerDown={(e) => {
              handlePointerDown(e);
              handleBeginSiteDrag(e);
            }}
            onPointerUp={handlePointerUp}
            onPointerMove={(e) => {
              const pe = e.nativeEvent as PointerEvent | undefined;
              if (pe && pe.pointerType === "touch") clearTouchTimers();
            }}
            onPointerOver={(e) => {
              if (dragFromHand || dragFromPile) return;
              e.stopPropagation();
              if (towerMerge.apexCard)
                beginHoverPreview(towerMerge.apexCard, tileKey);
            }}
            onPointerOut={(e) => {
              if (dragFromHand || dragFromPile) return;
              e.stopPropagation();
              clearTouchTimers();
              clearHoverPreviewDebounced(tileKey);
            }}
            onContextMenu={(e) => {
              if (isSpectator) return;
              e.stopPropagation();
              e.nativeEvent.preventDefault();
              openContextMenu(
                { kind: "site", x: tileX, y: tileY },
                { x: e.clientX, y: e.clientY },
              );
            }}
          />
        </group>
      ) : site.card ? (
        <group position={[edgeOffset.x, 0, edgeOffset.z]}>
          <CardPlane
            slug={site.card.slug || ""}
            width={CARD_SHORT}
            height={CARD_LONG}
            depthWrite
            depthTest
            rotationZ={rotZ}
            elevation={BASE_CARD_ELEVATION}
            renderOrder={10}
            textureUrl={!site.card.slug ? "/api/assets/earth.png" : undefined}
            onPointerDown={(e) => {
              handlePointerDown(e);
              handleBeginSiteDrag(e);
            }}
            onPointerUp={handlePointerUp}
            onPointerMove={(e) => {
              const pe = e.nativeEvent as PointerEvent | undefined;
              if (pe && pe.pointerType === "touch") clearTouchTimers();
            }}
            onPointerOver={(e) => {
              if (dragFromHand || dragFromPile) return;
              e.stopPropagation();
              if (site.card) beginHoverPreview(site.card, tileKey);
            }}
            onPointerOut={(e) => {
              if (dragFromHand || dragFromPile) return;
              e.stopPropagation();
              clearTouchTimers();
              clearHoverPreviewDebounced(tileKey);
            }}
            onContextMenu={(e) => {
              if (isSpectator) return;
              e.stopPropagation();
              e.nativeEvent.preventDefault();
              openContextMenu(
                { kind: "site", x: tileX, y: tileY },
                { x: e.clientX, y: e.clientY },
              );
            }}
          />
        </group>
      ) : (
        <mesh
          rotation-x={-Math.PI / 2}
          rotation-z={rotZ}
          position={[edgeOffset.x, BASE_CARD_ELEVATION, edgeOffset.z]}
          castShadow
          onPointerDown={(e) => {
            handlePointerDown(e);
            handleBeginSiteDrag(e);
          }}
          onPointerUp={handlePointerUp}
        >
          <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
          <meshStandardMaterial
            color={site.owner === 1 ? "#2f6fed" : "#d94e4e"}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
