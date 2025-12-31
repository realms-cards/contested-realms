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
  BoxGeometry,
} from "three";
import { getGraphicsSettings } from "@/hooks/useGraphicsSettings";
import { CARD_THICK } from "@/lib/game/constants";
import { useCardTexture } from "@/lib/game/textures/useCardTexture";
import { useCardGeometry } from "./useCardGeometry";

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
  receiveShadow?: boolean; // if true (default same as lit), receive shadows from other objects
  envMapIntensity?: number; // environment reflection intensity (default 0.3, set to 0 for isolated rendering)
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

// Card material settings for a semi-gloss printed card finish
const CARD_ROUGHNESS = 0.55; // Semi-gloss finish with visible highlights
const CARD_METALNESS = 0.02; // Tiny bit of metalness for subtle sheen
const EDGE_ROUGHNESS = 0.9; // Matte card stock edge

// Create material array for box: [+X, -X, +Y, -Y, +Z (front), -Z (back)]
function createBoxMaterials(
  frontMap: Texture | null,
  backMap: Texture | null,
  lit: boolean,
  depthWrite: boolean,
  depthTest: boolean,
  opacity: number,
  envIntensity: number = 0.3
): (MeshStandardMaterial | MeshBasicMaterial)[] {
  const materialProps = {
    depthWrite,
    depthTest,
    transparent: opacity < 1.0,
    opacity,
  };

  // Edge material (sides of the card) - matte card stock
  const edgeMaterial = lit
    ? new MeshStandardMaterial({
        color: EDGE_COLOR,
        roughness: EDGE_ROUGHNESS,
        metalness: 0,
        envMapIntensity: envIntensity,
        ...materialProps,
      })
    : new MeshBasicMaterial({
        color: EDGE_COLOR,
        toneMapped: false,
        ...materialProps,
      });

  // Front face material (card art) - semi-gloss finish
  const frontMaterial = lit
    ? new MeshStandardMaterial({
        map: frontMap ?? undefined,
        roughness: CARD_ROUGHNESS,
        metalness: CARD_METALNESS,
        envMapIntensity: envIntensity,
        ...materialProps,
      })
    : new MeshBasicMaterial({
        map: frontMap ?? undefined,
        toneMapped: false,
        ...materialProps,
      });

  // Back face material (card back) - semi-gloss finish
  const backMaterial = lit
    ? new MeshStandardMaterial({
        map: backMap ?? undefined,
        roughness: CARD_ROUGHNESS,
        metalness: CARD_METALNESS,
        envMapIntensity: envIntensity,
        ...materialProps,
      })
    : new MeshBasicMaterial({
        map: backMap ?? undefined,
        toneMapped: false,
        ...materialProps,
      });

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

// Create material array for OBJ geometry groups: [edge, front, back]
function createObjMaterials(
  frontMap: Texture | null,
  backMap: Texture | null,
  lit: boolean,
  depthWrite: boolean,
  depthTest: boolean,
  opacity: number,
  isLandscape: boolean = false,
  envIntensity: number = 0.3
): (MeshStandardMaterial | MeshBasicMaterial)[] {
  const materialProps = {
    depthWrite,
    depthTest,
    transparent: opacity < 1.0,
    opacity,
  };

  // Edge material (sides of the card) - matte card stock
  const edgeMaterial = lit
    ? new MeshStandardMaterial({
        color: EDGE_COLOR,
        roughness: EDGE_ROUGHNESS,
        metalness: 0,
        envMapIntensity: envIntensity,
        ...materialProps,
      })
    : new MeshBasicMaterial({
        color: EDGE_COLOR,
        toneMapped: false,
        ...materialProps,
      });

  // For landscape cards, counter-rotate the back texture to keep it upright
  // (the geometry is rotated 90° for landscape display)
  // Note: Front texture is NOT rotated here - site card art is already landscape-oriented
  // For atlas piles (forceTextureUrl), rotation is handled via textureRotation prop
  let adjustedBackMap = backMap;
  if (isLandscape && backMap) {
    adjustedBackMap = backMap.clone();
    adjustedBackMap.center.set(0.5, 0.5);
    adjustedBackMap.rotation = -Math.PI / 2; // Counter-rotate by -90°
    adjustedBackMap.needsUpdate = true;
  }

  // Front face material (card art) - semi-gloss finish
  const frontMaterial = lit
    ? new MeshStandardMaterial({
        map: frontMap ?? undefined,
        roughness: CARD_ROUGHNESS,
        metalness: CARD_METALNESS,
        envMapIntensity: envIntensity,
        ...materialProps,
      })
    : new MeshBasicMaterial({
        map: frontMap ?? undefined,
        toneMapped: false,
        ...materialProps,
      });

  // Back face material (card back) - semi-gloss finish
  const backMaterial = lit
    ? new MeshStandardMaterial({
        map: adjustedBackMap ?? undefined,
        roughness: CARD_ROUGHNESS,
        metalness: CARD_METALNESS,
        envMapIntensity: envIntensity,
        ...materialProps,
      })
    : new MeshBasicMaterial({
        map: adjustedBackMap ?? undefined,
        toneMapped: false,
        ...materialProps,
      });

  // OBJ geometry group order: [edge (group 0), front (group 1), back (group 2)]
  return [edgeMaterial, frontMaterial, backMaterial];
}

// Create box geometry for fallback when OBJ not loaded
function getBoxGeometry(
  width: number,
  height: number,
  thickness: number
): BoxGeometry {
  return new BoxGeometry(width, height, thickness);
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
  lit: litProp,
  castShadow: castShadowProp,
  receiveShadow: receiveShadowProp,
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
  const shouldReceiveShadow = receiveShadowProp ?? lit;
  const { geometry: cardGeometry, thicknessRatio } = useCardGeometry();

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
      transparent: opacity < 1.0,
      opacity,
    };
    const mat = lit
      ? new MeshStandardMaterial({
          color: "#4a5568",
          roughness: 0.8,
          metalness: 0,
          ...props,
        })
      : new MeshBasicMaterial({
          color: "#4a5568",
          toneMapped: false,
          ...props,
        });
    // Return 3 materials for OBJ groups, or 6 for box fallback
    return cardGeometry ? [mat, mat, mat] : [mat, mat, mat, mat, mat, mat];
  }, [lit, depthWrite, depthTest, opacity, cardGeometry]);

  // Calculate scale to transform normalized geometry to target size
  // Use uniform X/Y scaling to preserve rounded corner circles
  // OBJ model is portrait-oriented; for landscape cards we scale by height instead
  const isLandscape = width > height;
  const scale = useMemo(() => {
    if (!cardGeometry) return [1, 1, 1] as [number, number, number];
    // For landscape, scale by height (the shorter dimension after rotation)
    // For portrait, scale by width
    const uniformScale = isLandscape ? height : width;
    const scaleZ = thickness / thicknessRatio;
    return [uniformScale, uniformScale, scaleZ] as [number, number, number];
  }, [cardGeometry, width, height, thickness, thicknessRatio, isLandscape]);

  // For landscape cards, rotate 90 degrees so the portrait model displays as landscape
  const geometryRotationZ = isLandscape ? Math.PI / 2 : 0;

  // Use box geometry as fallback if OBJ not loaded
  const geometry = useMemo(() => {
    if (cardGeometry) return cardGeometry;
    return getBoxGeometry(width, height, thickness);
  }, [cardGeometry, width, height, thickness]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ + geometryRotationZ}
      position={[0, elevation + thickness / 2, 0]}
      scale={cardGeometry ? scale : undefined}
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
      receiveShadow={shouldReceiveShadow}
      material={materials}
    />
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
  lit: litProp,
  castShadow: castShadowProp,
  receiveShadow: receiveShadowProp,
  envMapIntensity: envMapIntensityProp,
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
  const backTex = useCardTexture({
    textureUrl: "/api/assets/cardback_spellbook.png",
    preferRaster,
  });
  const thickness = CARD_THICK;
  const lit = litProp ?? getGraphicsSettings().enhanced3DCards;
  const shouldCastShadow = castShadowProp ?? lit;
  const shouldReceiveShadow = receiveShadowProp ?? lit;
  const envIntensity = envMapIntensityProp ?? 0.3;
  const { geometry: cardGeometry, thicknessRatio } = useCardGeometry();

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
        try {
          rotatedMap.dispose();
        } catch {
          /* ignore */
        }
      }
    };
  }, [rotatedMap, backTex]);

  useEffect(() => {
    if (!interactive && meshRef.current) {
      meshRef.current.raycast = noopRaycast;
    }
  }, [interactive]);

  // Detect landscape orientation for scaling and texture adjustment
  const isLandscape = width > height;

  // Materials: card back on both front and back faces
  const materials = useMemo(() => {
    if (!backTex) return null;
    if (cardGeometry) {
      return createObjMaterials(
        rotatedMap,
        rotatedMap,
        lit,
        depthWrite,
        depthTest,
        opacity,
        isLandscape,
        envIntensity
      );
    }
    return createBoxMaterials(
      rotatedMap,
      rotatedMap,
      lit,
      depthWrite,
      depthTest,
      opacity,
      envIntensity
    );
  }, [
    rotatedMap,
    lit,
    depthWrite,
    depthTest,
    opacity,
    backTex,
    cardGeometry,
    isLandscape,
    envIntensity,
  ]);

  // Calculate scale for OBJ geometry
  // Use uniform X/Y scaling to preserve rounded corner circles
  const scale = useMemo(() => {
    if (!cardGeometry) return [1, 1, 1] as [number, number, number];
    const uniformScale = isLandscape ? height : width;
    const scaleZ = thickness / thicknessRatio;
    return [uniformScale, uniformScale, scaleZ] as [number, number, number];
  }, [cardGeometry, width, height, thickness, thicknessRatio, isLandscape]);

  // For landscape cards, rotate 90 degrees so the portrait model displays as landscape
  const geometryRotationZ = isLandscape ? Math.PI / 2 : 0;

  // Use box geometry as fallback
  const geometry = useMemo(() => {
    if (cardGeometry) return cardGeometry;
    return getBoxGeometry(width, height, thickness);
  }, [cardGeometry, width, height, thickness]);

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
      geometry={geometry}
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ + geometryRotationZ}
      position={[0, elevation + thickness / 2, 0]}
      scale={cardGeometry ? scale : undefined}
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
      receiveShadow={shouldReceiveShadow}
      material={materials}
    />
  );
}

const CardWithTexture = React.memo(function CardWithTexture(
  props: CardPlaneProps
) {
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
    lit: litProp,
    castShadow: castShadowProp,
    receiveShadow: receiveShadowProp,
    envMapIntensity: envMapIntensityProp,
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
  const shouldReceiveShadow = receiveShadowProp ?? lit;
  const envIntensity = envMapIntensityProp ?? 0.3;
  const { geometry: cardGeometry, thicknessRatio } = useCardGeometry();

  // If slug is missing and no explicit textureUrl is provided, fall back to a generic cardback
  // so that unknown cards (e.g., CPU placeholders) still render visibly.
  const effectiveTextureUrl = React.useMemo(() => {
    if (textureUrl !== undefined) return textureUrl;
    if (!slug || slug.trim() === "")
      return "/api/assets/cardback_spellbook.png";
    return undefined;
  }, [textureUrl, slug]);

  // Load front texture (card art)
  const tex = useCardTexture({
    slug: forceTextureUrl ? "" : slug,
    textureUrl: effectiveTextureUrl,
    preferRaster,
  });

  // Load back texture (card back)
  const backTex = useCardTexture({
    textureUrl: "/api/assets/cardback_spellbook.png",
    preferRaster,
  });

  const instancedMap = useMemo(() => {
    if (!tex) return null;
    if (!textureRotation || Math.abs(textureRotation) < 1e-6) return tex;
    const t = tex.clone();

    // Special-case: token pile uses preferRaster and token textures; rotate without UV invert to prevent smear/stripes.
    const isTokenTexture =
      (props.textureUrl || "").includes("/tokens/") ||
      (props.slug || "").startsWith("token:");
    const isCardbackTexture = (props.textureUrl || "").includes("cardback_");

    t.center.set(0.5, 0.5);
    t.rotation = textureRotation;

    if (isCardbackTexture) {
      // Cardbacks are normalized with a Y-invert (repeat.y=-1, offset.y=1). When combined with rotation,
      // this can sample outside UV bounds and render black; undo the invert for the rotated clone.
      t.repeat.y = 1;
      t.offset.y = 0;
    }

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
        try {
          instancedMap.dispose();
        } catch {
          /* ignore */
        }
      }
    };
  }, [instancedMap, tex]);

  // Detect landscape orientation for scaling and texture adjustment
  const isLandscape = width > height;

  // Create materials with front art and back texture
  const materials = useMemo(() => {
    if (!tex) return null;
    if (cardGeometry) {
      return createObjMaterials(
        instancedMap,
        backTex,
        lit,
        depthWrite,
        depthTest,
        opacity,
        isLandscape,
        envIntensity
      );
    }
    return createBoxMaterials(
      instancedMap,
      backTex,
      lit,
      depthWrite,
      depthTest,
      opacity,
      envIntensity
    );
  }, [
    instancedMap,
    backTex,
    lit,
    depthWrite,
    depthTest,
    opacity,
    tex,
    cardGeometry,
    isLandscape,
    envIntensity,
  ]);

  // Calculate scale for OBJ geometry
  // Use uniform X/Y scaling to preserve rounded corner circles
  const scale = useMemo(() => {
    if (!cardGeometry) return [1, 1, 1] as [number, number, number];
    const uniformScale = isLandscape ? height : width;
    const scaleZ = thickness / thicknessRatio;
    return [uniformScale, uniformScale, scaleZ] as [number, number, number];
  }, [cardGeometry, width, height, thickness, thicknessRatio, isLandscape]);

  // For landscape cards, rotate 90 degrees so the portrait model displays as landscape
  const geometryRotationZ = isLandscape ? Math.PI / 2 : 0;

  // Use box geometry as fallback
  const geometry = useMemo(() => {
    if (cardGeometry) return cardGeometry;
    return getBoxGeometry(width, height, thickness);
  }, [cardGeometry, width, height, thickness]);

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
      geometry={geometry}
      rotation-x={upright ? 0 : -Math.PI / 2}
      rotation-z={rotationZ + geometryRotationZ}
      position={[0, elevation + thickness / 2, 0]}
      scale={cardGeometry ? scale : undefined}
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
      receiveShadow={shouldReceiveShadow}
      material={materials}
    />
  );
});

export default function CardPlane(props: CardPlaneProps) {
  return (
    <Suspense fallback={<CardBackFallback {...props} />}>
      <CardWithTexture {...props} />
    </Suspense>
  );
}
