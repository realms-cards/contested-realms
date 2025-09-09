"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { Group } from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import CardPlane from "@/lib/game/components/CardPlane";
import { useDraft3DTransport } from "@/lib/hooks/useDraft3DTransport";
import { useDraft3DPreviews } from "@/lib/stores/draft-3d-online";

export interface OnlineCard3DProps {
  slug: string;
  cardId: string;
  isSite: boolean;
  x: number;
  z: number;
  y?: number;
  
  // Online-specific props
  sessionId: string;
  playerId: string;
  ownedByPlayer?: string; // Which player owns this card
  isPickable?: boolean; // Can this player pick this card
  isVisible?: boolean; // Is this card visible to current player
  
  // Stack management
  stackIndex?: number;
  totalInStack?: number;
  baseRenderOrder?: number;
  
  // Interaction callbacks
  onPick?: (cardId: string) => void;
  onInspect?: (cardId: string) => void;
  onHoverChange?: (hovering: boolean, cardId: string) => void;
  
  // Visual states
  disabled?: boolean;
  interactive?: boolean;
  
  // Draft-specific callbacks
  onDoubleClick?: () => void;
  onContextMenu?: (clientX: number, clientY: number) => void;
}

export default function OnlineCard3D({
  slug,
  cardId,
  isSite,
  x,
  z,
  y = 0.002,
  sessionId,
  playerId,
  ownedByPlayer,
  isPickable = true,
  isVisible = true,
  stackIndex = 0,
  totalInStack = 1,
  baseRenderOrder = 1500,
  onPick,
  onInspect,
  onHoverChange,
  disabled = false,
  interactive = true,
  onDoubleClick,
  onContextMenu,
}: OnlineCard3DProps) {
  const ref = useRef<Group | null>(null);
  const hoveringRef = useRef(false);
  const hoverStableRef = useRef<number | null>(null);
  const lastClickTime = useRef<number>(0);
  const roRef = useRef<number>(baseRenderOrder);
  
  // Online transport integration
  const {
    sendCardPreview,
    clearCardPreview,
    sendStackInteraction,
    isConnected
  } = useDraft3DTransport({
    transport: null, // Will be injected by parent component
    sessionId,
    playerId,
    onError: (error) => {
      console.error('[OnlineCard3D] Transport error:', error);
    }
  });
  
  // Preview state management
  const { activePreviews } = useDraft3DPreviews();
  
  // Check if this card is being previewed by any player
  const isBeingPreviewed = Array.from(activePreviews.values()).some(
    preview => preview.cardId === cardId && preview.isActive
  );
  
  // Check if current player is previewing this card
  const isCurrentPlayerPreviewing = Array.from(activePreviews.values()).some(
    preview => preview.cardId === cardId && preview.playerId === playerId && preview.isActive
  );

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => {
      if (hoverStableRef.current) {
        window.clearTimeout(hoverStableRef.current);
      }
    };
  }, []);

  // Handle card preview when hovering
  const handleHoverStart = useCallback(() => {
    if (!isConnected || disabled || !isVisible) return;
    
    hoveringRef.current = true;
    
    // Clear any pending hover-out debounce
    if (hoverStableRef.current) {
      window.clearTimeout(hoverStableRef.current);
      hoverStableRef.current = null;
    }
    
    // Send preview to other players
    sendCardPreview(cardId, 'hover', { x, y: y + 0.1, z }, 'low');
    
    // Notify parent component
    onHoverChange?.(true, cardId);
  }, [cardId, x, y, z, sendCardPreview, isConnected, disabled, isVisible, onHoverChange]);

  const handleHoverEnd = useCallback(() => {
    hoveringRef.current = false;
    
    // Add a small delay before calling hover false to prevent spurious events
    if (hoverStableRef.current) {
      window.clearTimeout(hoverStableRef.current);
    }
    
    hoverStableRef.current = window.setTimeout(() => {
      // Only call hover false if we're truly not hovering anymore
      if (!hoveringRef.current) {
        // Clear preview for other players
        clearCardPreview(cardId, 'hover');
        
        // Notify parent component
        onHoverChange?.(false, cardId);
      }
      hoverStableRef.current = null;
    }, 100); // Slightly longer delay for online sync
  }, [cardId, clearCardPreview, onHoverChange]);

  const handleClick = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (disabled || !isPickable || !isVisible) return;
    
    e.stopPropagation();
    
    // Detect double-click
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime.current;
    const isDoubleClick = timeSinceLastClick < 300;
    lastClickTime.current = now;
    
    if (isDoubleClick) {
      // Double-click for inspection
      sendCardPreview(cardId, 'inspect', { x, y: y + 0.2, z }, 'high');
      onDoubleClick?.();
      onInspect?.(cardId);
    } else {
      // Single click to pick card
      sendStackInteraction('pick', [cardId], undefined, undefined, {
        targetPosition: { x, y: y + 0.1, z },
        userInitiated: true,
        hasAnimation: true
      });
      onPick?.(cardId);
    }
  }, [
    cardId, 
    x, y, z, 
    disabled, 
    isPickable, 
    isVisible,
    sendCardPreview,
    sendStackInteraction,
    onPick,
    onInspect,
    onDoubleClick
  ]);

  const handleContextMenu = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (disabled) return;
    
    e.stopPropagation();
    e.nativeEvent.preventDefault();
    
    // Context menu for inspection or other actions
    sendCardPreview(cardId, 'select', { x, y: y + 0.15, z }, 'medium');
    onContextMenu?.(e.clientX, e.clientY);
  }, [cardId, x, y, z, sendCardPreview, onContextMenu, disabled]);

  // Calculate visual states based on online context
  const rotZ = isSite ? -Math.PI / 2 : 0;
  
  // Visual indicators for online state
  const isOwned = ownedByPlayer === playerId;
  const isOwnedByOther = ownedByPlayer && ownedByPlayer !== playerId;
  
  // Adjust render order for previewed cards
  useEffect(() => {
    if (isBeingPreviewed) {
      roRef.current = baseRenderOrder + 100;
    } else {
      roRef.current = baseRenderOrder;
    }
  }, [baseRenderOrder, isBeingPreviewed]);

  // Calculate visible area for fanned cards (similar to DraggableCard3D)
  const isInStack = totalInStack > 1;
  const isTopCard = stackIndex === totalInStack - 1;
  
  let visibleWidth = CARD_SHORT;
  let visibleHeight = CARD_LONG;
  let hitboxOffsetX = 0;
  let hitboxOffsetZ = 0;
  
  if (isInStack && !isTopCard) {
    const fanOffsetX = 0.03;
    const fanOffsetZ = 0.05;
    
    visibleWidth = fanOffsetX;
    visibleHeight = fanOffsetZ;
    
    hitboxOffsetX = -(CARD_SHORT / 2) + (visibleWidth / 2);
    hitboxOffsetZ = -(CARD_LONG / 2) + (visibleHeight / 2);
  }

  if (!isVisible) {
    // Card is not visible to current player
    return null;
  }

  return (
    <group ref={ref} position={[x, y, z]}>
      {/* Invisible hitbox positioned at card surface level */}
      <mesh
        position={[hitboxOffsetX, 0.005, hitboxOffsetZ]}
        rotation-x={-Math.PI / 2}
        rotation-z={isSite ? -Math.PI / 2 : 0}
        userData={{
          cardId,
          slug,
          type: 'draft-card',
          sessionId,
          playerId: ownedByPlayer,
          isPickable,
        }}
        onPointerOver={handleHoverStart}
        onPointerOut={handleHoverEnd}
        onPointerDown={handleClick}
        onContextMenu={handleContextMenu}
      >
        <planeGeometry args={[visibleWidth, visibleHeight]} />
        <meshBasicMaterial 
          transparent 
          opacity={0} 
          depthWrite={true} 
          depthTest={true} 
        />
      </mesh>

      {/* Visual card with online-specific styling */}
      <group>
        <CardPlane
          slug={slug}
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={rotZ}
          upright={false}
          depthWrite={false}
          depthTest={false}
          renderOrder={roRef.current}
          interactive={interactive}
          elevation={0.002}
          cardId={parseInt(cardId) || 0}
          
          // Visual modifiers handled by CardPlane internally
        />
        
        {/* Preview indicator for cards being viewed by other players */}
        {isBeingPreviewed && !isCurrentPlayerPreviewing && (
          <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[CARD_SHORT + 0.02, CARD_LONG + 0.02]} />
            <meshBasicMaterial
              color={0x4488ff}
              transparent
              opacity={0.3}
              depthWrite={false}
            />
          </mesh>
        )}
        
        {/* Ownership indicator */}
        {isOwned && (
          <mesh position={[CARD_SHORT/2 - 0.03, 0.01, -CARD_LONG/2 + 0.03]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[0.04, 0.04]} />
            <meshBasicMaterial
              color={0x44ff44}
              transparent
              opacity={0.8}
              depthWrite={false}
            />
          </mesh>
        )}
        
        {/* Not pickable indicator */}
        {!isPickable && isVisible && (
          <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[CARD_SHORT, CARD_LONG]} />
            <meshBasicMaterial
              color={0x333333}
              transparent
              opacity={0.5}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
    </group>
  );
}