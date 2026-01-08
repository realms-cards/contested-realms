import type { MutableRefObject } from "react";
import { Group } from "three";
import CardOutline from "@/lib/game/components/CardOutline";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT, PLAYER_COLORS } from "@/lib/game/constants";
import type { GameState, Permanents, PlayerKey } from "@/lib/game/store/types";
import { TOKEN_BY_NAME, tokenTextureUrl } from "@/lib/game/tokens";

type DragState = { from: string; index: number } | null;

type BoardDragGhostProps = {
  dragFromHand: boolean;
  dragFromPile: GameState["dragFromPile"];
  dragging: DragState;
  dragAvatar: PlayerKey | null;
  avatars: GameState["avatars"];
  permanents: Permanents;
  boardGhostRef: MutableRefObject<Group | null>;
  lastBoardGhostPosRef: MutableRefObject<{ x: number; z: number }>;
  enableGhostOnlyMode: boolean;
};

export function BoardDragGhost({
  dragFromHand,
  dragFromPile,
  dragging,
  dragAvatar,
  avatars,
  permanents,
  boardGhostRef,
  lastBoardGhostPosRef,
  enableGhostOnlyMode,
}: BoardDragGhostProps) {
  const shouldRender =
    dragFromHand ||
    dragFromPile ||
    (enableGhostOnlyMode && (Boolean(dragging) || Boolean(dragAvatar)));
  if (!shouldRender) {
    return null;
  }

  const renderAvatarGhost = () => {
    if (!dragAvatar) return null;
    const avatar = avatars?.[dragAvatar];
    const slug = avatar?.card?.slug || "";
    if (!slug) return null;
    const rotZ =
      (dragAvatar === "p1" ? 0 : Math.PI) + (avatar?.tapped ? -Math.PI / 2 : 0);
    return (
      <>
        <CardOutline
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={rotZ}
          elevation={0.0001}
          color={dragAvatar === "p1" ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2}
          renderOrder={1000}
        />
        <CardPlane
          slug={slug}
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={rotZ}
          interactive={false}
        />
      </>
    );
  };

  const renderPermanentGhost = () => {
    if (!dragging) return null;
    const list = permanents[dragging.from] || [];
    const p = list[dragging.index];
    if (!p || !p.card) return null;
    const isToken = (p.card.type || "").toLowerCase().includes("token");
    const tokenDef = isToken
      ? TOKEN_BY_NAME[(p.card.name || "").toLowerCase()]
      : undefined;
    let w = CARD_SHORT;
    let h = CARD_LONG;
    if (isToken && tokenDef?.size === "small") {
      w = CARD_SHORT * 0.5;
      h = CARD_LONG * 0.5;
    }
    const ownerRot = p.owner === 1 ? 0 : Math.PI;
    const rotZ =
      ownerRot +
      (tokenDef?.siteReplacement ? -Math.PI / 2 : 0) +
      (p.tapped ? -Math.PI / 2 : 0) +
      (p.tilt || 0);
    const slug = isToken ? "" : p.card.slug || "";
    const textureUrl =
      isToken && tokenDef ? tokenTextureUrl(tokenDef) : undefined;
    return (
      <>
        <CardOutline
          width={w}
          height={h}
          rotationZ={rotZ}
          elevation={0.0001}
          color={p.owner === 1 ? PLAYER_COLORS.p1 : PLAYER_COLORS.p2}
          renderOrder={1000}
        />
        <CardPlane
          slug={slug}
          width={w}
          height={h}
          rotationZ={rotZ}
          interactive={false}
          textureUrl={textureUrl}
          forceTextureUrl={Boolean(textureUrl)}
          textureRotation={tokenDef?.textureRotation ?? 0}
        />
      </>
    );
  };

  return (
    <group
      ref={boardGhostRef}
      position={[
        lastBoardGhostPosRef.current.x,
        0.26,
        lastBoardGhostPosRef.current.z,
      ]}
    >
      {dragAvatar ? renderAvatarGhost() : renderPermanentGhost()}
    </group>
  );
}
