"use client";

import type { ThreeEvent } from "@react-three/fiber";
import React, { Suspense, useEffect, useMemo, useRef } from "react";
import {
  type Object3D,
  type Raycaster,
  type Intersection,
  type Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  type Texture,
} from "three";
import { CARD_THICK } from "@/lib/game/constants";
import { useCardTexture } from "@/lib/game/textures/useCardTexture";
import { getGraphicsSettings } from "@/hooks/useGraphicsSettings";

// Card edge color (dark gray to simulate card stock)
const EDGE_COLOR = "#2a2a2a";

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
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  interactive?: boolean;
  elevation?: number;
  upright?: boolean; // if true, face camera (no -PI/2 tilt)
  renderOrder?: number;
  textureUrl?: string; // optional explicit texture (e.g., pile backs)
  textureRotation?: number; // rotation to apply to the texture itself
  forceTextureUrl?: boolean; // if true, ignore slug completely and only use textureUrl
  opacity?: number; // transparency (0.0 to 1.0, default 1.0)
  preferRaster?: boolean; // if true, skip KTX2 attempt and use raster
  lit?: boolean; // if true (default), use lit material; if false, use unlit (for hand cards)
  castShadow?: boolean; // if true (default same as lit), cast shadows
  onContextMenu?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
  onDoubleClick?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<PointerEvent>) => void;
  cardId?: number; // for raycasting identification
}

// Create material array for box: [+X, -X, +Y, -Y, +Z (front), -Z (back)]
function createMaterials(
  frontMap: Texture | null,
  backMap: Texture | null,
  lit: boolean,
  depthWrite: boolean,
  depthTest: boolean,
  polygonOffset: boolean,
  polygonOffsetFactor: number,
  polygonOffsetUnits: number,
  opacity: number
): (MeshStandardMaterial | MeshBasicMaterial)[] {
  // Note: polygonOffset not used - 3D box geometry has real thickness so no z-fighting
  const materialProps = {
    depthWrite,
    depthTest,
    transparent: opacity < 1.0,
    opacity,
  };
  // Suppress unused variable warnings
  void polygonOffset;
  void polygonOffsetFactor;
  void polygonOffsetUnits;

  // Edge material (sides of the card)
  const edgeMaterial = lit
    ? new MeshStandardMaterial({ color: EDGE_COLOR, roughness: 0.9, metalness: 0, ...materialProps })
    : new MeshBasicMaterial({ color: EDGE_COLOR, toneMapped: false, ...materialProps });

  // Front face material (card art)
  const frontMaterial = lit
    ? new MeshStandardMaterial({
        map: frontMap ?? undefined,
        roughness: 0.7,
        metalness: 0,
        ...materialProps,
      })
    : new MeshBasicMaterial({ map: frontMap ?? undefined, toneMapped: false, ...materialProps });

  // Back face material (card back)
  const backMaterial = lit
    ? new MeshStandardMaterial({
        map: backMap ?? undefined,
        roughness: 0.7,
        metalness: 0,
        ...materialProps,
      })
    : new MeshBasicMaterial({ map: backMap ?? undefined, toneMapped: false, ...materialProps });

  // Box material order: [+X, -X, +Y, -Y, +Z, -Z]
  // When lying flat (rotation-x = -PI/2): +Z faces up (front), -Z faces down (back)
  return [
    edgeMaterial, // +X (right edge)
    edgeMaterial, // -X (left edge)
    edgeMaterial, // +Y (now points forward after rotation)
    edgeMaterial, // -Y (now points backward after rotation)
    frontMaterial, // +Z (front face - faces UP when lying flat)
    backMaterial, // -Z (back face - faces DOWN when lying flat)
  ];
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
  polygonOffset = true,
  polygonOffsetFactor = -0.5,
  polygonOffsetUnits = -0.5,
  opacity = 1.0,
  lit: litProp,
  castShadow: castShadowProp,
  onContextMenu,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onClick,
}: Omit<CardPlaneProps, "slug" | "textureUrl">) {
  const meshRef = useRef<Mesh>(null);
  const thickness = CARD_THICK;
  const lit = litProp ?? getGraphicsSettings().enhanced3DCards;
  const shouldCastShadow = castShadowProp ?? lit;

  useEffect(() => {
    if (!interactive && meshRef.current) {
      meshRef.current.raycast = noopRaycast;
    }
  }, [interactive]);

  // Solid gray fallback material
  const materials = useMemo(() => {
    const props = {
      depthWrite,
      depthTest,
      polygonOffset,
      polygonOffsetFactor,
      polygonOffsetUnits,
      transparent: opacity < 1.0,
      opacity,
    };
    const mat = lit
      ? new MeshStandardMaterial({ color: "#4a5568", roughness: 0.8, metalness: 0, ...props })
      : new MeshBasicMaterial({ color: "#4a5568", toneMapped: false, ...props });
    return [mat, mat, mat, mat, mat, mat];
  }, [lit, depthWrite, depthTest, polygonOffset, polygonOffsetFactor, polygonOffsetUnits, opacity]);

  return (
    <mesh
      ref={meshRef}
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation + thickness / 2, 0]}
      renderOrder={renderOrder}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      castShadow={shouldCastShadow}
      receiveShadow={lit}
      material={materials}
    >
      <boxGeometry args={[width, height, thickness]} />
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
  polygonOffset = true,
  polygonOffsetFactor = -0.5,
  polygonOffsetUnits = -0.5,
  opacity = 1.0,
  lit: litProp,
  castShadow: castShadowProp,
  onContextMenu,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  onPointerMove,
  onPointerUp,
  onDoubleClick,
  onClick,
  preferRaster = false,
  textureRotation,
}: CardPlaneProps) {
  const meshRef = useRef<Mesh>(null);
  const backTex = useCardTexture({ textureUrl: "/api/assets/cardback_spellbook.png", preferRaster });
  const thickness = CARD_THICK;
  const lit = litProp ?? getGraphicsSettings().enhanced3DCards;
  const shouldCastShadow = castShadowProp ?? lit;

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
        try { rotatedMap.dispose(); } catch { /* ignore */ }
      }
    };
  }, [rotatedMap, backTex]);

  useEffect(() => {
    if (!interactive && meshRef.current) {
      meshRef.current.raycast = noopRaycast;
    }
  }, [interactive]);

  // Materials: card back on both front and back faces
  const materials = useMemo(() => {
    if (!backTex) return null;
    return createMaterials(
      rotatedMap,
      rotatedMap,
      lit,
      depthWrite,
      depthTest,
      polygonOffset,
      polygonOffsetFactor,
      polygonOffsetUnits,
      opacity
    );
  }, [rotatedMap, lit, depthWrite, depthTest, polygonOffset, polygonOffsetFactor, polygonOffsetUnits, opacity, backTex]);

  if (!backTex || !materials) {
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
        lit={lit}
        castShadow={castShadowProp}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onClick={onClick}
      />
    );
  }

  return (
    <mesh
      ref={meshRef}
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation + thickness / 2, 0]}
      renderOrder={renderOrder}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      castShadow={shouldCastShadow}
      receiveShadow={lit}
      material={materials}
    >
      <boxGeometry args={[width, height, thickness]} />
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
    polygonOffset = true,
    polygonOffsetFactor = -0.5,
    polygonOffsetUnits = -0.5,
    interactive = true,
    elevation = 0.001,
    upright = false,
    renderOrder = 0,
    textureUrl,
    forceTextureUrl = false,
    opacity = 1.0,
    preferRaster = false,
    lit: litProp,
    castShadow: castShadowProp,
    onContextMenu,
    onPointerDown,
    onPointerOver,
    onPointerOut,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    onClick,
    cardId,
    textureRotation,
  } = props;

  const meshRef = useRef<Mesh>(null);
  const thickness = CARD_THICK;
  // Use explicit lit prop if provided, otherwise fall back to graphics settings
  const lit = litProp ?? getGraphicsSettings().enhanced3DCards;
  const shouldCastShadow = castShadowProp ?? lit;

  // If slug is missing and no explicit textureUrl is provided, fall back to a generic cardback
  // so that unknown cards (e.g., CPU placeholders) still render visibly.
  const effectiveTextureUrl = React.useMemo(() => {
    if (textureUrl !== undefined) return textureUrl;
    if (!slug || slug.trim() === "") return "/api/assets/cardback_spellbook.png";
    return undefined;
  }, [textureUrl, slug]);

  // Load front texture (card art)
  const tex = useCardTexture({
    slug: forceTextureUrl ? "" : slug,
    textureUrl: effectiveTextureUrl,
    preferRaster,
  });

  // Load back texture (card back)
  const backTex = useCardTexture({ textureUrl: "/api/assets/cardback_spellbook.png", preferRaster });

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
        try { instancedMap.dispose(); } catch { /* ignore */ }
      }
    };
  }, [instancedMap, tex]);

  // Create materials with front art and back texture
  const materials = useMemo(() => {
    if (!tex) return null;
    return createMaterials(
      instancedMap,
      backTex,
      lit,
      depthWrite,
      depthTest,
      polygonOffset,
      polygonOffsetFactor,
      polygonOffsetUnits,
      opacity
    );
  }, [instancedMap, backTex, lit, depthWrite, depthTest, polygonOffset, polygonOffsetFactor, polygonOffsetUnits, opacity, tex]);

  // Disable raycasting on mount if not interactive, and set userData
  useEffect(() => {
    if (meshRef.current) {
      if (!interactive) {
        meshRef.current.raycast = noopRaycast;
      }
      meshRef.current.userData = { cardId, slug };
    }
  }, [interactive, cardId, slug]);

  if (!tex || !materials) {
    return <CardBackFallback {...props} />;
  }

  return (
    <mesh
      ref={meshRef}
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation + thickness / 2, 0]}
      renderOrder={renderOrder}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
      castShadow={shouldCastShadow}
      receiveShadow={lit}
      material={materials}
    >
      <boxGeometry args={[width, height, thickness]} />
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
