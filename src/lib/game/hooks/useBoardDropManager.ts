import { useEffect, type MutableRefObject } from "react";
import {
  clampOffset,
  STACK_MARGIN_Z,
  STACK_SPACING,
  TILE_OFFSET_LIMIT_X,
  TILE_OFFSET_LIMIT_Z,
} from "@/lib/game/boardShared";
import type { BoardDragControls } from "@/lib/game/hooks/useBoardDragControls";
import {
  CARD_LONG,
  CARD_SHORT,
  TILE_SIZE,
} from "@/lib/game/constants";
import type {
  BoardState,
  CellKey,
  GameState,
  Permanents,
  PlayerKey,
} from "@/lib/game/store/types";

type UseBoardDropManagerOptions = {
  board: BoardState;
  boardOffset: { x: number; y: number };
  dragAvatar: PlayerKey | null;
  dragFromHand: boolean;
  dragFromPile: GameState["dragFromPile"];
  isSpectator: boolean;
  permanents: Permanents;
  avatars: GameState["avatars"];
  interactionGuides: boolean;
  metaByCardId: GameState["metaByCardId"];
  fetchCardMeta: GameState["fetchCardMeta"];
  moveSelectedPermanentToWithOffset: GameState["moveSelectedPermanentToWithOffset"];
  setPermanentOffset: GameState["setPermanentOffset"];
  movePermanentToZone: GameState["movePermanentToZone"];
  setDragFromHand: GameState["setDragFromHand"];
  playCardFlip: () => void;
  actorKey: PlayerKey | null;
  currentPlayer: 1 | 2;
  setAttackChoice: GameState["setAttackChoice"];
  dragContext: BoardDragControls;
  useGhostOnlyBoardDrag: boolean;
  lastPointerRef: MutableRefObject<{ x: number; z: number } | null>;
};

export function useBoardDropManager({
  board,
  boardOffset,
  dragAvatar,
  dragFromHand,
  dragFromPile,
  isSpectator,
  permanents,
  avatars,
  interactionGuides,
  metaByCardId,
  fetchCardMeta,
  moveSelectedPermanentToWithOffset,
  setPermanentOffset,
  movePermanentToZone,
  setDragFromHand,
  playCardFlip,
  actorKey,
  currentPlayer,
  setAttackChoice,
  dragContext,
  useGhostOnlyBoardDrag,
  lastPointerRef,
}: UseBoardDropManagerOptions) {
  const {
    draggingRef,
    lastDropAt,
    setDragging,
    setGhost,
    dragTarget,
    draggedBody,
    snapBodyTo,
  } = dragContext;
  const { x: offsetX, y: offsetY } = boardOffset;

  useEffect(() => {
    const onGlobalPointerUp = () => {
      if (Date.now() - lastDropAt.current < 32) return;
      if (dragAvatar) return;
      if (dragFromHand || dragFromPile) return;
      if (isSpectator) return;
      const d = draggingRef.current;
      if (!d) return;
      const p = lastPointerRef.current;
      if (!p) return;
      const wx = p.x;
      const wz = p.z;
      try {
        const gridHalfW = (board.size.w * TILE_SIZE) / 2;
        const gridHalfH = (board.size.h * TILE_SIZE) / 2;
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
        if (overP1Atlas || overP2Atlas || overP1Spell || overP2Spell) {
          setDragging(null);
          setDragFromHand(false);
          setGhost(null);
          dragTarget.current = null;
          lastDropAt.current = Date.now();
          draggedBody.current = null;
          return;
        }
        if (overP1GY || overP2GY) {
          const draggedCard = permanents[d.from]?.[d.index]?.card;
          const tokenType = (draggedCard?.type || "").toLowerCase();
          const goTo = tokenType.includes("token") ? "banished" : "graveyard";
          try {
            movePermanentToZone(d.from, d.index, goTo);
            try {
              playCardFlip();
            } catch {}
          } finally {
            setDragging(null);
            setDragFromHand(false);
            setGhost(null);
            dragTarget.current = null;
            lastDropAt.current = Date.now();
            draggedBody.current = null;
          }
          return;
        }
      } catch {}

      const [fromX, fromY] = d.from.split(",").map(Number);
      const fromTileX = offsetX + fromX * TILE_SIZE;
      const fromTileZ = offsetY + fromY * TILE_SIZE;
      const distFromSource = Math.sqrt(
        Math.pow(wx - fromTileX, 2) + Math.pow(wz - fromTileZ, 2)
      );

      let tx: number;
      let ty: number;
      if (distFromSource < TILE_SIZE * 0.6) {
        tx = fromX;
        ty = fromY;
      } else {
        tx = Math.round((wx - offsetX) / TILE_SIZE);
        ty = Math.round((wz - offsetY) / TILE_SIZE);
        tx = Math.max(0, Math.min(board.size.w - 1, tx));
        ty = Math.max(0, Math.min(board.size.h - 1, ty));
      }
      const dropKey = `${tx},${ty}`;
      const tileX = offsetX + tx * TILE_SIZE;
      const tileZ = offsetY + ty * TILE_SIZE;
      const marginZ = STACK_MARGIN_Z;
      const spacing = STACK_SPACING;
      const draggedOwner =
        permanents[d.from]?.[d.index]?.owner ?? 1;
      const draggedInstId =
        permanents[d.from]?.[d.index]?.instanceId || null;
      const zBase =
        draggedOwner === 1
          ? -TILE_SIZE * 0.5 + marginZ
          : TILE_SIZE * 0.5 - marginZ;
      if (d.from === dropKey) {
        const baseX =
          tileX +
          (-((Math.max((permanents[dropKey] || []).length, 1) - 1) * spacing) /
            2 +
            d.index * spacing);
        const baseZ = tileZ + zBase;
        const offX = clampOffset(wx - baseX, TILE_OFFSET_LIMIT_X);
        const offZ = clampOffset(wz - baseZ, TILE_OFFSET_LIMIT_Z);
        dragTarget.current = null;
        draggedBody.current = null;
        requestAnimationFrame(() => {
          setPermanentOffset(dropKey, d.index, [offX, offZ]);
        });
        if (!useGhostOnlyBoardDrag) {
          const targetId = (draggedInstId ||
            `perm:${dropKey}:${d.index}`) as string;
          snapBodyTo(targetId, wx, wz);
        }
      } else {
        const toItems = permanents[dropKey] || [];
        const newIndex = toItems.length;
        const startX = -((Math.max(newIndex + 1, 1) - 1) * spacing) / 2;
        const baseX = tileX + (startX + newIndex * spacing);
        const baseZ = tileZ + zBase;
        const offX = clampOffset(wx - baseX, TILE_OFFSET_LIMIT_X);
        const offZ = clampOffset(wz - baseZ, TILE_OFFSET_LIMIT_Z);
        dragTarget.current = null;
        draggedBody.current = null;
        requestAnimationFrame(() => {
          moveSelectedPermanentToWithOffset(tx, ty, [offX, offZ]);
        });
        if (!useGhostOnlyBoardDrag) {
          const targetId = (draggedInstId ||
            `perm:${dropKey}:${newIndex}`) as string;
          snapBodyTo(targetId, wx, wz);
        }

        if (interactionGuides) {
          try {
            const moved = permanents[d.from]?.[d.index];
            const cardId = Number(moved?.card?.cardId);
            if (Number.isFinite(cardId) && cardId > 0) {
              if (!metaByCardId[cardId]) void fetchCardMeta([cardId]);
            }
            let hasBasePower = false;
            if (Number.isFinite(cardId) && cardId > 0) {
              const meta = metaByCardId[cardId];
              if (meta) {
                const atk = Number(meta.attack);
                hasBasePower = Number.isFinite(atk) && atk !== 0;
              } else {
                hasBasePower = true;
              }
            }
            if (hasBasePower) {
              const enemyOwner: 1 | 2 = moved?.owner === 1 ? 2 : 1;
              let hasTarget = false;
              const list = permanents[dropKey] || [];
              hasTarget = list.some((p) => p && p.owner === enemyOwner);
              if (!hasTarget) {
                const enemySeat = enemyOwner === 1 ? "p1" : "p2";
                const av = avatars?.[enemySeat];
                if (av && Array.isArray(av.pos) && av.pos.length === 2) {
                  hasTarget = av.pos[0] === tx && av.pos[1] === ty;
                }
              }
              if (!hasTarget) {
                const site = board.sites[dropKey];
                if (site && site.owner === enemyOwner) hasTarget = true;
              }
              const mine =
                (actorKey === "p1" && draggedOwner === 1) ||
                (actorKey === "p2" && draggedOwner === 2);
              const actorIsActive =
                (actorKey === "p1" && currentPlayer === 1) ||
                (actorKey === "p2" && currentPlayer === 2);
              if (hasTarget && mine && actorIsActive) {
                setAttackChoice({
                  tile: { x: tx, y: ty },
                  attacker: {
                    at: dropKey,
                    index: newIndex,
                    instanceId: draggedInstId ?? null,
                    owner: draggedOwner as 1 | 2,
                  },
                  attackerName: moved?.card?.name || null,
                });
              }
            }
          } catch {}
        }
      }
      setDragging(null);
      setDragFromHand(false);
      setGhost(null);
      dragTarget.current = null;
      lastDropAt.current = Date.now();
      draggedBody.current = null;
    };
    window.addEventListener("pointerup", onGlobalPointerUp);
    return () => window.removeEventListener("pointerup", onGlobalPointerUp);
  }, [
    actorKey,
    avatars,
    board,
    currentPlayer,
    dragAvatar,
    dragContext,
    dragFromHand,
    dragFromPile,
    fetchCardMeta,
    interactionGuides,
    isSpectator,
    metaByCardId,
    movePermanentToZone,
    moveSelectedPermanentToWithOffset,
    permanents,
    playCardFlip,
    setAttackChoice,
    setDragFromHand,
    setPermanentOffset,
    setDragging,
    setGhost,
    useGhostOnlyBoardDrag,
    boardOffset.x,
    boardOffset.y,
  ]);
}
