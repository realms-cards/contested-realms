"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { type Object3D, type Raycaster, type Intersection } from "three";
import React, { Suspense, useMemo } from "react";
import { useCardTexture } from "@/lib/game/textures/useCardTexture";

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

// Simplified component that relies on texture cache
const CardWithTexture = React.memo(function CardWithTexture(props: CardPlaneProps) {
  const {
    slug,
    width,
    height,
    rotationZ = 0,
    depthWrite = true,
    depthTest = true,
    interactive = true,
    elevation = 0.001,
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
      userData={{ cardId, slug }}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={tex}
        toneMapped={false}
        depthWrite={depthWrite}
        depthTest={depthTest}
        transparent={true}
      />
    </mesh>
  );
});

export default function CardPlane(props: CardPlaneProps) {
  return (
    <Suspense fallback={<CardFallback {...props} />}>
      <CardWithTexture {...props} />
    </Suspense>
  );
}
