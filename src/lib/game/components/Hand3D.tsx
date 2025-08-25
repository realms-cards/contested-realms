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
  const sites = hand.filter((c) => (c.type || "").toLowerCase().includes("site"));
  const nonSites = hand.filter((c) => !(c.type || "").toLowerCase().includes("site"));
  const rootRef = useRef<Group | null>(null);
  const { camera } = useThree();
  // Track whether mouse is in the bottom 1/4 of the screen
  const [mouseInZone, setMouseInZone] = useState(true);
  // Track the number of cards being hovered (simpler than insideHand)
  const [hoveredCardCount, setHoveredCardCount] = useState(0);
  // Simple hover tracking for card pop-up
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
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
      const k = 0.25; // faster lerp for more responsive feel
      revealLerp.current += (targetShown - revealLerp.current) * k;
      if (Math.abs(targetShown - revealLerp.current) < 0.005)
        revealLerp.current = targetShown;
    }

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
    if (n === 0) return [] as { x: number; y: number; rot: number; scale: number; originalIndex: number }[];
    
    const maxAngle = Math.min(HAND_MAX_TOTAL_ANGLE, n * HAND_STEP_MAX);
    const stepAngle = n > 1 ? maxAngle / (n - 1) : 0;
    const startAngle = -maxAngle / 2;
    const baseSpacing = CARD_SHORT * HAND_OVERLAP_FRAC;
    
    return new Array(n).fill(0).map((_, i) => {
      // Map back to original hand index
      const originalIndex = hand.findIndex((c) => 
        !(c.type || "").toLowerCase().includes("site") && 
        nonSites.indexOf(c) === i
      );
      const isHovered = originalIndex === hoveredCard;
      
      // Fan angle
      const angle = startAngle + i * stepAngle;
      const rot = angle; // Positive for upward fan
      
      // X position: evenly spread in fan
      const x = i * baseSpacing - ((n - 1) * baseSpacing) / 2;
      
      // Y position: arc + hover pop-up
      const arcY = -Math.abs(Math.sin(angle)) * HAND_FAN_ARC_Y;
      const y = isHovered ? arcY + CARD_LONG * 0.2 : arcY;
      
      // Scale: hovered card slightly bigger
      const scale = isHovered ? 1.05 : 1.0;
      
      return { x, y, rot, scale, originalIndex };
    });
  }, [hand, nonSites, hoveredCard]);

  // Site horizontal layout: sites in a horizontal row
  const siteLayout = useMemo(() => {
    const n = sites.length;
    if (n === 0) return [] as { x: number; y: number; rot: number; scale: number; originalIndex: number }[];
    
    const siteSpacing = CARD_LONG * 0.8; // Sites are wider, so more spacing
    
    return new Array(n).fill(0).map((_, i) => {
      // Map back to original hand index
      const originalIndex = hand.findIndex((c) => 
        (c.type || "").toLowerCase().includes("site") && 
        sites.indexOf(c) === i
      );
      const isHovered = originalIndex === hoveredCard;
      
      // X position: horizontal line
      const x = i * siteSpacing - ((n - 1) * siteSpacing) / 2;
      
      // Y position: lower than main hand, slight hover pop-up
      const y = isHovered ? -CARD_LONG * 0.7 : -CARD_LONG * 0.8;
      
      // No rotation for sites
      const rot = 0;
      
      // Scale: hovered site slightly bigger
      const scale = isHovered ? 1.1 : 1.0;
      
      return { x, y, rot, scale, originalIndex };
    });
  }, [hand, sites, hoveredCard]);

  // Simplified hover handling
  const hoverTimer = useRef<number | null>(null);

  const beginHoverPreview = useCallback((card?: CardRef | null) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (!card?.slug) return;
    hoverTimer.current = window.setTimeout(() => setPreviewCard(card), 600);
  }, [setPreviewCard]);
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
        const scale = HAND_CARD_SCALE * layoutScale;
        const renderOrder = isCardHovered ? 3000 : 1000 + originalIndex;
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
                  setHoveredCard((prev) => prev === originalIndex ? null : prev);
                }, 50); // 50ms delay to prevent flickering
                
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
                const PIX_THRESH = 8; // pixels
                if (held >= DRAG_HOLD_MS && dist > PIX_THRESH) {
                  // Start dragging - card is already selected
                  setDragFromHand(true);
                }
              }}
            >
              <boxGeometry args={[
                (isSite ? CARD_LONG : CARD_SHORT) * 1.2, // 20% larger interaction area
                (isSite ? CARD_SHORT : CARD_LONG) * 1.2,
                0.01
              ]} />
              <meshBasicMaterial transparent opacity={0} /> {/* Invisible */}
            </mesh>

            <group>
              {c.slug ? (
                <CardPlane
                  slug={c.slug}
                  width={isSite ? CARD_LONG : CARD_SHORT}
                  height={isSite ? CARD_SHORT : CARD_LONG}
                  rotationZ={-rot} // No special rotation for sites, let width/height handle orientation
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
                  <planeGeometry
                    args={[
                      isSite ? CARD_LONG : CARD_SHORT,
                      isSite ? CARD_SHORT : CARD_LONG,
                    ]}
                  />
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
        const scale = HAND_CARD_SCALE * layoutScale;
        const renderOrder = isCardHovered ? 3000 : 1000 + originalIndex;
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
                  setHoveredCard((prev) => prev === originalIndex ? null : prev);
                }, 50); // 50ms delay to prevent flickering
                
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
                const PIX_THRESH = 8; // pixels
                if (held >= DRAG_HOLD_MS && dist > PIX_THRESH) {
                  // Start dragging - card is already selected
                  setDragFromHand(true);
                }
              }}
            >
              <boxGeometry args={[
                (isSite ? CARD_LONG : CARD_SHORT) * 1.2, // 20% larger interaction area
                (isSite ? CARD_SHORT : CARD_LONG) * 1.2,
                0.01
              ]} />
              <meshBasicMaterial transparent opacity={0} /> {/* Invisible */}
            </mesh>

            <group>
              {c.slug ? (
                <CardPlane
                  slug={c.slug}
                  width={isSite ? CARD_LONG : CARD_SHORT}
                  height={isSite ? CARD_SHORT : CARD_LONG}
                  rotationZ={-rot} // No rotation for sites in their dedicated area
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
                  <planeGeometry
                    args={[
                      isSite ? CARD_LONG : CARD_SHORT,
                      isSite ? CARD_SHORT : CARD_LONG,
                    ]}
                  />
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
