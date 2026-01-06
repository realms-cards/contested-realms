"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef, useEffect } from "react";
import { cardbackAtlasUrl, cardbackSpellbookUrl } from "@/lib/assets";
import { useSound } from "@/lib/contexts/SoundContext";
import { cardRefToPreview } from "@/lib/game/card-preview.types";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import CardPlane from "@/lib/game/components/CardPlane";
import MaterialCardBack from "@/lib/game/components/MaterialCardBack";
import {
  CARD_LONG,
  CARD_SHORT,
  CARD_THICK,
  TILE_SIZE,
} from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PlayerKey } from "@/lib/game/store";

export interface Piles3DProps {
  matW: number;
  matH: number;
  owner: PlayerKey; // p1 is TOP, p2 is BOTTOM
  noRaycast?: boolean; // Disable raycast to prevent interference
  // Enhanced preview functions (optional for compatibility)
  showCardPreview?: (card: CardPreviewData) => void;
  hideCardPreview?: () => void;
}

const labels: Record<
  "spellbook" | "atlas" | "graveyard" | "collection",
  string
> = {
  spellbook: "Spellbook",
  atlas: "Atlas",
  graveyard: "Cemetery",
  collection: "Collection",
};

type PileKey = keyof Pick<
  ReturnType<typeof useGameStore.getState>["zones"]["p1"],
  "spellbook" | "atlas" | "graveyard" | "collection"
>;

type PlayerZones = ReturnType<typeof useGameStore.getState>["zones"]["p1"];

export default function Piles3D({
  matW: _matW,
  matH: _matH,
  owner,
  noRaycast = false,
  showCardPreview,
  hideCardPreview,
}: Piles3DProps) {
  const zones = useGameStore((s) => s.zones);
  const boardSize = useGameStore((s) => s.board.size);
  const cardbackUrls = useGameStore((s) => s.cardbackUrls);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  // Subscribe to permanents to trigger re-render when Doomsday Cult enters/leaves
  const _permanents = useGameStore((s) => s.permanents);
  const isDoomsdayCultActive = useGameStore((s) => s.isDoomsdayCultActive);
  // Compute whether Doomsday Cult is active (reveals spellbook tops)
  const doomsdayCultActive = isDoomsdayCultActive();
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const dragFromPile = useGameStore((s) => s.dragFromPile);
  const openContextMenu = useGameStore((s) => s.openContextMenu);
  const openPlacementDialog = useGameStore((s) => s.openPlacementDialog);
  const { playCardFlip, playCardSelect } = useSound();
  // Intentionally unused in this component after layout refactor
  void _matW;
  void _matH;

  const emptyPlayerZones = useMemo<PlayerZones>(
    () => ({
      spellbook: [],
      atlas: [],
      hand: [],
      graveyard: [],
      battlefield: [],
      collection: [],
      banished: [],
    }),
    []
  );

  const playerZones = zones?.[owner] ?? emptyPlayerZones;
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

  // Collection is now rendered as a UI button overlay, not a 3D pile
  const piles: {
    key: PileKey;
    x: number;
    z: number;
    cards: CardRef[];
  }[] = useMemo(
    () => [
      {
        key: "atlas",
        x: pilesX,
        z: startZ + step * 4.8,
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

    // Use enhanced preview if available, otherwise fall back to legacy
    if (showCardPreview) {
      const preview = cardRefToPreview(card);
      if (preview) {
        showCardPreview(preview);
        return;
      }
    }

    hoverTimer.current = window.setTimeout(
      () => setPreviewCard(card || null),
      600
    );
  }
  function clearHoverPreview() {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;

    // Use enhanced preview if available, otherwise fall back to legacy
    if (hideCardPreview) {
      hideCardPreview();
    } else {
      setPreviewCard(null);
    }
  }

  const pileDragStartRef = useRef<{
    who: PlayerKey;
    key: PileKey;
    start: [number, number];
    time: number;
  } | null>(null);

  // Targeted cleanup for pile drag gating only during focus/visibility changes
  useEffect(() => {
    const resetPileDrag = () => {
      pileDragStartRef.current = null;
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") resetPileDrag();
    };
    window.addEventListener("blur", resetPileDrag);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", resetPileDrag);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <group position={[0, 0.001, 0]}>
      {piles.map(({ key, x, z, cards }) => {
        // Orientation: Atlas landscape, Spellbook/Cemetery portrait regardless of contents
        const isAtlas = key === "atlas";
        const isCemetery = key === "graveyard";
        // Face the pile toward the owning seat: p1 (top) flipped 180°, p2 (bottom) normal
        const ownerRot = owner === "p1" ? Math.PI : 0;
        // Cemetery faces the bottom player (p2 perspective)
        const rotZ = isCemetery
          ? owner === "p1"
            ? 0
            : Math.PI
          : ownerRot + Math.PI;
        // Atlas needs 180° extra rotation to display upright (landscape card with portrait-oriented texture)
        const pileRotZ = isAtlas ? rotZ + Math.PI : rotZ;
        const ownerCardbacks = cardbackUrls[owner];
        const presetId = !isCemetery ? ownerCardbacks?.preset : null;
        const cardbackUrl = isCemetery
          ? undefined
          : presetId
          ? undefined
          : key === "atlas"
          ? ownerCardbacks?.atlas ?? cardbackAtlasUrl()
          : ownerCardbacks?.spellbook ?? cardbackSpellbookUrl();
        const w = isAtlas ? CARD_LONG : CARD_SHORT;
        const h = isAtlas ? CARD_SHORT : CARD_LONG;
        // Physically realistic pile: use real card thickness for all cards
        // Multiply by 2 to ensure enough depth buffer separation and visible stack effect
        const stackSpacing = CARD_THICK * 2;
        const visibleStackCount = cards.length - 1;
        const topCardElevation = visibleStackCount * stackSpacing;
        return (
          <group key={key} position={[x, 0, z]}>
            {/* Stack visualization with realistic thickness */}
            {cards.length > 0 ? (
              <group>
                {/* Bottom cards for stack depth (non-interactive) */}
                {cards
                  .slice(1)
                  .filter((card) => card.slug) // Only render cards with valid slugs
                  .map((card, stackIndex) =>
                    presetId ? (
                      <MaterialCardBack
                        key={`stack-${card.slug}-${stackIndex}`}
                        presetId={presetId}
                        width={w}
                        height={h}
                        rotationZ={pileRotZ}
                        depthWrite={false}
                        interactive={false}
                        elevation={stackIndex * stackSpacing}
                      />
                    ) : (
                      <CardPlane
                        key={`stack-${card.slug}-${stackIndex}`}
                        slug={card.slug || ""}
                        textureUrl={cardbackUrl}
                        forceTextureUrl={!isCemetery}
                        width={w}
                        height={h}
                        rotationZ={pileRotZ}
                        depthWrite={false}
                        interactive={false}
                        elevation={stackIndex * stackSpacing}
                      />
                    )
                  )}

                {/* Top card (interactive) - add invisible mesh for reliable clicking */}
                <group>
                  {/* Invisible clickable area */}
                  <mesh
                    rotation-x={-Math.PI / 2}
                    rotation-z={pileRotZ}
                    position={[0, topCardElevation + 0.001, 0]}
                    raycast={noRaycast ? () => [] : undefined}
                    onPointerOver={() => {
                      const isDragging = !!dragFromHand || !!dragFromPile;
                      if (isDragging) return;
                      // Don't stop propagation - allow orbit controls
                      if (isCemetery) beginHoverPreview(cards[0]);
                    }}
                    onPointerOut={() => {
                      const isDragging = !!dragFromHand || !!dragFromPile;
                      if (isDragging) return;
                      // Don't stop propagation - allow orbit controls
                      clearHoverPreview();
                      // Cancel pending drag gating if pointer leaves before threshold
                      if (
                        pileDragStartRef.current &&
                        pileDragStartRef.current.key === key &&
                        pileDragStartRef.current.who === owner
                      ) {
                        pileDragStartRef.current = null;
                      }
                    }}
                    onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                      // Right-click context menu for piles (top card)
                      const isDragging = !!dragFromHand || !!dragFromPile;
                      if (isDragging) return;
                      e.nativeEvent.preventDefault();
                      e.stopPropagation();
                      // Cancel any pending drag gating when opening the menu
                      pileDragStartRef.current = null;
                      const pileType =
                        key === "atlas"
                          ? "atlas"
                          : key === "graveyard"
                          ? "graveyard"
                          : key === "collection"
                          ? "collection"
                          : "spellbook";
                      openContextMenu(
                        { kind: "pile", who: owner, from: pileType },
                        { x: e.clientX, y: e.clientY }
                      );
                      clearHoverPreview();
                    }}
                    onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                      if (e.button !== 0) return; // left button only
                      const isDragging = !!dragFromHand || !!dragFromPile;
                      if (isDragging) return;
                      if (isCemetery) return;
                      // Start tracking for potential drag from atlas or spellbook
                      if (
                        (isAtlas || key === "spellbook") &&
                        cards.length > 0
                      ) {
                        const store = useGameStore.getState();
                        const actorKey = store.actorKey;
                        const isMine = !actorKey || actorKey === owner;
                        if (store.transport && !isMine) return;
                        pileDragStartRef.current = {
                          who: owner,
                          key: key as PileKey,
                          start: [e.clientX, e.clientY],
                          time: Date.now(),
                        };
                      }
                    }}
                    onClick={(_e: ThreeEvent<PointerEvent>) => {
                      void _e;
                      const isDragging = !!dragFromHand || !!dragFromPile;
                      if (isDragging) return;
                      if (isCemetery) return;
                      // If we started a drag, don't process click
                      if (pileDragStartRef.current) {
                        pileDragStartRef.current = null;
                        return;
                      }
                      const store = useGameStore.getState();
                      const actorKey = store.actorKey;
                      const isMine = !actorKey || actorKey === owner;
                      if (store.transport && !isMine) return;
                      const from = (key === "atlas" ? "atlas" : "spellbook") as
                        | "atlas"
                        | "spellbook";
                      store.drawFrom(owner, from, 1);
                      try {
                        playCardSelect();
                      } catch {}
                    }}
                    onPointerMove={(e: ThreeEvent<PointerEvent>) => {
                      // Check if we should initiate a drag from atlas or spellbook
                      const dragStart = pileDragStartRef.current;
                      if (
                        (isAtlas || key === "spellbook") &&
                        dragStart &&
                        dragStart.key === key &&
                        dragStart.who === owner
                      ) {
                        const [startX, startY] = dragStart.start;
                        const dx = e.clientX - startX;
                        const dy = e.clientY - startY;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        // Threshold to distinguish drag from click
                        if (distance > 8) {
                          // Initiate drag from pile with top card
                          const topCard = cards[0];
                          if (topCard) {
                            const pileFrom = isAtlas ? "atlas" : "spellbook";
                            setDragFromPile({
                              who: owner,
                              from: pileFrom,
                              card: topCard,
                            });
                            setDragFromHand(true);
                            try {
                              playCardSelect();
                            } catch {}
                          }
                          pileDragStartRef.current = null;
                        }
                      }
                    }}
                    onPointerUp={(e: ThreeEvent<PointerEvent>) => {
                      if (e.button !== 0) return; // only handle left-button releases for drops
                      // Always clear any pending drag gating on release
                      pileDragStartRef.current = null;
                      const isDragging = !!dragFromHand || !!dragFromPile;
                      if (!isDragging) return;
                      // Don't stop propagation - allow orbit controls

                      // Handle drops to piles
                      const store = useGameStore.getState();
                      if (dragFromHand && store.selectedCard) {
                        const card = store.selectedCard;
                        const typeLc = String(
                          card.card?.type || ""
                        ).toLowerCase();
                        // Non-site cards go to Spellbook
                        if (key === "spellbook" && !typeLc.includes("site")) {
                          const pileName = "Spellbook";
                          openPlacementDialog(
                            card.card?.name || "Card",
                            pileName,
                            (position) => {
                              store.moveCardFromHandToPile(
                                owner,
                                "spellbook",
                                position
                              );
                              try {
                                playCardFlip();
                              } catch {}
                              setDragFromHand(false);
                              store.clearSelection();
                              store.closePlacementDialog();
                            }
                          );
                          // Site cards go to Atlas
                        } else if (key === "atlas" && typeLc.includes("site")) {
                          const pileName = "Atlas";
                          openPlacementDialog(
                            card.card?.name || "Card",
                            pileName,
                            (position) => {
                              store.moveCardFromHandToPile(
                                owner,
                                "atlas",
                                position
                              );
                              try {
                                playCardFlip();
                              } catch {}
                              setDragFromHand(false);
                              store.clearSelection();
                              store.closePlacementDialog();
                            }
                          );
                        } else {
                          // Invalid drop - just cancel
                          setDragFromHand(false);
                          store.clearSelection();
                        }
                      } else if (dragFromPile) {
                        // Handle pile-to-pile moves if needed; for now, cancel
                        setDragFromPile(null);
                        setDragFromHand(false);
                        store.clearSelection();
                      }
                    }}
                  >
                    <planeGeometry args={[w, h]} />
                    <meshBasicMaterial transparent opacity={0} />
                  </mesh>

                  {/* Visual card */}
                  {/* Doomsday Cult reveals spellbook top - show card face instead of back */}
                  {(() => {
                    const isSpellbook = key === "spellbook";
                    const showFace =
                      isCemetery || (isSpellbook && doomsdayCultActive);
                    return presetId && !showFace ? (
                      <MaterialCardBack
                        presetId={presetId}
                        width={w}
                        height={h}
                        rotationZ={pileRotZ}
                        depthWrite={true}
                        interactive={false}
                        elevation={topCardElevation}
                      />
                    ) : (
                      <CardPlane
                        slug={cards[0].slug || ""}
                        textureUrl={showFace ? undefined : cardbackUrl}
                        forceTextureUrl={!showFace}
                        width={w}
                        height={h}
                        rotationZ={pileRotZ}
                        depthWrite={true}
                        interactive={false}
                        elevation={topCardElevation}
                      />
                    );
                  })()}
                </group>
              </group>
            ) : // Empty pile placeholder - skip for cemetery (no visual indicator)
            isCemetery ? null : (
              <mesh
                rotation-x={-Math.PI / 2}
                rotation-z={pileRotZ}
                position={[0, 0.001, 0]}
                raycast={noRaycast ? () => [] : undefined}
                onContextMenu={(e: ThreeEvent<PointerEvent>) => {
                  // Right click: open context menu for empty pile
                  const isDragging = !!dragFromHand || !!dragFromPile;
                  if (isDragging) return;
                  e.nativeEvent.preventDefault();
                  e.stopPropagation();
                  // Cancel any pending drag gating when opening the menu
                  pileDragStartRef.current = null;
                  const pileType =
                    key === "atlas"
                      ? "atlas"
                      : key === "collection"
                      ? "collection"
                      : "spellbook";
                  openContextMenu(
                    { kind: "pile", who: owner, from: pileType },
                    { x: e.clientX, y: e.clientY }
                  );
                  clearHoverPreview();
                }}
                onPointerUp={(e: ThreeEvent<PointerEvent>) => {
                  if (e.button !== 0) return; // left button release only
                  const isDragging = !!dragFromHand || !!dragFromPile;
                  if (!isDragging) return;
                  // Don't stop propagation - allow orbit controls

                  // Handle drops to empty piles
                  const store = useGameStore.getState();
                  if (dragFromHand && store.selectedCard) {
                    const card = store.selectedCard;
                    const typeLc = String(card.card?.type || "").toLowerCase();

                    // Non-site cards go to Spellbook
                    if (key === "spellbook" && !typeLc.includes("site")) {
                      const pileName = "Spellbook";
                      openPlacementDialog(
                        card.card?.name || "Card",
                        pileName,
                        (position) => {
                          store.moveCardFromHandToPile(
                            owner,
                            "spellbook",
                            position
                          );
                          try {
                            playCardFlip();
                          } catch {}
                          setDragFromHand(false);
                          store.clearSelection();
                          store.closePlacementDialog();
                        }
                      );
                      // Site cards go to Atlas
                    } else if (key === "atlas" && typeLc.includes("site")) {
                      const pileName = "Atlas";
                      openPlacementDialog(
                        card.card?.name || "Card",
                        pileName,
                        (position) => {
                          store.moveCardFromHandToPile(
                            owner,
                            "atlas",
                            position
                          );
                          try {
                            playCardFlip();
                          } catch {}
                          setDragFromHand(false);
                          store.clearSelection();
                          store.closePlacementDialog();
                        }
                      );
                    } else {
                      // Invalid drop - cancel
                      setDragFromHand(false);
                      store.clearSelection();
                    }
                  } else if (dragFromPile) {
                    // For now, cancel pile-to-pile on empty placeholder
                    setDragFromPile(null);
                    setDragFromHand(false);
                    store.clearSelection();
                  }
                }}
              >
                <planeGeometry args={[w, h]} />
                <meshStandardMaterial
                  color="#374151"
                  transparent
                  opacity={0.3}
                  depthWrite={true}
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}
