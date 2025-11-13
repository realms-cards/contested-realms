import type { MutableRefObject } from "react";
import { Group } from "three";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import type { GameState, PlayerKey } from "@/lib/game/store/types";
import { tokenTextureUrl, TOKEN_BY_KEY } from "@/lib/game/tokens";

type DragState = { from: string; index: number } | null;

type HandDragGhostProps = {
  dragFromHand: boolean;
  dragAvatar: PlayerKey | null;
  dragging: DragState;
  selectedCard: GameState["selectedCard"];
  dragFromPile: GameState["dragFromPile"];
  currentPlayer: 1 | 2;
  ghostGroupRef: MutableRefObject<Group | null>;
  lastGhostPosRef: MutableRefObject<{ x: number; z: number }>;
};

export function HandDragGhost({
  dragFromHand,
  dragAvatar,
  dragging,
  selectedCard,
  dragFromPile,
  currentPlayer,
  ghostGroupRef,
  lastGhostPosRef,
}: HandDragGhostProps) {
  if (
    !(
      dragFromHand &&
      !dragAvatar &&
      !dragging &&
      (selectedCard || dragFromPile?.card)
    )
  ) {
    return null;
  }

  const renderSelected = () => {
    if (selectedCard) {
      const card = selectedCard.card;
      const ownerRot = currentPlayer === 1 ? 0 : Math.PI;
      const type = (card.type || "").toLowerCase();
      const isToken = type.includes("token");
      const slug = card.slug || "";
      if (!slug) return null;
      if (slug.startsWith("token:") || isToken) {
        try {
          const key = slug.split(":")[1]?.toLowerCase();
          const def = key ? TOKEN_BY_KEY[key] : undefined;
          let w = CARD_SHORT;
          let h = CARD_LONG;
          if (def && def.size === "small") {
            w = CARD_SHORT * 0.5;
            h = CARD_LONG * 0.5;
          }
          const rotZToken =
            ownerRot + (def && def.siteReplacement ? -Math.PI / 2 : 0);
          return (
            <CardPlane
              slug=""
              width={w}
              height={h}
              rotationZ={rotZToken}
              interactive={false}
              textureUrl={def ? tokenTextureUrl(def) : undefined}
              forceTextureUrl
            />
          );
        } catch {
          return null;
        }
      }
      const isSite = type.includes("site");
      const rotZ = isSite ? -Math.PI / 2 + ownerRot : ownerRot;
      return (
        <CardPlane
          slug={slug}
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={rotZ}
          interactive={false}
        />
      );
    }
    if (dragFromPile?.card) {
      const card = dragFromPile.card;
      const ownerRot = dragFromPile.who === "p1" ? 0 : Math.PI;
      const slug = card.slug || "";
      if (!slug) return null;
      if (slug.startsWith("token:")) {
        try {
          const key = slug.split(":")[1]?.toLowerCase();
          const def = key ? TOKEN_BY_KEY[key] : undefined;
          let w = CARD_SHORT;
          let h = CARD_LONG;
          if (def && def.size === "small") {
            w = CARD_SHORT * 0.5;
            h = CARD_LONG * 0.5;
          }
          const rotZToken =
            ownerRot + (def && def.siteReplacement ? -Math.PI / 2 : 0);
          return (
            <CardPlane
              slug=""
              width={w}
              height={h}
              rotationZ={rotZToken}
              interactive={false}
              textureUrl={def ? tokenTextureUrl(def) : undefined}
              forceTextureUrl
            />
          );
        } catch {
          return null;
        }
      }
      const isSite = (card.type || "").toLowerCase().includes("site");
      const rotZ = isSite ? -Math.PI / 2 + ownerRot : ownerRot;
      return (
        <CardPlane
          slug={slug}
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={rotZ}
          interactive={false}
        />
      );
    }
    return null;
  };

  return (
    <group
      ref={ghostGroupRef}
      position={[
        lastGhostPosRef.current.x,
        0.1,
        lastGhostPosRef.current.z,
      ]}
    >
      {renderSelected()}
    </group>
  );
}
