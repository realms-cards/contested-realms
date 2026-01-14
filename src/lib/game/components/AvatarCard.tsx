import { Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useState, type MutableRefObject } from "react";
import { flushSync } from "react-dom";
import {
  BASE_CARD_ELEVATION,
  BodyApi,
  STACK_LAYER_LIFT,
} from "@/lib/game/boardShared";
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
import type { BoardDragControls } from "@/lib/game/hooks/useBoardDragControls";
import type {
  AvatarState,
  BoardState,
  CardRef,
  CellKey,
  GameState,
  Permanents,
  PlayerKey,
} from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";
import { TOKEN_BY_NAME, tokenTextureUrl } from "@/lib/game/tokens";

type HoverContext = {
  beginHoverPreview: (card?: CardRef | null, sourceKey?: string | null) => void;
  clearHoverPreview: (sourceKey?: string | null) => void;
  clearHoverPreviewDebounced: (
    sourceKey?: string | null,
    delay?: number
  ) => void;
  clearTouchTimers: () => void;
  touchPreviewTimerRef: MutableRefObject<number | null>;
  touchContextTimerRef: MutableRefObject<number | null>;
};

type SelectionContext = {
  selectedAvatar: PlayerKey | null;
  selectAvatar: GameState["selectAvatar"];
  contextMenu: GameState["contextMenu"];
  setLastTouchedId: (id: string | null) => void;
  lastTouchedId: string | null;
};

type CombatContext = {
  attackTargetChoice: GameState["attackTargetChoice"];
  attackConfirm: GameState["attackConfirm"];
  setAttackConfirm: GameState["setAttackConfirm"];
  pendingCombat: GameState["pendingCombat"];
};

type MagicContext = {
  pendingMagic: GameState["pendingMagic"];
  setMagicCasterChoice: GameState["setMagicCasterChoice"];
  setMagicTargetChoice: GameState["setMagicTargetChoice"];
  computeProjectileFirstHits: () => Record<
    "N" | "E" | "S" | "W",
    { kind: "permanent" | "avatar"; at: CellKey; index?: number } | null
  >;
  magicGuidesActive: GameState["magicGuidesActive"];
};

type AvatarActions = {
  moveAvatarToWithOffset: GameState["moveAvatarToWithOffset"];
  incrementCounter: GameState["incrementAvatarCounter"];
  decrementCounter: GameState["decrementAvatarCounter"];
};

export type AvatarCardProps = {
  seat: PlayerKey;
  avatar: AvatarState;
  boardOffset: { x: number; y: number };
  boardSize: BoardState["size"];
  permanents: Permanents;
  lastAvatarCardsRef: MutableRefObject<Record<PlayerKey, CardRef | null>>;
  dragContext: BoardDragControls;
  useGhostOnlyBoardDrag: boolean;
  dragFromHand: boolean;
  dragFromPile: GameState["dragFromPile"];
  draggingPermanent: { from: string; index: number } | null;
  setDragFromHand: GameState["setDragFromHand"];
  isHandVisible: boolean;
  isSpectator: boolean;
  actorKey: PlayerKey | null;
  currentPlayer: 1 | 2;
  openContextMenu: GameState["openContextMenu"];
  emitBoardPing: (pos: { x: number; z: number }) => void;
  handlePointerMove: (x: number, z: number) => void;
  hoverContext: HoverContext;
  selectionContext: SelectionContext;
  combatContext: CombatContext;
  magicContext: MagicContext;
  avatarActions: AvatarActions;
};

const HIGHLIGHT_ATTACKER = "#22c55e";
const HIGHLIGHT_TARGET = "#ef4444";

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
        >
          <circleGeometry args={[buttonRadius, 16]} />
          <meshBasicMaterial color="#166534" transparent opacity={0.9} />
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
        >
          <circleGeometry args={[buttonRadius, 16]} />
          <meshBasicMaterial color="#991b1b" transparent opacity={0.9} />
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

export function AvatarCard({
  seat,
  avatar,
  boardOffset,
  boardSize,
  permanents,
  lastAvatarCardsRef,
  dragContext,
  useGhostOnlyBoardDrag,
  dragFromHand,
  dragFromPile,
  draggingPermanent,
  setDragFromHand,
  isHandVisible,
  isSpectator,
  actorKey,
  currentPlayer,
  openContextMenu,
  emitBoardPing,
  handlePointerMove,
  hoverContext,
  selectionContext,
  combatContext,
  magicContext,
  avatarActions,
}: AvatarCardProps) {
  if (!avatar.pos) return null;
  const {
    dragAvatar,
    setDragAvatar,
    setGhost,
    avatarDragStartRef,
    boardGhostRef,
    lastBoardGhostPosRef,
    bodyMap,
    draggedBody,
    bodiesAccessedThisFrame,
    dragTarget,
    moveDraggedBody,
    snapBodyTo,
    lastDropAt,
  } = dragContext;
  const {
    beginHoverPreview,
    clearHoverPreviewDebounced,
    clearTouchTimers,
    touchPreviewTimerRef,
    touchContextTimerRef,
  } = hoverContext;
  const {
    selectedAvatar,
    selectAvatar,
    contextMenu,
    setLastTouchedId,
    lastTouchedId,
  } = selectionContext;
  const { attackTargetChoice, attackConfirm, setAttackConfirm, pendingCombat } =
    combatContext;
  const {
    pendingMagic,
    setMagicCasterChoice,
    setMagicTargetChoice,
    computeProjectileFirstHits,
    magicGuidesActive,
  } = magicContext;
  // These are kept for future re-enablement of magic targeting hints
  void computeProjectileFirstHits;
  void magicGuidesActive;
  const { moveAvatarToWithOffset, incrementCounter, decrementCounter } =
    avatarActions;

  const [ax, ay] = avatar.pos;
  const baseX = boardOffset.x + ax * TILE_SIZE;
  const baseZ = boardOffset.y + ay * TILE_SIZE;
  const offX = avatar.offset?.[0] ?? 0;
  const offZ = avatar.offset?.[1] ?? 0;
  const worldX = baseX + offX;
  const worldZ = baseZ + offZ;
  const hideAvatar = dragAvatar === seat && useGhostOnlyBoardDrag;
  const avatarBodyType = useGhostOnlyBoardDrag ? "fixed" : "dynamic";
  const avatarGravityScale = useGhostOnlyBoardDrag ? 0 : 1;
  const avatarId = `avatar:${seat}`;
  const tileKey = `${ax},${ay}` as CellKey;
  const tileItems = permanents[tileKey] || [];
  const isContextSelected =
    !!contextMenu &&
    contextMenu.target.kind === "avatar" &&
    contextMenu.target.who === seat;
  const isSel =
    selectedAvatar === seat || isContextSelected || dragAvatar === seat;
  const isLastTouched = lastTouchedId === avatarId;
  const isTopAvatar = dragAvatar === seat || isSel || isLastTouched;
  const avatarY =
    BASE_CARD_ELEVATION +
    (isTopAvatar
      ? (tileItems.length + 1) * STACK_LAYER_LIFT + CARD_THICK * 0.01
      : 0);

  const cachedCard = lastAvatarCardsRef.current[seat];
  const activeCard = avatar.card?.slug ? avatar.card : cachedCard;
  if (avatar.card?.slug) {
    lastAvatarCardsRef.current[seat] = avatar.card;
  }
  const rotZ =
    (seat === "p1" ? 0 : Math.PI) + (avatar.tapped ? -Math.PI / 2 : 0);
  const highlight = resolveHighlight();

  function resolveHighlight(): string | null {
    let hl: string | null = null;
    const pos = Array.isArray(avatar.pos) ? avatar.pos : null;
    if (
      pos &&
      attackConfirm &&
      attackConfirm.target.kind === "avatar" &&
      `${pos[0]},${pos[1]}` === attackConfirm.target.at
    ) {
      hl = HIGHLIGHT_TARGET;
    }
    if (
      pos &&
      pendingCombat?.target &&
      pendingCombat.target.kind === "avatar" &&
      `${pos[0]},${pos[1]}` === pendingCombat.target.at
    ) {
      hl = HIGHLIGHT_TARGET;
    }
    if (
      magicGuidesActive &&
      pendingMagic &&
      !pendingMagic.guidesSuppressed &&
      pendingMagic.target &&
      pendingMagic.target.kind === "avatar" &&
      pendingMagic.target.seat === seat
    ) {
      hl = HIGHLIGHT_TARGET;
    }
    if (
      magicGuidesActive &&
      pendingMagic &&
      !pendingMagic.guidesSuppressed &&
      pendingMagic.caster &&
      pendingMagic.caster.kind === "avatar" &&
      pendingMagic.caster.seat === seat
    ) {
      hl = HIGHLIGHT_ATTACKER;
    }
    return hl;
  }

  const attachedItems = (permanents[tileKey] || [])
    .map((p, idx) => ({ p, idx }))
    .filter(
      ({ p }) =>
        p.attachedTo && p.attachedTo.index === -1 && p.attachedTo.at === tileKey
    );
  const seenIds = new Set<string>();
  const uniqueAttachedItems = attachedItems.filter(({ p }) => {
    const id = (p.instanceId || p.card?.instanceId || "") as string;
    if (!id) return true;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });

  function handleMagicClick(e: ThreeEvent<PointerEvent>): boolean {
    if (!pendingMagic || pendingMagic.guidesSuppressed) return false;
    const ownerSeat = seatFromOwner(pendingMagic.spell.owner);
    const amActor = actorKey === ownerSeat;
    const actorIsActive =
      (actorKey === "p1" && currentPlayer === 1) ||
      (actorKey === "p2" && currentPlayer === 2);
    if (!amActor || !actorIsActive) return false;
    e.stopPropagation();
    if (pendingMagic.status === "choosingCaster") {
      setMagicCasterChoice({ kind: "avatar", seat });
      return true;
    }
    if (pendingMagic.status === "choosingTarget") {
      // Allow targeting any avatar without scope restrictions
      // The actual spell effect validation happens server-side during resolution
      setMagicTargetChoice({ kind: "avatar", seat });
      return true;
    }
    return false;
  }

  function handlePointerDown(e: ThreeEvent<PointerEvent>) {
    if (isSpectator) {
      e.stopPropagation();
      return;
    }
    if (draggingPermanent || dragFromHand || dragFromPile) return;
    if (handleMagicClick(e)) {
      return;
    }
    if (combatContext.attackTargetChoice) {
      e.stopPropagation();
      const enemySeat: PlayerKey =
        combatContext.attackTargetChoice.attacker.owner === 1 ? "p2" : "p1";
      const pos = Array.isArray(avatar.pos) ? avatar.pos : null;
      const onTile =
        !!pos &&
        pos[0] === combatContext.attackTargetChoice.tile.x &&
        pos[1] === combatContext.attackTargetChoice.tile.y;
      if (seat === enemySeat && onTile && pos) {
        const label = avatar.card?.name || "Avatar";
        setAttackConfirm({
          tile: combatContext.attackTargetChoice.tile,
          attacker: combatContext.attackTargetChoice.attacker,
          target: {
            kind: "avatar",
            at: `${pos[0]},${pos[1]}` as CellKey,
            index: null,
          },
          targetLabel: label,
        });
        return;
      }
    }
    if (
      attackTargetChoice &&
      actorKey &&
      seat !== (attackTargetChoice.attacker.owner === 1 ? "p1" : "p2")
    ) {
      e.stopPropagation();
    }

    const pe = e.nativeEvent as PointerEvent | undefined;
    if (pe && pe.pointerType === "touch") {
      clearTouchTimers();
      const cx = e.clientX;
      const cy = e.clientY;
      if (avatar.card) {
        touchPreviewTimerRef.current = window.setTimeout(() => {
          beginHoverPreview(avatar.card, seat);
        }, 180) as unknown as number;
      }
      touchContextTimerRef.current = window.setTimeout(() => {
        selectAvatar(seat);
        setLastTouchedId(avatarId);
        openContextMenu({ kind: "avatar", who: seat }, { x: cx, y: cy });
      }, 500) as unknown as number;
    }

    avatarDragStartRef.current = {
      who: seat,
      start: [e.point.x, e.point.z],
      time: Date.now(),
    };
    selectAvatar(seat);
    setLastTouchedId(avatarId);
  }

  function handlePointerMoveEvent(e: ThreeEvent<PointerEvent>) {
    if (dragFromHand || dragFromPile) return;
    e.stopPropagation();
    const pe = e.nativeEvent as PointerEvent | undefined;
    if (pe && pe.pointerType === "touch") {
      clearTouchTimers();
    }
    handlePointerMove(e.point.x, e.point.z);
    if (isSpectator) return;

    if (
      !dragAvatar &&
      avatarDragStartRef.current &&
      avatarDragStartRef.current.who === seat
    ) {
      if (!pe || (pe.buttons & 1) !== 1) {
        return;
      }
      const [sx, sz] = avatarDragStartRef.current.start;
      const dx = e.point.x - sx;
      const dz = e.point.z - sz;
      const dist = Math.hypot(dx, dz);
      const heldFor = Date.now() - avatarDragStartRef.current.time;
      if (heldFor >= DRAG_HOLD_MS && dist > DRAG_THRESHOLD) {
        flushSync(() => setDragAvatar(seat));
        setGhost(null);
        if (useGhostOnlyBoardDrag) {
          lastBoardGhostPosRef.current.x = e.point.x;
          lastBoardGhostPosRef.current.z = e.point.z;
          if (boardGhostRef.current) {
            boardGhostRef.current.position.set(e.point.x, 0.26, e.point.z);
          }
        }
        if (!useGhostOnlyBoardDrag) {
          const avatarBodyId = `avatar:${seat}`;
          if (bodiesAccessedThisFrame.current.has(avatarBodyId)) {
            draggedBody.current = null;
          } else {
            bodiesAccessedThisFrame.current.add(avatarBodyId);
            draggedBody.current = bodyMap.current.get(avatarBodyId) || null;
            if (draggedBody.current) {
              moveDraggedBody(e.point.x, e.point.z, true);
            }
          }
        } else {
          draggedBody.current = null;
        }
      }
    } else if (
      dragAvatar === seat &&
      draggedBody.current &&
      !useGhostOnlyBoardDrag
    ) {
      if (pe && (pe.buttons & 1) !== 1) {
        return;
      }
      moveDraggedBody(e.point.x, e.point.z, true);
    }
  }

  function handlePointerUp(e: ThreeEvent<PointerEvent>) {
    if (e.button !== 0) return;
    if (draggingPermanent || dragFromHand || dragFromPile) return;
    if (isSpectator) {
      e.stopPropagation();
      return;
    }
    if (dragAvatar === seat) {
      e.stopPropagation();
      const wx = e.point.x;
      const wz = e.point.z;
      let tx = Math.round((wx - boardOffset.x) / TILE_SIZE);
      let ty = Math.round((wz - boardOffset.y) / TILE_SIZE);
      tx = Math.max(0, Math.min(boardSize.w - 1, tx));
      ty = Math.max(0, Math.min(boardSize.h - 1, ty));
      const tileX = boardOffset.x + tx * TILE_SIZE;
      const tileZ = boardOffset.y + ty * TILE_SIZE;
      const relX = wx - tileX;
      const relZ = wz - tileZ;
      const apiAtDrop: BodyApi | null = draggedBody.current;
      dragTarget.current = null;
      draggedBody.current = null;
      requestAnimationFrame(() => {
        moveAvatarToWithOffset(seat, tx, ty, [relX, relZ]);
      });
      if (!useGhostOnlyBoardDrag) {
        snapBodyTo(`avatar:${seat}`, wx, wz);
        if (apiAtDrop) {
          setTimeout(() => {
            try {
              apiAtDrop.setBodyType("dynamic", true);
            } catch {}
          }, 0);
        }
      }
      setDragAvatar(null);
      setDragFromHand(false);
      setGhost(null);
      avatarDragStartRef.current = null;
      lastDropAt.current = Date.now();
      draggedBody.current = null;
      setLastTouchedId(avatarId);
    }
  }

  return (
    <group key={`avatar-${seat}`}>
      <RigidBody
        key={`avatar-${seat}`}
        ref={(api) => {
          const id = `avatar:${seat}`;
          try {
            if (api) {
              bodyMap.current.set(id, api as unknown as BodyApi);
            } else {
              bodyMap.current.delete(id);
            }
          } catch (error) {
            console.warn(
              `[physics] Failed to update body map for ${id}:`,
              error
            );
          }
        }}
        ccd
        colliders={false}
        position={[worldX, avatarY, worldZ]}
        linearDamping={2}
        angularDamping={2}
        canSleep={false}
        enabledRotations={[false, true, false]}
        gravityScale={avatarGravityScale}
        type={avatarBodyType}
      >
        <CuboidCollider
          args={[CARD_SHORT / 2, CARD_THICK / 2, CARD_LONG / 2]}
          friction={0.9}
          restitution={0}
          sensor
        />
        {(isSel || highlight) && !isHandVisible && !hideAvatar && (
          <CardOutline
            width={CARD_SHORT}
            height={CARD_LONG}
            rotationZ={rotZ}
            elevation={0.0001}
            color={
              highlight ?? (seat === "p1" ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2)
            }
            renderOrder={1201}
            pulse={!!highlight}
          />
        )}
        <group
          visible={!hideAvatar}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMoveEvent}
          onPointerUp={handlePointerUp}
          onDoubleClick={(e) => {
            if (dragFromHand || dragFromPile) return;
            if (dragAvatar) return;
            if (isSpectator) return;
            e.stopPropagation();
            setLastTouchedId(avatarId);
            emitBoardPing({ x: e.point.x, z: e.point.z });
          }}
          onClick={(e) => {
            if (dragFromHand || dragFromPile) return;
            e.stopPropagation();
            if (isSpectator) return;
            if (dragAvatar === seat) return;
            selectAvatar(seat);
            setLastTouchedId(avatarId);
          }}
          onContextMenu={(e: ThreeEvent<PointerEvent>) => {
            if (isSpectator) return;
            e.stopPropagation();
            e.nativeEvent.preventDefault();
            selectAvatar(seat);
            setLastTouchedId(avatarId);
            openContextMenu(
              { kind: "avatar", who: seat },
              { x: e.clientX, y: e.clientY }
            );
          }}
        >
          {(selectedAvatar === seat || dragAvatar === seat) &&
            !isHandVisible &&
            !hideAvatar && (
              <CardOutline
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={rotZ}
                elevation={dragAvatar === seat ? DRAG_LIFT + 0.0001 : 0.0001}
                color={seat === "p1" ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2}
                renderOrder={1000}
              />
            )}
          <CardPlane
            slug={activeCard?.slug || cachedCard?.slug || ""}
            width={CARD_SHORT}
            height={CARD_LONG}
            rotationZ={rotZ}
            elevation={dragAvatar === seat ? DRAG_LIFT + 0.002 : 0.002}
            polygonOffsetUnits={-1.25}
            polygonOffsetFactor={-0.75}
            renderOrder={
              hideAvatar
                ? -5
                : dragAvatar === seat || isSel || isLastTouched
                ? 1200
                : 100
            }
            onPointerOver={() => {
              if (dragFromHand || dragFromPile) return;
              beginHoverPreview(activeCard ?? cachedCard, seat);
            }}
            onPointerOut={() => {
              if (dragFromHand || dragFromPile) return;
              clearHoverPreviewDebounced(seat);
              clearTouchTimers();
            }}
          />
        </group>
        {renderCounters()}
        {renderAttachedItems()}
      </RigidBody>
    </group>
  );

  function renderCounters() {
    const count = Math.max(0, Number(avatar.counters || 0));
    if (count <= 0) return null;
    return (
      <CounterBadge3D
        count={count}
        playerColor={PLAYER_COLORS[seat]}
        rotZ={rotZ}
        onIncrement={() => incrementCounter(seat)}
        onDecrement={() => decrementCounter(seat)}
      />
    );
  }

  function renderAttachedItems() {
    if (uniqueAttachedItems.length === 0) return null;
    return uniqueAttachedItems.map(({ p, idx }, attachIdx) => {
      const itemType = (p.card.type || "").toLowerCase();
      const isArtifact = itemType.includes("artifact");
      const isToken = itemType.includes("token");
      const tokenName = (p.card.name || "").toLowerCase();
      const tokenDef = TOKEN_BY_NAME[tokenName];

      const offsetMultiplier = 0.3;
      const offsetX =
        CARD_SHORT *
        offsetMultiplier *
        (attachIdx - (uniqueAttachedItems.length - 1) / 2);
      const offsetZ = CARD_LONG * 0.4;
      const uniqueKey = `${tileKey}-${p.instanceId || idx}`;
      const avatarRenderOrder =
        isLastTouched || isSel || dragAvatar === seat ? 1200 : 100;

      // Render tokens (Lance, Ward, Stealth, Disabled, etc.)
      if (isToken && tokenDef) {
        const texUrl = tokenTextureUrl(tokenDef);
        const tokenW =
          tokenDef.size === "small" ? CARD_SHORT * 0.4 : CARD_SHORT * 0.6;
        const tokenH =
          tokenDef.size === "small" ? CARD_LONG * 0.4 : CARD_LONG * 0.6;
        return (
          <group
            key={`avatar-attached-token-${uniqueKey}`}
            position={[
              offsetX,
              BASE_CARD_ELEVATION + CARD_THICK * 0.1,
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

      // Render artifacts - carryable artifacts render ON TOP of their parent card
      if (isArtifact && p.card.slug) {
        const artifactW = CARD_SHORT * 0.6;
        const artifactH = CARD_LONG * 0.6;
        const artifactHoverKey = `artifact:avatar:${seat}:${uniqueKey}`;
        const artifactRenderOrder = avatarRenderOrder + 10 + attachIdx;
        return (
          <group
            key={`avatar-attached-${uniqueKey}`}
            position={[
              offsetX,
              BASE_CARD_ELEVATION + CARD_THICK * 0.15,
              offsetZ,
            ]}
          >
            <CardPlane
              slug={p.card.slug}
              width={artifactW}
              height={artifactH}
              rotationZ={rotZ}
              elevation={0.002}
              renderOrder={artifactRenderOrder}
              depthWrite
              onPointerOver={(e) => {
                e.stopPropagation();
                beginHoverPreview(p.card, artifactHoverKey);
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                clearHoverPreviewDebounced(artifactHoverKey);
              }}
            />
          </group>
        );
      }

      return null;
    });
  }
}
