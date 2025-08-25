"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
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
  HAND_OVERLAP_FRAC,
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
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const dragFromPile = useGameStore((s) => s.dragFromPile);

  const hand = zones[owner].hand || [];
  // Separate sites and non-sites for different display
  const sites = hand.filter((c) =>
    (c.type || "").toLowerCase().includes("site")
  );
  const nonSites = hand.filter(
    (c) => !(c.type || "").toLowerCase().includes("site")
  );
  const rootRef = useRef<Group | null>(null);
  const { camera } = useThree();
  // Track whether mouse is in the bottom 1/4 of the screen
  const [mouseInZone, setMouseInZone] = useState(true);
  // Track the number of cards being hovered (simpler than insideHand)
  const [hoveredCardCount, setHoveredCardCount] = useState(0);
  // Simple hover tracking for card pop-up
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  
  // Smooth transition refs for animations
  const handSpreadLerp = useRef(0); // 0 = compact, 1 = spread
  const sitePositionLerp = useRef(0); // for site positioning transitions
  const handDragStart = useRef<{
    x: number;
    y: number;
    time: number;
    index: number;
  } | null>(null);
  const revealLerp = useRef(1); // 0 hidden .. 1 shown

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const h = window.innerHeight || 1;
      const inZone = e.clientY >= h * 0.75;
      setMouseInZone(inZone);
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
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

  // Spellbook fan layout: only non-site cards in arc
  const spellbookLayout = useMemo(() => {
    const n = nonSites.length;
    if (n === 0)
      return [] as {
        x: number;
        y: number;
        rot: number;
        scale: number;
        originalIndex: number;
      }[];

    // Smooth interpolated spread using lerp values
    const maxAngleWhenShown = Math.min(HAND_MAX_TOTAL_ANGLE * 1.5, n * HAND_STEP_MAX * 1.3);
    const maxAngleWhenHidden = Math.min(HAND_MAX_TOTAL_ANGLE * 0.7, n * HAND_STEP_MAX * 0.8);
    const maxAngle = maxAngleWhenHidden + (maxAngleWhenShown - maxAngleWhenHidden) * handSpreadLerp.current;
    
    const baseSpacingWhenShown = CARD_SHORT * HAND_OVERLAP_FRAC * 0.5;
    const baseSpacingWhenHidden = CARD_SHORT * HAND_OVERLAP_FRAC * 0.8;
    const baseSpacing = baseSpacingWhenHidden + (baseSpacingWhenShown - baseSpacingWhenHidden) * handSpreadLerp.current;

    const stepAngle = n > 1 ? maxAngle / (n - 1) : 0;
    const startAngle = -maxAngle / 2;
    
    return new Array(n).fill(0).map((_, i) => {
      // Map back to original hand index
      const originalIndex = hand.findIndex(
        (c) =>
          !(c.type || "").toLowerCase().includes("site") &&
          nonSites.indexOf(c) === i
      );
      const isHovered = originalIndex === hoveredCard;

      // Fan angle
      const angle = startAngle + i * stepAngle;
      const rot = angle; // Positive for upward fan

      // X position with dynamic spacing away from hovered card
      let x = i * baseSpacing - ((n - 1) * baseSpacing) / 2;
      
      // Add spacing effect around hovered card
      if (hoveredCard !== null) {
        const hoveredCardIndex = nonSites.findIndex((c) => 
          hand.findIndex(hc => 
            !(hc.type || "").toLowerCase().includes("site") && nonSites.indexOf(hc) === nonSites.indexOf(c)
          ) === hoveredCard
        );
        
        if (hoveredCardIndex >= 0) {
          const distance = i - hoveredCardIndex;
          const pushAmount = CARD_SHORT * 0.3; // How much to push away
          const falloff = Math.max(0, 1 - Math.abs(distance) / 3); // Effect falls off over 3 cards
          
          if (distance > 0) {
            x += pushAmount * falloff; // Push right cards to the right
          } else if (distance < 0) {
            x -= pushAmount * falloff; // Push left cards to the left
          }
        }
      }

      // Y position: smooth interpolated arc + hover pop-up
      const arcMultiplierWhenShown = 1.5;
      const arcMultiplierWhenHidden = 1.0;
      const arcMultiplier = arcMultiplierWhenHidden + (arcMultiplierWhenShown - arcMultiplierWhenHidden) * handSpreadLerp.current;
      const arcY = -Math.abs(Math.sin(angle)) * HAND_FAN_ARC_Y * arcMultiplier;
      const y = isHovered ? arcY + CARD_LONG * 0.35 : arcY;

      // Scale: hovered card slightly bigger with smoother scaling
      const scale = isHovered ? 1.08 : 1.0;

      return { x, y, rot, scale, originalIndex };
    });
  }, [hand, nonSites, hoveredCard]);

  // Site threshold-grouped layout: sites grouped by their threshold types
  const siteLayout = useMemo(() => {
    const n = sites.length;
    if (n === 0)
      return [] as {
        x: number;
        y: number;
        rot: number;
        scale: number;
        originalIndex: number;
        thresholdType: string;
      }[];

    // Group sites by their primary threshold type
    const sitesByThreshold = sites.map((site, idx) => {
      const originalIndex = hand.findIndex(
        (c) => (c.type || "").toLowerCase().includes("site") && sites.indexOf(c) === idx
      );
      
      // Determine primary threshold type
      const thresholds = site.thresholds || {};
      const thresholdEntries = Object.entries(thresholds).filter(([, value]) => value && value > 0);
      const primaryThreshold = thresholdEntries.length > 0 ? thresholdEntries[0][0] : 'neutral';
      
      return { site, idx, originalIndex, thresholdType: primaryThreshold };
    });

    // Sort by threshold type for consistent grouping
    const thresholdOrder = ['air', 'water', 'earth', 'fire', 'neutral'];
    sitesByThreshold.sort((a, b) => {
      const aIndex = thresholdOrder.indexOf(a.thresholdType);
      const bIndex = thresholdOrder.indexOf(b.thresholdType);
      return aIndex - bIndex;
    });

    // Calculate layout positions
    const spellHandWidth = nonSites.length * CARD_SHORT * HAND_OVERLAP_FRAC * 0.7;
    const clearSeparation = CARD_SHORT * 1.5;
    const baseRightOffset = spellHandWidth * 0.5 + clearSeparation;
    
    return sitesByThreshold.map((item, layoutIndex) => {
      const { originalIndex, thresholdType } = item;
      const isHovered = originalIndex === hoveredCard;
      
      // Group sites vertically by threshold type
      const thresholdIndex = thresholdOrder.indexOf(thresholdType);
      const groupSpacing = CARD_SHORT * 0.4; // Vertical spacing between groups
      const cardSpacing = CARD_SHORT * 0.8; // Spacing within groups
      
      // Count cards in same threshold group before this one
      const cardsInGroupBefore = sitesByThreshold
        .slice(0, layoutIndex)
        .filter(s => s.thresholdType === thresholdType).length;
      
      // X position: slightly stagger by group for visual clarity
      const groupOffset = thresholdIndex * CARD_SHORT * 0.1;
      const x = baseRightOffset + groupOffset;
      
      // Y position: stack by threshold groups
      const groupY = thresholdIndex * groupSpacing;
      const inGroupY = cardsInGroupBefore * cardSpacing;
      const baseY = -(groupY + inGroupY) * 0.5 + CARD_LONG * 0.3; // Move sites up for better positioning
      const y = isHovered ? baseY + CARD_LONG * 0.15 : baseY;
      
      // Slight rotation for visual interest
      const rot = thresholdIndex * 0.05 - 0.1; // Small rotation per group
      
      // Scale
      const scale = isHovered ? 1.12 : 1.0;

      return { x, y, rot, scale, originalIndex, thresholdType };
    });
  }, [hand, sites, hoveredCard, mouseInZone, hoveredCardCount, nonSites]);

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

  // Simple state management - no complex cursor selection
  useEffect(() => {
    if (hand.length === 0) {
      setHoveredCardCount(0);
      setHoveredCard(null);
      clearHoverPreview();
    }
  }, [hand.length, clearHoverPreview]);

  useEffect(() => {
    if (!dragFromHand && !dragFromPile) {
      // Reset hover state when dragging stops to prevent sticking
      setHoveredCard(null);
      // Also clear the drag start ref to prevent ghost drags
      handDragStart.current = null;
    }
  }, [dragFromHand, dragFromPile]);

  // Additional failsafe for stuck drag states - no dependencies to prevent re-registration
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      handDragStart.current = null;
      setHoveredCard(null);
      setHoveredCardCount(0); // Reset hover count on global mouse up
      // Note: Don't clear drag states here as it may interfere with Board drop logic
      // Let the Board component be authoritative for clearing drag states after drops
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    return () => document.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []); // No dependencies to prevent handler re-registration

  useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    },
    []
  );

  // No keyboard/wheel controls - selection is now purely cursor-based

  return (
    <group ref={rootRef}>
      {/* Spellbook cards in fan */}
      {nonSites.map((c, i) => {
        const layoutInfo = spellbookLayout[i];
        if (!layoutInfo) return null;

        const { x, y, rot, scale: layoutScale, originalIndex } = layoutInfo;
        const isHandDrag = dragFromHand && selected && selected.who === owner;
        const isPileDrag = dragFromHand && dragFromPile && !selected;
        const isDragging = isHandDrag; // Only block interactions for actual hand drags
        const isSite = false; // These are non-sites
        const isCardHovered = originalIndex === hoveredCard;
        
        // Shrink spell cards when site hand is being shown (any site hovered)
        const siteHandActive = hoveredCard !== null && hand[hoveredCard] && 
          (hand[hoveredCard].type || "").toLowerCase().includes("site");
        
        const baseScale = siteHandActive ? HAND_CARD_SCALE * 0.9 : HAND_CARD_SCALE; // Slight shrinking when sites active
        const scale = baseScale * layoutScale;
        const renderOrder = isCardHovered ? 3000 : siteHandActive ? 500 + originalIndex : 2000 + originalIndex; // Spell cards go behind sites when sites are active
        return (
          <group
            key={`${c.cardId}-${i}`}
            position={[x, y, i * 0.001]}
            scale={[scale, scale, scale]}
          >
            {/* Invisible larger interaction box to ensure cards are always clickable */}
            <mesh
              position={[0, 0, 0.01]}
              onClick={(e: ThreeEvent<PointerEvent>) => {
                if (isDragging) return; // let events bubble during drags
                e.stopPropagation();
                // Select the clicked card using original hand index
                selectHandCard(owner, originalIndex);
              }}
              onPointerOver={(e) => {
                if (isDragging) return; // allow bubbling while dragging
                e.stopPropagation();

                // Clear any existing hover timeout
                if (hoverTimeoutRef.current) {
                  window.clearTimeout(hoverTimeoutRef.current);
                }

                setHoveredCardCount((prev) => prev + 1);
                setHoveredCard(originalIndex); // Set the hovered card immediately for responsive feel
                beginHoverPreview(c);
              }}
              onPointerOut={(e) => {
                if (isDragging) return; // allow bubbling while dragging
                e.stopPropagation();

                setHoveredCardCount((prev) => Math.max(0, prev - 1));

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

                // Select the card first
                selectHandCard(owner, originalIndex);

                // Record potential drag start
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
                  // Start dragging - card is already selected
                  setDragFromHand(true);
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
                    color={"#1f2937"}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
              )}
            </group>
          </group>
        );
      })}

      {/* Site cards in horizontal row */}
      {sites.map((c, i) => {
        const layoutInfo = siteLayout[i];
        if (!layoutInfo) return null;

        const { x, y, rot, scale: layoutScale, originalIndex } = layoutInfo;
        const isHandDrag = dragFromHand && selected && selected.who === owner;
        const isPileDrag = dragFromHand && dragFromPile && !selected;
        const isDragging = isHandDrag; // Only block interactions for actual hand drags
        const isSite = true; // These are sites
        const isCardHovered = originalIndex === hoveredCard;
        
        // Sites are now in their own fan area - always reasonably sized, bigger when hovered
        const siteHandActive = hoveredCard !== null && hand[hoveredCard] && 
          (hand[hoveredCard].type || "").toLowerCase().includes("site");
        
        const baseScale = HAND_CARD_SCALE * 0.6; // Always visible but smaller than spells
        const scale = baseScale * layoutScale;
        const renderOrder = isCardHovered ? 3500 : siteHandActive ? 2000 + originalIndex : 1000 + originalIndex; // Sites render above spells when active
        return (
          <group
            key={`site-${c.cardId}-${i}`}
            position={[x, y, i * 0.001]}
            scale={[scale, scale, scale]}
          >
            {/* Invisible larger interaction box to ensure cards are always clickable */}
            <mesh
              position={[0, 0, 0.01]}
              onClick={(e: ThreeEvent<PointerEvent>) => {
                if (isDragging) return; // let events bubble during drags
                e.stopPropagation();
                // Select the clicked card using original hand index
                selectHandCard(owner, originalIndex);
              }}
              onPointerOver={(e) => {
                if (isDragging) return; // allow bubbling while dragging
                e.stopPropagation();

                // Clear any existing hover timeout
                if (hoverTimeoutRef.current) {
                  window.clearTimeout(hoverTimeoutRef.current);
                }

                setHoveredCardCount((prev) => prev + 1);
                setHoveredCard(originalIndex); // Set the hovered card immediately for responsive feel
                beginHoverPreview(c);
              }}
              onPointerOut={(e) => {
                if (isDragging) return; // allow bubbling while dragging
                e.stopPropagation();

                setHoveredCardCount((prev) => Math.max(0, prev - 1));

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

                // Select the card first
                selectHandCard(owner, originalIndex);

                // Record potential drag start
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
                  // Start dragging - card is already selected
                  setDragFromHand(true);
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
                    color={"#1f2937"}
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
