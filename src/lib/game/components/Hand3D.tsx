"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Group, PerspectiveCamera } from "three";
import { useSound } from "@/lib/contexts/SoundContext";
import { cardRefToPreview } from "@/lib/game/card-preview.types";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import CardGlow from "@/lib/game/components/CardGlow";
import CardPlane from "@/lib/game/components/CardPlane";
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

export interface Hand3DProps {
  matW: number;
  matH: number;
  owner?: PlayerKey; // default: p1 (bottom)
  showCardBacks?: boolean; // if true, render card backs instead of card faces
  viewerPlayerNumber?: number | null; // 1 or 2, for positioning opponent hands
  // Optional placement override. When set to 'edgeTop'/'edgeBottom', the hand is placed along the board edge
  // regardless of showCardBacks; when omitted, placement falls back to overlayBottom for faces and edge for backs.
  placement?: 'overlayBottom' | 'edgeTop' | 'edgeBottom';
  // When true, render cards flat on the board (used for commentator mode)
  flatCards?: boolean;
  // Enhanced preview functions (optional for compatibility)
  showCardPreview?: (card: CardPreviewData) => void;
  hideCardPreview?: () => void;
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
  hideCardPreview 
}: Hand3DProps) {
  // Intentionally unused after layout refactor; keep signature stable
  void _matW;
  void _matH;
  const zones = useGameStore((s) => s.zones);
  const selected = useGameStore((s) => s.selectedCard);
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const selectedAvatar = useGameStore((s) => s.selectedAvatar);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const dragFromPile = useGameStore((s) => s.dragFromPile);
  const setMouseInHandZone = useGameStore((s) => s.setMouseInHandZone);
  const setHandHoverCount = useGameStore((s) => s.setHandHoverCount);
  const getRemoteHighlightColor = useGameStore((s) => s.getRemoteHighlightColor);
  const { playCardSelect } = useSound();

  const hand = useMemo(() => zones?.[owner]?.hand ?? [], [zones, owner]);
  
  // Sort hand with sites first, then spells
  const sortedHand = useMemo(() => {
    return [...hand].sort((a, b) => {
      const aIsSite = (a.type || "").toLowerCase().includes("site");
      const bIsSite = (b.type || "").toLowerCase().includes("site");

      if (aIsSite && !bIsSite) return -1; // a (site) comes before b (spell)
      if (!aIsSite && bIsSite) return 1; // b (site) comes before a (spell)
      return 0; // maintain relative order within same type
    });
  }, [hand]);
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
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);

  useEffect(() => {
    try {
      const m = window.matchMedia("(pointer: coarse)");
      setIsCoarsePointer(m.matches);
      const handler = (e: MediaQueryListEvent) => setIsCoarsePointer(e.matches);
      if (typeof m.addEventListener === "function") {
        m.addEventListener("change", handler);
        return () => m.removeEventListener("change", handler);
      } else {
        const anyM = m as unknown as {
          addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
          removeListener?: (cb: (e: MediaQueryListEvent) => void) => void;
        };
        anyM.addListener?.(handler);
        return () => anyM.removeListener?.(handler);
      }
    } catch {
      return;
    }
  }, []);

  // Hand cycling: focus index target and smoothed value
  const focusTargetRef = useRef(0);
  const focusLerpRef = useRef(0);
  const [focusLerp, setFocusLerp] = useState(0);

  // Sliding hover highlight index
  const hoverTargetRef = useRef(-1);
  const hoverLerpRef = useRef(-1);
  const [hoverLerp, setHoverLerp] = useState(-1);

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
  } | null>(null);
  const revealLerp = useRef(1); // 0 hidden .. 1 shown

  // Timeout ref for delayed hover cleanup
  const hoverCleanupTimeoutRef = useRef<number | null>(null);
  // Track last mouse position
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hand zone: portion of the screen height from the bottom that counts as "in hand zone"
  // Higher value = smaller zone (cursor must be closer to bottom)
  const HAND_ZONE_TOP_FRAC = 0.75; // Changed from 0.85 to 0.75 for more generous 25% zone

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const h = window.innerHeight || 1;
      const inBottomZone = e.clientY >= h * HAND_ZONE_TOP_FRAC;

      // Use original restrictive zone for hand visibility
      // Only use overCardsArea or bottom zone for hand showing
      const inHandZone = inBottomZone || overCardsArea;

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
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (hoverCleanupTimeoutRef.current) {
        window.clearTimeout(hoverCleanupTimeoutRef.current);
      }
    };
  }, [setMouseInHandZone, hoveredCardCount, setHandHoverCount, overCardsArea]);
  useEffect(() => {
    function onTouch(e: TouchEvent) {
      const t = e.touches[0] || e.changedTouches?.[0];
      if (!t) return;
      const h = window.innerHeight || 1;
      const inBottomZone = t.clientY >= h * HAND_ZONE_TOP_FRAC;
      const inHandZone = inBottomZone || overCardsArea;
      lastMousePosRef.current = { x: t.clientX, y: t.clientY };
      setMouseInHandZone(inHandZone);
      if (inHandZone && hoverCleanupTimeoutRef.current) {
        window.clearTimeout(hoverCleanupTimeoutRef.current);
        hoverCleanupTimeoutRef.current = null;
      }
    }
    window.addEventListener("touchstart", onTouch, { passive: true } as AddEventListenerOptions);
    window.addEventListener("touchmove", onTouch, { passive: true } as AddEventListenerOptions);
    return () => {
      window.removeEventListener("touchstart", onTouch as EventListener);
      window.removeEventListener("touchmove", onTouch as EventListener);
    };
  }, [setMouseInHandZone, overCardsArea]);
  // Clear local hand drag start when mouse is released anywhere
  useEffect(() => {
    const onUp = () => {
      handDragStart.current = null;

      // Emergency cleanup for sticky drags - give Board a chance to handle the drop first
      setTimeout(() => {
        // If drag is still active after Board has had time to process, force clear it
        if (dragFromHand && selected && selected.who === owner) {
          console.debug('[Hand3D] Emergency drag cleanup - clearing sticky drag state');
          setDragFromHand(false);
        }
      }, 50); // Short delay to let Board handle legitimate drops first
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragFromHand, selected, owner, setDragFromHand]);
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
    const isEdgePlacementCheck = (typeof placement === 'string' && (placement === 'edgeTop' || placement === 'edgeBottom')) || showCardBacks;
    const targetShownCheck = isEdgePlacementCheck ? 1 : (overCardsArea || mouseInZone) ? 1 : 0;
    const handShouldBeSpreadCheck = isEdgePlacementCheck ? true : (overCardsArea || mouseInZone);
    const spreadTargetCheck = handShouldBeSpreadCheck ? 1 : 0;

    const revealDelta = Math.abs(targetShownCheck - revealLerp.current);
    const spreadDelta = Math.abs(spreadTargetCheck - handSpreadLerp.current);
    const focusDelta = Math.abs(focusTargetRef.current - focusLerpRef.current);
    const hoverTarget = hoverTargetRef.current >= 0 ? hoverTargetRef.current : -1;
    const hoverDelta = Math.abs(hoverTarget - hoverLerpRef.current);

    // Skip frame only if animations are stable AND camera is stationary
    const threshold = 0.01;
    if (!cameraMoved && revealDelta < threshold && spreadDelta < threshold && focusDelta < threshold && hoverDelta < threshold) {
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
    const hasExplicitPlacement = typeof placement === 'string' && placement.length > 0;
    // Edge placement for:
    // - Spectators: explicit placement edgeTop/edgeBottom
    // - Players: opponent hand (showCardBacks) implicitly at board edge (upright)
    const isEdgePlacement = (hasExplicitPlacement && (placement === 'edgeTop' || placement === 'edgeBottom')) || (!hasExplicitPlacement && showCardBacks);
    const overlayTop = false; // with implicit edge for opponent, overlay top is no longer used

    const bottomY = -worldH / 2 + margin + CARD_LONG * 0.5 * HAND_CARD_SCALE; // Bottom overlay baseline
    const topY = worldH / 2 - margin - CARD_LONG * 0.5 * HAND_CARD_SCALE; // Top overlay baseline

    // Reveal logic: edge hands always visible; overlay hands show on interaction
    let targetShown = isEdgePlacement ? 1 : (overCardsArea || mouseInZone) ? 1 : 0;
    if (!showCardBacks && isCoarsePointer) {
      if (dragFromHand && selected && selected.who === owner) {
        const hScr = window.innerHeight || 1;
        const inReturnZone = lastMousePosRef.current.y >= hScr * 0.7;
        targetShown = inReturnZone ? 1 : 0;
      }
    }

    // Always use smooth reveal logic - allow hand to stay visible during drags for card returns
    const k = 0.35; // Increased from 0.25 for even more responsive hand reveal animation
    revealLerp.current += (targetShown - revealLerp.current) * k;
    if (Math.abs(targetShown - revealLerp.current) < 0.005)
      revealLerp.current = targetShown;

    // Smooth hand spread animation
    const handShouldBeSpread = isEdgePlacement
      ? true // Edge hands always spread for visibility
      : (overCardsArea || mouseInZone); // Overlay hand spreads when interacted with
    const spreadTarget = handShouldBeSpread ? 1 : 0;
    const spreadK = 0.25; // Smooth easing for hand spread
    handSpreadLerp.current += (spreadTarget - handSpreadLerp.current) * spreadK;
    if (Math.abs(spreadTarget - handSpreadLerp.current) < 0.005)
      handSpreadLerp.current = spreadTarget;

    const hiddenOffset = -CARD_LONG * HAND_CARD_SCALE * 0.8;
    const yOffset = hiddenOffset * (1 - revealLerp.current);

    if (isEdgePlacement) {
      // Board-edge placement (top or bottom relative to viewer)
      const gridHalfH = (boardSize?.h || 4) * TILE_SIZE * 0.5;
      const marginZ = CARD_LONG * HAND_CARD_SCALE * 0.65; // keep comfortably outside grid
      const edge = gridHalfH + marginZ;
      const topZ = (viewerPlayerNumber === 1 ? -edge : edge);
      const bottomZ = (viewerPlayerNumber === 1 ? edge : -edge);
      // Decide top vs bottom: explicit placement for spectators; players (implicit edge) place top when showing backs
      const placeTop = hasExplicitPlacement ? (placement === 'edgeTop') : showCardBacks;
      const z = placeTop ? topZ : bottomZ;
      const elevateY = 0.2; // slight lift above board
      rootRef.current.position.set(0, elevateY, z);
      // Face the viewing player properly
      const rotation = flatCards
        // Commentator mode: both hands should be readable (no flip for lower hand)
        ? (viewerPlayerNumber === 1 ? 0 : Math.PI)
        // Player mode / non-commentator spectators: top vs bottom differ
        : (placeTop ? (viewerPlayerNumber === 1 ? 0 : Math.PI) : (viewerPlayerNumber === 1 ? Math.PI : 0));
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
    {
      const n = sortedHand.length;
      const target = hoverTargetRef.current;
      const prev = hoverLerpRef.current;
      const kh = 0.3; // hover easing
      if (n > 0 && target >= 0) {
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

  // Unified hand fan layout: all cards in arc
  const handLayout = useMemo(() => {
    const n = sortedHand.length;
    if (n === 0)
      return [] as {
        x: number;
        y: number;
        rot: number;
        scale: number;
        originalIndex: number;
        hoverWeight: number;
      }[];

    // Much gentler fan angle for wider spread
    const maxAngleWhenShown = Math.min(
      HAND_MAX_TOTAL_ANGLE * 0.4,
      n * HAND_STEP_MAX * 0.3
    );
    const maxAngleWhenHidden = Math.min(
      HAND_MAX_TOTAL_ANGLE * 0.2,
      n * HAND_STEP_MAX * 0.15
    );
    const maxAngle =
      maxAngleWhenHidden +
      (maxAngleWhenShown - maxAngleWhenHidden) * handSpreadLerp.current;

    // Much wider spacing for proper fan
    const baseSpacingWhenShown = CARD_SHORT * 0.8;
    const baseSpacingWhenHidden = CARD_SHORT * 0.6;
    const baseSpacing =
      baseSpacingWhenHidden +
      (baseSpacingWhenShown - baseSpacingWhenHidden) * handSpreadLerp.current;

    const stepAngle = n > 1 ? maxAngle / (n - 1) : 0;
    const startAngle = -maxAngle / 2;

    return new Array(n).fill(0).map((_, i) => {
      // Map sorted index back to original hand index
      const sortedCard = sortedHand[i];
      const originalIndex = hand.findIndex((card) => card === sortedCard);
      const isSelected =
        selected && selected.who === owner && selected.index === originalIndex;

      // Fan angle
      const angle = startAngle + i * stepAngle;
      const rot = angle; // Positive for upward fan

      // X position centered for the whole fan (do not slide the entire fan)
      const x = i * baseSpacing - ((n - 1) * baseSpacing) / 2;

      // Y position: smooth interpolated arc + hover pop-up
      const arcMultiplierWhenShown = 1.5;
      const arcMultiplierWhenHidden = 1.0;
      const arcMultiplier =
        arcMultiplierWhenHidden +
        (arcMultiplierWhenShown - arcMultiplierWhenHidden) *
          handSpreadLerp.current;
      const arcY = -Math.abs(Math.sin(angle)) * HAND_FAN_ARC_Y * arcMultiplier;
      // Focus-based lift without sliding the fan
      const w = Math.max(0, 1 - Math.abs(i - focusLerp)); // 0..1 focus weight
      const liftFromFocus = CARD_LONG * 0.06 * w;
      // Sliding hover highlight adds extra lift that moves smoothly across cards
      const hoverWeight = hoverLerp >= 0 ? Math.max(0, 1 - Math.abs(i - hoverLerp)) : 0;
      const y = arcY + liftFromFocus + CARD_LONG * 0.08 * hoverWeight;

      // Scale: hovered card slightly bigger with smoother scaling
      const scale = Math.max(1 + 0.06 * w, 1.0 + 0.08 * hoverWeight);

      return {
        x,
        y,
        // Reduce rotation toward upright for focused cards
        rot: isSelected ? 0 : rot * (1 - 0.6 * Math.max(w, hoverWeight)),
        scale,
        originalIndex,
        hoverWeight,
      };
    });
  }, [sortedHand, hand, selected, owner, focusLerp, hoverLerp]);

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
  }, [hoveredCard, selected, owner, dragFromHand, showCardBacks, sortedHand.length, origToSortedIndex]);

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
          if (el.getAttribute && el.getAttribute("data-allow-wheel") === "true") return;
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
  }, [mouseInZone, dragFromHand, dragFromPile, sortedHand.length, showCardBacks, hand.length]);

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

      // Fallback to legacy preview system when enhanced preview unavailable or conversion failed
      hoverTimer.current = window.setTimeout(() => setPreviewCard(card), 400);
    },
    [setPreviewCard, HAND_PREVIEW_ENABLED, showCardPreview]
  );
  const clearHoverPreview = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;

    // Use enhanced preview if available, otherwise fall back to legacy
    if (hideCardPreview) {
      hideCardPreview();
    } else {
      setPreviewCard(null);
    }
  }, [setPreviewCard, hideCardPreview]);

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
    if (
      dragFromPile ||
      selectedPermanent ||
      selectedAvatar
    ) {
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
  }, [hoveredCardCount, mouseInZone, setHandHoverCount, setMouseInHandZone, dragFromHand, selected, owner, setDragFromHand]);

  // Reset aggregated over-cards-area when drags start to avoid stale 'true'
  useEffect(() => {
    if (dragFromHand || dragFromPile) {
      if (handAreaLeaveTimeoutRef.current) {
        window.clearTimeout(handAreaLeaveTimeoutRef.current);
        handAreaLeaveTimeoutRef.current = null;
      }
      setOverCardsArea(false);
    }
  }, [dragFromHand, dragFromPile]);

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
    []
  );

  // Keyboard/mouse-wheel cycling is enabled; selection still via click/drag

  return (
    <group ref={rootRef}>
      {/* Unified hand cards in fan */}
      {sortedHand.map((c, i) => {
        const layoutInfo = handLayout[i];
        if (!layoutInfo) return null;

        // Handle dragged card visibility for hand returns
        const isDraggedCard = selected && selected.card.cardId === c.cardId && dragFromHand && selected.who === owner;
        if (isDraggedCard) {
          // Use a slightly more generous zone for dragged card reappearance than for hand visibility
          const h = window.innerHeight || 1;
          const dragReturnZone = 0.7; // More generous than HAND_ZONE_TOP_FRAC (0.75) but not too much
          const inDragReturnZone = lastMousePosRef.current.y >= h * dragReturnZone;

          // Show the dragged card when mouse is in return zone or over cards area
          if (!inDragReturnZone && !overCardsArea) {
            return null;
          }
        }

        const { x, y, rot, scale: layoutScale, originalIndex, hoverWeight } = layoutInfo;
        const isHandDrag = dragFromHand && selected && selected.who === owner;
        const isPileDrag = dragFromHand && dragFromPile && !selected;
        const isDragging = isHandDrag; // Only block interactions for actual hand drags
        const isSite = (c.type || "").toLowerCase().includes("site");

        const baseScale = HAND_CARD_SCALE;
        const scale = baseScale * layoutScale;
        // Spells should render on top of sites: sites get lower render order, spells get higher
        const baseRenderOrder = showCardBacks ? -5 : (isSite ? 1000 : 2000);
        const renderOrder = showCardBacks
          ? baseRenderOrder + i
          : hoverWeight > 0.5
          ? 3000
          : baseRenderOrder + i;
        const handInstanceKey = `hand:${owner}:${originalIndex}`;
        const remoteHighlightColor = getRemoteHighlightColor(c, {
          instanceKey: handInstanceKey,
        });
        const cardRotationZ = showCardBacks ? (isSite ? -Math.PI / 2 : 0) : (isSite ? -rot - Math.PI / 2 : -rot);
        const glowWidth = CARD_SHORT + 0.25;
        const glowHeight = CARD_LONG + 0.35;
        return (
          <group
            key={`${c.cardId}-${owner}-${i}`}
            position={[x, y, i * 0.001]}
            scale={[scale, scale, scale]}
          >
            {remoteHighlightColor ? (
              <CardGlow
                width={glowWidth}
                height={glowHeight}
                rotationZ={cardRotationZ}
                elevation={0}
                color={remoteHighlightColor}
                renderOrder={renderOrder - 5}
              />
            ) : null}
            {/* Invisible larger interaction box to ensure cards are always clickable */}
            {!showCardBacks && !isDraggedCard && (
              <mesh
                position={[0, 0, 0.01]}
                onPointerOver={(e) => {
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
                  if (isDragging) return; // allow bubbling while dragging
                  e.stopPropagation();

                  setHandHoverCount(Math.max(0, hoveredCardCount - 1));

                  // Add small delay before clearing hover to prevent flicker between cards
                  if (hoverTimeoutRef.current) {
                    window.clearTimeout(hoverTimeoutRef.current);
                  }
                  hoverTimeoutRef.current = window.setTimeout(() => {
                    setHoveredCard((prev) =>
                      prev === originalIndex ? null : prev
                    );
                  }, 30); // Reduced to 30ms delay for more responsive transitions

                  // Debounce leaving the overall cards area so moving between cards doesn't hide the hand
                  if (handAreaLeaveTimeoutRef.current) {
                    window.clearTimeout(handAreaLeaveTimeoutRef.current);
                  }
                  handAreaLeaveTimeoutRef.current = window.setTimeout(() => {
                    setOverCardsArea(false);
                    handAreaLeaveTimeoutRef.current = null;
                  }, 80); // Quick hiding timeout for snappy response

                  clearHoverPreview();
                }}
                onPointerDown={(e) => {
                  if (isDragging) return; // don't start another drag
                  if (e.button !== 0) return;
                  e.stopPropagation();

                  // Clear preview when starting potential drag
                  clearHoverPreview();

                  // Record potential drag start (no selection needed)
                  handDragStart.current = {
                    x: e.clientX,
                    y: e.clientY,
                    time: Date.now(),
                    index: originalIndex,
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
                  const PIX_THRESH = 6; // pixels - reduced for more responsive drag initiation
                  if (held >= DRAG_HOLD_MS && dist > PIX_THRESH) {
                    // Select the card only when drag actually starts
                    selectHandCard(owner, originalIndex);
                    try { playCardSelect(); } catch {}
                    setDragFromHand(true);
                    // Clear preview when drag starts
                    clearHoverPreview();
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
                <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} /> {/* Invisible */}
              </mesh>
            )}

            <group>
              <CardPlane
                slug={showCardBacks ? "" : (c.slug || "")}
                width={CARD_SHORT}
                height={CARD_LONG}
                rotationZ={cardRotationZ}
                upright={!flatCards}
                depthWrite={showCardBacks ? true : false}
                depthTest={showCardBacks ? true : false}
                renderOrder={renderOrder}
                interactive={!isDragging && !showCardBacks}
                elevation={0.002 + 0.018 * (hoverWeight || 0)}
                textureUrl={showCardBacks ? (isSite ? "/api/assets/cardback_atlas.png" : "/api/assets/cardback_spellbook.png") : undefined}
                forceTextureUrl={showCardBacks}
                opacity={isDraggedCard ? 0.6 : 1.0} // Make dragged card semi-transparent when shown for return
              />
            </group>
          </group>
        );
      })}
    </group>
  );
}
