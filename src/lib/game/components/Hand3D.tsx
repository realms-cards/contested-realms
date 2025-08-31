"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import CardPlane from "@/lib/game/components/CardPlane";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PlayerKey } from "@/lib/game/store";
import {
  CARD_LONG,
  CARD_SHORT,
  HAND_DIST,
  HAND_BOTTOM_MARGIN,
  HAND_MAX_TOTAL_ANGLE,
  HAND_STEP_MAX,
  HAND_FAN_ARC_Y,
  HAND_CARD_SCALE,
} from "@/lib/game/constants";
import { DRAG_HOLD_MS } from "@/lib/game/constants";
import type { Group, PerspectiveCamera } from "three";

export interface Hand3DProps {
  matW: number;
  matH: number;
  owner?: PlayerKey; // default: p1 (bottom)
}

export default function Hand3D({ owner = "p1" }: Hand3DProps) {
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

  const hand = zones[owner].hand || [];
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
  // Aggressive cleanup interval to prevent stuck states
  const forceCleanupIntervalRef = useRef<number | null>(null);
  // Track last mouse position for stuck state detection
  const lastMousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const h = window.innerHeight || 1;
      const inZone = e.clientY >= h * 0.75;

      // Update last known mouse position
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      setMouseInHandZone(inZone);

      // Clear any pending cleanup when mouse re-enters zone
      if (inZone && hoverCleanupTimeoutRef.current) {
        window.clearTimeout(hoverCleanupTimeoutRef.current);
        hoverCleanupTimeoutRef.current = null;
      }

      // Schedule hover count reset when mouse leaves hand zone
      // Small delay to prevent flicker when moving between cards
      if (!inZone && hoveredCardCount > 0) {
        if (hoverCleanupTimeoutRef.current) {
          window.clearTimeout(hoverCleanupTimeoutRef.current);
        }
        hoverCleanupTimeoutRef.current = window.setTimeout(() => {
          setHandHoverCount(0);
          setHoveredCard(null);
          hoverCleanupTimeoutRef.current = null;
        }, 100); // 100ms grace period
      }
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (hoverCleanupTimeoutRef.current) {
        window.clearTimeout(hoverCleanupTimeoutRef.current);
      }
    };
  }, [setMouseInHandZone, hoveredCardCount, setHandHoverCount]);
  // Clear local hand drag start when mouse is released anywhere
  useEffect(() => {
    const onUp = () => {
      handDragStart.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);
  // Keep the hand anchored to the camera with less frequent updates
  useFrame(() => {
    const cam = camera as PerspectiveCamera;
    if (!rootRef.current || !("fov" in cam)) return;

    const dist = HAND_DIST;
    const fov = (cam.fov * Math.PI) / 180;
    const worldH = 2 * Math.tan(fov / 2) * dist;
    const margin = HAND_BOTTOM_MARGIN;
    const bottomY = -worldH / 2 + margin + CARD_LONG * 0.5 * HAND_CARD_SCALE;

    // Smart visibility logic - distinguish between hand drags and pile drags
    const isHandDrag = dragFromHand && selected && selected.who === owner; // Hand card being dragged
    const targetShown =
      !isHandDrag && (mouseInZone || hoveredCardCount > 0) ? 1 : 0;

    if (isHandDrag) {
      revealLerp.current = 0; // Collapse for hand drags
    } else {
      const k = 0.35; // Increased from 0.25 for even more responsive hand reveal animation
      revealLerp.current += (targetShown - revealLerp.current) * k;
      if (Math.abs(targetShown - revealLerp.current) < 0.005)
        revealLerp.current = targetShown;
    }

    // Smooth hand spread animation
    const handShouldBeSpread = mouseInZone || hoveredCardCount > 0;
    const spreadTarget = handShouldBeSpread ? 1 : 0;
    const spreadK = 0.25; // Smooth easing for hand spread
    handSpreadLerp.current += (spreadTarget - handSpreadLerp.current) * spreadK;
    if (Math.abs(spreadTarget - handSpreadLerp.current) < 0.005)
      handSpreadLerp.current = spreadTarget;

    const hiddenOffset = -CARD_LONG * HAND_CARD_SCALE * 0.8;
    const yOffset = hiddenOffset * (1 - revealLerp.current);

    rootRef.current.position.copy(cam.position);
    rootRef.current.quaternion.copy(cam.quaternion);
    rootRef.current.translateZ(-dist);
    rootRef.current.translateY(bottomY + yOffset);
  });

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
      const isHovered = originalIndex === hoveredCard;
      const isSelected =
        selected && selected.who === owner && selected.index === originalIndex;

      // Fan angle
      const angle = startAngle + i * stepAngle;
      const rot = angle; // Positive for upward fan

      // X position with dynamic spacing away from hovered card
      const x = i * baseSpacing - ((n - 1) * baseSpacing) / 2;

      // Y position: smooth interpolated arc + hover pop-up
      const arcMultiplierWhenShown = 1.5;
      const arcMultiplierWhenHidden = 1.0;
      const arcMultiplier =
        arcMultiplierWhenHidden +
        (arcMultiplierWhenShown - arcMultiplierWhenHidden) *
          handSpreadLerp.current;
      const arcY = -Math.abs(Math.sin(angle)) * HAND_FAN_ARC_Y * arcMultiplier;
      const y = isHovered ? arcY + CARD_LONG * 0.08 : arcY;

      // Scale: hovered card slightly bigger with smoother scaling
      const scale = isHovered ? 1.08 : 1.0;

      return {
        x,
        y,
        rot: isSelected || isHovered ? 0 : rot,
        scale,
        originalIndex,
      };
    });
  }, [sortedHand, hand, hoveredCard, selected, owner]);

  // Simplified hover handling
  const hoverTimer = useRef<number | null>(null);

  const beginHoverPreview = useCallback(
    (card?: CardRef | null) => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
      if (!card?.slug) return;
      hoverTimer.current = window.setTimeout(() => setPreviewCard(card), 400); // Reduced from 600ms for more responsive preview
    },
    [setPreviewCard]
  );
  const clearHoverPreview = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPreviewCard(null);
  }, [setPreviewCard]);

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
      // Reset hover state when dragging stops to prevent sticking
      setHoveredCard(null);
      // Also clear the drag start ref to prevent ghost drags
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

  // Emergency cleanup on any significant game state change
  useEffect(() => {
    // Force cleanup when drags start, selections change, or other major state shifts occur
    if (
      dragFromHand ||
      dragFromPile ||
      selected ||
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
    dragFromHand,
    dragFromPile,
    selected,
    selectedPermanent,
    selectedAvatar,
    hoveredCardCount,
    setHandHoverCount,
  ]);

  // Additional failsafe for stuck drag states - no dependencies to prevent re-registration
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      handDragStart.current = null;
      setHoveredCard(null);
      setHandHoverCount(0); // Reset hover count on global mouse up
      // Note: Don't clear drag states here as it may interfere with Board drop logic
      // Let the Board component be authoritative for clearing drag states after drops
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [setHandHoverCount]); // Include setHandHoverCount dependency

  // Aggressive periodic cleanup to prevent stuck states
  useEffect(() => {
    forceCleanupIntervalRef.current = window.setInterval(() => {
      // If we have hover count but mouse is clearly not in hand zone, force reset
      if (hoveredCardCount > 0 && !mouseInZone) {
        // Double-check using last known mouse position
        const h = window.innerHeight || 1;
        const lastY = lastMousePosRef.current.y;
        const isActuallyInZone = lastY >= h * 0.75;

        if (!isActuallyInZone || lastY === 0) {
          console.debug("[Hand] Force cleaning stuck hover state", {
            lastY,
            threshold: h * 0.75,
            hoveredCardCount,
          });
          setHandHoverCount(0);
          setHoveredCard(null);
          if (hoverCleanupTimeoutRef.current) {
            window.clearTimeout(hoverCleanupTimeoutRef.current);
            hoverCleanupTimeoutRef.current = null;
          }
        }
      }
    }, 500); // Check every 500ms

    return () => {
      if (forceCleanupIntervalRef.current) {
        window.clearInterval(forceCleanupIntervalRef.current);
        forceCleanupIntervalRef.current = null;
      }
    };
  }, [hoveredCardCount, mouseInZone, setHandHoverCount]);

  // Emergency keyboard shortcut to force hand hiding
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (hoveredCardCount > 0 || mouseInZone)) {
        console.debug("[Hand] Emergency cleanup via Escape key");
        setHandHoverCount(0);
        setHoveredCard(null);
        setMouseInHandZone(false);
        if (hoverCleanupTimeoutRef.current) {
          window.clearTimeout(hoverCleanupTimeoutRef.current);
          hoverCleanupTimeoutRef.current = null;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hoveredCardCount, mouseInZone, setHandHoverCount, setMouseInHandZone]);

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
      if (forceCleanupIntervalRef.current)
        window.clearInterval(forceCleanupIntervalRef.current);
    },
    []
  );

  // No keyboard/wheel controls - selection is now purely cursor-based

  return (
    <group ref={rootRef}>
      {/* Unified hand cards in fan */}
      {sortedHand.map((c, i) => {
        const layoutInfo = handLayout[i];
        if (!layoutInfo) return null;

        const { x, y, rot, scale: layoutScale, originalIndex } = layoutInfo;
        const isHandDrag = dragFromHand && selected && selected.who === owner;
        const isPileDrag = dragFromHand && dragFromPile && !selected;
        const isDragging = isHandDrag; // Only block interactions for actual hand drags
        const isSite = (c.type || "").toLowerCase().includes("site");
        const isCardHovered = originalIndex === hoveredCard;

        const baseScale = HAND_CARD_SCALE;
        const scale = baseScale * layoutScale;
        // Spells should render on top of sites: sites get lower render order, spells get higher
        const baseRenderOrder = isSite ? 1000 : 2000;
        const renderOrder = isCardHovered ? 3000 : baseRenderOrder + i;
        return (
          <group
            key={`${c.cardId}-${i}`}
            position={[x, y, i * 0.001]}
            scale={[scale, scale, scale]}
          >
            {/* Invisible larger interaction box to ensure cards are always clickable */}
            <mesh
              position={[0, 0, 0.01]}
              onPointerOver={(e) => {
                if (isDragging) return; // allow bubbling while dragging
                e.stopPropagation();

                // Clear any existing hover timeout
                if (hoverTimeoutRef.current) {
                  window.clearTimeout(hoverTimeoutRef.current);
                }

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
              <meshBasicMaterial transparent opacity={0} /> {/* Invisible */}
            </mesh>

            <group>
              {c.slug ? (
                <CardPlane
                  slug={c.slug}
                  width={CARD_SHORT}
                  height={CARD_LONG}
                  rotationZ={isSite ? -rot - Math.PI / 2 : -rot} // Sites need -90° rotation for correct art orientation
                  upright
                  depthWrite={false}
                  depthTest={false}
                  renderOrder={renderOrder}
                  interactive={!isDragging}
                  elevation={isCardHovered ? 0.02 : 0.002}
                />
              ) : (
                <mesh
                  rotation-x={0}
                  rotation-z={-rot}
                  position={[0, isCardHovered ? 0.02 : 0.002, 0]}
                  renderOrder={renderOrder}
                >
                  <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
                  <meshBasicMaterial
                    color={"#fff00"}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
              )}
            </group>
          </group>
        );
      })}
    </group>
  );
}
