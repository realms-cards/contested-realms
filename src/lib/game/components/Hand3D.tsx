"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Group, PerspectiveCamera } from "three";
import { useGraphicsSettings } from "@/hooks/useGraphicsSettings";
import { cardbackAtlasUrl, cardbackSpellbookUrl } from "@/lib/assets";
import { useSound } from "@/lib/contexts/SoundContext";
import { isMagician } from "@/lib/game/avatarAbilities";
import { cardRefToPreview } from "@/lib/game/card-preview.types";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import CardBorder from "@/lib/game/components/CardBorder";
import CardGlow from "@/lib/game/components/CardGlow";
import CardPlane from "@/lib/game/components/CardPlane";
import MaterialCardBack from "@/lib/game/components/MaterialCardBack";
import {
  CARD_LONG,
  CARD_SHORT,
  HAND_DIST,
  HAND_BOTTOM_MARGIN,
  HAND_MAX_TOTAL_ANGLE,
  HAND_STEP_MAX,
  HAND_FAN_ARC_Y,
  HAND_CARD_SCALE,
  TILE_SIZE,
} from "@/lib/game/constants";
import { DRAG_HOLD_MS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PlayerKey } from "@/lib/game/store";
import { useTouchDevice } from "@/lib/hooks/useTouchDevice";
import { throttle } from "@/lib/utils/throttle";

export interface Hand3DProps {
  matW: number;
  matH: number;
  owner?: PlayerKey; // default: p1 (bottom)
  showCardBacks?: boolean; // if true, render card backs instead of card faces
  viewerPlayerNumber?: number | null; // 1 or 2, for positioning opponent hands
  // Optional placement override. When set to 'edgeTop'/'edgeBottom', the hand is placed along the board edge
  // regardless of showCardBacks; when omitted, placement falls back to overlayBottom for faces and edge for backs.
  placement?: "overlayBottom" | "edgeTop" | "edgeBottom";
  // When true, render cards flat on the board (used for commentator mode)
  flatCards?: boolean;
  // Enhanced preview functions (optional for compatibility)
  showCardPreview?: (card: CardPreviewData) => void;
  hideCardPreview?: () => void;
  hideCardPreviewImmediate?: () => void;
}

export default function Hand3D({
  matW: _matW,
  matH: _matH,
  owner = "p1",
  showCardBacks = false,
  viewerPlayerNumber = null,
  placement,
  flatCards = false,
  showCardPreview,
  hideCardPreview: _hideCardPreview,
  hideCardPreviewImmediate,
}: Hand3DProps) {
  // Intentionally unused after layout refactor; keep signature stable
  void _matW;
  void _matH;
  void _hideCardPreview; // Debounced version not used - we use immediate for snappy clear

  const zones = useGameStore((s) => s.zones);
  const selected = useGameStore((s) => s.selectedCard);
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const selectedAvatar = useGameStore((s) => s.selectedAvatar);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const setDragFaceDown = useGameStore((s) => s.setDragFaceDown);
  const openContextMenu = useGameStore((s) => s.openContextMenu);
  const dragFromPile = useGameStore((s) => s.dragFromPile);
  const boardDragActive = useGameStore((s) => s.boardDragActive);
  const draggingSite = useGameStore((s) => s.draggingSite);
  const setMouseInHandZone = useGameStore((s) => s.setMouseInHandZone);
  const setHandHoverCount = useGameStore((s) => s.setHandHoverCount);
  const getRemoteHighlightColor = useGameStore(
    (s) => s.getRemoteHighlightColor,
  );
  const avatars = useGameStore((s) => s.avatars);
  const cardbackUrls = useGameStore((s) => s.cardbackUrls);
  const handVisibilityMode = useGameStore((s) => s.handVisibilityMode);
  const setHandVisibilityMode = useGameStore((s) => s.setHandVisibilityMode);
  const castPlacementMode = useGameStore((s) => s.castPlacementMode);
  // Overlay/dialog states – on mobile we collapse the hand when any of these are active
  const contextMenu = useGameStore((s) => s.contextMenu);
  const searchDialog = useGameStore((s) => s.searchDialog);
  const peekDialog = useGameStore((s) => s.peekDialog);
  const placementDialog = useGameStore((s) => s.placementDialog);
  const switchSiteSource = useGameStore((s) => s.switchSiteSource);
  const attackTargetChoice = useGameStore((s) => s.attackTargetChoice);
  const attackChoice = useGameStore((s) => s.attackChoice);
  const attackConfirm = useGameStore((s) => s.attackConfirm);
  const { playCardSelect } = useSound();

  const hand = useMemo(() => zones?.[owner]?.hand ?? [], [zones, owner]);
  const { settings: graphicsSettings } = useGraphicsSettings();

  // Get cardback config for this hand's owner (hand cards always use preset)
  const ownerCardbacks = cardbackUrls[owner];
  const usePreset = showCardBacks && ownerCardbacks?.preset;

  // Detect if the hand's owner is a Magician (hide card type distinction from opponents)
  const ownerIsMagician = useMemo(
    () => isMagician(avatars[owner]?.card?.name),
    [avatars, owner],
  );

  // Sort hand based on user preference (sites first or spells first)
  const sortedHand = useMemo(() => {
    const sitesFirst = graphicsSettings.handSortOrder !== "spellsFirst";
    return [...hand].sort((a, b) => {
      const aIsSite = (a.type || "").toLowerCase().includes("site");
      const bIsSite = (b.type || "").toLowerCase().includes("site");

      if (sitesFirst) {
        if (aIsSite && !bIsSite) return -1; // a (site) comes before b (spell)
        if (!aIsSite && bIsSite) return 1; // b (site) comes before a (spell)
      } else {
        if (aIsSite && !bIsSite) return 1; // a (site) comes after b (spell)
        if (!aIsSite && bIsSite) return -1; // b (site) comes after a (spell)
      }
      return 0; // maintain relative order within same type
    });
  }, [hand, graphicsSettings.handSortOrder]);
  const rootRef = useRef<Group | null>(null);
  const { camera } = useThree();
  // Get mouse zone state from store
  const mouseInZone = useGameStore((s) => s.mouseInHandZone);
  // Get hover count state from store
  const hoveredCardCount = useGameStore((s) => s.handHoverCount);
  // Simple hover tracking for card pop-up
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  // Hand card preview enabled for testing
  const HAND_PREVIEW_ENABLED = true;
  // Use shared hook for touch device detection
  const isCoarsePointer = useTouchDevice();

  // Track touch-selected card for mobile tap-to-select pattern
  const [touchSelectedIndex, setTouchSelectedIndex] = useState<number | null>(
    null,
  );
  // Track if we just tapped (to distinguish tap from drag)
  const tapStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    index: number;
  } | null>(null);
  const TAP_THRESHOLD_PX = 10; // Max movement to count as tap
  const TAP_THRESHOLD_MS = 300; // Max duration to count as tap

  // Hand cycling: focus index target and smoothed value
  const focusTargetRef = useRef(0);
  const focusLerpRef = useRef(0);
  const [focusLerp, setFocusLerp] = useState(0);

  // Sliding hover highlight index
  const hoverTargetRef = useRef(-1);
  const hoverLerpRef = useRef(-1);
  const [hoverLerp, setHoverLerp] = useState(-1);

  // Track previous hovered card for arrival animation
  const prevHoverIndexRef = useRef(-1);
  // Per-card arrival animation progress: 0 = just started (behind/below), 1 = fully arrived (in hover position)
  // The arriving card animates UP and OVER the previous card
  const cardArrivalRef = useRef<Map<number, number>>(new Map());

  // Track whether the pointer is over any card area (aggregated)
  const [overCardsArea, setOverCardsArea] = useState(false);
  const handAreaLeaveTimeoutRef = useRef<number | null>(null);

  // Smooth transition refs for animations
  const handSpreadLerp = useRef(0); // 0 = compact, 1 = spread
  const handDragStart = useRef<{
    x: number;
    y: number;
    time: number;
    index: number;
    faceDown?: boolean; // Right-click or two-finger drag = play face-down
  } | null>(null);
  const revealLerp = useRef(1); // 0 hidden .. 1 shown
  // Track touch count for two-finger face-down gesture
  const activeTouchCountRef = useRef(0);

  // Timeout ref for delayed hover cleanup
  const hoverCleanupTimeoutRef = useRef<number | null>(null);
  // Track last mouse position
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hand zone: portion of the screen height from the bottom that counts as "in hand zone"
  // Higher value = smaller zone (cursor must be closer to bottom)
  // On touch devices, use a larger trigger zone for easier access
  const HAND_ZONE_TOP_FRAC = isCoarsePointer ? 0.82 : 0.87; // Mobile: bottom 18%, Desktop: bottom 12%
  const HAND_ZONE_BOTTOM_FRAC = 1.0; // Allow touching very edge on mobile
  // Horizontal zone: center portion of screen width that triggers hand reveal
  // On touch devices, use wider zone for easier access
  // RELAXED: Much wider zone for easier access
  const HAND_ZONE_LEFT_FRAC = isCoarsePointer ? 0.15 : 0.25; // Mobile: 15%, Desktop: 25%
  const HAND_ZONE_RIGHT_FRAC = isCoarsePointer ? 0.85 : 0.75; // Mobile: 85%, Desktop: 75%

  useEffect(() => {
    function onMoveRaw(e: MouseEvent) {
      const h = window.innerHeight || 1;
      const w = window.innerWidth || 1;
      // Vertical: between 80% and 95% of screen height (a narrow band near bottom)
      const inVerticalZone =
        e.clientY >= h * HAND_ZONE_TOP_FRAC &&
        e.clientY <= h * HAND_ZONE_BOTTOM_FRAC;
      // Horizontal: center 30% of screen (35%-65%)
      const inHorizontalZone =
        e.clientX >= w * HAND_ZONE_LEFT_FRAC &&
        e.clientX <= w * HAND_ZONE_RIGHT_FRAC;

      // Use restrictive zone for hand visibility - a small box near bottom center
      // Also allow overCardsArea to keep hand visible once hovering over cards
      const inHandZone = (inVerticalZone && inHorizontalZone) || overCardsArea;

      // Update last known mouse position
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      setMouseInHandZone(inHandZone);

      // Clear any pending cleanup when mouse re-enters zone
      if (inHandZone && hoverCleanupTimeoutRef.current) {
        window.clearTimeout(hoverCleanupTimeoutRef.current);
        hoverCleanupTimeoutRef.current = null;
      }

      // Don't clear based on zone - let overCardsArea handle visibility
      // Zone is just for initial trigger to show the cards
    }
    // Throttle to 30ms (~33fps) to reduce CPU load during drag operations
    const onMove = throttle(onMoveRaw, 30);
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      onMove.cancel();
      if (hoverCleanupTimeoutRef.current) {
        window.clearTimeout(hoverCleanupTimeoutRef.current);
      }
    };
  }, [
    setMouseInHandZone,
    hoveredCardCount,
    setHandHoverCount,
    overCardsArea,
    HAND_ZONE_TOP_FRAC,
    HAND_ZONE_BOTTOM_FRAC,
    HAND_ZONE_LEFT_FRAC,
    HAND_ZONE_RIGHT_FRAC,
  ]);
  useEffect(() => {
    function onTouch(e: TouchEvent) {
      const t = e.touches[0] || e.changedTouches?.[0];
      if (!t) return;
      const h = window.innerHeight || 1;
      const w = window.innerWidth || 1;
      // Vertical: between 80% and 95% of screen height
      const inVerticalZone =
        t.clientY >= h * HAND_ZONE_TOP_FRAC &&
        t.clientY <= h * HAND_ZONE_BOTTOM_FRAC;
      // Horizontal: center 30% of screen
      const inHorizontalZone =
        t.clientX >= w * HAND_ZONE_LEFT_FRAC &&
        t.clientX <= w * HAND_ZONE_RIGHT_FRAC;
      const inHandZone = (inVerticalZone && inHorizontalZone) || overCardsArea;
      lastMousePosRef.current = { x: t.clientX, y: t.clientY };
      setMouseInHandZone(inHandZone);
      if (inHandZone && hoverCleanupTimeoutRef.current) {
        window.clearTimeout(hoverCleanupTimeoutRef.current);
        hoverCleanupTimeoutRef.current = null;
      }
    }
    // Handle touchend to collapse hand when tapping outside hand zone
    // Safari-specific fix: Don't use overCardsArea in the check because
    // Safari doesn't always fire onPointerOut events properly, leaving it stuck
    function onTouchEnd(e: TouchEvent) {
      const t = e.changedTouches?.[0];
      if (!t) return;
      const h = window.innerHeight || 1;
      const w = window.innerWidth || 1;
      // Check if touch ended outside the hand zone (pure coordinate check, no overCardsArea)
      const inVerticalZone =
        t.clientY >= h * HAND_ZONE_TOP_FRAC &&
        t.clientY <= h * HAND_ZONE_BOTTOM_FRAC;
      const inHorizontalZone =
        t.clientX >= w * HAND_ZONE_LEFT_FRAC &&
        t.clientX <= w * HAND_ZONE_RIGHT_FRAC;
      const inHandZone = inVerticalZone && inHorizontalZone;
      // If touch ended outside hand zone, collapse the hand
      if (!inHandZone) {
        setMouseInHandZone(false);
        // Also reset forced visibility mode so hand hides
        setHandVisibilityMode(null);
        // Force clear overCardsArea which may be stuck on Safari
        setOverCardsArea(false);
      }
    }
    window.addEventListener("touchstart", onTouch, {
      passive: true,
    } as AddEventListenerOptions);
    window.addEventListener("touchmove", onTouch, {
      passive: true,
    } as AddEventListenerOptions);
    // Use capture phase to ensure we get the event before Three.js canvas (Safari fix)
    window.addEventListener("touchend", onTouchEnd, {
      passive: true,
      capture: true,
    } as AddEventListenerOptions);
    return () => {
      window.removeEventListener("touchstart", onTouch as EventListener);
      window.removeEventListener("touchmove", onTouch as EventListener);
      // Must match capture: true for proper cleanup
      window.removeEventListener(
        "touchend",
        onTouchEnd as EventListener,
        {
          capture: true,
        } as EventListenerOptions,
      );
    };
  }, [
    setMouseInHandZone,
    setHandVisibilityMode,
    overCardsArea,
    HAND_ZONE_TOP_FRAC,
    HAND_ZONE_BOTTOM_FRAC,
    HAND_ZONE_LEFT_FRAC,
    HAND_ZONE_RIGHT_FRAC,
  ]);

  // Track active touch count for two-finger face-down gesture
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      activeTouchCountRef.current = e.touches.length;
    };
    const onTouchEnd = (e: TouchEvent) => {
      activeTouchCountRef.current = e.touches.length;
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  // Clear local hand drag start when mouse/touch is released anywhere
  useEffect(() => {
    const onUp = (e: MouseEvent | TouchEvent) => {
      handDragStart.current = null;

      // On mobile: if released in return zone, cancel the drag and return card to hand
      if (
        isCoarsePointer &&
        dragFromHand &&
        selected &&
        selected.who === owner
      ) {
        // Safe touch event check
        const isTouchEvent = "changedTouches" in e;
        const clientY = isTouchEvent
          ? ((e as TouchEvent).changedTouches?.[0]?.clientY ??
            lastMousePosRef.current.y)
          : (e as MouseEvent).clientY;
        const hScr = window.innerHeight || 1;
        const inReturnZone = clientY >= hScr - 20;

        if (inReturnZone) {
          // Cancel the drag - card returns to hand
          clearSelection();
          setDragFromHand(false);
          setDragFaceDown(false);
          return;
        }
      }

      // Emergency cleanup for sticky drags - give Board a chance to handle the drop first
      setTimeout(() => {
        // If drag is still active after Board has had time to process, force clear it
        if (dragFromHand && selected && selected.who === owner) {
          console.debug(
            "[Hand3D] Emergency drag cleanup - clearing sticky drag state",
          );
          setDragFromHand(false);
        }
      }, 50); // Short delay to let Board handle legitimate drops first
    };
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setDragFaceDown is a stable Zustand action
  }, [
    dragFromHand,
    selected,
    owner,
    setDragFromHand,
    clearSelection,
    isCoarsePointer,
  ]);

  // Auto-reset "visible" mode when cursor leaves hand area - with delay
  const hideDelayRef = useRef<number | null>(null);
  useEffect(() => {
    if (handVisibilityMode === "visible" && !overCardsArea && !mouseInZone) {
      // Add delay before hiding to prevent finicky behavior
      if (hideDelayRef.current) window.clearTimeout(hideDelayRef.current);
      hideDelayRef.current = window.setTimeout(() => {
        setHandVisibilityMode(null);
        hideDelayRef.current = null;
      }, 150); // 150ms delay before hiding - quick but still prevents accidental hide
    } else if (overCardsArea || mouseInZone) {
      // Cancel pending hide if cursor returns
      if (hideDelayRef.current) {
        window.clearTimeout(hideDelayRef.current);
        hideDelayRef.current = null;
      }
    }
    return () => {
      if (hideDelayRef.current) window.clearTimeout(hideDelayRef.current);
    };
  }, [handVisibilityMode, overCardsArea, mouseInZone, setHandVisibilityMode]);

  // Keep the hand anchored to the camera with less frequent updates
  const boardSize = useGameStore((s) => s.board.size);
  const lastUpdateRef = useRef({ reveal: 0, spread: 0, focus: 0, hover: 0 });
  const lastCameraPosRef = useRef({ x: 0, y: 0, z: 0 });

  useFrame(() => {
    const cam = camera as PerspectiveCamera;
    if (!rootRef.current || !("fov" in cam)) return;

    // Check if camera has moved (board dragging)
    const camPos = cam.position;
    const cameraMoved =
      Math.abs(camPos.x - lastCameraPosRef.current.x) > 0.001 ||
      Math.abs(camPos.y - lastCameraPosRef.current.y) > 0.001 ||
      Math.abs(camPos.z - lastCameraPosRef.current.z) > 0.001;

    if (cameraMoved) {
      lastCameraPosRef.current = { x: camPos.x, y: camPos.y, z: camPos.z };
    }

    // Performance optimization: Skip expensive calculations if hand is stable AND camera hasn't moved
    // Check if all lerps are close to their targets (threshold: 0.01)
    const isEdgePlacementCheck =
      (typeof placement === "string" &&
        (placement === "edgeTop" || placement === "edgeBottom")) ||
      showCardBacks;
    const targetShownCheck = isEdgePlacementCheck
      ? 1
      : overCardsArea || mouseInZone
        ? 1
        : 0;
    const handShouldBeSpreadCheck = isEdgePlacementCheck
      ? true
      : overCardsArea || mouseInZone;
    const spreadTargetCheck = handShouldBeSpreadCheck ? 1 : 0;

    const revealDelta = Math.abs(targetShownCheck - revealLerp.current);
    const spreadDelta = Math.abs(spreadTargetCheck - handSpreadLerp.current);
    const focusDelta = Math.abs(focusTargetRef.current - focusLerpRef.current);
    const hoverTarget =
      hoverTargetRef.current >= 0 ? hoverTargetRef.current : -1;
    const hoverDelta = Math.abs(hoverTarget - hoverLerpRef.current);

    // Skip frame only if animations are stable AND camera is stationary
    const threshold = 0.01;
    if (
      !cameraMoved &&
      revealDelta < threshold &&
      spreadDelta < threshold &&
      focusDelta < threshold &&
      hoverDelta < threshold
    ) {
      // Only update every 4th frame when stable to keep position synchronized
      const last = lastUpdateRef.current;
      const now = performance.now();
      if (now - (last.reveal || 0) < 66) return; // ~60ms = 4 frames at 60fps
      lastUpdateRef.current.reveal = now;
    }

    const dist = HAND_DIST;
    const fov = (cam.fov * Math.PI) / 180;
    const worldH = 2 * Math.tan(fov / 2) * dist;
    const margin = HAND_BOTTOM_MARGIN;

    // Placement model:
    // - If placement prop is provided: use edgeTop/edgeBottom (spectator mode)
    // - If not provided: original overlay behavior
    const hasExplicitPlacement =
      typeof placement === "string" && placement.length > 0;
    // Edge placement for:
    // - Spectators: explicit placement edgeTop/edgeBottom
    // - Players: opponent hand (showCardBacks) implicitly at board edge (upright)
    const isEdgePlacement =
      (hasExplicitPlacement &&
        (placement === "edgeTop" || placement === "edgeBottom")) ||
      (!hasExplicitPlacement && showCardBacks);
    const overlayTop = false; // with implicit edge for opponent, overlay top is no longer used

    const bottomY = -worldH / 2 + margin + CARD_LONG * 0.5 * HAND_CARD_SCALE; // Bottom overlay baseline
    const topY = worldH / 2 - margin - CARD_LONG * 0.5 * HAND_CARD_SCALE; // Top overlay baseline

    // Reveal logic: edge hands always visible; overlay hands show on interaction
    // handVisibilityMode: null = default, "hidden" = force hide, "visible" = force show
    let targetShown: number;
    if (!showCardBacks && castPlacementMode) {
      // Hide hand during cast placement (user is clicking a tile)
      targetShown = 0;
    } else if (
      !showCardBacks &&
      isCoarsePointer &&
      (contextMenu ||
        searchDialog ||
        peekDialog ||
        placementDialog ||
        switchSiteSource ||
        attackTargetChoice ||
        attackChoice ||
        attackConfirm)
    ) {
      // On mobile, collapse hand when any overlay or board-selection prompt is active
      targetShown = 0;
    } else if (!showCardBacks && handVisibilityMode === "hidden") {
      targetShown = 0;
    } else if (!showCardBacks && handVisibilityMode === "visible") {
      targetShown = 1;
    } else if (isEdgePlacement) {
      targetShown = 1;
    } else {
      targetShown = overCardsArea || mouseInZone ? 1 : 0;
    }
    // When dragging from hand, only show hand in a small return zone
    if (!showCardBacks && dragFromHand && selected && selected.who === owner) {
      const hScr = window.innerHeight || 1;
      const DRAG_RETURN_ZONE_PX = 20; // Tiny zone at bottom edge for returning cards
      const inReturnZone =
        lastMousePosRef.current.y >= hScr - DRAG_RETURN_ZONE_PX;
      targetShown = inReturnZone ? 1 : 0;
    }
    // Hide hand completely during any other board drag (permanents, avatars, sites)
    if (!showCardBacks && (boardDragActive || draggingSite)) {
      targetShown = 0;
    }

    // Smooth reveal animation - fast and snappy for responsive feel
    const k = 0.35; // Faster animation for snappy, responsive transitions
    revealLerp.current += (targetShown - revealLerp.current) * k;
    if (Math.abs(targetShown - revealLerp.current) < 0.005)
      revealLerp.current = targetShown;

    // Always keep hand fanned out - no cramped/compact state
    // This removes the finicky "compressed to fanned" transition
    handSpreadLerp.current = 1; // Always spread

    // Push hand further off-screen when force hidden via Space or any dragging
    // Show only ~40px (card titles) when collapsed - hide ~92% of the card
    const normalHiddenOffset = -CARD_LONG * HAND_CARD_SCALE * 1;
    const forceHiddenOffset = -CARD_LONG * HAND_CARD_SCALE * 1.8; // Almost completely off-screen
    const isDraggingFromHand =
      dragFromHand && selected && selected.who === owner;
    // Hide hand during any board drag (permanents, avatars, sites, or from hand)
    const anyDragActive =
      isDraggingFromHand || boardDragActive || Boolean(draggingSite);
    const hiddenOffset =
      handVisibilityMode === "hidden" || anyDragActive
        ? forceHiddenOffset
        : normalHiddenOffset;
    const yOffset = hiddenOffset * (1 - revealLerp.current);

    if (isEdgePlacement) {
      // Board-edge placement (top or bottom relative to viewer)
      const gridHalfH = (boardSize?.h || 4) * TILE_SIZE * 0.5;
      const marginZ = CARD_LONG * HAND_CARD_SCALE * 1.3; // push further back to sit behind table edge
      const edge = gridHalfH + marginZ;
      const topZ = viewerPlayerNumber === 1 ? -edge : edge;
      const bottomZ = viewerPlayerNumber === 1 ? edge : -edge;
      // Decide top vs bottom: explicit placement for spectators; players (implicit edge) place top when showing backs
      const placeTop = hasExplicitPlacement
        ? placement === "edgeTop"
        : showCardBacks;
      const z = placeTop ? topZ : bottomZ;
      const elevateY = 0.2; // slight lift above board
      rootRef.current.position.set(0, elevateY, z);
      // Face the viewing player properly
      const rotation = flatCards
        ? // Commentator mode: both hands should be readable (no flip for lower hand)
          viewerPlayerNumber === 1
          ? 0
          : Math.PI
        : // Player mode / non-commentator spectators: top vs bottom differ
          placeTop
          ? viewerPlayerNumber === 1
            ? 0
            : Math.PI
          : viewerPlayerNumber === 1
            ? Math.PI
            : 0;
      rootRef.current.rotation.set(0, rotation, 0);
    } else {
      // Overlay placement relative to camera (bottom for own, top for opponent when backs)
      rootRef.current.position.copy(cam.position);
      rootRef.current.quaternion.copy(cam.quaternion);
      rootRef.current.translateZ(-dist);
      const overlayY = overlayTop ? topY : bottomY;
      rootRef.current.translateY(overlayY + yOffset);
    }

    // Smooth focus index animation (for cycling)
    {
      const n = sortedHand.length;
      if (n > 0) {
        const clamped = Math.max(0, Math.min(n - 1, focusTargetRef.current));
        focusTargetRef.current = clamped;
        const kf = 0.25; // focus easing
        const prev = focusLerpRef.current;
        focusLerpRef.current += (clamped - focusLerpRef.current) * kf;
        if (Math.abs(focusLerpRef.current - prev) > 0.001) {
          setFocusLerp(focusLerpRef.current);
        }
      } else {
        focusTargetRef.current = 0;
        focusLerpRef.current = 0;
        if (focusLerp !== 0) setFocusLerp(0);
      }
    }

    // Smooth hover index animation (sliding highlight)
    // When collapsed, force no hover so cards don't stick out
    {
      const n = sortedHand.length;
      const target = hoverTargetRef.current;
      const prev = hoverLerpRef.current;
      const kh = 0.3; // hover easing
      // When collapsed (revealLerp < 0.5), don't preserve hover state
      const isCollapsed = revealLerp.current < 0.5;

      // Detect hover changes for arrival animation
      const prevHoverTarget = prevHoverIndexRef.current;
      if (target !== prevHoverTarget && target >= 0) {
        // New card is being hovered - start its arrival animation (up and over)
        cardArrivalRef.current.set(target, 0.01); // Start arrival at 0
        prevHoverIndexRef.current = target;
      } else if (target < 0 && prevHoverTarget >= 0) {
        prevHoverIndexRef.current = -1;
      }

      // Animate per-card arrival states
      // Progress: 0 = starting (behind/below), 1 = fully arrived at hover position
      const animSpeed = 0.08; // Smooth animation speed
      cardArrivalRef.current.forEach((progress, cardIndex) => {
        const isCurrentlyHovered = cardIndex === target;
        if (isCurrentlyHovered && progress < 1) {
          // Animate toward fully arrived
          const newProgress = Math.min(1, progress + animSpeed);
          cardArrivalRef.current.set(cardIndex, newProgress);
        } else if (!isCurrentlyHovered) {
          // No longer hovered - remove tracking (card snaps back)
          cardArrivalRef.current.delete(cardIndex);
        }
      });

      if (n > 0 && target >= 0 && !isCollapsed) {
        const clamped = Math.max(0, Math.min(n - 1, target));
        hoverLerpRef.current += (clamped - hoverLerpRef.current) * kh;
      } else {
        // Animate toward -1 (no hover)
        hoverLerpRef.current += (-1 - hoverLerpRef.current) * kh;
        if (Math.abs(-1 - hoverLerpRef.current) < 0.005)
          hoverLerpRef.current = -1;
      }
      if (Math.abs(hoverLerpRef.current - prev) > 0.001) {
        setHoverLerp(hoverLerpRef.current);
      }
    }
  });

  // Map original hand indices to sorted indices (for selection/hover focus)
  const origToSortedIndex = useMemo(() => {
    const map = new Map<number, number>();
    sortedHand.forEach((card, sortedIdx) => {
      const origIdx = hand.findIndex((c) => c === card);
      if (origIdx !== -1) map.set(origIdx, sortedIdx);
    });
    return map;
  }, [sortedHand, hand]);

  // Get current arrival states for layout calculation (forces re-render when animations are active)
  const [arrivalSnapshot, setArrivalSnapshot] = useState<Map<number, number>>(
    new Map(),
  );
  // Counter to force continuous updates while animating
  const [animationTick, setAnimationTick] = useState(0);

  // Update arrival snapshot continuously while animations are running
  useEffect(() => {
    if (cardArrivalRef.current.size === 0) {
      if (arrivalSnapshot.size > 0) {
        setArrivalSnapshot(new Map());
      }
      return;
    }
    // Continuously re-render while animations are active
    const id = requestAnimationFrame(() => {
      setArrivalSnapshot(new Map(cardArrivalRef.current));
      setAnimationTick((t) => t + 1); // Force next frame
    });
    return () => cancelAnimationFrame(id);
  }, [arrivalSnapshot.size, animationTick]);

  // Unified hand fan layout: all cards in arc - always fanned out
  const handLayout = useMemo(() => {
    const n = sortedHand.length;
    if (n === 0)
      return [] as {
        x: number;
        y: number;
        z: number;
        rot: number;
        scale: number;
        originalIndex: number;
        hoverWeight: number;
        arrivalProgress: number;
      }[];

    // Reduce fan angle when collapsed to make titles more readable
    // revealLerp: 0 = collapsed, 1 = fully revealed
    const revealAmount = revealLerp.current;
    const collapsedAngleMult = 0; // Much tighter fan when collapsed
    const expandedAngleMult = 0.4;
    const angleMult =
      collapsedAngleMult +
      (expandedAngleMult - collapsedAngleMult) * revealAmount;
    const maxAngle = Math.min(
      HAND_MAX_TOTAL_ANGLE * angleMult,
      n * HAND_STEP_MAX * angleMult,
    );

    // Dynamic spacing: show more of each card when few cards, compress when many
    // With 1-4 cards: very wide spacing (almost full card visible)
    // With 5-7 cards: moderate spacing
    // With 8+ cards: tighter spacing but still readable
    const maxSpacing = CARD_SHORT * 1.1; // Almost full card width visible
    const minSpacing = CARD_SHORT * 0.5; // Tighter for large hands
    const spacingFactor = Math.max(0, Math.min(1, (8 - n) / 5)); // 1 at n≤3, 0 at n≥8
    const baseSpacing = minSpacing + (maxSpacing - minSpacing) * spacingFactor;

    const stepAngle = n > 1 ? maxAngle / (n - 1) : 0;
    const startAngle = -maxAngle / 2;

    // Check sort direction for site positioning
    const sitesFirst = graphicsSettings.handSortOrder !== "spellsFirst";

    return new Array(n).fill(0).map((_, i) => {
      // Map sorted index back to original hand index
      const sortedCard = sortedHand[i];
      const originalIndex = hand.findIndex((card) => card === sortedCard);
      const isSelected =
        selected && selected.who === owner && selected.index === originalIndex;
      const isSite = (sortedCard.type || "").toLowerCase().includes("site");

      // Fan angle
      const angle = startAngle + i * stepAngle;
      const rot = angle; // Positive for upward fan

      // Base X position centered for the whole fan
      let baseX = i * baseSpacing - ((n - 1) * baseSpacing) / 2;
      // When sites first: sites are at left (negative x), flip to right edge
      // When spells first: sites are at right (positive x), flip to left edge
      if (isSite && n > 1) {
        const siteOuterOffset = CARD_SHORT * 0.15 * (1 - revealAmount); // Only when collapsed
        baseX += sitesFirst ? -siteOuterOffset : siteOuterOffset;
      }

      // Check if this card has arrival animation (sliding in from side)
      const arrivalProgress = arrivalSnapshot.get(i) ?? 1; // Default to 1 = fully arrived

      // Calculate arrival offsets - card slides in horizontally from the side
      // Progress: 0 = starting position (offset to side), 1 = final position
      let arrivalX = 0;

      if (arrivalProgress < 1) {
        const t = arrivalProgress;
        const slideAmount = CARD_SHORT * 0.3; // How far to slide from

        // Slide in from the side with ease-out
        // Card starts offset and slides to its final position
        const slideEase = 1 - Math.pow(1 - t, 2); // Ease out
        arrivalX = slideAmount * (1 - slideEase);
      }

      const x = baseX + arrivalX;

      // Y position: arc + hover pop-up
      const arcY = -Math.abs(Math.sin(angle)) * HAND_FAN_ARC_Y * 1.5;
      // Focus-based lift without sliding the fan
      // Scale by revealAmount so lift fades when collapsed
      const w = Math.max(0, 1 - Math.abs(i - focusLerp)); // 0..1 focus weight
      const liftFromFocus = CARD_LONG * 0.06 * w * revealAmount;
      // Sliding hover highlight adds extra lift that moves smoothly across cards
      // Scale by revealAmount so hover lift fades when collapsed
      const hoverWeight =
        hoverLerp >= 0
          ? Math.max(0, 1 - Math.abs(i - hoverLerp)) * revealAmount
          : 0;
      // Sites are rotated 90°, lift them when collapsed so top borders align with spells
      // CARD_LONG is the long edge, CARD_SHORT is the short edge
      // Site top needs to align with spell top: lift by half the difference
      const siteCollapsedLift = isSite
        ? (CARD_LONG - CARD_SHORT) * 0.5 * (1 - revealAmount)
        : 0;
      const y =
        arcY +
        liftFromFocus +
        CARD_LONG * 0.08 * hoverWeight +
        siteCollapsedLift;

      // Z position: hovered card on top, stacking down from it on both sides
      // When a card is hovered, it's on top (highest Z)
      // Cards further from the hovered card are lower in the stack
      const currentHoverIndex = hoverLerp >= 0 ? Math.round(hoverLerp) : -1;
      let stackZ: number;
      if (currentHoverIndex >= 0) {
        // Distance from hovered card determines depth
        const distFromHover = Math.abs(i - currentHoverIndex);
        // Hovered card at max Z, others decrease based on distance
        stackZ = (n - distFromHover) * 0.002;
      } else {
        // No hover - use index-based stacking (center on top)
        const distFromCenter = Math.abs(i - (n - 1) / 2);
        stackZ = (n - distFromCenter) * 0.001;
      }
      // Hovered card gets extra forward push
      const hoverForwardZ = hoverWeight * 0.03;
      const z = stackZ + hoverForwardZ;

      // Scale: hovered card slightly bigger with smoother scaling
      const scale = Math.max(
        1 + 0.06 * w * revealAmount,
        1.0 + 0.08 * hoverWeight,
      );

      return {
        x,
        y,
        z,
        // Reduce rotation toward upright for focused cards
        rot: isSelected ? 0 : rot * (1 - 0.6 * Math.max(w, hoverWeight)),
        scale,
        originalIndex,
        hoverWeight,
        arrivalProgress,
      };
    });
  }, [
    sortedHand,
    hand,
    selected,
    owner,
    focusLerp,
    hoverLerp,
    graphicsSettings.handSortOrder,
    arrivalSnapshot,
  ]);

  // Clamp focus to hand size changes
  useEffect(() => {
    const n = sortedHand.length;
    if (n === 0) {
      focusTargetRef.current = 0;
      focusLerpRef.current = 0;
      return;
    }
    const max = n - 1;
    focusTargetRef.current = Math.max(0, Math.min(max, focusTargetRef.current));
    focusLerpRef.current = Math.max(0, Math.min(max, focusLerpRef.current));
  }, [sortedHand.length]);

  // Snap focus to selected card when selection changes
  useEffect(() => {
    if (!sortedHand.length) return;
    if (selected && selected.who === owner) {
      const sorted = origToSortedIndex.get(selected.index);
      if (sorted != null) focusTargetRef.current = sorted;
    }
  }, [selected, owner, sortedHand.length, origToSortedIndex]);

  // When hovering (and not dragging), nudge focus to hovered card
  useEffect(() => {
    if (showCardBacks) return;
    if (!sortedHand.length) return;
    if (!dragFromHand && (!selected || selected.who !== owner)) {
      if (hoveredCard != null) {
        const sorted = origToSortedIndex.get(hoveredCard);
        if (sorted != null) focusTargetRef.current = sorted;
      }
    }
  }, [
    hoveredCard,
    selected,
    owner,
    dragFromHand,
    showCardBacks,
    sortedHand.length,
    origToSortedIndex,
  ]);

  // Track hover target for sliding highlight animation
  useEffect(() => {
    if (showCardBacks) {
      hoverTargetRef.current = -1;
      return;
    }
    if (hoveredCard == null) {
      hoverTargetRef.current = -1;
      return;
    }
    const sorted = origToSortedIndex.get(hoveredCard);
    hoverTargetRef.current = sorted != null ? sorted : -1;
  }, [hoveredCard, origToSortedIndex, showCardBacks]);

  // Input handlers: mouse wheel and arrow keys cycle focus when in hand zone
  useEffect(() => {
    if (showCardBacks) return;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        let el: HTMLElement | null = t;
        while (el && el !== document.body) {
          if (el.getAttribute && el.getAttribute("data-allow-wheel") === "true")
            return;
          el = el.parentElement as HTMLElement | null;
        }
      }
      if (!mouseInZone || dragFromHand || dragFromPile) return;
      if (sortedHand.length === 0) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      const max = sortedHand.length - 1;
      const next = Math.max(0, Math.min(max, focusTargetRef.current + dir));
      focusTargetRef.current = next;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (dragFromHand || dragFromPile) return;
      if (!mouseInZone) return;
      if (sortedHand.length === 0) return;
      const max = sortedHand.length - 1;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        focusTargetRef.current = Math.min(max, focusTargetRef.current + 1);
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        focusTargetRef.current = Math.max(0, focusTargetRef.current - 1);
      }
    };
    const onWheelListener = (e: WheelEvent) => onWheel(e);
    window.addEventListener("wheel", onWheelListener, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", onWheelListener);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    mouseInZone,
    dragFromHand,
    dragFromPile,
    sortedHand.length,
    showCardBacks,
    hand.length,
  ]);

  // Simplified hover handling
  const hoverTimer = useRef<number | null>(null);

  const beginHoverPreview = useCallback(
    (card?: CardRef | null) => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      if (!HAND_PREVIEW_ENABLED) return; // Preview disabled
      if (!card?.slug) return;

      // Use enhanced preview if available, otherwise fall back to legacy
      if (showCardPreview) {
        const preview = cardRefToPreview(card);
        if (preview) {
          showCardPreview(preview);
          return;
        }
      }

      // Fallback to legacy preview system - show immediately for responsive feel
      setPreviewCard(card);
    },
    [setPreviewCard, HAND_PREVIEW_ENABLED, showCardPreview],
  );
  const clearHoverPreview = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    // Use immediate hide if enhanced preview is active, otherwise legacy clear
    if (hideCardPreviewImmediate) {
      hideCardPreviewImmediate();
    } else {
      setPreviewCard(null);
    }
  }, [setPreviewCard, hideCardPreviewImmediate]);

  // Clear preview when any selection changes
  useEffect(() => {
    if (selected || selectedPermanent || selectedAvatar) {
      clearHoverPreview();
    }
  }, [selected, selectedPermanent, selectedAvatar, clearHoverPreview]);

  // Simple state management - no complex cursor selection
  useEffect(() => {
    if (hand.length === 0) {
      setHandHoverCount(0);
      setHoveredCard(null);
      clearHoverPreview();
    }
  }, [hand.length, clearHoverPreview, setHandHoverCount]);

  useEffect(() => {
    if (!dragFromHand && !dragFromPile) {
      // Only clear the drag start ref to prevent ghost drags
      // Don't clear hover state - let user continue browsing after drag
      handDragStart.current = null;
    }
  }, [dragFromHand, dragFromPile]);

  // Additional cleanup: reset hover state when switching players or other major state changes
  useEffect(() => {
    // Reset hover state when the current player changes (for hotseat)
    setHandHoverCount(0);
    setHoveredCard(null);
    // Clear any pending hover cleanup timeout
    if (hoverCleanupTimeoutRef.current) {
      window.clearTimeout(hoverCleanupTimeoutRef.current);
      hoverCleanupTimeoutRef.current = null;
    }
  }, [owner, setHandHoverCount]);

  // Emergency cleanup on drag state changes only
  useEffect(() => {
    // Only force cleanup when drags start from other sources (not when selecting from hand)
    if (dragFromPile || selectedPermanent || selectedAvatar) {
      if (hoveredCardCount > 0) {
        console.debug("[Hand] Emergency cleanup due to game state change");
        setHandHoverCount(0);
        setHoveredCard(null);
      }
    }
  }, [
    dragFromPile,
    selectedPermanent,
    selectedAvatar,
    hoveredCardCount,
    setHandHoverCount,
  ]);

  // Additional failsafe for stuck drag states - no dependencies to prevent re-registration
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      handDragStart.current = null;
      // Don't clear hover states on mouseup - let user continue browsing
      // Note: Don't clear drag states here as it may interfere with Board drop logic
      // Let the Board component be authoritative for clearing drag states after drops
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []); // No dependencies - just cleanup drag start ref

  // Emergency keyboard shortcut to force hand hiding and clear sticky drags
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (hoveredCardCount > 0 || mouseInZone) {
          console.debug("[Hand] Emergency cleanup via Escape key");
          setHandHoverCount(0);
          setHoveredCard(null);
        }

        // Also clear sticky drags with Escape key
        if (dragFromHand && selected && selected.who === owner) {
          console.debug("[Hand] Emergency drag cleanup via Escape key");
          setDragFromHand(false);
        }
        setMouseInHandZone(false);
        setOverCardsArea(false);
        if (hoverCleanupTimeoutRef.current) {
          window.clearTimeout(hoverCleanupTimeoutRef.current);
          hoverCleanupTimeoutRef.current = null;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    hoveredCardCount,
    mouseInZone,
    setHandHoverCount,
    setMouseInHandZone,
    dragFromHand,
    selected,
    owner,
    setDragFromHand,
  ]);

  // Reset aggregated over-cards-area when drags start to avoid stale 'true'
  useEffect(() => {
    if (dragFromHand || dragFromPile) {
      if (handAreaLeaveTimeoutRef.current) {
        window.clearTimeout(handAreaLeaveTimeoutRef.current);
        handAreaLeaveTimeoutRef.current = null;
      }
      setOverCardsArea(false);
      // Clear touch selection when drag starts
      if (isCoarsePointer) {
        setTouchSelectedIndex(null);
      }
    }
  }, [dragFromHand, dragFromPile, isCoarsePointer]);

  // Clear touch selection when tapping outside the hand zone on mobile
  useEffect(() => {
    if (!isCoarsePointer) return;

    const handleTouchOutside = (e: TouchEvent) => {
      // Only handle if we have a touch selection
      if (touchSelectedIndex === null) return;

      const t = e.touches[0];
      if (!t) return;

      const h = window.innerHeight || 1;
      const w = window.innerWidth || 1;

      // Check if touch is outside the hand zone
      const inVerticalZone = t.clientY >= h * HAND_ZONE_TOP_FRAC;
      const inHorizontalZone =
        t.clientX >= w * HAND_ZONE_LEFT_FRAC &&
        t.clientX <= w * HAND_ZONE_RIGHT_FRAC;

      // If touch is outside hand zone, clear selection after a small delay
      // (to allow card tap to be processed first)
      if (!inVerticalZone || !inHorizontalZone) {
        setTimeout(() => {
          setTouchSelectedIndex(null);
          clearHoverPreview();
        }, 100);
      }
    };

    window.addEventListener("touchstart", handleTouchOutside, {
      passive: true,
    });
    return () => window.removeEventListener("touchstart", handleTouchOutside);
  }, [
    isCoarsePointer,
    touchSelectedIndex,
    HAND_ZONE_TOP_FRAC,
    HAND_ZONE_LEFT_FRAC,
    HAND_ZONE_RIGHT_FRAC,
    clearHoverPreview,
  ]);

  // Cleanup on window focus/blur events to handle edge cases
  useEffect(() => {
    const handleBlur = () => {
      if (hoveredCardCount > 0) {
        console.debug("[Hand] Cleanup on window blur");
        setHandHoverCount(0);
        setHoveredCard(null);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && hoveredCardCount > 0) {
        console.debug("[Hand] Cleanup on visibility hidden");
        setHandHoverCount(0);
        setHoveredCard(null);
      }
    };

    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hoveredCardCount, setHandHoverCount]);

  useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      if (hoverCleanupTimeoutRef.current)
        window.clearTimeout(hoverCleanupTimeoutRef.current);
      if (handAreaLeaveTimeoutRef.current)
        window.clearTimeout(handAreaLeaveTimeoutRef.current);
    },
    [],
  );

  // Keyboard/mouse-wheel cycling is enabled; selection still via click/drag

  return (
    <group ref={rootRef}>
      {/* Hand cards use unlit materials, no directional light needed */}
      {/* Unified hand cards in fan */}
      {sortedHand.map((c, i) => {
        const layoutInfo = handLayout[i];
        if (!layoutInfo) return null;

        // Check if we're currently dragging from hand
        const isHandDragActive =
          dragFromHand && selected && selected.who === owner;

        // Handle dragged card visibility for hand returns
        const isDraggedCard =
          selected &&
          selected.card.cardId === c.cardId &&
          dragFromHand &&
          selected.who === owner;

        // When dragging, only render the dragged card (and only in return zone)
        // Skip all other cards to prevent blocking board placement
        if (isHandDragActive && !isDraggedCard) {
          return null; // Don't render non-dragged cards during drag
        }

        if (isDraggedCard) {
          // Use the same tiny return zone for dragged card visibility
          const h = window.innerHeight || 1;
          const DRAG_RETURN_ZONE_PX = 20; // Match the hand visibility zone
          const inDragReturnZone =
            lastMousePosRef.current.y >= h - DRAG_RETURN_ZONE_PX;

          // Show the dragged card only when mouse is in return zone
          if (!inDragReturnZone) {
            return null;
          }
        }

        const {
          x,
          y,
          z,
          rot,
          scale: layoutScale,
          originalIndex,
          hoverWeight,
        } = layoutInfo;
        const isHandDrag = dragFromHand && selected && selected.who === owner;
        const isPileDrag = dragFromHand && dragFromPile && !selected;
        const isDragging = isHandDrag; // Only block interactions for actual hand drags
        const isSite = (c.type || "").toLowerCase().includes("site");

        const baseScale = HAND_CARD_SCALE * (graphicsSettings.handCardScale ?? 1);
        const scale = baseScale * layoutScale;
        // Spells should render on top of sites: sites get lower render order, spells get higher
        // When spells first (sites on right), invert site order so leftmost site overlaps rightmost
        const sitesFirst = graphicsSettings.handSortOrder !== "spellsFirst";
        const baseRenderOrder = showCardBacks ? -5 : isSite ? 1000 : 2000;
        // For sites when on the right side, invert the index so inner sites render on top
        const indexForOrder =
          isSite && !sitesFirst ? sortedHand.length - 1 - i : i;
        const renderOrder = showCardBacks
          ? baseRenderOrder + i
          : hoverWeight > 0.5
            ? 3000
            : baseRenderOrder + indexForOrder;
        const handInstanceKey = `hand:${owner}:${originalIndex}`;
        const remoteHighlightColor = getRemoteHighlightColor(c, {
          instanceKey: handInstanceKey,
        });
        // Magician: when viewing opponent's Magician hand, all cards render upright
        // (no rotation for sites) to hide which cards are sites
        const cardRotationZ = showCardBacks
          ? ownerIsMagician
            ? 0 // Magician: all cards upright to hide site distinction
            : isSite
              ? -Math.PI / 2
              : 0
          : isSite
            ? -rot - Math.PI / 2
            : -rot;
        const glowWidth = CARD_SHORT + 0.25;
        const glowHeight = CARD_LONG + 0.35;
        // Touch-selected card gets a border outline on mobile
        const isTouchSelected =
          isCoarsePointer && touchSelectedIndex === originalIndex;
        return (
          <group
            key={`${c.cardId}-${owner}-${i}`}
            position={[x, y, z]}
            scale={[scale, scale, scale]}
          >
            {/* Touch selection border outline for mobile - tap again to play */}
            {isTouchSelected && !remoteHighlightColor && !showCardBacks && (
              <CardBorder
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={cardRotationZ}
                elevation={0.01}
                color="#22d3ee"
                thickness={0.05}
                renderOrder={renderOrder + 10000 - 3}
              />
            )}
            {/* Remote highlight glow */}
            {remoteHighlightColor ? (
              <CardGlow
                width={glowWidth}
                height={glowHeight}
                rotationZ={cardRotationZ}
                elevation={0}
                color={remoteHighlightColor}
                renderOrder={renderOrder + 10000 - 5}
              />
            ) : null}
            {/* Invisible larger interaction box to ensure cards are always clickable */}
            {/* Disable during drag to prevent blocking board placement */}
            {!showCardBacks && !isDraggedCard && !isDragging && (
              <mesh
                position={[0, 0, 0.05]}
                onPointerOver={(e) => {
                  // Skip hover handling on touch devices - use tap instead
                  if (isCoarsePointer) return;
                  if (isDragging) return; // allow bubbling while dragging
                  e.stopPropagation();

                  // Clear any existing hover timeout
                  if (hoverTimeoutRef.current) {
                    window.clearTimeout(hoverTimeoutRef.current);
                  }

                  // Pointer entered cards area: cancel area leave debounce and mark as over
                  if (handAreaLeaveTimeoutRef.current) {
                    window.clearTimeout(handAreaLeaveTimeoutRef.current);
                    handAreaLeaveTimeoutRef.current = null;
                  }
                  if (!overCardsArea) setOverCardsArea(true);

                  setHandHoverCount(hoveredCardCount + 1);
                  setHoveredCard(originalIndex); // Set the hovered card immediately for responsive feel
                  beginHoverPreview(c);
                }}
                onPointerOut={(e) => {
                  // Skip hover handling on touch devices - use tap instead
                  if (isCoarsePointer) return;
                  if (isDragging) return; // allow bubbling while dragging
                  e.stopPropagation();

                  setHandHoverCount(Math.max(0, hoveredCardCount - 1));

                  // Add small delay before clearing hover to prevent flicker between cards
                  if (hoverTimeoutRef.current) {
                    window.clearTimeout(hoverTimeoutRef.current);
                  }
                  hoverTimeoutRef.current = window.setTimeout(() => {
                    setHoveredCard((prev) =>
                      prev === originalIndex ? null : prev,
                    );
                  }, 30); // Small delay for smooth card-to-card transitions

                  // Debounce leaving the overall cards area so moving between cards doesn't hide the hand
                  if (handAreaLeaveTimeoutRef.current) {
                    window.clearTimeout(handAreaLeaveTimeoutRef.current);
                  }
                  handAreaLeaveTimeoutRef.current = window.setTimeout(() => {
                    setOverCardsArea(false);
                    clearHoverPreview();
                    handAreaLeaveTimeoutRef.current = null;
                  }, 30); // Short debounce - onPointerOver cancels this when moving between cards
                }}
                onContextMenu={(e) => {
                  if (isDragging) return;
                  e.stopPropagation();
                  e.nativeEvent.preventDefault();
                  openContextMenu(
                    {
                      kind: "handCard",
                      who: owner,
                      index: originalIndex,
                      card: c,
                    },
                    { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
                  );
                }}
                onPointerDown={(e) => {
                  if (isDragging) return; // don't start another drag
                  // Only handle left-click for drag; right-click handled by onContextMenu
                  if (e.button !== 0) return;
                  e.stopPropagation();

                  // Check for two-finger touch (face-down gesture)
                  const isTwoFingerTouch =
                    isCoarsePointer && activeTouchCountRef.current >= 2;
                  const shouldPlayFaceDown = isTwoFingerTouch;

                  // On touch devices, track for tap detection (only for single touch)
                  if (isCoarsePointer && !isTwoFingerTouch) {
                    tapStartRef.current = {
                      x: e.clientX,
                      y: e.clientY,
                      time: Date.now(),
                      index: originalIndex,
                    };
                    // Keep hand visible on touch
                    if (!overCardsArea) setOverCardsArea(true);
                  }

                  // Clear preview when starting potential drag
                  clearHoverPreview();

                  // Record potential drag start with face-down flag
                  handDragStart.current = {
                    x: e.clientX,
                    y: e.clientY,
                    time: Date.now(),
                    index: originalIndex,
                    faceDown: shouldPlayFaceDown,
                  };
                }}
                onPointerMove={(e) => {
                  // Start drag only after a tiny hold and some pointer travel
                  if (isHandDrag || isPileDrag) return;
                  const s = handDragStart.current;
                  if (!s || s.index !== originalIndex) return;
                  const held = Date.now() - s.time;
                  const dx = e.clientX - s.x;
                  const dy = e.clientY - s.y;
                  const dist = Math.hypot(dx, dy);
                  const PIX_THRESH = isCoarsePointer ? 12 : 6;

                  if (held >= DRAG_HOLD_MS && dist > PIX_THRESH) {
                    // Start drag - reordering vs playing is determined by where it's dropped
                    selectHandCard(owner, originalIndex);
                    try {
                      playCardSelect();
                    } catch {}
                    // Set face-down flag if right-click or two-finger drag
                    if (s.faceDown) {
                      setDragFaceDown(true);
                    }
                    setDragFromHand(true);
                    clearHoverPreview();
                    setTouchSelectedIndex(null);
                    tapStartRef.current = null;
                  }
                }}
                onPointerUp={(e) => {
                  // Mobile tap-to-select handling
                  if (!isCoarsePointer) return;
                  const tap = tapStartRef.current;
                  tapStartRef.current = null;
                  if (!tap || tap.index !== originalIndex) return;

                  const dx = e.clientX - tap.x;
                  const dy = e.clientY - tap.y;
                  const dist = Math.hypot(dx, dy);
                  const duration = Date.now() - tap.time;

                  // Check if this was a tap (not a drag)
                  if (dist < TAP_THRESHOLD_PX && duration < TAP_THRESHOLD_MS) {
                    e.stopPropagation();

                    // If this card is already touch-selected, start drag
                    if (touchSelectedIndex === originalIndex) {
                      // Second tap on same card = select and start drag mode
                      selectHandCard(owner, originalIndex);
                      try {
                        playCardSelect();
                      } catch {}
                      setDragFromHand(true);
                      setTouchSelectedIndex(null);
                    } else {
                      // First tap = select this card and show preview
                      setTouchSelectedIndex(originalIndex);
                      setHoveredCard(originalIndex);
                      focusTargetRef.current = i; // Focus on this card in fan
                      beginHoverPreview(c);
                      try {
                        playCardSelect();
                      } catch {}
                    }
                  }
                }}
              >
                <boxGeometry
                  args={[
                    CARD_SHORT * 1.1, // Modest interaction area - reduce collision
                    CARD_LONG * 1.1,
                    0.01,
                  ]}
                />
                <meshBasicMaterial
                  transparent
                  opacity={0}
                  depthWrite={false}
                  depthTest={false}
                />{" "}
                {/* Invisible */}
              </mesh>
            )}

            <group>
              {usePreset && ownerCardbacks.preset ? (
                <MaterialCardBack
                  presetId={ownerCardbacks.preset}
                  width={CARD_SHORT}
                  height={CARD_LONG}
                  rotationZ={cardRotationZ}
                  elevation={0.002 + 0.018 * (hoverWeight || 0)}
                  interactive={false}
                  depthWrite={true}
                  castShadow={false} // Hand cards should not cast shadows on the board
                />
              ) : (
                <CardPlane
                  slug={showCardBacks ? "" : c.slug || ""}
                  width={CARD_SHORT}
                  height={CARD_LONG}
                  rotationZ={cardRotationZ}
                  upright={!flatCards}
                  depthWrite={showCardBacks} // Opponent hand: proper depth; Own hand: overlay on top
                  depthTest={showCardBacks} // Opponent hand: proper depth; Own hand: overlay on top
                  renderOrder={
                    showCardBacks ? renderOrder : renderOrder + 10000
                  } // Own hand needs high renderOrder
                  interactive={!isDragging && !showCardBacks}
                  elevation={0.002 + 0.018 * (hoverWeight || 0)}
                  lit={false} // Unlit material - completely isolated from scene lighting
                  castShadow={false}
                  receiveShadow={false}
                  opacity={isDraggedCard ? 0.6 : showCardBacks ? 1 : 0.9999} // Opponent: solid; Own: slightly < 1 for renderOrder
                  textureUrl={
                    showCardBacks
                      ? ownerIsMagician
                        ? cardbackSpellbookUrl() // Magician: all cards look like spellbook cards
                        : isSite
                          ? (ownerCardbacks?.atlas ?? cardbackAtlasUrl())
                          : (ownerCardbacks?.spellbook ??
                            cardbackSpellbookUrl())
                      : undefined
                  }
                  forceTextureUrl={showCardBacks}
                />
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}
