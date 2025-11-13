import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import { Group } from "three";
import { NumberBadge, type Digit } from "@/components/game/manacost";
import { BASE_CARD_ELEVATION, BodyApi } from "@/lib/game/boardShared";
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
  setDragging: Dispatch<
    SetStateAction<{ from: string; index: number } | null>
  >;
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
    delay?: number
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
  counterHandlers: CounterHandlers;
  movementHandlers: MovementHandlers;
  emitBoardPing: (pos: { x: number; z: number }) => void;
  handlePointerMove: (x: number, z: number) => void;
  highlightColors: HighlightColors;
  stackConfig: StackConfig;
  playCardFlip: () => void;
  isPrimaryCardHit: (
    e: ThreeEvent<PointerEvent | MouseEvent>
  ) => boolean;
};

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
  counterHandlers,
  movementHandlers,
  emitBoardPing,
  handlePointerMove,
  highlightColors,
  stackConfig,
  playCardFlip,
  isPrimaryCardHit,
}: PermanentStackProps) {
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
  } = magicContext;
  const { increment, decrement } = counterHandlers;
  const { setOffset, moveToWithOffset, moveToZone } = movementHandlers;

  const { attacker: HIGHLIGHT_ATTACKER, target: HIGHLIGHT_TARGET, defender: HIGHLIGHT_DEFENDER } =
    highlightColors;

  const { spacing, marginZ: baseMarginZ, layerLift, baseElevation, burrowedElevation, rubbleElevation, avatarAvoidZ } =
    stackConfig;

  const key = tileKey;
  const boardHalfW = (boardSize.w * TILE_SIZE) / 2;
  const boardHalfH = (boardSize.h * TILE_SIZE) / 2;

  return (
    <>
      {items.map((p, idx) => {
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
        const ownerAvatar = avatars?.[ownerSeat];
        const avatarOnThisTile =
          ownerAvatar?.pos &&
          ownerAvatar.pos[0] === tileX &&
          ownerAvatar.pos[1] === tileY;
        const isSel =
          selectedPermanent &&
          selectedPermanent.at === key &&
          selectedPermanent.index === idx;
        const isToken = (p.card.type || "").toLowerCase().includes("token");
        const tokenDef = isToken
          ? TOKEN_BY_NAME[(p.card.name || "").toLowerCase()]
          : undefined;
        const tokenSiteReplace = !!tokenDef?.siteReplacement;
        const marginZ =
          baseMarginZ + (avatarOnThisTile ? TILE_SIZE * 0.08 : 0);
        const avatarShiftZ = avatarOnThisTile
          ? owner === 1
            ? -avatarAvoidZ
            : avatarAvoidZ
          : 0;
        const zBase = tokenSiteReplace
          ? 0
          : owner === 1
          ? -TILE_SIZE * 0.5 + marginZ + avatarShiftZ
          : TILE_SIZE * 0.5 - marginZ + avatarShiftZ;
        const rotZ =
          (owner === 1 ? 0 : Math.PI) +
          (tokenSiteReplace ? -Math.PI / 2 : 0) +
          (p.tapped ? Math.PI / 2 : 0) +
          (p.tilt || 0);
        const offX = p.offset?.[0] ?? 0;
        const offZ = p.offset?.[1] ?? 0;

        const permanentId = p.card.cardId;
        const permanentPosition = permanentPositions[permanentId];
        const isBurrowed =
          permanentPosition?.state === "burrowed" ||
          permanentPosition?.state === "submerged";

        const permId = (p.instanceId ?? `perm:${key}:${idx}`) as string;
        const isLastTouched = lastTouchedId === permId;
        const baseY = isBurrowed
          ? burrowedElevation
          : tokenSiteReplace
          ? rubbleElevation
          : baseElevation;
        const isTopCandidate =
          (dragging &&
            dragging.from === key &&
            dragging.index === idx) ||
          isSel ||
          isLastTouched;
        const effectiveStackIndex =
          !isBurrowed && !tokenSiteReplace && isTopCandidate
            ? items.length + 1
            : idx;
        const stackLift =
          !isBurrowed && !tokenSiteReplace
            ? effectiveStackIndex * layerLift
            : 0;
        const yPos = baseY + stackLift;

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
              (d) => d.at === key && d.index === idx
            )
          ) {
            roleGlow = HIGHLIGHT_DEFENDER;
          }
        }
        if (pendingMagic) {
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
          if (
            !roleGlow &&
            !pendingMagic.caster &&
            pendingMagic.status === "choosingCaster" &&
            p.owner === pendingMagic.spell.owner
          ) {
            const nm = p.card?.name || "";
            if (nm && detectSpellcasterSync(nm)) {
              roleGlow = HIGHLIGHT_ATTACKER;
            }
          }
          if (!roleGlow && pendingMagic.status === "choosingTarget") {
            const allowPerm =
              pendingMagic.hints?.allow?.permanent !== false;
            const scope = pendingMagic.hints?.scope || null;
            if (allowPerm && scope === "projectile") {
              const hits = computeProjectileFirstHits();
              const k = key as CellKey;
              const isFirstHit =
                (hits.N &&
                  hits.N.kind === "permanent" &&
                  hits.N.at === k &&
                  hits.N.index === idx) ||
                (hits.E &&
                  hits.E.kind === "permanent" &&
                  hits.E.at === k &&
                  hits.E.index === idx) ||
                (hits.S &&
                  hits.S.kind === "permanent" &&
                  hits.S.at === k &&
                  hits.S.index === idx) ||
                (hits.W &&
                  hits.W.kind === "permanent" &&
                  hits.W.at === k &&
                  hits.W.index === idx);
              if (isFirstHit) {
                roleGlow = HIGHLIGHT_TARGET;
              }
            } else if (allowPerm) {
              const dx = Math.abs(tileX - pendingMagic.tile.x);
              const dy = Math.abs(tileY - pendingMagic.tile.y);
              const man = dx + dy;
              let inScope = true;
              if (scope === "here") inScope = man === 0;
              else if (scope === "adjacent") inScope = man === 1;
              else if (scope === "nearby") inScope = man <= 2;
              if (inScope) roleGlow = HIGHLIGHT_TARGET;
            }
          }
        }

        const showPermanentGlow =
          (renderPermanentGlow && !isLocalDragGhost) || !!roleGlow;
        const isDraggingPermanent =
          dragging && dragging.from === key && dragging.index === idx;

        const bodyType =
          useGhostOnlyBoardDrag || tokenSiteReplace ? "fixed" : "dynamic";
        const gravityScale = useGhostOnlyBoardDrag ? 0 : 1;

        return (
          <RigidBody
            key={`perm-${key}-${idx}`}
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
                  error
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
              userData={{ cardInstance: permId }}
              onPointerDown={(e) => {
                if (!isPrimaryCardHit(e)) {
                  return;
                }
                if (isSpectator) {
                  e.stopPropagation();
                  return;
                }
                if (dragFromHand || dragFromPile) return;
                if (tokenSiteReplace) {
                  e.stopPropagation();
                  selectPermanent(key, idx);
                  setLastTouchedId(permId);
                  clearHoverPreview(hoverKey);
                  return;
                }
                if (pendingMagic) {
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
                      const hints = pendingMagic.hints;
                      const scope = hints?.scope || null;
                      if (scope === "projectile") {
                        const ox = pendingMagic.tile.x;
                        const oy = pendingMagic.tile.y;
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
                          setMagicTargetChoice({
                            kind: "projectile",
                            direction: dir,
                            firstHit: hits[dir] || undefined,
                          });
                        }
                        return;
                      }
                      const allowPerm =
                        hints?.allow?.permanent !== false;
                      if (!allowPerm) return;
                      const dx = Math.abs(tileX - pendingMagic.tile.x);
                      const dy = Math.abs(tileY - pendingMagic.tile.y);
                      const man = dx + dy;
                      if (scope === "here" && man !== 0) return;
                      if (scope === "adjacent" && man !== 1) return;
                      if (scope === "nearby" && man > 2) return;
                      setMagicTargetChoice({
                        kind: "permanent",
                        at: key as CellKey,
                        index: idx,
                      });
                      return;
                    }
                  }
                }
                if (attackTargetChoice) {
                  e.stopPropagation();
                  const enemyOwner =
                    attackTargetChoice.attacker.owner === 1 ? 2 : 1;
                  const onTile =
                    attackTargetChoice.tile.x === tileX &&
                    attackTargetChoice.tile.y === tileY;
                  if (onTile && owner === enemyOwner) {
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
                  if (onTile && owner === myOwner) {
                    e.stopPropagation();
                    const present = (pendingCombat.defenders || []).some(
                      (d) => d.at === key && d.index === idx
                    );
                    if (present) {
                      const next = (pendingCombat.defenders || []).filter(
                        (d) => !(d.at === key && d.index === idx)
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
                const pe = e.nativeEvent as PointerEvent | undefined;
                if (pe && pe.pointerType === "touch") {
                  clearTouchTimers();
                  const cx = e.clientX;
                  const cy = e.clientY;
                  touchPreviewTimerRef.current = window.setTimeout(() => {
                    beginHoverPreview(p.card, hoverKey);
                  }, 180) as unknown as number;
                  touchContextTimerRef.current = window.setTimeout(() => {
                    selectPermanent(key, idx);
                    setLastTouchedId(permId);
                    openContextMenu(
                      { kind: "permanent", at: key, index: idx },
                      { x: cx, y: cy }
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
                    const canDefendNow =
                      !!(
                        pendingCombat && pendingCombat.defenderSeat === actorKey
                      );
                    if (!actorIsActive && !mine) {
                      clearHoverPreview(hoverKey);
                      return;
                    }
                    if (canDefendNow && !actorIsActive && !mine) {
                      clearHoverPreview(hoverKey);
                      return;
                    }
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
                          e.point.z
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
                              false
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
                    const rightX =
                      gridHalfW + TILE_SIZE / 2 - CARD_SHORT / 2;
                    const leftX =
                      -gridHalfW - TILE_SIZE / 2 + CARD_SHORT / 2;
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
                      const tokenType =
                        (p.card?.type || "").toLowerCase();
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
                    permanents[dragging.from]?.[dragging.index]
                      ?.instanceId || null;
                  const localZBase =
                    draggedOwner === 1
                      ? -TILE_SIZE * 0.5 + marginZ
                      : TILE_SIZE * 0.5 - marginZ;
                  if (dragging.from === dropKey) {
                    const baseX =
                      tileWorldX +
                      (-(Math.max((permanents[dropKey] || []).length, 1) - 1) *
                        spacing) /
                        2 +
                      dragging.index * spacing;
                    const baseZ = tileWorldZ + localZBase;
                    const newOffset: [number, number] = [
                      wx - baseX,
                      wz - baseZ,
                    ];
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
                    const startX =
                      -((Math.max(newIndex + 1, 1) - 1) * spacing) / 2;
                    const baseX = tileWorldX + (startX + newIndex * spacing);
                    const baseZ = tileWorldZ + localZBase;
                    const newOffset: [number, number] = [
                      wx - baseX,
                      wz - baseZ,
                    ];
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
                  renderOrder={1000}
                  pulse={!!roleGlow}
                  pulseSpeed={1.6}
                  pulseMin={0.35}
                  pulseMax={0.95}
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
                  if (dragging && dragging.from === key && dragging.index === idx)
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
                    { x: e.clientX, y: e.clientY }
                  );
                }}
              >
                {isToken ? (
                  <CardPlane
                    slug=""
                    textureUrl={tokenDef ? tokenTextureUrl(tokenDef) : undefined}
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
                    elevation={0.005}
                    depthWrite={!tokenSiteReplace}
                    renderOrder={tokenSiteReplace ? -5 : 100}
                  />
                ) : (
                  <CardPlane
                    slug={p.card?.slug || ""}
                    width={CARD_SHORT}
                    height={CARD_LONG}
                    rotationZ={rotZ}
                    renderOrder={
                      isBurrowed
                        ? -10
                        : isDraggingPermanent || isSel || isLastTouched
                        ? 1000
                        : 100
                    }
                    depthWrite={!isBurrowed}
                    depthTest={true}
                    textureUrl={
                      !p.card?.slug ? "/api/assets/air.png" : undefined
                    }
                  />
                )}
                {(() => {
                  const count = Math.max(0, Number(p.counters || 0));
                  if (count <= 0) return null;
                  const digits = Math.floor(count)
                    .toString()
                    .split("")
                    .map((d) => Number(d) as Digit);
                  const leftEdgeX = -CARD_SHORT * 0.5;
                  const centerZ = 0;
                  return (
                    <Html
                      position={[leftEdgeX, 0.004, centerZ]}
                      transform
                      rotation-x={-Math.PI / 2}
                      rotation-z={rotZ}
                      zIndexRange={[0, 0]}
                    >
                      <div className="pointer-events-auto select-none">
                        <div className="relative inline-flex group">
                          <div className="flex items-center gap-0.5">
                            {digits.map((d, i) => (
                              <NumberBadge
                                key={i}
                                value={d}
                                size={8}
                                strokeWidth={2}
                                backgroundOpacity={0.5}
                                textAsSvg
                              />
                            ))}
                          </div>
                          <div className="absolute inset-0 flex flex-col opacity-80">
                            <button
                              type="button"
                              aria-label="Increment counter"
                              title="Increment counter"
                              onClick={(evt) => {
                                evt.stopPropagation();
                                increment(key, idx);
                              }}
                              className="flex-1 transition-opacity rounded-t-sm cursor-pointer opacity-0 group-hover:opacity-100 bg-transparent group-hover:bg-emerald-500/20 hover:bg-emerald-500/30"
                            >
                              <span className="sr-only">+</span>
                            </button>
                            <button
                              type="button"
                              aria-label="Decrement counter"
                              title="Decrement counter"
                              onClick={(evt) => {
                                evt.stopPropagation();
                                decrement(key, idx);
                              }}
                              className="flex-1 transition-opacity rounded-b-sm cursor-pointer opacity-0 group-hover:opacity-100 bg-transparent group-hover:bg-rose-500/20 hover:bg-rose-500/30"
                            >
                              <span className="sr-only">-</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </Html>
                  );
                })()}
                {(() => {
                  const attachedTokens = items.filter(
                    (item) =>
                      item.attachedTo &&
                      item.attachedTo.at === key &&
                      item.attachedTo.index === idx
                  );
                  return attachedTokens.map((token, attachIdx) => {
                    const tokenName = (token.card.name || "").toLowerCase();
                    const attachTokenDef = TOKEN_BY_NAME[tokenName];
                    const isArtifact = (token.card.type || "")
                      .toLowerCase()
                      .includes("artifact");
                    const offsetMultiplier = 0.3;
                    const attachOffsetX =
                      CARD_SHORT *
                      offsetMultiplier *
                      (attachIdx - (attachedTokens.length - 1) / 2);
                    const offsetZ = CARD_LONG * 0.4;

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
                    if (isArtifact && token.card.slug) {
                      const artifactW = CARD_SHORT * 0.6;
                      const artifactH = CARD_LONG * 0.6;
                      const artifactHoverKey = `artifact:${key}:${idx}:${attachIdx}`;
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
                            BASE_CARD_ELEVATION - CARD_THICK * 0.05,
                            offsetZ,
                          ]}
                        >
                          <CardPlane
                            slug={token.card.slug}
                            width={artifactW}
                            height={artifactH}
                            rotationZ={rotZ}
                            elevation={-0.001}
                            renderOrder={parentRenderOrder - 10 - attachIdx}
                            depthWrite={false}
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
