"use client";

import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Object3D } from "three";
import { type StoreApi, type UseBoundStore } from "zustand";
// (overlay components are no longer used)
import { useGraphicsSettings } from "@/hooks/useGraphicsSettings";
import { cardbackAtlasUrl, cardbackSpellbookUrl } from "@/lib/assets";
import { useSound } from "@/lib/contexts/SoundContext";
import {
  AVATAR_AVOID_Z,
  BASE_CARD_ELEVATION,
  BURROWED_ELEVATION,
  RUBBLE_ELEVATION,
  STACK_LAYER_LIFT,
  STACK_MARGIN_Z,
  STACK_SPACING,
} from "@/lib/game/boardShared";
import { AvatarCard } from "@/lib/game/components/AvatarCard";
import BoardCursorLayer from "@/lib/game/components/BoardCursorLayer";
import { BoardDragGhost } from "@/lib/game/components/BoardDragGhost";
import { BoardEnvironment } from "@/lib/game/components/BoardEnvironment";
import BoardPingLayer from "@/lib/game/components/BoardPingLayer";
import { BoardTile } from "@/lib/game/components/BoardTile";
import { DraggingSiteGhost } from "@/lib/game/components/DraggingSiteGhost";
import { GemToken3D } from "@/lib/game/components/GemToken3D";
import { HandDragGhost } from "@/lib/game/components/HandDragGhost";
import { MagicConnectionLines } from "@/lib/game/components/MagicConnectionLines";
import { RemoteDragOverlays } from "@/lib/game/components/RemoteDragOverlays";
import { BASE_TILE_SIZE, TILE_SIZE, MAT_RATIO } from "@/lib/game/constants";
import { useAttachmentDialog } from "@/lib/game/hooks/useAttachmentDialog";
import { useBoardDragControls } from "@/lib/game/hooks/useBoardDragControls";
import { useBoardDropManager } from "@/lib/game/hooks/useBoardDropManager";
import { useBoardHotkeys } from "@/lib/game/hooks/useBoardHotkeys";
import { useRemoteCursorSystem } from "@/lib/game/hooks/useRemoteCursorSystem";
import { useTileDropHandler } from "@/lib/game/hooks/useTileDropHandler";
import type { CellKey } from "@/lib/game/store";
import {
  useGameStore,
  createInitialBoard,
  type CardRef,
  type GameState,
  type PlayerKey,
} from "@/lib/game/store";
import {
  isMonumentByName,
  isAutomatonByName,
} from "@/lib/game/store/omphalosState";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";
import { preloadCardbackTextures } from "@/lib/game/textures/useCardTexture";
import { generateInteractionRequestId } from "@/lib/net/interactions";

// Feature flag to isolate snap effects while debugging rapier aliasing
const ENABLE_SNAP = true;
// Prefer ghost-only visual during board drags (do not move the real body until drop)
const USE_GHOST_ONLY_BOARD_DRAG = true;
const HIGHLIGHT_ATTACKER = "#22c55e";
const HIGHLIGHT_TARGET = "#ef4444";
const HIGHLIGHT_DEFENDER = "#3b82f6";

const STACK_CONFIG = {
  spacing: STACK_SPACING,
  marginZ: STACK_MARGIN_Z,
  layerLift: STACK_LAYER_LIFT,
  baseElevation: BASE_CARD_ELEVATION,
  burrowedElevation: BURROWED_ELEVATION,
  rubbleElevation: RUBBLE_ELEVATION,
  avatarAvoidZ: AVATAR_AVOID_Z,
} as const;

// Component to preload cardback textures inside R3F context
function CardbackPreloader() {
  const { gl } = useThree();
  const cardbackUrls = useGameStore((s) => s.cardbackUrls);

  useEffect(() => {
    // Collect all custom cardback URLs that need preloading
    const urlsToPreload: string[] = [
      // Always preload default cardbacks (uses CDN when available)
      cardbackSpellbookUrl(),
      cardbackAtlasUrl(),
    ];

    // Add custom cardback URLs for both players
    for (const player of ["p1", "p2"] as const) {
      const urls = cardbackUrls[player];
      if (urls?.spellbook) urlsToPreload.push(urls.spellbook);
      if (urls?.atlas) urlsToPreload.push(urls.atlas);
    }

    // Dedupe and preload
    const uniqueUrls = [...new Set(urlsToPreload)];
    void preloadCardbackTextures(gl, uniqueUrls);
  }, [gl, cardbackUrls]);

  return null; // Invisible component
}

const HIGHLIGHT_COLORS = {
  attacker: HIGHLIGHT_ATTACKER,
  target: HIGHLIGHT_TARGET,
  defender: HIGHLIGHT_DEFENDER,
} as const;

function findCardInstanceNode(object: Object3D | null): Object3D | null {
  let current = object;
  while (current) {
    if (
      current.userData &&
      Object.prototype.hasOwnProperty.call(current.userData, "cardInstance")
    ) {
      return current;
    }
    current = current.parent ?? null;
  }
  return null;
}

function isPrimaryCardHit(e: ThreeEvent<PointerEvent | MouseEvent>): boolean {
  const intersections = e.intersections;
  if (!intersections || intersections.length === 0) {
    return true;
  }
  const primaryObject = intersections[0]?.object ?? null;
  const eventObject = (e.object as Object3D | undefined) ?? null;
  if (!primaryObject || !eventObject) {
    return true;
  }
  if (primaryObject.uuid === eventObject.uuid) {
    return true;
  }

  let cursor: Object3D | null = eventObject.parent ?? null;
  while (cursor) {
    if (cursor.uuid === primaryObject.uuid) {
      return true;
    }
    cursor = cursor.parent ?? null;
  }
  cursor = primaryObject.parent ?? null;
  while (cursor) {
    if (cursor.uuid === eventObject.uuid) {
      return true;
    }
    cursor = cursor.parent ?? null;
  }

  const primaryCard = findCardInstanceNode(primaryObject);
  const eventCard = findCardInstanceNode(eventObject);
  if (primaryCard && eventCard && primaryCard.uuid === eventCard.uuid) {
    return true;
  }

  return false;
}

// Component prop interfaces
interface BoardProps {
  noRaycast?: boolean;
  enableBoardPings?: boolean;
  interactionMode?: "normal" | "spectator";
  storeApi?: UseBoundStore<StoreApi<GameState>>;
}

export default function Board({
  noRaycast = false,
  enableBoardPings = false,
  interactionMode = "normal",
  storeApi,
}: BoardProps = {}) {
  const resolvedStoreApi = (storeApi ?? useGameStore) as UseBoundStore<
    StoreApi<GameState>
  >;
  const useScopedStore = <T,>(selector: (state: GameState) => T): T =>
    resolvedStoreApi(selector);
  const { settings: graphicsSettings } = useGraphicsSettings();
  const isSpectator = interactionMode === "spectator";
  const boardState = useScopedStore((s) => s.board);
  const fallbackBoard = useMemo(() => createInitialBoard(), []);
  const board = boardState ?? fallbackBoard;
  const showGrid = useScopedStore((s) => s.showGridOverlay);
  const showPlaymat = useScopedStore((s) => s.showPlaymat);
  const showPlaymatOverlay = useScopedStore((s) => s.showPlaymatOverlay);
  const playmatUrl = useScopedStore((s) => s.playmatUrl);
  const playmatUrls = useScopedStore((s) => s.playmatUrls);
  const activePlaymatOwner = useScopedStore((s) => s.activePlaymatOwner);
  const setPlaymatUrl = useScopedStore((s) => s.setPlaymatUrl);
  const allowSiteDrag = useScopedStore((s) => s.allowSiteDrag);
  const showOwnershipOverlay = useScopedStore((s) => s.showOwnershipOverlay);
  const cardScale = useScopedStore((s) => s.cardScale);
  const playSelectedTo = useScopedStore((s) => s.playSelectedTo);
  const moveSelectedPermanentToWithOffset = useScopedStore(
    (s) => s.moveSelectedPermanentToWithOffset,
  );
  const setPermanentOffset = useScopedStore((s) => s.setPermanentOffset);
  const movePermanentToZone = useScopedStore((s) => s.movePermanentToZone);
  const moveAvatarToWithOffset = useScopedStore(
    (s) => s.moveAvatarToWithOffset,
  );
  const contextMenu = useScopedStore((s) => s.contextMenu);
  const openContextMenu = useScopedStore((s) => s.openContextMenu);
  const selected = useScopedStore((s) => s.selectedCard);
  const selectedPermanent = useScopedStore((s) => s.selectedPermanent);
  const toggleFaceDown = useScopedStore((s) => s.toggleFaceDown);
  const permanents = useScopedStore((s) => s.permanents);
  const permanentPositions = useScopedStore((s) => s.permanentPositions);
  const draggingSite = useScopedStore((s) => s.draggingSite);
  const setDraggingSite = useScopedStore((s) => s.setDraggingSite);
  const updateDraggingSitePos = useScopedStore((s) => s.updateDraggingSitePos);
  const dropDraggingSite = useScopedStore((s) => s.dropDraggingSite);
  const { playCardPlay, playTurnGong, playCardFlip } = useSound();
  const dragFromHand = useScopedStore((s) => s.dragFromHand);
  const previewCard = useScopedStore((s) => s.previewCard);
  // Hand visibility state to disable glows when hand is shown
  const mouseInHandZone = useScopedStore((s) => s.mouseInHandZone);
  const handHoverCount = useScopedStore((s) => s.handHoverCount);
  const [lastTouchedId, setLastTouchedId] = useState<string | null>(null);
  const isHandVisible = mouseInHandZone || handHoverCount > 0;
  const setDragFromHand = useScopedStore((s) => s.setDragFromHand);
  const setDragFaceDown = useScopedStore((s) => s.setDragFaceDown);
  const setPreviewCard = useScopedStore((s) => s.setPreviewCard);
  const dragFromPile = useScopedStore((s) => s.dragFromPile);
  const setLastPointerWorldPos = useScopedStore(
    (s) => s.setLastPointerWorldPos,
  );
  const setDragFromPile = useScopedStore((s) => s.setDragFromPile);
  const setBoardDragActive = useScopedStore((s) => s.setBoardDragActive);
  const playFromPileTo = useScopedStore((s) => s.playFromPileTo);
  const selectedAvatar = useScopedStore((s) => s.selectedAvatar);
  const selectAvatar = useScopedStore((s) => s.selectAvatar);
  const handlePointerMoveRef = useRef<(x: number, z: number) => void>(() => {});
  const lastAvatarCardsRef = useRef<Record<PlayerKey, CardRef | null>>({
    p1: null,
    p2: null,
  });
  const getRemoteHighlightColor = useScopedStore(
    (s) => s.getRemoteHighlightColor,
  );
  const currentPlayer = useScopedStore((s) => s.currentPlayer);
  const actorKey = useScopedStore((s) => s.actorKey);
  const remoteCursors = useScopedStore((s) => s.remoteCursors);
  const localPlayerId = useScopedStore((s) => s.localPlayerId);
  const avatars = useScopedStore((s) => s.avatars);
  const gemTokens = useScopedStore((s) => s.gemTokens);
  const _duplicateGemToken = useScopedStore((s) => s.duplicateGemToken);
  const _destroyGemToken = useScopedStore((s) => s.destroyGemToken);
  const portalState = useScopedStore((s) => s.portalState);
  const stolenCards = useScopedStore((s) => s.stolenCards);
  const pendingPrivateHandCast = useScopedStore(
    (s) => s.pendingPrivateHandCast,
  );
  const completePendingPrivateHandCast = useScopedStore(
    (s) => s.completePendingPrivateHandCast,
  );
  const switchSiteSource = useScopedStore((s) => s.switchSiteSource);
  const setSwitchSiteSource = useScopedStore((s) => s.setSwitchSiteSource);
  const switchSitePosition = useScopedStore((s) => s.switchSitePosition);
  const log = useScopedStore((s) => s.log);
  // Online mode consent infrastructure
  const transport = useScopedStore((s) => s.transport);
  const matchId = useScopedStore((s) => s.matchId);
  const opponentPlayerId = useScopedStore((s) => s.opponentPlayerId);
  const sendInteractionRequest = useScopedStore(
    (s) => s.sendInteractionRequest,
  );
  const overlayBlocking = useScopedStore((s) =>
    Boolean(s.peekDialog || s.searchDialog || s.placementDialog),
  );
  // Counter actions
  const incrementPermanentCounter = useScopedStore(
    (s) => s.incrementPermanentCounter,
  );
  const decrementPermanentCounter = useScopedStore(
    (s) => s.decrementPermanentCounter,
  );
  const incrementAvatarCounter = useScopedStore(
    (s) => s.incrementAvatarCounter,
  );
  const decrementAvatarCounter = useScopedStore(
    (s) => s.decrementAvatarCounter,
  );
  const attachTokenToPermanent = useScopedStore(
    (s) => s.attachTokenToPermanent,
  );
  const attachPermanentToAvatar = useScopedStore(
    (s) => s.attachPermanentToAvatar,
  );
  const hoverPreviewSourceRef = useRef<string | null>(null);
  const hoverPreviewClearTimerRef = useRef<number | null>(null);
  const touchPreviewTimerRef = useRef<number | null>(null);
  const touchContextTimerRef = useRef<number | null>(null);

  const beginHoverPreview = useCallback(
    (card?: CardRef | null, sourceKey?: string | null) => {
      if (hoverPreviewClearTimerRef.current) {
        window.clearTimeout(hoverPreviewClearTimerRef.current);
        hoverPreviewClearTimerRef.current = null;
      }
      if (!card) return;
      hoverPreviewSourceRef.current = sourceKey ?? null;
      setPreviewCard(card);
    },
    [setPreviewCard],
  );

  const clearHoverPreview = useCallback(
    (sourceKey?: string | null) => {
      if (
        sourceKey &&
        hoverPreviewSourceRef.current &&
        sourceKey !== hoverPreviewSourceRef.current
      ) {
        return;
      }
      if (hoverPreviewClearTimerRef.current) {
        window.clearTimeout(hoverPreviewClearTimerRef.current);
        hoverPreviewClearTimerRef.current = null;
      }
      hoverPreviewSourceRef.current = null;
      setPreviewCard(null);
    },
    [setPreviewCard],
  );

  const clearHoverPreviewDebounced = useCallback(
    (sourceKey?: string | null, delay = 60) => {
      if (hoverPreviewClearTimerRef.current) {
        window.clearTimeout(hoverPreviewClearTimerRef.current);
        hoverPreviewClearTimerRef.current = null;
      }
      hoverPreviewClearTimerRef.current = window.setTimeout(
        () => {
          hoverPreviewClearTimerRef.current = null;
          clearHoverPreview(sourceKey);
        },
        Math.max(0, delay),
      ) as unknown as number;
    },
    [clearHoverPreview],
  );

  const clearTouchTimers = useCallback(() => {
    if (touchPreviewTimerRef.current) {
      window.clearTimeout(touchPreviewTimerRef.current);
      touchPreviewTimerRef.current = null;
    }
    if (touchContextTimerRef.current) {
      window.clearTimeout(touchContextTimerRef.current);
      touchContextTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverPreviewClearTimerRef.current) {
        window.clearTimeout(hoverPreviewClearTimerRef.current);
        hoverPreviewClearTimerRef.current = null;
      }
      clearTouchTimers();
    };
  }, [clearTouchTimers]);

  useEffect(() => {
    const controller = new AbortController();

    const apply = async () => {
      try {
        const res = await fetch("/api/users/me/playmats/selected", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) {
          // Not authenticated or error - use default playmat
          setPlaymatUrl("/playmat.jpg");
          return;
        }

        const data = (await res.json()) as { selectedPlaymatRef?: unknown };
        const ref =
          typeof data.selectedPlaymatRef === "string"
            ? data.selectedPlaymatRef
            : null;

        if (ref && ref.startsWith("custom:")) {
          const id = ref.slice("custom:".length);
          if (id) {
            setPlaymatUrl(`/api/users/me/playmats/${id}/image`);
            return;
          }
        }

        setPlaymatUrl("/playmat.jpg");
      } catch {
        // Fetch failed (e.g., solo/hotseat mode) - use default playmat
        setPlaymatUrl("/playmat.jpg");
      }
    };

    void apply();
    return () => controller.abort();
  }, [setPlaymatUrl]);

  // Fetch cardback selection for solo/hotseat mode (apply only to local player p2)
  const setCardbackUrls = useGameStore((s) => s.setCardbackUrls);
  useEffect(() => {
    const controller = new AbortController();

    const applyCardbacks = async () => {
      try {
        const res = await fetch("/api/users/me/cardbacks/selected", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return; // Not authenticated - use defaults

        const data = (await res.json()) as {
          selectedSpellbookRef?: string;
          selectedAtlasRef?: string;
        };

        // Parse spellbook ref
        let spellbookUrl: string | null = null;
        let preset: string | null = null;
        const sbRef = data.selectedSpellbookRef;
        if (sbRef?.startsWith("custom:")) {
          const id = sbRef.slice("custom:".length);
          if (id) spellbookUrl = `/api/users/me/cardbacks/${id}/spellbook`;
        } else if (sbRef?.startsWith("preset:")) {
          preset = sbRef;
        }

        // Parse atlas ref
        let atlasUrl: string | null = null;
        const atRef = data.selectedAtlasRef;
        if (atRef?.startsWith("custom:")) {
          const id = atRef.slice("custom:".length);
          if (id) atlasUrl = `/api/users/me/cardbacks/${id}/atlas`;
        } else if (atRef?.startsWith("preset:") && !preset) {
          // Fall back to atlas preset if no spellbook preset
          preset = atRef;
        }

        // Apply to local player (p2) in solo mode
        setCardbackUrls("p2", spellbookUrl, atlasUrl, preset);
      } catch {
        // Fetch failed - use defaults
      }
    };

    void applyCardbacks();
    return () => controller.abort();
  }, [setCardbackUrls]);

  // Calculate playmat bounds for drag clamping (same logic as matW/matH below)
  const matBounds = useMemo(() => {
    const baseGridW = board.size.w * BASE_TILE_SIZE;
    const baseGridH = board.size.h * BASE_TILE_SIZE;
    let matW = baseGridW;
    let matH = baseGridW / MAT_RATIO;
    if (matH < baseGridH) {
      matH = baseGridH;
      matW = baseGridH * MAT_RATIO;
    }
    return { halfW: matW / 2, halfH: matH / 2 };
  }, [board.size.w, board.size.h]);

  const boardDragControls = useBoardDragControls({
    currentPlayer,
    playTurnGong,
    dragFromHand: Boolean(dragFromHand),
    dragFromPile,
    selectedCard: selected,
    setDragFromHand,
    setDragFromPile,
    setBoardDragActive,
    handlePointerMoveRef,
    enableSnap: ENABLE_SNAP,
    matBounds,
  });

  const {
    dragging,
    setDragging,
    dragAvatar,
    setGhost,
    dragStartRef,
    ghostGroupRef,
    lastGhostPosRef,
    boardGhostRef,
    lastBoardGhostPosRef,
    bodyMap,
    draggedBody,
    bodiesAccessedThisFrame,
    dragTarget,
    moveDraggedBody,
    snapBodyTo,
    lastDropAt,
  } = boardDragControls;

  const { openAttachmentDialog, attachmentDialogNode } = useAttachmentDialog({
    setDragFromPile,
    playFromPileTo,
    playSelectedTo,
    attachTokenToPermanent,
    attachPermanentToAvatar,
  });

  useBoardHotkeys({
    store: resolvedStoreApi,
    isSpectator,
    overlayBlocking,
    playCardFlip,
  });

  const clearBoardSelection = useCallback(() => {
    const state = resolvedStoreApi.getState();
    state.clearSelection();
    state.closeContextMenu();
  }, [resolvedStoreApi]);

  // Complete switch site position when target tile is clicked
  const onCompleteSwitchSite = useCallback(
    (targetX: number, targetY: number) => {
      if (!switchSiteSource) return;
      const { x: sourceX, y: sourceY } = switchSiteSource;
      // Don't allow switching to the same cell
      if (sourceX === targetX && sourceY === targetY) {
        setSwitchSiteSource(null);
        return;
      }

      const apply = () => {
        switchSitePosition(sourceX, sourceY, targetX, targetY);
        setSwitchSiteSource(null);
      };

      // In online mode, request consent
      const isOnline = Boolean(transport);
      if (isOnline && localPlayerId && opponentPlayerId && matchId) {
        const sourceKey = `${sourceX},${sourceY}` as CellKey;
        const targetKey = `${targetX},${targetY}` as CellKey;
        const sourceCellNo =
          (board.size.h - 1 - sourceY) * board.size.w + sourceX + 1;
        const targetCellNo =
          (board.size.h - 1 - targetY) * board.size.w + targetX + 1;
        const hasTargetSite = Boolean(board.sites[targetKey]);

        // Build descriptive text with site names and permanents
        const sourceSite = board.sites[sourceKey];
        const targetSite = board.sites[targetKey];
        const sourceSiteName = sourceSite?.card?.name || "site";
        const targetSiteName = targetSite?.card?.name || "site";

        // Get permanents at source that will be moved
        const sourcePerms = permanents[sourceKey] || [];
        const permNames = sourcePerms
          .map((p) => p.card?.name)
          .filter(Boolean)
          .slice(0, 3); // Limit to first 3
        const permInfo =
          permNames.length > 0
            ? ` (with ${permNames.join(", ")}${
                sourcePerms.length > 3 ? "..." : ""
              })`
            : "";

        const description = hasTargetSite
          ? `Switch ${sourceSiteName} at #${sourceCellNo} with ${targetSiteName} at #${targetCellNo}${permInfo}`
          : `Move ${sourceSiteName} at #${sourceCellNo} to void at #${targetCellNo}${permInfo}`;

        const rid = generateInteractionRequestId("switch");
        const ttlMs = 30000;
        sendInteractionRequest({
          requestId: rid,
          from: localPlayerId,
          to: opponentPlayerId,
          kind: "switchSite",
          matchId,
          note: description,
          payload: {
            sourceCell: sourceKey,
            targetCell: targetKey,
            grant: {
              allowOpponentZoneWrite: true,
              singleUse: true,
              expiresAt: Date.now() + ttlMs,
            },
          },
        });

        log(`Requesting consent: ${description}`);
        // Listen for approval
        const checkApproval = setInterval(() => {
          const entry = resolvedStoreApi.getState().interactionLog[rid];
          if (entry?.status === "approved") {
            clearInterval(checkApproval);
            apply();
          } else if (
            entry &&
            (entry.status === "declined" || entry.status === "cancelled")
          ) {
            clearInterval(checkApproval);
            setSwitchSiteSource(null);
            log("Site switch request declined");
          }
        }, 300);
      } else {
        // Offline mode: apply directly
        apply();
      }
    },
    [
      switchSiteSource,
      switchSitePosition,
      setSwitchSiteSource,
      log,
      transport,
      localPlayerId,
      opponentPlayerId,
      matchId,
      sendInteractionRequest,
      board,
      permanents,
      resolvedStoreApi,
    ],
  );

  // Cancel switch site selection on Escape key
  useEffect(() => {
    if (!switchSiteSource) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSwitchSiteSource(null);
        log("Site switch cancelled");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [switchSiteSource, setSwitchSiteSource, log]);

  // Flip selected permanent with 'F' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "f" || e.key === "F") && selectedPermanent) {
        // Check if the permanent is owned by the player
        const item =
          permanents[selectedPermanent.at]?.[selectedPermanent.index];
        if (!item) return;
        const ownerSeat = item.owner === 1 ? "p1" : "p2";
        if (actorKey && actorKey === ownerSeat) {
          toggleFaceDown(selectedPermanent.at, selectedPermanent.index);
          try {
            playCardFlip();
          } catch {}
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPermanent, permanents, actorKey, toggleFaceDown, playCardFlip]);

  // Toggle UI visibility with 'U' key
  const toggleUiHidden = useScopedStore((s) => s.toggleUiHidden);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === "u" || e.key === "U") {
        toggleUiHidden();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleUiHidden]);

  // Attack chooser state moved to store so HUD can render at layout level
  const attackTargetChoice = useScopedStore((s) => s.attackTargetChoice);
  const setAttackChoice = useScopedStore((s) => s.setAttackChoice);
  const attackConfirm = useScopedStore((s) => s.attackConfirm);
  const setAttackConfirm = useScopedStore((s) => s.setAttackConfirm);
  const [lastCrossMove, setLastCrossMove] = useState<{
    fromKey: string;
    toKey: string;
    destIndex: number;
    prevOffset: [number, number] | null;
    instanceId?: string | null;
  } | null>(null);
  // Keep a ref in sync with state to avoid stale closures in effects
  const lastCrossMoveRef = useRef(lastCrossMove);
  useEffect(() => {
    lastCrossMoveRef.current = lastCrossMove;
  }, [lastCrossMove]);
  const combatGuidesActive = useScopedStore((s) => s.combatGuidesActive);
  const magicGuidesActive = useScopedStore((s) => s.magicGuidesActive);
  const metaByCardId = useScopedStore((s) => s.metaByCardId);
  const fetchCardMeta = useScopedStore((s) => s.fetchCardMeta);
  const pendingCombat = useScopedStore((s) => s.pendingCombat);
  const selectPermanent = useScopedStore((s) => s.selectPermanent);
  const setDefenderSelection = useScopedStore((s) => s.setDefenderSelection);
  const revertCrossMoveTick = useScopedStore((s) => s.revertCrossMoveTick);
  // Magic casting flow
  const pendingMagic = useScopedStore((s) => s.pendingMagic);
  const setMagicCasterChoice = useScopedStore((s) => s.setMagicCasterChoice);
  const setMagicTargetChoice = useScopedStore((s) => s.setMagicTargetChoice);

  // Chaos Twister minigame flow
  const pendingChaosTwister = useScopedStore((s) => s.pendingChaosTwister);
  const selectChaosTwisterMinion = useScopedStore(
    (s) => s.selectChaosTwisterMinion,
  );
  const selectChaosTwisterSite = useScopedStore(
    (s) => s.selectChaosTwisterSite,
  );

  // Earthquake spell flow
  const pendingEarthquake = useScopedStore((s) => s.pendingEarthquake);
  const selectEarthquakeArea = useScopedStore((s) => s.selectEarthquakeArea);
  const performEarthquakeSwap = useScopedStore((s) => s.performEarthquakeSwap);

  // Atlantean Fate spell flow (4x4 area selection)
  const pendingAtlanteanFate = useScopedStore((s) => s.pendingAtlanteanFate);
  const setAtlanteanFatePreview = useScopedStore(
    (s) => s.setAtlanteanFatePreview,
  );

  // Mephistopheles summon flow (Evil minion to adjacent site)
  const pendingMephistophelesSummon = useScopedStore(
    (s) => s.pendingMephistophelesSummon,
  );
  const selectMephistophelesSummonTarget = useScopedStore(
    (s) => s.selectMephistophelesSummonTarget,
  );
  const selectAtlanteanFateCorner = useScopedStore(
    (s) => s.selectAtlanteanFateCorner,
  );

  // Helper to check if a token can be attached
  const isAttachableToken = (tokenName: string): boolean => {
    const name = tokenName.toLowerCase();
    return (
      name === "lance" ||
      name === "stealth" ||
      name === "disabled" ||
      name === "ward"
    );
  };

  // Helper to check if a card is a carryable artifact
  // Excludes Monuments and Automatons (uses name-based fallback when subTypes missing)
  const isCarryableArtifact = (card: CardRef): boolean => {
    const cardType = (card.type || "").toLowerCase();
    const cardSubTypes = (card.subTypes || "").toLowerCase();
    const cardName = card.name || "";
    const isArtifact = cardType.includes("artifact");
    const isMonument =
      cardSubTypes.includes("monument") || isMonumentByName(cardName);
    const isAutomaton =
      cardSubTypes.includes("automaton") || isAutomatonByName(cardName);
    return isArtifact && !isMonument && !isAutomaton;
  };

  // Compute first hits for projectile scope along cardinal directions from the caster
  const computeProjectileFirstHits = useCallback((): Record<
    "N" | "E" | "S" | "W",
    { kind: "permanent" | "avatar"; at: CellKey; index?: number } | null
  > => {
    const hits: Record<
      "N" | "E" | "S" | "W",
      { kind: "permanent" | "avatar"; at: CellKey; index?: number } | null
    > = { N: null, E: null, S: null, W: null };
    const pm = resolvedStoreApi.getState().pendingMagic;
    if (!pm) return hits;

    // Use caster position as origin, not spell tile
    let originX = pm.tile.x;
    let originY = pm.tile.y;
    try {
      const caster = pm.caster;
      if (caster && caster.kind === "avatar") {
        const pos = avatars?.[caster.seat]?.pos as [number, number] | null;
        if (Array.isArray(pos)) {
          originX = pos[0];
          originY = pos[1];
        }
      } else if (caster && caster.kind === "permanent") {
        const [cx, cy] = String(caster.at).split(",").map(Number);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          originX = cx;
          originY = cy;
        }
      } else {
        // Default to spell owner's avatar
        const ownerSeat = seatFromOwner(pm.spell.owner);
        const pos = avatars?.[ownerSeat]?.pos as [number, number] | null;
        if (Array.isArray(pos)) {
          originX = pos[0];
          originY = pos[1];
        }
      }
    } catch {}
    const w = board.size.w;
    const h = board.size.h;
    const checkTile = (tx: number, ty: number) => {
      const k = `${tx},${ty}` as CellKey;
      try {
        const list = (permanents[k] || []) as Array<{
          attachedTo?: { at: CellKey; index: number } | null;
        }>;
        if (list.length > 0) {
          // Scan from topmost downwards and pick the first non-attachment (host minion)
          for (let i = list.length - 1; i >= 0; i--) {
            const it = list[i] as
              | { attachedTo?: { at: CellKey; index: number } | null }
              | null
              | undefined;
            if (it && !it.attachedTo) {
              return { kind: "permanent" as const, at: k, index: i };
            }
          }
        }
      } catch {}
      try {
        const p1 = avatars?.p1?.pos as [number, number] | null;
        if (Array.isArray(p1) && p1[0] === tx && p1[1] === ty) {
          return { kind: "avatar" as const, at: k };
        }
      } catch {}
      try {
        const p2 = avatars?.p2?.pos as [number, number] | null;
        if (Array.isArray(p2) && p2[0] === tx && p2[1] === ty) {
          return { kind: "avatar" as const, at: k };
        }
      } catch {}
      return null;
    };
    // North
    for (let yy = originY - 1; yy >= 0; yy--) {
      const hit = checkTile(originX, yy);
      if (hit) {
        hits.N = hit;
        break;
      }
    }
    // East
    for (let xx = originX + 1; xx < w; xx++) {
      const hit = checkTile(xx, originY);
      if (hit) {
        hits.E = hit;
        break;
      }
    }
    // South
    for (let yy = originY + 1; yy < h; yy++) {
      const hit = checkTile(originX, yy);
      if (hit) {
        hits.S = hit;
        break;
      }
    }
    // West
    for (let xx = originX - 1; xx >= 0; xx--) {
      const hit = checkTile(xx, originY);
      if (hit) {
        hits.W = hit;
        break;
      }
    }
    return hits;
  }, [avatars, board.size.h, board.size.w, permanents, resolvedStoreApi]);

  // Site edge placement functions
  const calculateEdgePosition = useScopedStore((s) => s.calculateEdgePosition);
  const playerPositions = useScopedStore((s) => s.playerPositions);

  // Removed baseline-shift helper to ensure only the moved card changes position

  // Compute mat world size using BASE tile size (keeps mat size unchanged even if TILE_SIZE changes)
  const baseGridW = board.size.w * BASE_TILE_SIZE;
  const baseGridH = board.size.h * BASE_TILE_SIZE;
  let matW = baseGridW;
  let matH = baseGridW / MAT_RATIO;
  if (matH < baseGridH) {
    matH = baseGridH;
    matW = baseGridH * MAT_RATIO;
  }

  const offsetX = useMemo(
    () => -((board.size.w - 1) * TILE_SIZE) / 2,
    [board.size.w],
  );
  const offsetY = useMemo(
    () => -((board.size.h - 1) * TILE_SIZE) / 2,
    [board.size.h],
  );

  const cells = useMemo(() => {
    const out: { x: number; y: number; key: string }[] = [];
    for (let y = 0; y < board.size.h; y++) {
      for (let x = 0; x < board.size.w; x++) {
        out.push({ x, y, key: `${x},${y}` });
      }
    }
    return out;
  }, [board.size.w, board.size.h]);

  const dragContext = useMemo(
    () => ({
      dragging,
      dragAvatar,
      dragFromHand,
      dragFromPile: Boolean(dragFromPile),
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
      useGhostOnlyBoardDrag: USE_GHOST_ONLY_BOARD_DRAG,
    }),
    [
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
    ],
  );
  const hoverContext = useMemo(
    () => ({
      beginHoverPreview,
      clearHoverPreview,
      clearHoverPreviewDebounced,
      openContextMenu,
    }),
    [
      beginHoverPreview,
      clearHoverPreview,
      clearHoverPreviewDebounced,
      openContextMenu,
    ],
  );
  const touchContext = useMemo(
    () => ({
      clearTouchTimers,
      touchPreviewTimerRef,
      touchContextTimerRef,
    }),
    [clearTouchTimers],
  );
  const selectionContext = useMemo(
    () => ({
      selectPermanent,
      selectedPermanent,
      lastTouchedId,
      setLastTouchedId,
    }),
    [selectPermanent, selectedPermanent, lastTouchedId],
  );
  const combatContext = useMemo(
    () => ({
      attackTargetChoice,
      setAttackConfirm,
      pendingCombat,
      setDefenderSelection,
    }),
    [attackTargetChoice, setAttackConfirm, pendingCombat, setDefenderSelection],
  );
  const magicContext = useMemo(
    () => ({
      pendingMagic,
      setMagicTargetChoice,
      setMagicCasterChoice,
      computeProjectileFirstHits,
      magicGuidesActive,
    }),
    [
      pendingMagic,
      setMagicTargetChoice,
      setMagicCasterChoice,
      computeProjectileFirstHits,
      magicGuidesActive,
    ],
  );
  const chaosTwisterContext = useMemo(
    () => ({
      pendingChaosTwister,
      selectChaosTwisterMinion,
      selectChaosTwisterSite,
      metaByCardId,
    }),
    [
      pendingChaosTwister,
      selectChaosTwisterMinion,
      selectChaosTwisterSite,
      metaByCardId,
    ],
  );
  const earthquakeContext = useMemo(
    () => ({
      pendingEarthquake,
      selectEarthquakeArea,
      performEarthquakeSwap,
    }),
    [pendingEarthquake, selectEarthquakeArea, performEarthquakeSwap],
  );
  const atlanteanFateContext = useMemo(
    () => ({
      pendingAtlanteanFate,
      setAtlanteanFatePreview,
      selectAtlanteanFateCorner,
    }),
    [pendingAtlanteanFate, setAtlanteanFatePreview, selectAtlanteanFateCorner],
  );
  const mephistophelesSummonContext = useMemo(
    () => ({
      pendingMephistophelesSummon,
      selectMephistophelesSummonTarget,
    }),
    [pendingMephistophelesSummon, selectMephistophelesSummonTarget],
  );
  // Pathfinder target selection
  const pendingPathfinderPlay = useScopedStore((s) => s.pendingPathfinderPlay);
  const selectPathfinderTarget = useScopedStore(
    (s) => s.selectPathfinderTarget,
  );
  const pathfinderContext = useMemo(
    () => ({
      pendingPathfinderPlay,
      selectPathfinderTarget,
    }),
    [pendingPathfinderPlay, selectPathfinderTarget],
  );
  const counterHandlers = useMemo(
    () => ({
      increment: incrementPermanentCounter,
      decrement: decrementPermanentCounter,
    }),
    [incrementPermanentCounter, decrementPermanentCounter],
  );
  const movementHandlers = useMemo(
    () => ({
      setOffset: setPermanentOffset,
      moveToWithOffset: moveSelectedPermanentToWithOffset,
      moveToZone: movePermanentToZone,
    }),
    [
      setPermanentOffset,
      moveSelectedPermanentToWithOffset,
      movePermanentToZone,
    ],
  );

  const handleTilePointerUp = useTileDropHandler({
    board,
    permanents,
    avatars,
    interactionGuides: combatGuidesActive,
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
    selectedCard: selected,
    mouseInHandZone,
    isSpectator,
    actorKey,
    currentPlayer,
    setAttackChoice,
    setLastCrossMove,
    isAttachableToken,
    isCarryableArtifact,
    dragContext: boardDragControls,
    useGhostOnlyBoardDrag: USE_GHOST_ONLY_BOARD_DRAG,
    selectAvatar,
    selectPermanent,
    draggingSite,
    dropDraggingSite,
    pendingPrivateHandCast,
    completePendingPrivateHandCast,
  });

  const {
    remotePermanentDrags,
    remotePermanentDragLookup,
    remoteHandDrags,
    remotePileDrags,
    remoteAvatarDrags,
    remoteAvatarDragSet,
    handlePointerMove: baseHandlePointerMove,
    emitBoardPing,
    lastPointerRef,
  } = useRemoteCursorSystem({
    resolvedStoreApi,
    isSpectator,
    overlayBlocking,
    remoteCursors,
    localPlayerId,
    actorKey,
    permanents,
    avatars,
    boardOffset: { x: offsetX, y: offsetY },
    boardSize: board.size,
    dragAvatar,
    dragging,
    previewCard,
    selectedCard: selected,
    selectedPermanent,
    handlePointerMoveRef,
    setLastPointerWorldPos,
  });
  // Wrap handlePointerMove to also update dragging site position
  const handlePointerMove = useCallback(
    (x: number, z: number) => {
      baseHandlePointerMove(x, z);
      if (draggingSite) {
        updateDraggingSitePos(x, z);
      }
    },
    [baseHandlePointerMove, draggingSite, updateDraggingSitePos],
  );

  useBoardDropManager({
    board,
    boardOffset: { x: offsetX, y: offsetY },
    dragAvatar,
    dragFromHand,
    dragFromPile,
    isSpectator,
    permanents,
    avatars,
    interactionGuides: combatGuidesActive,
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
    dragContext: boardDragControls,
    useGhostOnlyBoardDrag: USE_GHOST_ONLY_BOARD_DRAG,
    lastPointerRef,
    draggingSite,
    setDraggingSite,
  });

  // removed global pointerup fallback; drops are handled by tiles/cards precisely

  // Preload card meta for all board entities (avatars, permanents) to improve chooser readiness
  useEffect(() => {
    try {
      const ids = new Set<number>();
      // Permanents
      for (const arr of Object.values(permanents)) {
        if (!Array.isArray(arr)) continue;
        for (const p of arr) {
          const id = Number(p?.card?.cardId);
          if (Number.isFinite(id) && id > 0) ids.add(id);
        }
      }
      // Avatars
      const a1 = avatars?.p1?.card?.cardId;
      const a2 = avatars?.p2?.card?.cardId;
      if (Number.isFinite(Number(a1))) ids.add(Number(a1));
      if (Number.isFinite(Number(a2))) ids.add(Number(a2));
      const list = Array.from(ids.values());
      if (list.length > 0) void fetchCardMeta(list);
    } catch {}
  }, [permanents, avatars, fetchCardMeta]);

  const revertLastCrossTileMove = useCallback(() => {
    const snap = lastCrossMoveRef.current;
    if (!snap) return;
    try {
      const [fx, fy] = snap.fromKey.split(",").map((v) => Number(v));
      if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
        setLastCrossMove(null);
        return;
      }
      try {
        selectPermanent(snap.toKey, snap.destIndex);
      } catch {}
      requestAnimationFrame(() => {
        try {
          moveSelectedPermanentToWithOffset(
            fx,
            fy,
            (snap.prevOffset ?? [0, 0]) as [number, number],
          );
        } finally {
          setLastCrossMove(null);
        }
      });
    } catch {
      setLastCrossMove(null);
    }
  }, [moveSelectedPermanentToWithOffset, selectPermanent]);

  // Respond to layout-level cancel requests
  useEffect(() => {
    // Any tick change requests revert of the last cross-tile move
    revertLastCrossTileMove();
  }, [revertCrossMoveTick, revertLastCrossTileMove]);

  return (
    <group>
      {/* Preload cardback textures early */}
      <CardbackPreloader />

      <BoardEnvironment
        matW={matW}
        matH={matH}
        showPlaymat={showPlaymat}
        playmatUrl={
          // Use active player's playmat if set, otherwise fall back to legacy playmatUrl
          activePlaymatOwner && playmatUrls[activePlaymatOwner]
            ? playmatUrls[activePlaymatOwner]
            : playmatUrl
        }
        showOverlay={showPlaymatOverlay}
        showTable={graphicsSettings.showTable}
      />

      {/* Interactive tiles */}
      <group position={[0, 0, 0]}>
        {cells.map(({ x, y, key }) => {
          const position: [number, number, number] = [
            offsetX + x * TILE_SIZE,
            0,
            offsetY + y * TILE_SIZE,
          ];
          return (
            <BoardTile
              key={key}
              tileX={x}
              tileY={y}
              tileKey={key as CellKey}
              position={position}
              site={board.sites[key]}
              allowSiteDrag={allowSiteDrag}
              draggingSite={draggingSite}
              setDraggingSite={setDraggingSite}
              boardSize={board.size}
              boardOffset={{ x: offsetX, y: offsetY }}
              showGrid={showGrid}
              noRaycast={noRaycast}
              dragFromHand={dragFromHand}
              dragFromPile={dragFromPile}
              selectedCard={selected}
              boardDragContext={boardDragControls}
              permanentDragContext={dragContext}
              hoverContext={hoverContext}
              touchContext={touchContext}
              selectionContext={selectionContext}
              combatContext={combatContext}
              magicContext={magicContext}
              chaosTwisterContext={chaosTwisterContext}
              earthquakeContext={earthquakeContext}
              atlanteanFateContext={atlanteanFateContext}
              mephistophelesSummonContext={mephistophelesSummonContext}
              pathfinderContext={pathfinderContext}
              counterHandlers={counterHandlers}
              movementHandlers={movementHandlers}
              handlePointerMove={handlePointerMove}
              handleTilePointerUp={handleTilePointerUp}
              emitBoardPing={emitBoardPing}
              getRemoteHighlightColor={getRemoteHighlightColor}
              isHandVisible={isHandVisible}
              isSpectator={isSpectator}
              actorKey={actorKey}
              currentPlayer={currentPlayer}
              lastDropAt={lastDropAt}
              pendingMagic={pendingMagic}
              avatars={avatars}
              magicHighlightColor={HIGHLIGHT_TARGET}
              magicGuidesActive={magicGuidesActive}
              clearBoardSelection={clearBoardSelection}
              permanents={permanents}
              permanentPositions={permanentPositions}
              remotePermanentDragLookup={remotePermanentDragLookup}
              highlightColors={HIGHLIGHT_COLORS}
              stackConfig={STACK_CONFIG}
              playCardFlip={playCardFlip}
              isPrimaryCardHit={isPrimaryCardHit}
              contextMenu={contextMenu}
              openContextMenu={openContextMenu}
              playerPositions={playerPositions}
              calculateEdgePosition={calculateEdgePosition}
              attackConfirm={attackConfirm}
              attackTargetChoice={attackTargetChoice}
              portalState={portalState}
              switchSiteSource={switchSiteSource}
              onCompleteSwitchSite={onCompleteSwitchSite}
              showOwnershipOverlay={showOwnershipOverlay}
              cardScale={cardScale}
              stolenCards={stolenCards}
              metaByCardId={metaByCardId}
            />
          );
        })}
      </group>

      {/* Board ping markers */}
      {enableBoardPings ? <BoardPingLayer /> : null}

      {/* Remote cursors */}
      <BoardCursorLayer />

      {/* Magic spell connection lines */}
      {pendingMagic && magicGuidesActive && !pendingMagic.guidesSuppressed && (
        <MagicConnectionLines
          pendingMagic={pendingMagic}
          avatars={avatars}
          permanents={permanents}
          boardOffset={{ x: offsetX, y: offsetY }}
        />
      )}

      <RemoteDragOverlays
        handDrags={remoteHandDrags}
        pileDrags={remotePileDrags}
        permanentDrags={remotePermanentDrags}
        avatarDrags={remoteAvatarDrags}
      />

      {/* Avatars */}
      {(["p1", "p2"] as const).map((who) => {
        const avatar = avatars?.[who];
        if (!avatar || !avatar.pos) return null;
        if (remoteAvatarDragSet.has(who)) {
          return null;
        }
        return (
          <AvatarCard
            key={`avatar-${who}`}
            seat={who}
            avatar={avatar}
            boardOffset={{ x: offsetX, y: offsetY }}
            boardSize={board.size}
            permanents={permanents}
            lastAvatarCardsRef={lastAvatarCardsRef}
            dragContext={boardDragControls}
            useGhostOnlyBoardDrag={USE_GHOST_ONLY_BOARD_DRAG}
            dragFromHand={dragFromHand}
            dragFromPile={dragFromPile}
            draggingPermanent={dragging}
            setDragFromHand={setDragFromHand}
            isHandVisible={isHandVisible}
            isSpectator={isSpectator}
            actorKey={actorKey}
            currentPlayer={currentPlayer}
            openContextMenu={openContextMenu}
            emitBoardPing={emitBoardPing}
            handlePointerMove={handlePointerMove}
            hoverContext={{
              beginHoverPreview,
              clearHoverPreview,
              clearHoverPreviewDebounced,
              clearTouchTimers,
              touchPreviewTimerRef,
              touchContextTimerRef,
            }}
            selectionContext={{
              selectedAvatar,
              selectAvatar,
              contextMenu,
              setLastTouchedId,
              lastTouchedId,
            }}
            combatContext={{
              attackTargetChoice,
              attackConfirm,
              setAttackConfirm,
              pendingCombat,
            }}
            magicContext={{
              pendingMagic,
              setMagicCasterChoice,
              setMagicTargetChoice,
              computeProjectileFirstHits,
              magicGuidesActive,
            }}
            avatarActions={{
              moveAvatarToWithOffset,
              incrementCounter: incrementAvatarCounter,
              decrementCounter: decrementAvatarCounter,
            }}
          />
        );
      })}

      <HandDragGhost
        dragFromHand={dragFromHand}
        dragAvatar={dragAvatar}
        dragging={dragging}
        selectedCard={selected}
        dragFromPile={dragFromPile}
        currentPlayer={currentPlayer}
        ghostGroupRef={ghostGroupRef}
        lastGhostPosRef={lastGhostPosRef}
      />

      <BoardDragGhost
        dragFromHand={dragFromHand}
        dragFromPile={dragFromPile}
        dragging={dragging}
        dragAvatar={dragAvatar}
        avatars={avatars}
        permanents={permanents}
        boardGhostRef={boardGhostRef}
        lastBoardGhostPosRef={lastBoardGhostPosRef}
        enableGhostOnlyMode={USE_GHOST_ONLY_BOARD_DRAG}
      />

      <DraggingSiteGhost draggingSite={draggingSite} />

      {/* Gem Tokens */}
      {gemTokens.map((token) => (
        <GemToken3D
          key={token.id}
          token={token}
          onContextMenu={(e, tokenId) => {
            e.nativeEvent.preventDefault();
            openContextMenu(
              { kind: "gemToken" as const, tokenId },
              { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
            );
          }}
        />
      ))}

      {attachmentDialogNode}

      {/* Combat HUD is rendered at layout level (outside Canvas) */}

      {/* bottom Html controls removed in favor of portal */}
    </group>
  );
}
