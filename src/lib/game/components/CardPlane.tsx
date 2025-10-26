"use client";

import type { ThreeEvent } from "@react-three/fiber";
import React, { Suspense, useEffect, useMemo } from "react";
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

function CardBackFallback({
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
  preferRaster = false,
  textureRotation,
}: CardPlaneProps) {
  const backTex = useCardTexture({ textureUrl: "/api/assets/cardback_spellbook.png", preferRaster });
  const rotatedMap = useMemo(() => {
    if (!backTex) return null;
    if (!textureRotation || Math.abs(textureRotation) < 1e-6) return backTex;
    const t = backTex.clone();
    t.center.set(0.5, 0.5);
    t.rotation = textureRotation;
    t.needsUpdate = true;
    return t;
  }, [backTex, textureRotation]);
  useEffect(() => {
    return () => {
      if (rotatedMap && rotatedMap !== backTex) {
        try { rotatedMap.dispose(); } catch {}
      }
    };
  }, [rotatedMap, backTex]);
  if (!backTex) {
    return (
      <CardFallback
        width={width}
        height={height}
        rotationZ={rotationZ}
        elevation={elevation}
        upright={upright}
        renderOrder={renderOrder}
        interactive={interactive}
        depthWrite={depthWrite}
        depthTest={depthTest}
        opacity={opacity}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
      />
    );
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
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={rotatedMap ?? undefined}
        toneMapped={false}
        depthWrite={depthWrite}
        depthTest={depthTest}
        transparent={true}
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
    textureRotation,
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
  const instancedMap = useMemo(() => {
    if (!tex) return null;
    if (!textureRotation || Math.abs(textureRotation) < 1e-6) return tex;
    const t = tex.clone();
    t.center.set(0.5, 0.5);
    t.rotation = textureRotation;
    // Special-case: token pile uses preferRaster and token textures; rotate without UV invert to prevent smear/stripes.
    const isTokenTexture = (props.textureUrl || "").includes("/tokens/") || (props.slug || "").startsWith("token:");
    if (props.preferRaster && isTokenTexture) {
      // Undo the Y-invert applied during normalization for this rotated clone
      t.repeat.y = 1;
      t.offset.y = 0;
    }
    t.needsUpdate = true;
    return t;
  }, [tex, textureRotation, props.preferRaster, props.textureUrl, props.slug]);
  useEffect(() => {
    return () => {
      if (instancedMap && instancedMap !== tex) {
        try { instancedMap.dispose(); } catch {}
      }
    };
  }, [instancedMap, tex]);

  if (!tex) {
    return <CardBackFallback {...props} />;
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
      userData={{ 
        cardId, 
        slug
      }}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={instancedMap ?? undefined}
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
    <Suspense fallback={<CardBackFallback {...props} />}> 
      <CardWithTexture {...props} />
    </Suspense>
  );
}
