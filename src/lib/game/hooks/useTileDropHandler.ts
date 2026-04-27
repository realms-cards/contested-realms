import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import {
  clampOffset,
  getPermanentOwnerBaseZ,
  STACK_SPACING,
  TILE_OFFSET_LIMIT_X,
  TILE_OFFSET_LIMIT_Z,
} from "@/lib/game/boardShared";
import { TILE_SIZE } from "@/lib/game/constants";
import type { AttachmentPileInfo } from "@/lib/game/hooks/useAttachmentDialog";
import { triggerAttackChoiceIfApplicable } from "@/lib/game/hooks/useAttackChoiceTrigger";
import type { BoardDragControls } from "@/lib/game/hooks/useBoardDragControls";
import { isAuraSubtype } from "@/lib/game/store/atlanteanFateState";
import type {
  PlayerKey,
  CardRef,
  GameState,
  BoardState,
  Permanents,
} from "@/lib/game/store/types";
import { TOKEN_BY_NAME, isMinionToken } from "@/lib/game/tokens";

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
  setDragFaceDown: GameState["setDragFaceDown"];
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
  // Site dragging
  draggingSite: GameState["draggingSite"];
  dropDraggingSite: GameState["dropDraggingSite"];
  // Private hand cast targeting (Morgana/Omphalos)
  pendingPrivateHandCast: GameState["pendingPrivateHandCast"];
  completePendingPrivateHandCast: GameState["completePendingPrivateHandCast"];
  // Cast placement from context menu
  castPlacementMode: GameState["castPlacementMode"];
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
  setDragFaceDown,
  setDragFromPile,
  dragFromHand,
  dragFromPile,
  selectedCard,
  mouseInHandZone: _mouseInHandZone,
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
  draggingSite,
  dropDraggingSite,
  pendingPrivateHandCast,
  completePendingPrivateHandCast,
  castPlacementMode,
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

  // Track if 'F' key is held for face-down play
  const fKeyHeldRef = useRef(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        fKeyHeldRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") {
        fKeyHeldRef.current = false;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return useCallback(
    ({ event, tileX, tileY, tileWorldPosition }: HandleTilePointerUpArgs) => {
      const e = event;
      // Accept left-click (0) or right-click (2) - right-click triggers face-down play
      const isRightClick = e.button === 2;
      if (e.button !== 0 && e.button !== 2) return;
      if (isSpectator) return;
      e.stopPropagation();
      // Prevent context menu for right-click drops
      if (isRightClick && e.nativeEvent) {
        e.nativeEvent.preventDefault();
      }

      // Handle site drag drop
      if (draggingSite) {
        dropDraggingSite(tileX, tileY);
        return;
      }

      // Handle pending private hand cast (Morgana/Omphalos targeting)
      if (pendingPrivateHandCast) {
        completePendingPrivateHandCast({ x: tileX, y: tileY });
        return;
      }

      const dropKey = `${tileX},${tileY}`;
      const pos = tileWorldPosition;
      const hasAvatarOnDropTile = Object.values(avatars).some((avatar) => {
        const posArr = avatar.pos;
        return posArr && posArr[0] === tileX && posArr[1] === tileY;
      });

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
        // Calculate offset relative to owner's base position for precise drops
        // Rendering uses: position = [offX, y, zBase + offZ]
        // So to land at world.z, we need: offZ = world.z - pos[2] - zBase
        const draggedItem = permanents[dragging.from]?.[dragging.index];
        const owner = draggedItem?.owner ?? 1;
        const zBase = getPermanentOwnerBaseZ(owner, hasAvatarOnDropTile);
        const offX = clampOffset(world.x - pos[0], TILE_OFFSET_LIMIT_X);
        const offZ = clampOffset(world.z - pos[2] - zBase, TILE_OFFSET_LIMIT_Z);
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
        const toItems = permanents[dropKey] || [];
        const newIndex = toItems.length;
        // Calculate offset relative to owner's base position for precise drops
        // Rendering uses: position = [offX, y, zBase + offZ]
        // So to land at world.z, we need: offZ = world.z - pos[2] - zBase
        const draggedItem = permanents[dragging.from]?.[dragging.index];
        const owner = draggedItem?.owner ?? 1;
        const zBase = getPermanentOwnerBaseZ(owner, hasAvatarOnDropTile);
        const offX = clampOffset(world.x - pos[0], TILE_OFFSET_LIMIT_X);
        const offZ = clampOffset(world.z - pos[2] - zBase, TILE_OFFSET_LIMIT_Z);
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
              },
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

      // Handle cast placement from context menu (no active drag, just selectedCard + castPlacementMode)
      if (castPlacementMode && selectedCard && !dragFromHand) {
        playSelectedTo(tileX, tileY);
        try {
          playCardPlay();
        } catch {}
        const type = (selectedCard.card?.type || "").toLowerCase();
        const isToken = type.includes("token");
        const tokenDef = isToken
          ? TOKEN_BY_NAME[(selectedCard.card?.name || "").toLowerCase()]
          : undefined;
        const tokenSiteReplace = !!tokenDef?.siteReplacement;
        if (!type.includes("site") && !tokenSiteReplace) {
          // Calculate offset so card centers on click position
          const wx = e.point.x;
          const wz = e.point.z;
          const pos = tileWorldPosition;
          const dropOwner: 1 | 2 =
            selectedCard.who === "p1"
              ? 1
              : selectedCard.who === "p2"
                ? 2
                : currentPlayer;
          const dropZBase = getPermanentOwnerBaseZ(
            dropOwner,
            hasAvatarOnDropTile,
          );
          const offX = clampOffset(wx - pos[0], TILE_OFFSET_LIMIT_X);
          const offZ = clampOffset(
            wz - pos[2] - dropZBase,
            TILE_OFFSET_LIMIT_Z,
          );
          const newIndex = (permanents[dropKey] || []).length;
          setPermanentOffset(dropKey, newIndex, [offX, offZ]);
        }
        lastDropAt.current = Date.now();
        return;
      }

      if (dragFromHand) {
        // Note: We no longer cancel drops based on mouseInHandZone here.
        // If the user clicked on a tile, they want to place the card there.
        // Hand return is handled by dropping outside the board (onPointerMissed).
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
          // Check if there's an avatar on this tile
          const hasAvatarOnTile = Object.values(avatars).some((avatar) => {
            const posArr = avatar.pos;
            return posArr && posArr[0] === tileX && posArr[1] === tileY;
          });
          if (isAttachable && (toItems.length > 0 || hasAvatarOnTile)) {
            const spacing = STACK_SPACING;
            let closestPermanent: {
              at: string;
              index: number;
              card: CardRef;
            } | null = null;
            let closestDistance = Infinity;
            // Check for avatar on this tile first - always a valid target
            const avatarEntry = Object.entries(avatars).find(([, avatar]) => {
              const posArr = avatar.pos;
              return posArr && posArr[0] === tileX && posArr[1] === tileY;
            });

            // Build list of all potential targets (minions + avatar)
            const potentialTargets: Array<{
              at: string;
              index: number;
              card: CardRef;
              x: number;
              z: number;
            }> = [];

            // Add minions as potential targets (any minion - friendly or enemy)
            // Also allow minion tokens (Skeleton, Frog, Foot Soldier, Bruin, Tawny)
            toItems.forEach((perm, realIdx) => {
              const itemType = (perm.card.type || "").toLowerCase();
              const itemName = perm.card.name || "";
              const isToken = itemType.includes("token");
              // Block artifacts, sites, and non-minion tokens (Lance, Ward, Disabled, etc.)
              if (
                itemType.includes("artifact") ||
                itemType.includes("site") ||
                (isToken && !isMinionToken(itemName))
              ) {
                return;
              }
              const startX = -((Math.max(toItems.length, 1) - 1) * spacing) / 2;
              const owner = perm.owner;
              const zBase = getPermanentOwnerBaseZ(owner, hasAvatarOnTile);
              const xPos = startX + realIdx * spacing;
              const permX = pos[0] + xPos + (perm.offset?.[0] ?? 0);
              const permZ = pos[2] + zBase + (perm.offset?.[1] ?? 0);
              potentialTargets.push({
                at: dropKey,
                index: realIdx,
                card: perm.card,
                x: permX,
                z: permZ,
              });
            });

            // Add avatar as a potential target if present on tile (any avatar - friendly or enemy)
            if (avatarEntry) {
              const [avatarKey, avatar] = avatarEntry;
              const avatarOffset = avatar.offset || [0, 0];
              const avatarX = pos[0] + avatarOffset[0];
              const avatarZ = pos[2] + avatarOffset[1];
              potentialTargets.push({
                at: dropKey,
                index: -1,
                card: avatar.card || {
                  cardId: 0,
                  variantId: null,
                  name: `${avatarKey.toUpperCase()} Avatar`,
                  type: "Avatar",
                  slug: null,
                },
                x: avatarX,
                z: avatarZ,
              });
            }

            // Find closest target from all potential targets
            for (const target of potentialTargets) {
              const distance = Math.sqrt(
                Math.pow(wx - target.x, 2) + Math.pow(wz - target.z, 2),
              );
              if (distance < closestDistance) {
                closestDistance = distance;
                closestPermanent = {
                  at: target.at,
                  index: target.index,
                  card: target.card,
                };
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

        // Calculate offset relative to owner's base position for precise drops
        // Rendering uses: position = [offX, y, zBase + offZ]
        // So to land at wz, we need: offZ = wz - pos[2] - zBase
        const toItemsAfter = permanents[dropKey] || [];
        const newIndex = toItemsAfter.length;
        // Determine owner from drag source - tokens use dragFromPile.who, hand cards use actorKey
        const dropOwner: 1 | 2 = dragFromPile?.who
          ? dragFromPile.who === "p1"
            ? 1
            : 2
          : actorKey === "p1"
            ? 1
            : actorKey === "p2"
              ? 2
              : currentPlayer;
        const dropZBase = getPermanentOwnerBaseZ(
          dropOwner,
          hasAvatarOnDropTile,
        );
        const offX = clampOffset(wx - pos[0], TILE_OFFSET_LIMIT_X);
        const offZ = clampOffset(wz - pos[2] - dropZBase, TILE_OFFSET_LIMIT_Z);

        if (dragFromPile?.card) {
          const type = (dragFromPile.card.type || "").toLowerCase();
          // If F key is held or right-click release, play the card face-down (except sites)
          if ((fKeyHeldRef.current || isRightClick) && !type.includes("site")) {
            setDragFaceDown(true);
          }
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
          // If F key is held or right-click release, play the card face-down
          if (fKeyHeldRef.current || isRightClick) {
            setDragFaceDown(true);
          }

          // Check if this is a 2x2 Aura - snap to intersection instead of tile center
          // Border auras (Wall of Ice, etc.) are excluded and placed normally
          const cardId = selectedCard.card?.cardId ?? 0;
          const cardMeta = metaByCardId[cardId];
          // Type can be on card directly OR in metaByCardId
          const cardType = (
            selectedCard.card?.type ||
            cardMeta?.type ||
            ""
          ).toLowerCase();
          const cardName = selectedCard.card?.name || "";
          // Check if it's an aura type and not in the exclusion list
          const isAura =
            cardType.includes("aura") && isAuraSubtype("aura", cardName); // Pass "aura" to check exclusion list only

          console.log("[useTileDropHandler] Aura check:", {
            cardName,
            cardType,
            cardTypeFromCard: selectedCard.card?.type,
            cardTypeFromMeta: cardMeta?.type,
            isAura,
            wx,
            wz,
            tileX,
            tileY,
          });

          if (isAura) {
            // 2x2 Auras (e.g. Atlantean Fate) are cast at the intersection of
            // four squares, NOT atop a single tile. Snap to the nearest valid
            // intersection so the resolver and overlay agree on the affected
            // 2x2 area.
            const halfTile = TILE_SIZE / 2;
            // Quadrant of the drop within the tile decides which intersection
            // (offX/offZ are computed relative to tile center above).
            const rightHalf = offX >= 0;
            const topHalf = offZ >= 0;
            // Anchor tile = lower-left tile of the chosen 2x2.
            let anchorX = rightHalf ? tileX : tileX - 1;
            let anchorY = topHalf ? tileY : tileY - 1;
            // Clamp so the full 2x2 fits on the board.
            anchorX = Math.max(0, Math.min(board.size.w - 2, anchorX));
            anchorY = Math.max(0, Math.min(board.size.h - 2, anchorY));

            const auraDropKey = `${anchorX},${anchorY}`;
            const auraNewIndex = (permanents[auraDropKey] || []).length;
            // Positive offsets place the card toward the anchor tile's
            // top-right corner = the snapped intersection.
            const auraOffX = clampOffset(halfTile, TILE_OFFSET_LIMIT_X);
            const auraOffZ = clampOffset(halfTile, TILE_OFFSET_LIMIT_Z);

            playSelectedTo(anchorX, anchorY);
            try {
              playCardPlay();
            } catch {}
            setDragFromHand(false);
            setGhost(null);
            setPermanentOffset(auraDropKey, auraNewIndex, [auraOffX, auraOffZ]);
          } else {
            // Regular non-aura card placement
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
      setDragFaceDown,
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
      isSpectator,
      isAttachableToken,
      isCarryableArtifact,
      draggingSite,
      dropDraggingSite,
      pendingPrivateHandCast,
      completePendingPrivateHandCast,
      castPlacementMode,
    ],
  );
}
