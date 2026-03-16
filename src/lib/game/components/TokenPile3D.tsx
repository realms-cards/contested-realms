"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import CardPlane from "@/lib/game/components/CardPlane";
import { TILE_SIZE, CARD_SHORT, CARD_LONG } from "@/lib/game/constants";
import type { PlayerKey } from "@/lib/game/store";
import { useGameStore } from "@/lib/game/store";
// No label text for tokens pile
import {
  TOKEN_DEFS,
  tokenTextureUrl,
  tokenSlug,
  newTokenInstanceId,
} from "@/lib/game/tokens";

export interface TokenPile3DProps {
  owner: PlayerKey; // p1 is TOP, p2 is BOTTOM
  noRaycast?: boolean; // Disable raycast for spectator mode
}

// A simple face-up token "pile" that lives on the player's left side, lower third of the playmat.
// Right-clicking opens a search dialog with all known tokens; selecting one adds it to the player's hand.
export default function TokenPile3D({
  owner,
  noRaycast = false,
}: TokenPile3DProps) {
  const boardSize = useGameStore((s) => s.board.size);
  const openContextMenu = useGameStore((s) => s.openContextMenu);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const actorKey = useGameStore((s) => s.actorKey);
  const transport = useGameStore((s) => s.transport);

  // Only allow interaction with own token pile in online play
  const isMine = !actorKey || actorKey === owner;

  // Compute position: align with card piles column (Piles3D) at top third of the column
  const { x, z, rotZ } = useMemo(() => {
    const gridHalfW = (boardSize.w * TILE_SIZE) / 2;
    const gridHalfH = (boardSize.h * TILE_SIZE) / 2;
    const isBottom = owner === "p2";
    // Piles3D side X
    const rightX = gridHalfW + TILE_SIZE / 2 - CARD_SHORT / 2;
    const leftX = -gridHalfW - TILE_SIZE / 2 + CARD_SHORT / 2;
    const pilesX = isBottom ? leftX - 0.1 : rightX + 0.1;
    // Piles3D Z anchors
    const topEdgeZ = -gridHalfH;
    const bottomEdgeZ = gridHalfH;
    const startZ = isBottom
      ? bottomEdgeZ + TILE_SIZE * 0.8
      : topEdgeZ - TILE_SIZE * 0.8;
    const zSpacing = CARD_LONG * 1.1;
    const step = isBottom ? -zSpacing : +zSpacing;
    const posZ = startZ + step * 3.2; // a bit further up toward top edge
    const ownerRot = owner === "p1" ? 0 : Math.PI;
    return { x: pilesX, z: posZ, rotZ: ownerRot };
  }, [boardSize.w, boardSize.h, owner]);

  const [expanded, setExpanded] = useState(false);
  const lastInteractRef = useRef<number>(0);
  const autoCloseTimerRef = useRef<number | null>(null);
  const AUTO_CLOSE_MS = 3000; // keep visible longer

  function bumpInteractClock() {
    lastInteractRef.current = Date.now();
    if (autoCloseTimerRef.current)
      window.clearTimeout(autoCloseTimerRef.current);
    autoCloseTimerRef.current = window.setTimeout(() => {
      // Only collapse if no interaction since timer start
      if (Date.now() - lastInteractRef.current >= AUTO_CLOSE_MS) {
        setExpanded(false);
      }
    }, AUTO_CLOSE_MS);
  }

  useEffect(() => {
    return () => {
      if (autoCloseTimerRef.current)
        window.clearTimeout(autoCloseTimerRef.current);
    };
  }, []);
  const dragStartRef = useRef<{
    tokenKey: string;
    x: number;
    y: number;
    t: number;
  } | null>(null);

  // Long-press for context menu on mobile/touch
  const tokenLongPressRef = useRef<number | null>(null);
  function clearTokenLongPress() {
    if (tokenLongPressRef.current) {
      window.clearTimeout(tokenLongPressRef.current);
      tokenLongPressRef.current = null;
    }
  }

  return (
    <group position={[x, 0.002, z]}>
      {/* Base pile */}
      <group
        onPointerDown={
          noRaycast
            ? undefined
            : (e: ThreeEvent<PointerEvent>) => {
                if (e.button !== 0) return;
                const pe = e.nativeEvent as PointerEvent | undefined;
                const isTouchEvent =
                  pe &&
                  (pe.pointerType === "touch" ||
                    !window.matchMedia("(pointer: fine)").matches);
                if (!isTouchEvent) return;
                if (transport && !isMine) return;
                clearTokenLongPress();
                const cx = e.clientX;
                const cy = e.clientY;
                tokenLongPressRef.current = window.setTimeout(() => {
                  tokenLongPressRef.current = null;
                  openContextMenu(
                    { kind: "tokenpile", who: owner },
                    { x: cx, y: cy },
                  );
                }, 500) as unknown as number;
              }
        }
        onPointerOut={noRaycast ? undefined : () => clearTokenLongPress()}
        onContextMenu={
          noRaycast
            ? undefined
            : (e: ThreeEvent<PointerEvent>) => {
                e.nativeEvent.preventDefault();
                e.stopPropagation();
                if (transport && !isMine) return;
                openContextMenu(
                  { kind: "tokenpile", who: owner },
                  { x: e.clientX, y: e.clientY }
                );
              }
        }
        onClick={
          noRaycast
            ? undefined
            : (e: ThreeEvent<MouseEvent>) => {
                clearTokenLongPress();
                e.stopPropagation();
                if (transport && !isMine) return;
                setExpanded((v) => !v);
                bumpInteractClock();
              }
        }
        onPointerMove={noRaycast ? undefined : () => bumpInteractClock()}
      >
        {/* Small stacked visuals with Disabled on top */}
        {(() => {
          const texTop = "/api/assets/cardback_spellbook.png";
          const w = CARD_SHORT * 0.5;
          const h = CARD_LONG * 0.5;
          const layers = 3;
          return (
            <group>
              {[...Array(layers)].map((_, i) => (
                <CardPlane
                  key={`pile-layer-${i}`}
                  slug={""}
                  textureUrl={texTop}
                  forceTextureUrl
                  width={w}
                  height={h}
                  rotationZ={rotZ}
                  elevation={0.001 * i}
                />
              ))}
            </group>
          );
        })()}
      </group>

      {/* Expanded fan */}
      {expanded && (
        <group
          position={[0, 0.02, 0]}
          onPointerMove={() => bumpInteractClock()}
        >
          {(() => {
            const defsAll = TOKEN_DEFS.filter((d) => !d.markerOnly);
            const small = defsAll.filter((d) => d.size !== "normal");
            const leftCount = Math.floor(small.length / 2);
            const left = small.slice(0, leftCount);
            const right = small.slice(leftCount);
            const defs = [...left, ...right];
            const N = defs.length;
            // Circular fan like before: arc opens outward from pile center
            const spread = Math.max(1.4, Math.min(2.6, N * 0.22));
            const start = -spread / 2;
            return defs.map((def, i) => {
              const t = i / Math.max(1, N - 1);
              const angle = start + t * spread;
              const radius = 1.35;
              const px = Math.sin(angle) * radius;
              const pz = Math.cos(angle) * radius * (owner === "p2" ? 1 : -1);
              const w = def.size === "small" ? CARD_SHORT * 0.5 : CARD_SHORT;
              const h = def.size === "small" ? CARD_LONG * 0.5 : CARD_LONG;
              const tex = tokenTextureUrl(def);
              // Match board orientation; Rubble gets site-like -90°
              const rotated = def.siteReplacement ? -Math.PI / 2 : 0;

              return (
                <group key={def.key} position={[px, 0, pz]}>
                  {/* Drag surface */}
                  <mesh
                    rotation-x={-Math.PI / 2}
                    rotation-z={rotZ + rotated}
                    onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      const store = useGameStore.getState();
                      if (store.transport && !isMine) return;
                      dragStartRef.current = {
                        tokenKey: def.key,
                        x: e.clientX,
                        y: e.clientY,
                        t: Date.now(),
                      };
                      // Start drag immediately
                      const card = {
                        cardId: newTokenInstanceId(def),
                        variantId: null,
                        name: def.name,
                        type: "Token",
                        slug: tokenSlug(def),
                        thresholds: null,
                      };
                      // Clear any selected hand card and preview to prevent accidental plays
                      store.clearSelection?.();
                      store.setPreviewCard?.(null);
                      setDragFromPile({ who: owner, from: "tokens", card });
                      setDragFromHand(true);
                      bumpInteractClock();
                      // Collapse the fan immediately so tiles receive pointer moves for ghost
                      setExpanded(false);
                    }}
                  >
                    <planeGeometry args={[w, h]} />
                    <meshBasicMaterial transparent opacity={0} />
                  </mesh>
                  <CardPlane
                    slug={""}
                    textureUrl={tex}
                    forceTextureUrl
                    preferRaster
                    width={w}
                    height={h}
                    rotationZ={rotZ + rotated}
                    elevation={0.005}
                    renderOrder={650}
                    onPointerOver={() => bumpInteractClock()}
                  />
                </group>
              );
            });
          })()}
        </group>
      )}

      {/* Big tokens (Bruin, Rubble) placed in the center gap of the fan */}
      {expanded && (
        <group
          position={[0, 0.03, 0]}
          onPointerMove={() => bumpInteractClock()}
        >
          {(() => {
            const big = TOKEN_DEFS.filter((d) => d.size === "normal" && !d.markerOnly);
            if (big.length === 0) return null;
            const gapRadius = 0.55;
            const baseZ = Math.cos(0) * gapRadius * (owner === "p2" ? 1 : -1);
            const centers: Array<[number, number]> =
              big.length === 1
                ? [[0, baseZ]]
                : [
                    [-CARD_SHORT * 0.6, baseZ],
                    [CARD_SHORT * 0.6, baseZ],
                  ];
            return big.map((def, i) => {
              const [px, pz] = centers[i] || [0, baseZ];
              const w = CARD_SHORT;
              const h = CARD_LONG;
              const tex = tokenTextureUrl(def);
              // Match board orientation; Rubble gets site-like -90°
              const rotated = def.siteReplacement ? -Math.PI / 2 : 0;
              return (
                <group key={`big-${def.key}`} position={[px, 0, pz]}>
                  <mesh
                    rotation-x={-Math.PI / 2}
                    rotation-z={rotZ + rotated}
                    onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      const store = useGameStore.getState();
                      if (store.transport && !isMine) return;
                      const card = {
                        cardId: newTokenInstanceId(def),
                        variantId: null,
                        name: def.name,
                        type: "Token",
                        slug: tokenSlug(def),
                        thresholds: null,
                      };
                      // Clear any selected hand card and preview to prevent accidental plays
                      store.clearSelection?.();
                      store.setPreviewCard?.(null);
                      setDragFromPile({ who: owner, from: "tokens", card });
                      setDragFromHand(true);
                      bumpInteractClock();
                      setExpanded(false);
                    }}
                  >
                    <planeGeometry args={[w, h]} />
                    <meshBasicMaterial transparent opacity={0} />
                  </mesh>
                  <CardPlane
                    slug={""}
                    textureUrl={tex}
                    forceTextureUrl
                    preferRaster
                    width={w}
                    height={h}
                    rotationZ={rotZ + rotated}
                    elevation={0.01}
                    renderOrder={660}
                    onPointerOver={() => bumpInteractClock()}
                  />
                </group>
              );
            });
          })()}
        </group>
      )}
    </group>
  );
}
