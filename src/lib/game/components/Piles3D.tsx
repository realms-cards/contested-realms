"use client";

import { useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import CardPlane from "@/lib/game/components/CardPlane";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PlayerKey } from "@/lib/game/store";
import {
  CARD_LONG,
  CARD_SHORT,
  TILE_SIZE,
  CARD_THICK,
} from "@/lib/game/constants";

export interface Piles3DProps {
  matW: number;
  matH: number;
  owner: PlayerKey; // p1 is TOP, p2 is BOTTOM
}

const labels: Record<"spellbook" | "atlas" | "graveyard", string> = {
  spellbook: "Spellbook",
  atlas: "Atlas",
  graveyard: "Cemetery",
};

type PileKey = keyof Pick<
  ReturnType<typeof useGameStore.getState>["zones"]["p1"],
  "spellbook" | "atlas" | "graveyard"
>;

export default function Piles3D({
  matW: _matW,
  matH: _matH,
  owner,
}: Piles3DProps) {
  const zones = useGameStore((s) => s.zones);
  const boardSize = useGameStore((s) => s.board.size);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const dragFromPile = useGameStore((s) => s.dragFromPile);
  // Intentionally unused in this component after layout refactor
  void _matW;
  void _matH;

  const playerZones = zones[owner];
  // Seat mapping: p1 at TOP, p2 at BOTTOM
  const isBottom = owner === "p2";

  // Sides of the playing grid (inside the playmat), vertical stack per player seat
  const gridHalfW = (boardSize.w * TILE_SIZE) / 2;
  const gridHalfH = (boardSize.h * TILE_SIZE) / 2;
  // Horizontal placement: p1 on RIGHT, p2 on LEFT (mirror)
  const rightX = gridHalfW + TILE_SIZE / 2 - CARD_SHORT / 2;
  const leftX = -gridHalfW - TILE_SIZE / 2 + CARD_SHORT / 2;
  const pilesX = isBottom ? leftX - 0.1 : rightX + 0.1;
  // Anchor just outside the grid on the player's own edge
  const topEdgeZ = -gridHalfH;
  const bottomEdgeZ = gridHalfH;
  const startZ = isBottom
    ? bottomEdgeZ + TILE_SIZE * 0.8 // p2 bottom side
    : topEdgeZ - TILE_SIZE * 0.8; // p1 top side
  // Vertical spacing between piles
  const zSpacing = CARD_LONG * 1.1;
  // Step toward the grid for both players
  const step = isBottom ? -zSpacing : +zSpacing;

  const piles: {
    key: PileKey;
    x: number;
    z: number;
    label: string;
    cards: CardRef[];
  }[] = useMemo(
    () => [
      {
        key: "atlas",
        x: pilesX,
        z: startZ + step * 4.8,
        label: labels.atlas,
        cards: playerZones.atlas,
      },
      {
        key: "spellbook",
        x: pilesX,
        z: startZ + step * 5.9,
        label: labels.spellbook,
        cards: playerZones.spellbook,
      },
      {
        key: "graveyard",
        x: pilesX,
        z: startZ + step * 7.2,
        label: labels.graveyard,
        cards: playerZones.graveyard,
      },
    ],
    [
      pilesX,
      startZ,
      step,
      playerZones.atlas,
      playerZones.spellbook,
      playerZones.graveyard,
    ]
  );

  const hoverTimer = useRef<number | null>(null);
  function beginHoverPreview(card?: CardRef | null) {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    if (!card?.slug) return;
    hoverTimer.current = window.setTimeout(
      () => setPreviewCard(card || null),
      600
    );
  }
  function clearHoverPreview() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPreviewCard(null);
  }

  return (
    <group position={[0, 0.001, 0]}>
      {piles.map(({ key, x, z, label, cards }) => {
        const top = cards[0];
        // Orientation: Atlas landscape, Spellbook/Cemetery portrait regardless of contents
        const isAtlas = key === "atlas";
        const rotZ = isAtlas ? -Math.PI / 2 : 0;
        const w = isAtlas ? CARD_LONG : CARD_SHORT;
        const h = isAtlas ? CARD_SHORT : CARD_LONG;
        return (
          <group key={key} position={[x, 0, z]}>
            {/* Label and count */}
            <Text
              position={[0, 0.002, -h * 0.7]}
              rotation-x={-Math.PI / 2}
              color="#e5e7eb"
              anchorX="center"
              anchorY="middle"
              fontSize={0.18}
            >
              {label} ({cards.length})
            </Text>

            {/* Top card or placeholder */}
            {top ? (
              <group
                onPointerOver={(e) => {
                  const isDragging = !!dragFromHand || !!dragFromPile;
                  if (isDragging) return; // allow bubbling while dragging
                  e.stopPropagation();
                  beginHoverPreview(top);
                }}
                onPointerOut={(e) => {
                  const isDragging = !!dragFromHand || !!dragFromPile;
                  if (isDragging) return; // allow bubbling while dragging
                  e.stopPropagation();
                  clearHoverPreview();
                }}
                onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                  const isDragging = !!dragFromHand || !!dragFromPile;
                  if (isDragging) return; // don't start another drag
                  if (e.button !== 0) return; // left only
                  e.stopPropagation();
                  setDragFromPile({ who: owner, from: key, card: top });
                  setDragFromHand(true);
                }}
              >
                {/* Stack base layers (non-interactive) */}
                {(() => {
                  const layers = Math.min(Math.max(cards.length - 1, 0), 6);
                  // Lightweight deterministic jitter to avoid re-renders causing visible reshuffles
                  const jitter = (seed: number) => {
                    const s = Math.sin(seed * 9301 + 49297) * 233280;
                    return s - Math.floor(s);
                  };
                  return new Array(layers).fill(0).map((_, i) => {
                    const jx = (jitter(i + 1) - 0.5) * 0.006; // ~±0.003
                    const jz = (jitter(i + 1.5) - 0.5) * 0.006;
                    const jrot = (jitter(i + 2) - 0.5) * 0.03; // ~±1.7°
                    return (
                      <mesh
                        key={`layer-${i}`}
                        rotation-z={rotZ + jrot}
                        position={[jx, (i + 1) * CARD_THICK, jz]}
                      >
                        <boxGeometry args={[w, CARD_THICK, h]} />
                        <meshStandardMaterial color="#0f172a" />
                      </mesh>
                    );
                  });
                })()}
                <CardPlane
                  slug={top.slug!}
                  width={w}
                  height={h}
                  rotationZ={rotZ}
                  depthWrite={false}
                  interactive={!(dragFromHand || dragFromPile)}
                  elevation={
                    Math.min(Math.max(cards.length - 1, 0), 6) * CARD_THICK +
                    0.003
                  }
                />
              </group>
            ) : (
              <mesh rotation-x={-Math.PI / 2} rotation-z={rotZ}>
                <planeGeometry args={[w, h]} />
                <meshStandardMaterial color={"#111827"} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
