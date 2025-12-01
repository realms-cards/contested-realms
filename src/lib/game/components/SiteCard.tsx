import type { ThreeEvent } from "@react-three/fiber";
import type { MutableRefObject } from "react";
import CardOutline from "@/lib/game/components/CardOutline";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT, PLAYER_COLORS } from "@/lib/game/constants";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  SiteTile,
} from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";

const HIGHLIGHT_TARGET = "#ef4444";

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
    delay?: number
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
};

export function SiteCard({
  tileX,
  tileY,
  tileKey,
  site: maybeSite,
  contextMenu,
  openContextMenu,
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
  emitBoardPing,
  isSpectator,
  actorKey,
  currentPlayer,
  setMagicTargetChoice,
  touchPreviewTimerRef,
  touchContextTimerRef,
  computeProjectileFirstHits,
}: SiteCardProps) {
  // These props are kept for future re-enablement of magic targeting hints
  void magicGuidesActive;
  void computeProjectileFirstHits;
  void avatars;
  if (!maybeSite) return null;
  const site = maybeSite;

  const rotZ =
    -Math.PI / 2 +
    (site.owner === 1 ? 0 : Math.PI) +
    (site.tapped ? Math.PI / 2 : 0);
  const ownerSeat = seatFromOwner(site.owner);
  const playerPos = playerPositions[ownerSeat];
  const edgeOffset = calculateEdgePosition(
    { x: tileX, z: tileY },
    playerPos.position
  );
  const siteInstanceKey = `site:${tileX},${tileY}`;
  const siteRemoteColor = getRemoteHighlightColor(site.card ?? null, {
    instanceKey: siteInstanceKey,
  });
  const siteGlowColor = siteRemoteColor ?? PLAYER_COLORS[ownerSeat];
  const renderSiteGlow = !isHandVisible && (siteRemoteColor || isSelected());

  const canInteract =
    !dragFromHand && !dragFromPile && !dragAvatar && !dragging && !isSpectator;

  function isSelected(): boolean {
    if (!contextMenu) return false;
    return (
      contextMenu.target.kind === "site" &&
      contextMenu.target.x === tileX &&
      contextMenu.target.y === tileY
    );
  }

  function highlightColor(): string | null {
    let hl: string | null = null;
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
    if (pe && pe.pointerType === "touch") {
      clearTouchTimers();
      if (site.card) {
        touchPreviewTimerRef.current = window.setTimeout(() => {
          beginHoverPreview(site.card, tileKey);
        }, 180) as unknown as number;
      }
      touchContextTimerRef.current = window.setTimeout(() => {
        openContextMenu(
          { kind: "site", x: tileX, y: tileY },
          { x: e.clientX, y: e.clientY }
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

  const highlight = highlightColor();

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
            pulse
          />
        </group>
      )}
      {site.card?.slug ? (
        <group position={[edgeOffset.x, 0, edgeOffset.z]}>
          <CardPlane
            slug={site.card.slug || ""}
            width={CARD_SHORT}
            height={CARD_LONG}
            depthWrite
            depthTest
            rotationZ={rotZ}
            elevation={0.001}
            renderOrder={10}
            textureUrl={!site.card.slug ? "/api/assets/earth.png" : undefined}
            onPointerDown={handlePointerDown}
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
            onPointerMove={(e) => {
              const pe = e.nativeEvent as PointerEvent | undefined;
              if (pe && pe.pointerType === "touch") clearTouchTimers();
            }}
            onDoubleClick={(e) => {
              if (!canInteract) return;
              e.stopPropagation();
              emitBoardPing({ x: e.point.x, z: e.point.z });
            }}
            onContextMenu={(e) => {
              if (isSpectator) return;
              e.stopPropagation();
              e.nativeEvent.preventDefault();
              openContextMenu(
                { kind: "site", x: tileX, y: tileY },
                { x: e.clientX, y: e.clientY }
              );
            }}
          />
        </group>
      ) : (
        <mesh
          rotation-x={-Math.PI / 2}
          rotation-z={rotZ}
          position={[edgeOffset.x, 0.001, edgeOffset.z]}
          castShadow
          onPointerDown={handlePointerDown}
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
