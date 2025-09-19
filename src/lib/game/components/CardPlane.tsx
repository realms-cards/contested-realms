"use client";

import type { ThreeEvent } from "@react-three/fiber";
import React, { Suspense } from "react";
import { type Object3D, type Raycaster, type Intersection } from "three";
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
  opacity?: number; // transparency (0.0 to 1.0, default 1.0)
  preferRaster?: boolean; // if true, skip KTX2 attempt and use raster
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
  opacity = 1.0,
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
        transparent={opacity < 1.0}
        opacity={opacity}
      />
    </mesh>
  );
}

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
    forceTextureUrl = false,
    opacity = 1.0,
    preferRaster = false,
    onContextMenu,
    onPointerDown,
    onPointerOver,
    onPointerOut,
    onClick,
    cardId,
  } = props;

  // If slug is missing and no explicit textureUrl is provided, fall back to a generic cardback
  // so that unknown cards (e.g., CPU placeholders) still render visibly.
  const effectiveTextureUrl = React.useMemo(() => {
    if (textureUrl !== undefined) return textureUrl;
    if (!slug || slug.trim() === "") return "/api/assets/cardback_spellbook.png";
    return undefined;
  }, [textureUrl, slug]);

  // Simple texture loading - just use the hook for everything
  const tex = useCardTexture({ 
    slug: forceTextureUrl ? "" : slug, 
    textureUrl: effectiveTextureUrl,
    preferRaster,
  });
  
  if (!tex) {
    return <CardFallback {...props} />;
  }

  // Note: Do not mutate shared Texture rotation here; it is cached and shared across consumers.
  // Any per-card orientation should be handled by mesh rotation (rotationZ) or UVs in a cloned texture.

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
      userData={{ 
        cardId, 
        slug
      }}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={tex}
        toneMapped={false}
        depthWrite={depthWrite}
        depthTest={depthTest}
        transparent={true}
        opacity={opacity}
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
