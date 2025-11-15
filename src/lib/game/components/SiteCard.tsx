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
    if (
      pendingMagic?.target &&
      pendingMagic.target.kind === "location" &&
      pendingMagic.target.at === tileKey
    ) {
      hl = HIGHLIGHT_TARGET;
    }
    if (!hl && pendingMagic && pendingMagic.status === "choosingTarget") {
      const hints = pendingMagic.hints;
      const allowLoc = hints?.allow?.location !== false;
      const scope = hints?.scope || null;
      if (allowLoc && scope !== "projectile") {
        const dx = Math.abs(tileX - pendingMagic.tile.x);
        const dy = Math.abs(tileY - pendingMagic.tile.y);
        const man = dx + dy;
        if (scope === null || scope === "global") hl = HIGHLIGHT_TARGET;
        else if (scope === "here" && man === 0) hl = HIGHLIGHT_TARGET;
        else if (scope === "adjacent" && man === 1) hl = HIGHLIGHT_TARGET;
        else if (scope === "nearby" && man <= 2) hl = HIGHLIGHT_TARGET;
      }
    }
    return hl;
  }

  function deriveCasterOrigin(): { ox: number; oy: number } {
    let ox = pendingMagic?.tile.x ?? tileX;
    let oy = pendingMagic?.tile.y ?? tileY;
    try {
      const caster = pendingMagic?.caster;
      if (caster && caster.kind === "avatar") {
        const pos = avatars?.[caster.seat]?.pos as [number, number] | null;
        if (Array.isArray(pos)) {
          ox = pos[0];
          oy = pos[1];
        }
      } else if (caster && caster.kind === "permanent") {
        const [cx, cy] = String(caster.at).split(",").map(Number);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          ox = cx;
          oy = cy;
        }
      } else if (pendingMagic) {
        const seat = seatFromOwner(pendingMagic.spell.owner);
        const pos = avatars?.[seat]?.pos as [number, number] | null;
        if (Array.isArray(pos)) {
          ox = pos[0];
          oy = pos[1];
        }
      }
    } catch {}
    return { ox, oy };
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
    if (!pendingMagic) return;
    const ownerSeat = seatFromOwner(pendingMagic.spell.owner);
    const amActor = actorKey === ownerSeat;
    const actorIsActive =
      (actorKey === "p1" && currentPlayer === 1) ||
      (actorKey === "p2" && currentPlayer === 2);
    if (!amActor || !actorIsActive) return;
    e.stopPropagation();
    if (pendingMagic.status === "choosingTarget") {
      const hints = pendingMagic.hints;
      const scope = hints?.scope || null;
      if (scope === "projectile") {
        const { ox, oy } = deriveCasterOrigin();
        if (ox === tileX || oy === tileY) {
          const dir =
            ox === tileX
              ? tileY < oy
                ? "N"
                : "S"
              : tileX > ox
              ? "E"
              : "W";
          const hits = computeProjectileFirstHits();
          const firstHit = hits[dir] ?? undefined;
          setMagicTargetChoice({ kind: "projectile", direction: dir, firstHit });
        }
        return;
      }
      if (hints?.allow?.location === false) return;
      const { ox, oy } = deriveCasterOrigin();
      const dx = Math.abs(tileX - ox);
      const dy = Math.abs(tileY - oy);
      const man = dx + dy;
      if (scope === "here" && man !== 0) return;
      if (scope === "adjacent" && man !== 1) return;
      if (scope === "nearby" && man > 2) return;
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
        Number.isFinite(ax) && Number.isFinite(ay) && ax === tileX && ay === tileY;
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
