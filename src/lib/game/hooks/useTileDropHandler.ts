import type { ThreeEvent } from "@react-three/fiber";
import { useCallback } from "react";
import {
  clampOffset,
  STACK_MARGIN_Z,
  STACK_SPACING,
  TILE_OFFSET_LIMIT_X,
  TILE_OFFSET_LIMIT_Z,
} from "@/lib/game/boardShared";
import { TILE_SIZE } from "@/lib/game/constants";
import type { AttachmentPileInfo } from "@/lib/game/hooks/useAttachmentDialog";
import { triggerAttackChoiceIfApplicable } from "@/lib/game/hooks/useAttackChoiceTrigger";
import type { BoardDragControls } from "@/lib/game/hooks/useBoardDragControls";
import type {
  PlayerKey,
  CardRef,
  GameState,
  BoardState,
  Permanents,
} from "@/lib/game/store/types";
import { TOKEN_BY_NAME } from "@/lib/game/tokens";

type LastCrossMove = {
  fromKey: string;
  toKey: string;
  destIndex: number;
  prevOffset: [number, number] | null;
  instanceId?: string | null;
} | null;

type TileDropHandlerOptions = {
  board: BoardState;
  permanents: Permanents;
  avatars: GameState["avatars"];
  interactionGuides: GameState["interactionGuides"];
  metaByCardId: GameState["metaByCardId"];
  fetchCardMeta: GameState["fetchCardMeta"];
  moveAvatarToWithOffset: GameState["moveAvatarToWithOffset"];
  moveSelectedPermanentToWithOffset: GameState["moveSelectedPermanentToWithOffset"];
  setPermanentOffset: GameState["setPermanentOffset"];
  playFromPileTo: GameState["playFromPileTo"];
  playCardPlay: () => void;
  playSelectedTo: GameState["playSelectedTo"];
  openAttachmentDialog: (args: {
    token: CardRef;
    targetPermanent: { at: string; index: number; card: CardRef };
    dropCoords: { x: number; y: number };
    fromPile: boolean;
    pileInfo?: AttachmentPileInfo | null;
  }) => void;
  setDragFromHand: GameState["setDragFromHand"];
  setDragFromPile: GameState["setDragFromPile"];
  dragFromHand: boolean;
  dragFromPile: GameState["dragFromPile"];
  selectedCard: GameState["selectedCard"];
  mouseInHandZone: boolean;
  isSpectator: boolean;
  actorKey: PlayerKey | null;
  currentPlayer: 1 | 2;
  setAttackChoice: GameState["setAttackChoice"];
  setLastCrossMove: (value: LastCrossMove | null) => void;
  isAttachableToken: (name: string) => boolean;
  isCarryableArtifact: (card: CardRef) => boolean;
  dragContext: BoardDragControls;
  useGhostOnlyBoardDrag: boolean;
  selectAvatar: GameState["selectAvatar"];
  selectPermanent: GameState["selectPermanent"];
};

type HandleTilePointerUpArgs = {
  event: ThreeEvent<PointerEvent>;
  tileX: number;
  tileY: number;
  tileWorldPosition: [number, number, number];
};

export function useTileDropHandler({
  board,
  permanents,
  avatars,
  interactionGuides,
  metaByCardId,
  fetchCardMeta,
  moveAvatarToWithOffset,
  moveSelectedPermanentToWithOffset,
  setPermanentOffset,
  playFromPileTo,
  playCardPlay,
  playSelectedTo,
  openAttachmentDialog,
  setDragFromHand,
  setDragFromPile,
  dragFromHand,
  dragFromPile,
  selectedCard,
  mouseInHandZone,
  isSpectator,
  actorKey,
  currentPlayer,
  setAttackChoice,
  setLastCrossMove,
  isAttachableToken,
  isCarryableArtifact,
  dragContext,
  useGhostOnlyBoardDrag,
  selectAvatar,
  selectPermanent,
}: TileDropHandlerOptions) {
  const {
    dragAvatar,
    setDragAvatar,
    dragging,
    setDragging,
    setGhost,
    dragTarget,
    draggedBody,
    snapBodyTo,
    avatarDragStartRef,
    dragStartRef,
    lastDropAt,
  } = dragContext;

  return useCallback(
    ({ event, tileX, tileY, tileWorldPosition }: HandleTilePointerUpArgs) => {
      const e = event;
      if (e.button !== 0) return;
      if (isSpectator) return;
      e.stopPropagation();

      const dropKey = `${tileX},${tileY}`;
      const pos = tileWorldPosition;

      if (dragAvatar) {
        const wx = e.point.x;
        const wz = e.point.z;
        const baseX = pos[0];
        const baseZ = pos[2];
        const offX = clampOffset(wx - baseX, TILE_OFFSET_LIMIT_X);
        const offZ = clampOffset(wz - baseZ, TILE_OFFSET_LIMIT_Z);
        const apiAtDrop = draggedBody.current;
        dragTarget.current = null;
        draggedBody.current = null;

        // Check if avatar moved cross-tile for attack triggering
        const avatarPos = avatars[dragAvatar]?.pos;
        const wasCrossTileMove =
          avatarPos && (avatarPos[0] !== tileX || avatarPos[1] !== tileY);

        requestAnimationFrame(() => {
          moveAvatarToWithOffset(dragAvatar, tileX, tileY, [offX, offZ]);
        });
        if (!useGhostOnlyBoardDrag) {
          snapBodyTo(`avatar:${dragAvatar}`, wx, wz);
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
        selectAvatar(dragAvatar);
        lastDropAt.current = Date.now();

        // Trigger attack choice for avatar cross-tile moves when guides are on
        if (wasCrossTileMove && interactionGuides) {
          const owner: 1 | 2 = dragAvatar === "p1" ? 1 : 2;
          const enemyOwner: 1 | 2 = owner === 1 ? 2 : 1;
          const enemySeat = enemyOwner === 1 ? "p1" : "p2";

          // Check for valid targets at drop location
          let hasTarget = false;

          // Check for enemy permanents
          const permsAtDrop = permanents[dropKey] || [];
          hasTarget = permsAtDrop.some((p) => p && p.owner === enemyOwner);

          // Check for enemy avatar
          if (!hasTarget) {
            const enemyAvatar = avatars[enemySeat];
            if (
              enemyAvatar &&
              Array.isArray(enemyAvatar.pos) &&
              enemyAvatar.pos[0] === tileX &&
              enemyAvatar.pos[1] === tileY
            ) {
              hasTarget = true;
            }
          }

          // Check for enemy site OR any site with enemy units
          // (enemy units already checked above, so this is for attacking the site itself)
          if (!hasTarget) {
            const site = board.sites[dropKey];
            if (site) {
              // Can attack enemy-owned sites
              if (site.owner === enemyOwner) {
                hasTarget = true;
              }
              // Can also attack if there are enemy units on any site (already checked above via permsAtDrop)
            }
          }

          // Check if it's the actor's turn
          const mine =
            (actorKey === "p1" && owner === 1) ||
            (actorKey === "p2" && owner === 2);
          const actorIsActive =
            (actorKey === "p1" && currentPlayer === 1) ||
            (actorKey === "p2" && currentPlayer === 2);

          if (hasTarget && mine && actorIsActive) {
            const avatarCard = avatars[dragAvatar]?.card;
            setAttackChoice({
              tile: { x: tileX, y: tileY },
              attacker: {
                at: dropKey,
                index: -1, // Special index for avatar
                instanceId: null,
                owner,
                isAvatar: true, // Mark as avatar attacker
                avatarSeat: dragAvatar,
              },
              attackerName: avatarCard?.name || "Avatar",
            });
          }
        }
        return;
      }

      const world = e.point;

      const finishDrag = () => {
        setDragging(null);
        setDragFromHand(false);
        setGhost(null);
        dragStartRef.current = null;
        lastDropAt.current = Date.now();
        draggedBody.current = null;
      };

      const handleSameTileMove = () => {
        if (!dragging) return;
        const spacing = STACK_SPACING;
        const marginZ = STACK_MARGIN_Z;
        const items = permanents[dropKey] || [];
        const count = items.length;
        const startX = -((Math.max(count, 1) - 1) * spacing) / 2;
        const idxBase = dragging.index;
        const owner =
          items[idxBase]?.owner ??
          permanents[dragging.from]?.[dragging.index]?.owner ??
          1;
        const zBase =
          owner === 1 ? -TILE_SIZE * 0.5 + marginZ : TILE_SIZE * 0.5 - marginZ;
        const xPos = startX + idxBase * spacing;
        const baseX = pos[0] + xPos;
        const baseZ = pos[2] + zBase;
        const offX = clampOffset(world.x - baseX, TILE_OFFSET_LIMIT_X);
        const offZ = clampOffset(world.z - baseZ, TILE_OFFSET_LIMIT_Z);
        const apiAtDrop = draggedBody.current;
        if (!useGhostOnlyBoardDrag && apiAtDrop) {
          setTimeout(() => {
            try {
              apiAtDrop.setBodyType("dynamic", true);
            } catch {}
          }, 0);
        }
        dragTarget.current = null;
        draggedBody.current = null;
        requestAnimationFrame(() => {
          setPermanentOffset(dropKey, dragging.index, [offX, offZ]);
        });
        if (!useGhostOnlyBoardDrag) {
          snapBodyTo(`perm:${dropKey}:${dragging.index}`, world.x, world.z);
        }
      };

      const handleCrossTileMove = () => {
        if (!dragging) return;
        const spacing = STACK_SPACING;
        const marginZ = STACK_MARGIN_Z;
        const toItems = permanents[dropKey] || [];
        const newIndex = toItems.length;
        const newCount = toItems.length + 1;
        const startX = -((Math.max(newCount, 1) - 1) * spacing) / 2;
        const owner = permanents[dragging.from]?.[dragging.index]?.owner ?? 1;
        const zBase =
          owner === 1 ? -TILE_SIZE * 0.5 + marginZ : TILE_SIZE * 0.5 - marginZ;
        const xPos = startX + newIndex * spacing;
        const baseX = pos[0] + xPos;
        const baseZ = pos[2] + zBase;
        const offX = clampOffset(world.x - baseX, TILE_OFFSET_LIMIT_X);
        const offZ = clampOffset(world.z - baseZ, TILE_OFFSET_LIMIT_Z);
        dragTarget.current = null;
        draggedBody.current = null;
        try {
          const movedPre = permanents[dragging.from]?.[dragging.index];
          const prevOffsetArr =
            movedPre?.offset && Array.isArray(movedPre.offset)
              ? (movedPre.offset as [number, number])
              : null;
          setLastCrossMove({
            fromKey: dragging.from,
            toKey: dropKey,
            destIndex: newIndex,
            prevOffset: prevOffsetArr,
            instanceId: movedPre?.instanceId ?? null,
          });
          try {
            selectPermanent(dragging.from, dragging.index);
          } catch (err) {
            console.error("[useTileDropHandler] Select failed:", err);
          }
          moveSelectedPermanentToWithOffset(tileX, tileY, [offX, offZ]);
          if (!useGhostOnlyBoardDrag) {
            snapBodyTo(`perm:${dropKey}:${newIndex}`, world.x, world.z);
          }
          if (interactionGuides) {
            triggerAttackChoiceIfApplicable(
              {
                permanents,
                avatars,
                board,
                metaByCardId,
                fetchCardMeta,
                actorKey,
                currentPlayer,
                setAttackChoice,
              },
              {
                fromKey: dragging.from,
                fromIndex: dragging.index,
                dropKey,
                tileX,
                tileY,
                newIndex,
              }
            );
          }
        } catch {}
      };

      if (dragging) {
        if (dragging.from === dropKey) {
          handleSameTileMove();
        } else {
          handleCrossTileMove();
        }
        finishDrag();
        return;
      }

      if (dragFromHand) {
        if (mouseInHandZone) {
          setDragFromHand(false);
          setGhost(null);
          lastDropAt.current = Date.now();
          return;
        }
        const wx = e.point.x;
        const wz = e.point.z;
        const toItems = permanents[dropKey] || [];
        const handCard = selectedCard?.card ?? null;
        const pileCard = dragFromPile?.card ?? null;
        const draggedCard: CardRef | null = handCard ?? pileCard ?? null;
        if (draggedCard) {
          const cardType = (draggedCard.type || "").toLowerCase();
          const isToken = cardType.includes("token");
          const tokenName = (draggedCard.name || "").toLowerCase();
          const isAttachable =
            (isToken && isAttachableToken(tokenName)) ||
            isCarryableArtifact(draggedCard);
          if (isAttachable && toItems.length > 0) {
            const spacing = STACK_SPACING;
            const marginZ = STACK_MARGIN_Z;
            let closestPermanent: {
              at: string;
              index: number;
              card: CardRef;
            } | null = null;
            let closestDistance = Infinity;
            toItems.forEach((perm, realIdx) => {
              const itemType = (perm.card.type || "").toLowerCase();
              if (
                itemType.includes("token") ||
                itemType.includes("artifact") ||
                itemType.includes("site")
              ) {
                return;
              }
              const startX = -((Math.max(toItems.length, 1) - 1) * spacing) / 2;
              const owner = perm.owner;
              const zBase =
                owner === 1
                  ? -TILE_SIZE * 0.5 + marginZ
                  : TILE_SIZE * 0.5 - marginZ;
              const xPos = startX + realIdx * spacing;
              const permX = pos[0] + xPos + (perm.offset?.[0] ?? 0);
              const permZ = pos[2] + zBase + (perm.offset?.[1] ?? 0);
              const distance = Math.sqrt(
                Math.pow(wx - permX, 2) + Math.pow(wz - permZ, 2)
              );
              if (distance < closestDistance) {
                closestDistance = distance;
                closestPermanent = {
                  at: dropKey,
                  index: realIdx,
                  card: perm.card,
                };
              }
            });
            if (!closestPermanent || closestDistance >= TILE_SIZE * 0.5) {
              const avatarEntry = Object.entries(avatars).find(([, avatar]) => {
                const posArr = avatar.pos;
                return posArr && posArr[0] === tileX && posArr[1] === tileY;
              });
              if (avatarEntry) {
                const [avatarKey, avatar] = avatarEntry;
                closestPermanent = {
                  at: dropKey,
                  index: -1,
                  card: avatar.card || {
                    cardId: 0,
                    variantId: null,
                    name: `${avatarKey.toUpperCase()} Avatar`,
                    type: "Avatar",
                    slug: null,
                  },
                };
                closestDistance = 0;
              }
            }
            if (closestPermanent && closestDistance < TILE_SIZE * 0.5) {
              const wasFromPile = !!pileCard;
              const pileInfo =
                wasFromPile && dragFromPile
                  ? {
                      who: dragFromPile.who,
                      from: dragFromPile.from,
                      card: pileCard,
                    }
                  : null;
              openAttachmentDialog({
                token: draggedCard,
                targetPermanent: closestPermanent,
                dropCoords: { x: tileX, y: tileY },
                fromPile: wasFromPile,
                pileInfo,
              });
              setDragFromHand(false);
              setGhost(null);
              setDragFromPile(null);
              lastDropAt.current = Date.now();
              return;
            }
          }
        }

        const spacing = STACK_SPACING;
        const marginZ = STACK_MARGIN_Z;
        const toItemsAfter = permanents[dropKey] || [];
        const newIndex = toItemsAfter.length;
        const newCount = toItemsAfter.length + 1;
        const startX = -((Math.max(newCount, 1) - 1) * spacing) / 2;
        const owner = currentPlayer;
        const zBase =
          owner === 1 ? -TILE_SIZE * 0.5 + marginZ : TILE_SIZE * 0.5 - marginZ;
        const xPos = startX + newIndex * spacing;
        const baseX = pos[0] + xPos;
        const baseZ = pos[2] + zBase;
        const offX = wx - baseX;
        const offZ = wz - baseZ;

        if (dragFromPile?.card) {
          const type = (dragFromPile.card.type || "").toLowerCase();
          playFromPileTo(tileX, tileY);
          try {
            playCardPlay();
          } catch {}
          setDragFromPile(null);
          setDragFromHand(false);
          setGhost(null);
          const isToken = type.includes("token");
          const tokenDef = isToken
            ? TOKEN_BY_NAME[(dragFromPile.card.name || "").toLowerCase()]
            : undefined;
          const tokenSiteReplace = !!tokenDef?.siteReplacement;
          if (!type.includes("site") && !tokenSiteReplace) {
            setPermanentOffset(dropKey, newIndex, [offX, offZ]);
          }
        } else if (selectedCard) {
          playSelectedTo(tileX, tileY);
          try {
            playCardPlay();
          } catch {}
          setDragFromHand(false);
          setGhost(null);
          const type = (selectedCard.card?.type || "").toLowerCase();
          const isToken = type.includes("token");
          const tokenDef = isToken
            ? TOKEN_BY_NAME[(selectedCard.card?.name || "").toLowerCase()]
            : undefined;
          const tokenSiteReplace = !!tokenDef?.siteReplacement;
          if (!type.includes("site") && !tokenSiteReplace) {
            setPermanentOffset(dropKey, newIndex, [offX, offZ]);
          }
        }
        lastDropAt.current = Date.now();
      }
    },
    [
      actorKey,
      avatars,
      board,
      currentPlayer,
      dragAvatar,
      dragging,
      dragFromHand,
      dragFromPile,
      dragTarget,
      draggedBody,
      snapBodyTo,
      avatarDragStartRef,
      dragStartRef,
      lastDropAt,
      openAttachmentDialog,
      permanents,
      playCardPlay,
      playFromPileTo,
      playSelectedTo,
      selectedCard,
      selectAvatar,
      selectPermanent,
      setAttackChoice,
      setDragAvatar,
      setDragFromHand,
      setDragFromPile,
      setDragging,
      setGhost,
      setLastCrossMove,
      setPermanentOffset,
      moveAvatarToWithOffset,
      moveSelectedPermanentToWithOffset,
      fetchCardMeta,
      useGhostOnlyBoardDrag,
      interactionGuides,
      metaByCardId,
      mouseInHandZone,
      isSpectator,
      isAttachableToken,
      isCarryableArtifact,
    ]
  );
}
