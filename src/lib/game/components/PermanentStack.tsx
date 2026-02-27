import { Text } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import {
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import { Group } from "three";
import { getGraphicsSettings } from "@/hooks/useGraphicsSettings";
import { BodyApi, getPermanentOwnerBaseZ } from "@/lib/game/boardShared";
import { detectSpellcasterSync } from "@/lib/game/cardAbilities";
import CardOutline from "@/lib/game/components/CardOutline";
import CardPlane from "@/lib/game/components/CardPlane";
import {
  CARD_LONG,
  CARD_SHORT,
  CARD_THICK,
  DRAG_HOLD_MS,
  DRAG_LIFT,
  DRAG_THRESHOLD,
  PLAYER_COLORS,
  TILE_SIZE,
} from "@/lib/game/constants";
import { hasCustomResolver } from "@/lib/game/resolverRegistry";
import type {
  BoardState,
  CardRef,
  CellKey,
  GameState,
  PermanentItem,
  Permanents,
  PlayerKey,
} from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";
import { TOKEN_BY_NAME, tokenTextureUrl } from "@/lib/game/tokens";

// Silenced token uses the Silence spell's card art
const SILENCE_SPELL_TEXTURE_URL = "/api/images/alp_silence_b_s";

type ProjectileHit = {
  kind: "permanent" | "avatar";
  at: CellKey;
  index?: number;
};

type ComputeProjectileHits = () => Record<
  "N" | "E" | "S" | "W",
  ProjectileHit | null
>;

type DragStart = {
  at: string;
  index: number;
  start: [number, number];
  time: number;
};

type DragContext = {
  dragging: { from: string; index: number } | null;
  dragAvatar: PlayerKey | null;
  dragFromHand: boolean;
  dragFromPile: boolean;
  setDragging: Dispatch<SetStateAction<{ from: string; index: number } | null>>;
  setDragFromHand: GameState["setDragFromHand"];
  dragStartRef: MutableRefObject<DragStart | null>;
  dragTarget: MutableRefObject<{ x: number; z: number; lift: boolean } | null>;
  draggedBody: MutableRefObject<BodyApi | null>;
  bodyMap: MutableRefObject<Map<string, BodyApi>>;
  bodiesAccessedThisFrame: MutableRefObject<Set<string>>;
  boardGhostRef: MutableRefObject<Group | null>;
  lastBoardGhostPosRef: MutableRefObject<{ x: number; z: number }>;
  lastDropAt: MutableRefObject<number>;
  moveDraggedBody: (x: number, z: number, lift?: boolean) => void;
  snapBodyTo: (id: string, x: number, z: number) => void;
  setGhost: Dispatch<SetStateAction<{ x: number; z: number } | null>>;
  useGhostOnlyBoardDrag: boolean;
};

type HoverContext = {
  beginHoverPreview: (card?: CardRef | null, sourceKey?: string | null) => void;
  clearHoverPreview: (sourceKey?: string | null) => void;
  clearHoverPreviewDebounced: (
    sourceKey?: string | null,
    delay?: number,
  ) => void;
  openContextMenu: GameState["openContextMenu"];
};

type TouchContext = {
  clearTouchTimers: () => void;
  touchPreviewTimerRef: MutableRefObject<number | null>;
  touchContextTimerRef: MutableRefObject<number | null>;
};

type SelectionContext = {
  selectPermanent: GameState["selectPermanent"];
  selectedPermanent: GameState["selectedPermanent"];
  lastTouchedId: string | null;
  setLastTouchedId: (id: string | null) => void;
};

type CombatContext = {
  attackTargetChoice: GameState["attackTargetChoice"];
  setAttackConfirm: GameState["setAttackConfirm"];
  pendingCombat: GameState["pendingCombat"];
  setDefenderSelection: GameState["setDefenderSelection"];
};

type MagicContext = {
  pendingMagic: GameState["pendingMagic"];
  setMagicTargetChoice: GameState["setMagicTargetChoice"];
  setMagicCasterChoice: GameState["setMagicCasterChoice"];
  computeProjectileFirstHits: ComputeProjectileHits;
  magicGuidesActive: GameState["magicGuidesActive"];
};

type ChaosTwisterContext = {
  pendingChaosTwister: GameState["pendingChaosTwister"];
  selectChaosTwisterMinion: GameState["selectChaosTwisterMinion"];
  selectChaosTwisterSite: GameState["selectChaosTwisterSite"];
  metaByCardId: GameState["metaByCardId"];
};

type ShapeshiftContext = {
  pendingShapeshift: GameState["pendingShapeshift"];
  selectShapeshiftTarget: GameState["selectShapeshiftTarget"];
};

type CounterHandlers = {
  increment: GameState["incrementPermanentCounter"];
  decrement: GameState["decrementPermanentCounter"];
};

type MovementHandlers = {
  setOffset: GameState["setPermanentOffset"];
  moveToWithOffset: GameState["moveSelectedPermanentToWithOffset"];
  moveToZone: GameState["movePermanentToZone"];
};

type StackConfig = {
  spacing: number;
  marginZ: number;
  layerLift: number;
  baseElevation: number;
  burrowedElevation: number;
  rubbleElevation: number;
  avatarAvoidZ: number;
};

type HighlightColors = {
  attacker: string;
  target: string;
  defender: string;
};

export type PermanentStackProps = {
  tileKey: CellKey;
  tileX: number;
  tileY: number;
  boardSize: BoardState["size"];
  boardOffset: { x: number; y: number };
  items: PermanentItem[];
  permanents: Permanents;
  permanentPositions: GameState["permanentPositions"];
  remoteDragLookup: Map<string, Set<number>>;
  avatars: GameState["avatars"];
  getRemoteHighlightColor: GameState["getRemoteHighlightColor"];
  isHandVisible: boolean;
  isSpectator: boolean;
  actorKey: PlayerKey | null;
  currentPlayer: 1 | 2;
  dragContext: DragContext;
  hoverContext: HoverContext;
  touchContext: TouchContext;
  selectionContext: SelectionContext;
  combatContext: CombatContext;
  magicContext: MagicContext;
  chaosTwisterContext: ChaosTwisterContext;
  shapeshiftContext: ShapeshiftContext;
  counterHandlers: CounterHandlers;
  movementHandlers: MovementHandlers;
  emitBoardPing: (pos: { x: number; z: number }) => void;
  handlePointerMove: (x: number, z: number) => void;
  highlightColors: HighlightColors;
  stackConfig: StackConfig;
  playCardFlip: () => void;
  isPrimaryCardHit: (e: ThreeEvent<PointerEvent | MouseEvent>) => boolean;
  showOwnershipOverlay: boolean;
  cardScale: number;
  stolenCards: GameState["stolenCards"];
  hasSite?: boolean;
  isBabelTower?: boolean;
};

/** Counter badge with +/- buttons that appear on hover */
function CounterBadge3D({
  count,
  playerColor,
  rotZ,
  onIncrement,
  onDecrement,
}: {
  count: number;
  playerColor: string;
  rotZ: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const badgeRadius = 0.06;
  const outlineWidth = 0.008;
  const buttonRadius = 0.025;
  const buttonSpacing = badgeRadius + buttonRadius + 0.01;
  const leftEdgeX = -CARD_SHORT * 0.5 + badgeRadius;
  const innerRadius = badgeRadius - outlineWidth;

  return (
    <group
      position={[leftEdgeX, 0.006, 0]}
      rotation-x={-Math.PI / 2}
      rotation-z={rotZ}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {/* Increment button (above) - visible on hover */}
      <group position={[0, buttonSpacing, 0]} visible={hovered}>
        <mesh
          onPointerDown={(e) => {
            e.stopPropagation();
            onIncrement();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <circleGeometry args={[buttonRadius, 16]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.9} />
        </mesh>
        <Text
          position={[0, 0, 0.001]}
          fontSize={buttonRadius * 1.6}
          color="#4ade80"
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
        >
          +
        </Text>
      </group>
      {/* Outline ring in player color */}
      <mesh position={[0, 0, -0.001]}>
        <ringGeometry args={[innerRadius, badgeRadius, 32]} />
        <meshBasicMaterial color={playerColor} />
      </mesh>
      {/* Background circle */}
      <mesh>
        <circleGeometry args={[innerRadius, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.9} />
      </mesh>
      {/* Counter text */}
      <Text
        position={[0, 0, 0.001]}
        fontSize={badgeRadius * 1.3}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fontWeight={700}
      >
        {count}
      </Text>
      {/* Decrement button (below) - visible on hover */}
      <group position={[0, -buttonSpacing, 0]} visible={hovered}>
        <mesh
          onPointerDown={(e) => {
            e.stopPropagation();
            onDecrement();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <circleGeometry args={[buttonRadius, 16]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.9} />
        </mesh>
        <Text
          position={[0, 0, 0.001]}
          fontSize={buttonRadius * 1.6}
          color="#f87171"
          anchorX="center"
          anchorY="middle"
          fontWeight={700}
        >
          −
        </Text>
      </group>
    </group>
  );
}

export function PermanentStack({
  tileKey,
  tileX,
  tileY,
  boardSize,
  boardOffset,
  items,
  permanents,
  permanentPositions,
  remoteDragLookup,
  avatars,
  getRemoteHighlightColor,
  isHandVisible,
  isSpectator,
  actorKey,
  currentPlayer,
  dragContext,
  hoverContext,
  touchContext,
  selectionContext,
  combatContext,
  magicContext,
  chaosTwisterContext,
  shapeshiftContext,
  counterHandlers,
  movementHandlers,
  emitBoardPing,
  handlePointerMove,
  highlightColors,
  stackConfig,
  playCardFlip,
  isPrimaryCardHit,
  showOwnershipOverlay,
  cardScale,
  stolenCards: _stolenCards,
  hasSite = false,
  isBabelTower = false,
}: PermanentStackProps) {
  const { gl } = useThree();
  if (items.length === 0) {
    return null;
  }

  const {
    dragging,
    dragAvatar,
    dragFromHand,
    dragFromPile,
    setDragging,
    setDragFromHand,
    dragStartRef,
    dragTarget,
    draggedBody,
    bodyMap,
    bodiesAccessedThisFrame,
    boardGhostRef,
    lastBoardGhostPosRef,
    lastDropAt,
    moveDraggedBody,
    snapBodyTo,
    setGhost,
    useGhostOnlyBoardDrag,
  } = dragContext;
  const {
    beginHoverPreview,
    clearHoverPreview,
    clearHoverPreviewDebounced,
    openContextMenu,
  } = hoverContext;
  const { clearTouchTimers, touchPreviewTimerRef, touchContextTimerRef } =
    touchContext;
  const {
    selectPermanent,
    selectedPermanent,
    lastTouchedId,
    setLastTouchedId,
  } = selectionContext;
  const {
    attackTargetChoice,
    setAttackConfirm,
    pendingCombat,
    setDefenderSelection,
  } = combatContext;
  const {
    pendingMagic,
    setMagicTargetChoice,
    setMagicCasterChoice,
    computeProjectileFirstHits,
    magicGuidesActive,
  } = magicContext;
  // These are kept for future re-enablement of magic targeting hints
  void computeProjectileFirstHits;
  const { pendingChaosTwister, selectChaosTwisterMinion, metaByCardId } =
    chaosTwisterContext;
  const { pendingShapeshift, selectShapeshiftTarget } = shapeshiftContext;
  const { increment, decrement } = counterHandlers;
  const { setOffset, moveToWithOffset, moveToZone } = movementHandlers;

  const {
    attacker: HIGHLIGHT_ATTACKER,
    target: HIGHLIGHT_TARGET,
    defender: HIGHLIGHT_DEFENDER,
  } = highlightColors;

  const {
    spacing: _spacing,
    marginZ: _baseMarginZ,
    layerLift,
    baseElevation,
    burrowedElevation,
    rubbleElevation,
    avatarAvoidZ,
  } = stackConfig;
  void _spacing; // Spacing is part of the config but not used in this component
  void _baseMarginZ; // Z offset is now computed directly, not from marginZ config

  const key = tileKey;
  const boardHalfW = (boardSize.w * TILE_SIZE) / 2;
  const boardHalfH = (boardSize.h * TILE_SIZE) / 2;

  // Sort items so they stack correctly (bottom to top):
  // 1. Burrowed/submerged cards (lowest)
  // 2. Sites (middle)
  // 3. Minions/tokens/other permanents (top)
  const sortedItems = [...items]
    .map((p, originalIdx) => ({ p, originalIdx }))
    .sort((a, b) => {
      // Use instanceId for stable position state lookup (prevents state leakage on card movement)
      const aInstanceId = a.p.instanceId ?? `perm:${key}:${a.originalIdx}`;
      const bInstanceId = b.p.instanceId ?? `perm:${key}:${b.originalIdx}`;
      const aState = permanentPositions[aInstanceId]?.state;
      const bState = permanentPositions[bInstanceId]?.state;
      const aIsBurrowed = aState === "burrowed" || aState === "submerged";
      const bIsBurrowed = bState === "burrowed" || bState === "submerged";
      // Burrowed cards go first (bottom of stack)
      if (aIsBurrowed && !bIsBurrowed) return -1;
      if (!aIsBurrowed && bIsBurrowed) return 1;
      // Sites go below minions/tokens (but above burrowed)
      const aType = (a.p.card.type || "").toLowerCase();
      const bType = (b.p.card.type || "").toLowerCase();
      const aIsSite = aType.includes("site");
      const bIsSite = bType.includes("site");
      if (aIsSite && !bIsSite) return -1;
      if (!aIsSite && bIsSite) return 1;
      return 0;
    });

  return (
    <>
      {sortedItems.map(({ p, originalIdx }, sortedIdx) => {
        const idx = originalIdx; // Use original index for permanentId and selection matching
        const remoteDragSet = remoteDragLookup.get(key);
        if (remoteDragSet?.has(idx)) {
          return null;
        }
        if (p.attachedTo) {
          return null;
        }
        const hoverKey = `${key}:${idx}`;

        const owner = p.owner;
        const ownerSeat = seatFromOwner(owner);
        // Check if ANY avatar (owner's or opponent's) is on this tile
        const p1AvatarOnTile =
          avatars?.p1?.pos &&
          avatars.p1.pos[0] === tileX &&
          avatars.p1.pos[1] === tileY;
        const p2AvatarOnTile =
          avatars?.p2?.pos &&
          avatars.p2.pos[0] === tileX &&
          avatars.p2.pos[1] === tileY;
        const avatarOnThisTile = p1AvatarOnTile || p2AvatarOnTile;
        const isSel =
          selectedPermanent &&
          selectedPermanent.at === key &&
          selectedPermanent.index === idx;
        const cardType = (p.card.type || "").toLowerCase();
        const isToken = cardType.includes("token");
        const tokenName = (p.card.name || "").toLowerCase();
        const tokenDef = isToken ? TOKEN_BY_NAME[tokenName] : undefined;
        const tokenSiteReplace = !!tokenDef?.siteReplacement;
        // Transformed sites (e.g. Island Leviathan, Horns of Behemoth) keep landscape orientation
        const isSiteCard = cardType.includes("site") && !isToken;
        // Silenced tokens use the Silence spell card art
        const isSilencedToken = isToken && tokenName === "silenced";
        // Disabled tokens use the Disabled token texture
        const isDisabledToken = isToken && tokenName === "disabled";
        const avatarBumpZ = avatarOnThisTile ? avatarAvoidZ : 0;
        // Token site replacements sit at center, regular cards get owner-based z offset
        const zBase = tokenSiteReplace
          ? 0
          : getPermanentOwnerBaseZ(owner, avatarBumpZ > 0);
        const rotZ =
          (owner === 1 ? 0 : Math.PI) +
          (tokenSiteReplace || isSiteCard ? -Math.PI / 2 : 0) +
          (p.tapped ? -Math.PI / 2 : 0) +
          (p.tilt || 0);
        const baseOffX = p.offset?.[0] ?? 0;
        const baseOffZ = p.offset?.[1] ?? 0;
        // Add offsets for silenced/disabled tokens so they don't overlap
        const tokenOffsetX = isSilencedToken
          ? CARD_SHORT * 0.3
          : isDisabledToken
            ? -CARD_SHORT * 0.3
            : 0;
        const offX = baseOffX + tokenOffsetX;
        const offZ = baseOffZ;

        // Use instanceId for stable position state lookup (prevents state leakage on card movement)
        const permId = (p.instanceId ?? `perm:${key}:${idx}`) as string;
        const permanentPosition = permanentPositions[permId];
        const isBurrowed =
          permanentPosition?.state === "burrowed" ||
          permanentPosition?.state === "submerged";

        const isLastTouched = lastTouchedId === permId;
        // Count burrowed cards in this stack for elevation offset
        const burrowedCount = sortedItems.filter(({ p: sp }) => {
          const spInstanceId = sp.instanceId ?? `perm:${key}:${idx}`;
          const pstate = permanentPositions[spInstanceId]?.state;
          return pstate === "burrowed" || pstate === "submerged";
        }).length;

        // Burrowed cards at ground level, non-burrowed cards elevated above them
        // When avatar is on this tile, lift permanents above the avatar
        // When site is on this tile, lift permanents above the site (site rendered by SiteCard)
        // Tower of Babel has two stacked cards, so lift an extra layer
        const avatarLift = avatarOnThisTile ? layerLift : 0;
        const siteLift =
          hasSite && !tokenSiteReplace ? layerLift * (isBabelTower ? 2 : 1) : 0;
        const baseY = isBurrowed
          ? burrowedElevation
          : tokenSiteReplace
            ? rubbleElevation
            : baseElevation + burrowedCount * layerLift + avatarLift + siteLift;
        // Stack index for non-burrowed cards only (burrowed cards don't stack)
        // Cards maintain stable positions based on sort order
        const nonBurrowedIdx = isBurrowed ? 0 : sortedIdx - burrowedCount;
        const stackLift =
          !isBurrowed && !tokenSiteReplace ? nonBurrowedIdx * layerLift : 0;
        // Lift selected cards above the entire stack (count non-burrowed items)
        const isSelected = isSel || isLastTouched;
        const nonBurrowedCount = sortedItems.length - burrowedCount;
        const selectionLift =
          isSelected && !isBurrowed && !tokenSiteReplace
            ? (nonBurrowedCount - nonBurrowedIdx + 1) * layerLift
            : 0;
        const yPos = baseY + stackLift + selectionLift;

        const remotePermanentColor = getRemoteHighlightColor(p.card ?? null, {
          instanceKey: permId,
        });
        const permanentGlowColor =
          remotePermanentColor ?? PLAYER_COLORS[ownerSeat];
        const renderPermanentGlow =
          !isHandVisible && (isSel || !!remotePermanentColor);
        const isLocalDragGhost =
          useGhostOnlyBoardDrag &&
          dragging &&
          dragging.from === key &&
          dragging.index === idx;

        let roleGlow: string | null = null;
        if (
          attackTargetChoice &&
          attackTargetChoice.attacker.at === key &&
          attackTargetChoice.attacker.index === idx
        ) {
          roleGlow = HIGHLIGHT_ATTACKER;
        }
        if (pendingCombat) {
          if (
            pendingCombat.attacker.at === key &&
            pendingCombat.attacker.index === idx
          ) {
            roleGlow = HIGHLIGHT_ATTACKER;
          }
          if (
            pendingCombat.target &&
            pendingCombat.target.kind === "permanent" &&
            pendingCombat.target.at === key &&
            pendingCombat.target.index === idx
          ) {
            roleGlow = HIGHLIGHT_TARGET;
          }
          if (
            (pendingCombat.defenders || []).some(
              (d) => d.at === key && d.index === idx,
            )
          ) {
            roleGlow = HIGHLIGHT_DEFENDER;
          }
        }
        if (
          magicGuidesActive &&
          pendingMagic &&
          !pendingMagic.guidesSuppressed
        ) {
          if (
            pendingMagic.caster &&
            pendingMagic.caster.kind === "permanent" &&
            pendingMagic.caster.at === key &&
            pendingMagic.caster.index === idx
          ) {
            roleGlow = HIGHLIGHT_ATTACKER;
          }
          if (
            pendingMagic.target &&
            pendingMagic.target.kind === "permanent" &&
            pendingMagic.target.at === key &&
            pendingMagic.target.index === idx
          ) {
            roleGlow = HIGHLIGHT_TARGET;
          }
          // NOTE: "Potential target" highlighting is disabled until we can provide
          // accurate hints for every spell type. Only selected caster/target are highlighted.
          // The magic interaction flow (caster/target selection) still works.
        }

        const showPermanentGlow =
          (renderPermanentGlow && !isLocalDragGhost) || !!roleGlow;
        const isDraggingPermanent =
          dragging && dragging.from === key && dragging.index === idx;

        // Ownership overlay: show faint glow on cards owned by the local player
        // In online play, use actorKey; in offline play, default to P1
        const localSeat = actorKey ?? "p1";
        const isOwnedByLocalPlayer =
          (localSeat === "p1" && owner === 1) ||
          (localSeat === "p2" && owner === 2);
        const showOwnershipGlow =
          showOwnershipOverlay && isOwnedByLocalPlayer && !isLocalDragGhost;

        // Debug log (remove after testing)
        if (idx === 0 && showOwnershipOverlay) {
          console.log("[ownership]", {
            showOwnershipOverlay,
            localSeat,
            owner,
            isOwnedByLocalPlayer,
            showPermanentGlow,
            showOwnershipGlow,
          });
        }

        const bodyType = tokenSiteReplace
          ? "fixed" // Rubble tokens are truly fixed (site replacements)
          : isDraggingPermanent && !useGhostOnlyBoardDrag
            ? "kinematicPosition" // Active drag: body follows physics during drag
            : "fixed"; // Not dragging: locked in place to prevent unwanted position updates
        const gravityScale =
          useGhostOnlyBoardDrag || tokenSiteReplace || !isDraggingPermanent
            ? 0
            : 1;

        return (
          <RigidBody
            key={p.instanceId ?? `perm:${key}:${idx}`}
            ref={(api) => {
              const id = (p.instanceId ?? `perm:${key}:${idx}`) as string;
              try {
                if (api) {
                  bodyMap.current.set(id, api as unknown as BodyApi);
                } else {
                  bodyMap.current.delete(id);
                }
              } catch (error) {
                console.warn(
                  `[physics] Failed to update body map for ${id}:`,
                  error,
                );
              }
            }}
            type={bodyType}
            ccd
            colliders={false}
            position={[offX, yPos, zBase + offZ]}
            linearDamping={2}
            angularDamping={2}
            canSleep={false}
            enabledRotations={[false, true, false]}
            gravityScale={gravityScale}
          >
            <CuboidCollider
              args={[CARD_SHORT / 2, CARD_THICK / 2, CARD_LONG / 2]}
              friction={0.9}
              restitution={0}
              sensor
            />
            <group
              visible={!isLocalDragGhost}
              scale={tokenSiteReplace ? [1, 1, 1] : [cardScale, 1, cardScale]}
              userData={{ cardInstance: permId }}
              onPointerDown={(e) => {
                if (!isPrimaryCardHit(e)) {
                  return;
                }
                if (isSpectator) {
                  e.stopPropagation();
                  return;
                }
                if (dragging || dragAvatar || dragFromHand || dragFromPile)
                  return;
                if (tokenSiteReplace) {
                  e.stopPropagation();
                  selectPermanent(key, idx);
                  setLastTouchedId(permId);
                  clearHoverPreview(hoverKey);
                  return;
                }
                if (pendingMagic && !pendingMagic.guidesSuppressed) {
                  const ownerSeat = seatFromOwner(pendingMagic.spell.owner);
                  const amActor = actorKey === ownerSeat;
                  const actorIsActive =
                    (actorKey === "p1" && currentPlayer === 1) ||
                    (actorKey === "p2" && currentPlayer === 2);
                  if (amActor && actorIsActive) {
                    e.stopPropagation();
                    if (pendingMagic.status === "choosingCaster") {
                      if (p.owner === pendingMagic.spell.owner) {
                        const nm = p.card?.name || "";
                        if (nm && detectSpellcasterSync(nm)) {
                          setMagicCasterChoice({
                            kind: "permanent",
                            at: key as CellKey,
                            index: idx,
                            owner: p.owner as 1 | 2,
                          });
                        }
                      }
                      return;
                    }
                    if (pendingMagic.status === "choosingTarget") {
                      // Allow targeting any permanent on the board without scope restrictions
                      // The actual spell effect validation happens server-side during resolution
                      setMagicTargetChoice({
                        kind: "permanent",
                        at: key as CellKey,
                        index: idx,
                      });
                      return;
                    }
                  }
                }
                // Chaos Twister minion selection - click on any minion
                if (
                  pendingChaosTwister &&
                  pendingChaosTwister.phase === "selectingMinion" &&
                  pendingChaosTwister.casterSeat === actorKey
                ) {
                  const type = (p.card?.type || "").toLowerCase();
                  const isMinion =
                    type.includes("minion") || type.includes("creature");
                  // Attachments cannot be selected
                  const isAttachment = Boolean(p.attachedTo);
                  if (isMinion && !isAttachment) {
                    e.stopPropagation();
                    // Get power from metaByCardId
                    let power = 0;
                    const cardId = p.card?.cardId;
                    if (cardId && metaByCardId[cardId]?.attack != null) {
                      power = metaByCardId[cardId].attack ?? 0;
                    }
                    selectChaosTwisterMinion({
                      at: key as CellKey,
                      index: idx,
                      card: p.card,
                      power,
                    });
                    return;
                  }
                }
                // Shapeshift target selection - click on any allied permanent (except avatars/sites)
                if (
                  pendingShapeshift &&
                  pendingShapeshift.phase === "selectingTarget" &&
                  pendingShapeshift.casterSeat === actorKey
                ) {
                  const type = (p.card?.type || "").toLowerCase();
                  // Exclude avatars and sites - everything else can be targeted
                  // (includes minions, tokens, animated spells, etc.)
                  const isAvatar = type.includes("avatar");
                  const isSite = type.includes("site");
                  const isAttachment = Boolean(p.attachedTo);
                  const casterOwner =
                    pendingShapeshift.casterSeat === "p1" ? 1 : 2;
                  if (
                    !isAvatar &&
                    !isSite &&
                    !isAttachment &&
                    owner === casterOwner
                  ) {
                    e.stopPropagation();
                    selectShapeshiftTarget({
                      cellKey: key as CellKey,
                      index: idx,
                      instanceId: p.card?.instanceId ?? null,
                      card: p.card as CardRef,
                    });
                    return;
                  }
                }
                if (attackTargetChoice) {
                  e.stopPropagation();
                  const enemyOwner =
                    attackTargetChoice.attacker.owner === 1 ? 2 : 1;
                  const onTile =
                    attackTargetChoice.tile.x === tileX &&
                    attackTargetChoice.tile.y === tileY;
                  // Attachments (like Lance, Disabled) cannot be targeted directly
                  const isAttachment = Boolean(p.attachedTo);
                  if (onTile && owner === enemyOwner && !isAttachment) {
                    const label = p.card?.name || "Unit";
                    setAttackConfirm({
                      tile: attackTargetChoice.tile,
                      attacker: attackTargetChoice.attacker,
                      target: {
                        kind: "permanent",
                        at: key as CellKey,
                        index: idx,
                      },
                      targetLabel: label,
                    });
                    return;
                  }
                }
                if (
                  pendingCombat &&
                  actorKey &&
                  pendingCombat.defenderSeat === actorKey
                ) {
                  const onTile =
                    pendingCombat.tile.x === tileX &&
                    pendingCombat.tile.y === tileY;
                  const myOwner: 1 | 2 =
                    pendingCombat.attacker.owner === 1 ? 2 : 1;
                  // Attachments cannot be assigned as defenders
                  const isAttachment = Boolean(p.attachedTo);
                  if (onTile && owner === myOwner && !isAttachment) {
                    e.stopPropagation();
                    const present = (pendingCombat.defenders || []).some(
                      (d) => d.at === key && d.index === idx,
                    );
                    if (present) {
                      const next = (pendingCombat.defenders || []).filter(
                        (d) => !(d.at === key && d.index === idx),
                      ) as Array<{
                        at: CellKey;
                        index: number;
                        owner: 1 | 2;
                        instanceId?: string | null;
                      }>;
                      setDefenderSelection(next);
                    } else {
                      const next = [
                        ...((pendingCombat.defenders || []) as Array<{
                          at: CellKey;
                          index: number;
                          owner: 1 | 2;
                          instanceId?: string | null;
                        }>),
                        {
                          at: key as CellKey,
                          index: idx,
                          owner: myOwner,
                          instanceId: p.instanceId ?? null,
                        },
                      ];
                      setDefenderSelection(next);
                    }
                    return;
                  }
                }
                // XR mode: select permanent immediately on pinch
                // (bypasses touch/button handlers that depend on clientX/clientY)
                if (gl.xr.isPresenting) {
                  e.stopPropagation();
                  selectPermanent(key, idx);
                  setLastTouchedId(permId);
                  dragStartRef.current = {
                    at: key,
                    index: idx,
                    start: [e.point.x, e.point.z],
                    time: Date.now(),
                  };
                  clearHoverPreview(hoverKey);
                  return;
                }
                const pe = e.nativeEvent as PointerEvent | undefined;
                // Start long-press timer for touch AND coarse-pointer devices (AVP gaze+pinch
                // reports pointerType "mouse" but has no right-click for context menu)
                const needsLongPress =
                  pe &&
                  (pe.pointerType === "touch" ||
                    !window.matchMedia("(pointer: fine)").matches);
                if (needsLongPress) {
                  clearTouchTimers();
                  const cx = e.clientX;
                  const cy = e.clientY;
                  // Don't show preview to opponents for face-down cards
                  const isOwner = actorKey === ownerSeat;
                  const canShowPreview = !p.faceDown || isOwner || isSpectator;
                  if (canShowPreview) {
                    touchPreviewTimerRef.current = window.setTimeout(() => {
                      beginHoverPreview(p.card, hoverKey);
                    }, 180) as unknown as number;
                  }
                  touchContextTimerRef.current = window.setTimeout(() => {
                    selectPermanent(key, idx);
                    setLastTouchedId(permId);
                    openContextMenu(
                      { kind: "permanent", at: key, index: idx },
                      { x: cx, y: cy },
                    );
                  }, 500) as unknown as number;
                }
                if (e.button === 0) {
                  e.stopPropagation();
                  selectPermanent(key, idx);
                  setLastTouchedId(permId);
                  if (!isSpectator && actorKey) {
                    const mine =
                      (actorKey === "p1" && owner === 1) ||
                      (actorKey === "p2" && owner === 2);
                    const actorIsActive =
                      (actorKey === "p1" && currentPlayer === 1) ||
                      (actorKey === "p2" && currentPlayer === 2);
                    // Acting player can drag any card (own or opponent's)
                    // Non-acting player can only drag their own cards
                    if (!actorIsActive && !mine) {
                      clearHoverPreview(hoverKey);
                      return;
                    }
                    // Board movement is allowed before drawing so players can
                    // resolve effects like Hauntless Head or "once on your
                    // turn" move abilities. Playing cards from hand is still
                    // gated by the draw requirement in playActions.
                  }
                  dragStartRef.current = {
                    at: key,
                    index: idx,
                    start: [e.point.x, e.point.z],
                    time: Date.now(),
                  };
                  clearHoverPreview(hoverKey);
                }
              }}
              onPointerOver={(e) => {
                if (dragFromHand || dragFromPile) return;
                if (!isPrimaryCardHit(e)) {
                  clearHoverPreviewDebounced(hoverKey);
                  return;
                }
                e.stopPropagation();
                // Don't show preview to opponents for face-down cards
                const isOwner = actorKey === ownerSeat;
                if (p.faceDown && !isOwner && !isSpectator) {
                  return;
                }
                beginHoverPreview(p.card, hoverKey);
              }}
              onPointerOut={(e) => {
                if (dragFromHand || dragFromPile) return;
                e.stopPropagation();
                clearHoverPreviewDebounced(hoverKey);
                if (
                  dragStartRef.current &&
                  dragStartRef.current.at === key &&
                  dragStartRef.current.index === idx
                ) {
                  dragStartRef.current = null;
                }
                clearTouchTimers();
              }}
              onDoubleClick={(e) => {
                if (dragFromHand || dragFromPile) return;
                if (tokenSiteReplace) return;
                if (isSpectator) return;
                if (!isPrimaryCardHit(e)) {
                  return;
                }
                e.stopPropagation();
                setLastTouchedId(permId);
                emitBoardPing({ x: e.point.x, z: e.point.z });
              }}
              onPointerMove={(e) => {
                if (dragFromHand || dragFromPile) return;
                if (tokenSiteReplace) return;
                if (!isPrimaryCardHit(e)) {
                  clearHoverPreviewDebounced(hoverKey);
                  return;
                }
                e.stopPropagation();
                const pe = e.nativeEvent as PointerEvent | undefined;
                if (pe && pe.pointerType === "touch") {
                  clearTouchTimers();
                }
                handlePointerMove(e.point.x, e.point.z);
                if (isSpectator) return;
                if (
                  !dragging &&
                  dragStartRef.current &&
                  dragStartRef.current.at === key &&
                  dragStartRef.current.index === idx
                ) {
                  if (!pe || (pe.buttons & 1) !== 1) {
                    return;
                  }
                  const [sx, sz] = dragStartRef.current.start;
                  const dx = e.point.x - sx;
                  const dz = e.point.z - sz;
                  const dist = Math.hypot(dx, dz);
                  const heldFor = Date.now() - dragStartRef.current.time;
                  if (heldFor >= DRAG_HOLD_MS && dist > DRAG_THRESHOLD) {
                    flushSync(() => {
                      setDragging({ from: key, index: idx });
                    });
                    dragStartRef.current = null;
                    if (useGhostOnlyBoardDrag) {
                      lastBoardGhostPosRef.current.x = e.point.x;
                      lastBoardGhostPosRef.current.z = e.point.z;
                      if (boardGhostRef.current) {
                        boardGhostRef.current.position.set(
                          e.point.x,
                          0.26,
                          e.point.z,
                        );
                      }
                    }
                    if (!useGhostOnlyBoardDrag) {
                      const bodyId = (p.instanceId ??
                        `perm:${key}:${idx}`) as string;
                      if (bodiesAccessedThisFrame.current.has(bodyId)) {
                        draggedBody.current = null;
                      } else {
                        bodiesAccessedThisFrame.current.add(bodyId);
                        draggedBody.current =
                          bodyMap.current.get(bodyId) || null;
                        if (draggedBody.current) {
                          try {
                            draggedBody.current.setBodyType(
                              "kinematicPosition",
                              false,
                            );
                          } catch {}
                          moveDraggedBody(e.point.x, e.point.z, true);
                        }
                      }
                    } else {
                      draggedBody.current = null;
                    }
                  }
                } else if (
                  dragging &&
                  dragging.from === key &&
                  dragging.index === idx &&
                  draggedBody.current &&
                  !useGhostOnlyBoardDrag
                ) {
                  if (pe && (pe.buttons & 1) !== 1) {
                    return;
                  }
                  moveDraggedBody(e.point.x, e.point.z, true);
                }
              }}
              onPointerUp={(e) => {
                if (e.button !== 0) return;
                if (dragAvatar) return;
                if (dragFromHand || dragFromPile) return;
                if (tokenSiteReplace) {
                  e.stopPropagation();
                  return;
                }
                if (isSpectator) {
                  e.stopPropagation();
                  return;
                }
                e.stopPropagation();
                clearTouchTimers();
                if (dragging) {
                  const wx = e.point.x;
                  const wz = e.point.z;
                  try {
                    const gridHalfW = boardHalfW;
                    const gridHalfH = boardHalfH;
                    const rightX = gridHalfW + TILE_SIZE / 2 - CARD_SHORT / 2;
                    const leftX = -gridHalfW - TILE_SIZE / 2 + CARD_SHORT / 2;
                    const zSpacing = CARD_LONG * 1.1;
                    const halfW = CARD_SHORT / 2 + 0.2;
                    const halfH = CARD_LONG / 2 + 0.2;
                    const p1X = rightX + 0.1;
                    const p1StartZ = -gridHalfH - TILE_SIZE * 0.8;
                    const p1Z = p1StartZ + zSpacing * 7.2;
                    const p2X = leftX - 0.1;
                    const p2StartZ = gridHalfH + TILE_SIZE * 0.8;
                    const p2Z = p2StartZ - zSpacing * 7.2;
                    const p1AtlasZ = p1StartZ + zSpacing * 4.8;
                    const p1SpellZ = p1StartZ + zSpacing * 5.9;
                    const p2AtlasZ = p2StartZ - zSpacing * 4.8;
                    const p2SpellZ = p2StartZ - zSpacing * 5.9;
                    const atlasHalfW = CARD_LONG / 2 + 0.2;
                    const atlasHalfH = CARD_SHORT / 2 + 0.2;
                    const overP1GY =
                      wx >= p1X - halfW &&
                      wx <= p1X + halfW &&
                      wz >= p1Z - halfH &&
                      wz <= p1Z + halfH;
                    const overP2GY =
                      wx >= p2X - halfW &&
                      wx <= p2X + halfW &&
                      wz >= p2Z - halfH &&
                      wz <= p2Z + halfH;
                    const overP1Atlas =
                      wx >= p1X - atlasHalfW &&
                      wx <= p1X + atlasHalfW &&
                      wz >= p1AtlasZ - atlasHalfH &&
                      wz <= p1AtlasZ + atlasHalfH;
                    const overP2Atlas =
                      wx >= p2X - atlasHalfW &&
                      wx <= p2X + atlasHalfW &&
                      wz >= p2AtlasZ - atlasHalfH &&
                      wz <= p2AtlasZ + atlasHalfH;
                    const overP1Spell =
                      wx >= p1X - halfW &&
                      wx <= p1X + halfW &&
                      wz >= p1SpellZ - halfH &&
                      wz <= p1SpellZ + halfH;
                    const overP2Spell =
                      wx >= p2X - halfW &&
                      wx <= p2X + halfW &&
                      wz >= p2SpellZ - halfH &&
                      wz <= p2SpellZ + halfH;
                    if (
                      overP1Atlas ||
                      overP2Atlas ||
                      overP1Spell ||
                      overP2Spell
                    ) {
                      setDragging(null);
                      setDragFromHand(false);
                      setGhost(null);
                      dragStartRef.current = null;
                      lastDropAt.current = Date.now();
                      draggedBody.current = null;
                      return;
                    }
                    if (overP1GY || overP2GY) {
                      const tokenType = (p.card?.type || "").toLowerCase();
                      const goTo = tokenType.includes("token")
                        ? "banished"
                        : "graveyard";
                      try {
                        moveToZone(dragging.from, dragging.index, goTo);
                        try {
                          playCardFlip();
                        } catch {}
                      } finally {
                        setDragging(null);
                        setDragFromHand(false);
                        setGhost(null);
                        dragStartRef.current = null;
                        lastDropAt.current = Date.now();
                        draggedBody.current = null;
                      }
                      return;
                    }
                  } catch {}
                  let tx = Math.round((wx - boardOffset.x) / TILE_SIZE);
                  let ty = Math.round((wz - boardOffset.y) / TILE_SIZE);
                  tx = Math.max(0, Math.min(boardSize.w - 1, tx));
                  ty = Math.max(0, Math.min(boardSize.h - 1, ty));
                  const dropKey = `${tx},${ty}`;
                  const tileWorldX = boardOffset.x + tx * TILE_SIZE;
                  const tileWorldZ = boardOffset.y + ty * TILE_SIZE;
                  const draggedOwner =
                    permanents[dragging.from]?.[dragging.index]?.owner ?? 1;
                  const draggedInstId =
                    permanents[dragging.from]?.[dragging.index]?.instanceId ||
                    null;
                  // Calculate offset relative to owner's base position for precise drops
                  // Rendering uses: position = [offX, y, zBase + offZ]
                  // So to land at wz, we need: offZ = wz - tileWorldZ - zBase
                  const localZBase =
                    draggedOwner === 1 ? TILE_SIZE * 0.15 : -(TILE_SIZE * 0.15);
                  const offX = wx - tileWorldX;
                  const offZ = wz - tileWorldZ - localZBase;
                  if (dragging.from === dropKey) {
                    const newOffset: [number, number] = [offX, offZ];
                    dragTarget.current = null;
                    draggedBody.current = null;
                    requestAnimationFrame(() => {
                      setOffset(dropKey, dragging.index, newOffset);
                    });
                    if (!useGhostOnlyBoardDrag) {
                      const targetId = (draggedInstId ||
                        `perm:${dropKey}:${dragging.index}`) as string;
                      snapBodyTo(targetId, wx, wz);
                    }
                  } else {
                    const toItems = permanents[dropKey] || [];
                    const newIndex = toItems.length;
                    const newOffset: [number, number] = [offX, offZ];
                    dragTarget.current = null;
                    draggedBody.current = null;
                    requestAnimationFrame(() => {
                      moveToWithOffset(tx, ty, newOffset);
                    });
                    if (!useGhostOnlyBoardDrag) {
                      const targetId = (draggedInstId ||
                        `perm:${dropKey}:${newIndex}`) as string;
                      snapBodyTo(targetId, wx, wz);
                    }
                  }
                  setDragging(null);
                  setDragFromHand(false);
                  setGhost(null);
                  dragStartRef.current = null;
                  lastDropAt.current = Date.now();
                  draggedBody.current = null;
                  setLastTouchedId(permId);
                  return;
                }
              }}
            >
              {showPermanentGlow && (
                <CardOutline
                  width={
                    tokenDef && tokenDef.size === "small"
                      ? CARD_SHORT * 0.5
                      : CARD_SHORT
                  }
                  height={
                    tokenDef && tokenDef.size === "small"
                      ? CARD_LONG * 0.5
                      : CARD_LONG
                  }
                  rotationZ={rotZ}
                  elevation={isDraggingPermanent ? DRAG_LIFT + 0.0001 : 0.0001}
                  color={roleGlow ?? permanentGlowColor}
                  renderOrder={1500}
                  pulse={!!roleGlow}
                  pulseSpeed={1.6}
                  pulseMin={0.35}
                  pulseMax={0.95}
                />
              )}
              {showOwnershipGlow && (
                <CardOutline
                  width={
                    tokenDef && tokenDef.size === "small"
                      ? CARD_SHORT * 0.5
                      : CARD_SHORT
                  }
                  height={
                    tokenDef && tokenDef.size === "small"
                      ? CARD_LONG * 0.5
                      : CARD_LONG
                  }
                  rotationZ={rotZ}
                  elevation={0.006}
                  color={PLAYER_COLORS[localSeat]}
                  renderOrder={1600}
                  opacity={0.5}
                />
              )}
              {/* Subtle cyan glow for token copies */}
              {p.isCopy && (
                <CardOutline
                  width={CARD_SHORT}
                  height={CARD_LONG}
                  rotationZ={rotZ}
                  elevation={0.003}
                  color="#22d3ee"
                  renderOrder={1400}
                  opacity={0.4}
                  pulse
                  pulseSpeed={0.8}
                  pulseMin={0.25}
                  pulseMax={0.5}
                />
              )}
              {/* Purple glow for cards with custom resolvers */}
              {!roleGlow &&
                !p.isCopy &&
                getGraphicsSettings().showResolverGlow &&
                hasCustomResolver(p.card.name) && (
                  <CardOutline
                    width={
                      tokenDef && tokenDef.size === "small"
                        ? CARD_SHORT * 0.54
                        : CARD_SHORT * 1.08
                    }
                    height={
                      tokenDef && tokenDef.size === "small"
                        ? CARD_LONG * 0.54
                        : CARD_LONG * 1.08
                    }
                    rotationZ={rotZ}
                    elevation={0.002}
                    color="#8b5cf6"
                    renderOrder={1350}
                    opacity={0.4}
                    pulse
                    pulseSpeed={0.6}
                    pulseMin={0.2}
                    pulseMax={0.45}
                  />
                )}
              <group
                visible
                userData={{ cardInstance: permId }}
                onClick={(e) => {
                  if (dragFromHand || dragFromPile) return;
                  if (!isPrimaryCardHit(e)) {
                    return;
                  }
                  e.stopPropagation();
                  if (isSpectator) return;
                  if (
                    dragging &&
                    dragging.from === key &&
                    dragging.index === idx
                  )
                    return;
                  selectPermanent(key, idx);
                  setLastTouchedId(permId);
                }}
                onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                  if (isSpectator) return;
                  if (!isPrimaryCardHit(e)) {
                    return;
                  }
                  e.stopPropagation();
                  e.nativeEvent.preventDefault();
                  selectPermanent(key, idx);
                  setLastTouchedId(permId);
                  openContextMenu(
                    { kind: "permanent", at: key, index: idx },
                    { x: e.clientX, y: e.clientY },
                  );
                }}
              >
                {isSilencedToken ? (
                  /* Silenced token: uses Silence spell card art */
                  <CardPlane
                    slug=""
                    textureUrl={SILENCE_SPELL_TEXTURE_URL}
                    forceTextureUrl
                    width={CARD_SHORT * 0.5}
                    height={CARD_LONG * 0.5}
                    rotationZ={rotZ}
                    elevation={0}
                    depthWrite
                    depthTest
                    polygonOffset
                    polygonOffsetFactor={-1}
                    polygonOffsetUnits={-1}
                    renderOrder={
                      isDraggingPermanent || isSel || isLastTouched ? 1000 : 100
                    }
                  />
                ) : isToken ? (
                  <CardPlane
                    slug=""
                    textureUrl={
                      tokenDef ? tokenTextureUrl(tokenDef) : undefined
                    }
                    forceTextureUrl
                    width={
                      tokenDef && tokenDef.size === "small"
                        ? CARD_SHORT * 0.5
                        : CARD_SHORT
                    }
                    height={
                      tokenDef && tokenDef.size === "small"
                        ? CARD_LONG * 0.5
                        : CARD_LONG
                    }
                    rotationZ={rotZ}
                    elevation={0}
                    depthWrite
                    depthTest
                    polygonOffset
                    polygonOffsetFactor={-1}
                    polygonOffsetUnits={-1}
                    renderOrder={
                      tokenSiteReplace
                        ? 5
                        : isDraggingPermanent || isSel || isLastTouched
                          ? 1000
                          : 100
                    }
                  />
                ) : (
                  <CardPlane
                    slug={p.faceDown ? "" : p.card?.slug || ""}
                    width={CARD_SHORT}
                    height={CARD_LONG}
                    rotationZ={rotZ}
                    renderOrder={
                      isDraggingPermanent || isSel || isLastTouched
                        ? 1000
                        : isBurrowed
                          ? 50
                          : 100
                    }
                    depthWrite
                    depthTest
                    textureUrl={
                      p.faceDown
                        ? "/api/assets/cardback_spellbook.png"
                        : !p.card?.slug
                          ? "/api/assets/air.png"
                          : undefined
                    }
                  />
                )}
                {/* Counter badge - shows +/- buttons on hover */}
                {Number(p.counters || 0) > 0 && (
                  <CounterBadge3D
                    count={Math.max(0, Number(p.counters || 0))}
                    playerColor={PLAYER_COLORS[ownerSeat]}
                    rotZ={rotZ}
                    onIncrement={() => increment(key, idx)}
                    onDecrement={() => decrement(key, idx)}
                  />
                )}
                {/* Stolen cards are now rendered as attached permanents with cardback */}
                {(() => {
                  const attachedTokens = items.filter(
                    (item) =>
                      item.attachedTo &&
                      item.attachedTo.at === key &&
                      item.attachedTo.index === idx,
                  );
                  return attachedTokens.map((token, attachIdx) => {
                    const tokenName = (token.card.name || "").toLowerCase();
                    const attachTokenDef = TOKEN_BY_NAME[tokenName];
                    const isPithImpStolen =
                      "pithImpStolen" in token.card &&
                      token.card.pithImpStolen === true;
                    const offsetMultiplier = 0.3;
                    const attachOffsetX =
                      CARD_SHORT *
                      offsetMultiplier *
                      (attachIdx - (attachedTokens.length - 1) / 2);
                    const offsetZ = CARD_LONG * 0.4;

                    // Render Pith Imp stolen cards as face-down cardbacks
                    if (isPithImpStolen) {
                      const stolenW = CARD_SHORT * 0.55;
                      const stolenH = CARD_LONG * 0.55;
                      return (
                        <group
                          key={`attached-stolen-${attachIdx}`}
                          position={[
                            attachOffsetX,
                            (isBurrowed ? burrowedElevation : baseElevation) -
                              CARD_THICK * 0.05,
                            offsetZ,
                          ]}
                        >
                          <CardPlane
                            slug=""
                            textureUrl="/api/assets/cardback_spellbook.png"
                            forceTextureUrl
                            width={stolenW}
                            height={stolenH}
                            rotationZ={rotZ}
                            elevation={-0.001}
                            renderOrder={90 - attachIdx}
                            depthWrite={false}
                          />
                        </group>
                      );
                    }

                    if (attachTokenDef) {
                      const texUrl = tokenTextureUrl(attachTokenDef);
                      const tokenW =
                        attachTokenDef.size === "small"
                          ? CARD_SHORT * 0.4
                          : CARD_SHORT * 0.6;
                      const tokenH =
                        attachTokenDef.size === "small"
                          ? CARD_LONG * 0.4
                          : CARD_LONG * 0.6;
                      return (
                        <group
                          key={`attached-${attachIdx}`}
                          position={[
                            attachOffsetX,
                            (isBurrowed ? burrowedElevation : baseElevation) +
                              CARD_THICK * 0.1,
                            offsetZ,
                          ]}
                        >
                          <CardPlane
                            slug=""
                            textureUrl={texUrl}
                            forceTextureUrl
                            width={tokenW}
                            height={tokenH}
                            rotationZ={rotZ}
                            elevation={0.005}
                            renderOrder={50 + attachIdx}
                          />
                        </group>
                      );
                    }
                    // Carryable artifacts, carried units, and any other attached card
                    // with a slug: render as 60% scale card art overlay.
                    // This fallback ensures carried units render even if isCarried
                    // is lost during network sync.
                    if (token.card.slug) {
                      const artifactW = CARD_SHORT * 0.6;
                      const artifactH = CARD_LONG * 0.6;
                      const artifactHoverKey = `${token.isCarried ? "carried" : "artifact"}:${key}:${idx}:${attachIdx}`;
                      const parentRenderOrder = isBurrowed
                        ? -10
                        : isDraggingPermanent || isSel || isLastTouched
                          ? 1000
                          : 100;
                      return (
                        <group
                          key={`attached-${attachIdx}`}
                          position={[
                            attachOffsetX,
                            (isBurrowed ? burrowedElevation : baseElevation) +
                              CARD_THICK * 0.15,
                            offsetZ,
                          ]}
                        >
                          <CardPlane
                            slug={token.card.slug}
                            width={artifactW}
                            height={artifactH}
                            rotationZ={rotZ}
                            elevation={isBurrowed ? 0 : 0.002}
                            renderOrder={parentRenderOrder + 10 + attachIdx}
                            depthWrite
                            depthTest
                            interactive
                            onPointerOver={(evt: ThreeEvent<PointerEvent>) => {
                              evt.stopPropagation();
                              beginHoverPreview(token.card, artifactHoverKey);
                            }}
                            onPointerOut={(evt: ThreeEvent<PointerEvent>) => {
                              evt.stopPropagation();
                              clearHoverPreviewDebounced(artifactHoverKey);
                            }}
                          />
                        </group>
                      );
                    }
                    return null;
                  });
                })()}
              </group>
            </group>
          </RigidBody>
        );
      })}
    </>
  );
}
