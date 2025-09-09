"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { type Object3D, type Raycaster, type Intersection } from "three";
import React, { Suspense, useEffect, useState } from "react";
import { useSpring, animated } from "@react-spring/three";
import { useCardTexture } from "@/lib/game/textures/useCardTexture";
import { useGameStore } from "../store";
import type { PermanentPositionState } from "../types";

function noopRaycast(
  this: Object3D,
  _raycaster: Raycaster,
  _intersects: Intersection[]
): void {
  void _raycaster;
  void _intersects;
}

interface CardPlaneProps {
  slug: string; // used when textureUrl is not provided
  width: number;
  height: number;
  rotationZ?: number;
  depthWrite?: boolean;
  depthTest?: boolean;
  interactive?: boolean;
  elevation?: number;
  upright?: boolean; // if true, face camera (no -PI/2 tilt)
  renderOrder?: number;
  textureUrl?: string; // optional explicit texture (e.g., pile backs)
  textureRotation?: number; // rotation to apply to the texture itself
  forceTextureUrl?: boolean; // if true, ignore slug completely and only use textureUrl
  onContextMenu?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<PointerEvent>) => void;
  cardId?: number; // for raycasting identification
  
  // Burrow/Submerge support
  permanentId?: number; // if provided, uses position from game store
  basePosition?: [number, number, number]; // base X,Y,Z position when not using store
  enablePositionAnimation?: boolean; // whether to animate position transitions
}

// Fallback component while texture loads
function CardFallback({
  width,
  height,
  rotationZ = 0,
  elevation = 0.001,
  upright = false,
  renderOrder = 0,
  interactive = true,
  depthWrite = true,
  depthTest = true,
  onContextMenu,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  onClick,
}: Omit<CardPlaneProps, "slug" | "textureUrl">) {
  return (
    <mesh
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation, 0]}
      raycast={interactive ? undefined : noopRaycast}
      renderOrder={renderOrder}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      castShadow
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        color="#4a5568"
        toneMapped={false}
        depthWrite={depthWrite}
        depthTest={depthTest}
      />
    </mesh>
  );
}

// Position calculation hook for permanent cards
function useCardPosition(props: CardPlaneProps) {
  const {
    permanentId,
    basePosition = [0, 0, 0],
    elevation = 0.001,
    enablePositionAnimation = true
  } = props;

  // Get permanent position from store if permanentId is provided
  const permanentPosition = useGameStore((state) => 
    permanentId ? state.permanentPositions[permanentId] : null
  );

  // Calculate final position
  const targetPosition: [number, number, number] = React.useMemo(() => {
    if (permanentPosition) {
      // Use position from game store
      return [
        basePosition[0] + permanentPosition.position.x,
        permanentPosition.position.y, // Y is controlled by burrow/surface state
        basePosition[2] + permanentPosition.position.z
      ];
    }
    
    // Use base position with elevation
    return [basePosition[0], basePosition[1] + elevation, basePosition[2]];
  }, [permanentPosition, basePosition, elevation]);

  // Get transition duration from permanent position or default
  const transitionDuration = permanentPosition?.transitionDuration ?? 200;

  // Animate position changes if enabled
  const springProps = useSpring({
    position: targetPosition,
    config: {
      duration: enablePositionAnimation ? transitionDuration : 0,
      tension: 200,
      friction: 20
    }
  });

  return {
    springProps,
    currentState: permanentPosition?.state ?? 'surface',
    isUnderground: permanentPosition?.state === 'burrowed' || permanentPosition?.state === 'submerged'
  };
}

// Enhanced component with burrow/submerge positioning
const CardWithTexture = React.memo(function CardWithTexture(props: CardPlaneProps) {
  const {
    slug,
    width,
    height,
    rotationZ = 0,
    depthWrite = true,
    depthTest = true,
    interactive = true,
    upright = false,
    renderOrder = 0,
    textureUrl,
    textureRotation,
    forceTextureUrl = false,
    onContextMenu,
    onPointerDown,
    onPointerOver,
    onPointerOut,
    onClick,
    cardId,
  } = props;

  // Get position and animation from the hook
  const { springProps, currentState, isUnderground } = useCardPosition(props);

  // Simple texture loading - just use the hook for everything
  const tex = useCardTexture({ 
    slug: forceTextureUrl ? "" : slug, 
    textureUrl 
  });
  
  if (!tex) {
    return <CardFallback {...props} />;
  }

  // Apply texture rotation if specified
  if (textureRotation !== undefined && tex.rotation !== textureRotation) {
    tex.rotation = textureRotation;
    tex.center.set(0.5, 0.5); // Rotate around center
    tex.needsUpdate = true;
  }

  // Adjust render properties for underground permanents
  const adjustedDepthWrite = isUnderground ? false : depthWrite;
  const adjustedRenderOrder = isUnderground ? renderOrder - 1 : renderOrder;

  return (
    <animated.mesh
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ}
      position={springProps.position}
      raycast={interactive ? undefined : noopRaycast}
      renderOrder={adjustedRenderOrder}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      castShadow
      userData={{ 
        cardId, 
        slug, 
        permanentId: props.permanentId,
        positionState: currentState
      }}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={tex}
        toneMapped={false}
        depthWrite={adjustedDepthWrite}
        depthTest={depthTest}
        transparent={true}
        opacity={isUnderground ? 0.7 : 1.0} // Slightly transparent when underground
      />
    </animated.mesh>
  );
});

export default function CardPlane(props: CardPlaneProps) {
  return (
    <Suspense fallback={<CardFallback {...props} />}>
      <CardWithTexture {...props} />
    </Suspense>
  );
}
