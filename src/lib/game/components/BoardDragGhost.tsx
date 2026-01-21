import type { MutableRefObject } from "react";
import { Group } from "three";
import CardOutline from "@/lib/game/components/CardOutline";
import CardPlane from "@/lib/game/components/CardPlane";
import {
  CARD_LONG,
  CARD_SHORT,
  CARD_THICK,
  PLAYER_COLORS,
} from "@/lib/game/constants";
import type {
  GameState,
  PermanentItem,
  Permanents,
  PlayerKey,
} from "@/lib/game/store/types";
import { TOKEN_BY_NAME, tokenTextureUrl } from "@/lib/game/tokens";

type DragState = { from: string; index: number } | null;

function findAttachmentsFor(
  permanents: Permanents,
  cellKey: string,
  index: number,
): PermanentItem[] {
  const result: PermanentItem[] = [];
  for (const key of Object.keys(permanents)) {
    const items = permanents[key] || [];
    for (const item of items) {
      if (item.attachedTo?.at === cellKey && item.attachedTo.index === index) {
        result.push(item);
      }
    }
  }
  return result;
}

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

  const renderAttachments = (
    attachments: PermanentItem[],
    rotZ: number,
    baseElevation: number,
  ) => {
    if (attachments.length === 0) return null;
    const offsetMultiplier = 0.3;
    const offsetZ = CARD_LONG * 0.4;

    return attachments.map((token, attachIdx) => {
      const tokenName = (token.card.name || "").toLowerCase();
      const attachTokenDef = TOKEN_BY_NAME[tokenName];
      const isArtifact = (token.card.type || "")
        .toLowerCase()
        .includes("artifact");
      const attachOffsetX =
        CARD_SHORT *
        offsetMultiplier *
        (attachIdx - (attachments.length - 1) / 2);

      if (attachTokenDef) {
        const texUrl = tokenTextureUrl(attachTokenDef);
        const tokenW =
          attachTokenDef.size === "small" ? CARD_SHORT * 0.4 : CARD_SHORT * 0.6;
        const tokenH =
          attachTokenDef.size === "small" ? CARD_LONG * 0.4 : CARD_LONG * 0.6;
        return (
          <group
            key={`ghost-attached-${attachIdx}`}
            position={[
              attachOffsetX,
              baseElevation + CARD_THICK * 0.1,
              offsetZ,
            ]}
          >
            <CardPlane
              slug=""
              textureUrl={texUrl}
              forceTextureUrl
              width={tokenW}
              height={tokenH}
              rotationZ={rotZ}
              elevation={0.005}
              renderOrder={1050 + attachIdx}
              interactive={false}
            />
          </group>
        );
      }
      if (isArtifact && token.card.slug) {
        const artifactW = CARD_SHORT * 0.6;
        const artifactH = CARD_LONG * 0.6;
        return (
          <group
            key={`ghost-attached-${attachIdx}`}
            position={[
              attachOffsetX,
              baseElevation + CARD_THICK * 0.15,
              offsetZ,
            ]}
          >
            <CardPlane
              slug={token.card.slug}
              width={artifactW}
              height={artifactH}
              rotationZ={rotZ}
              elevation={0.002}
              renderOrder={1050 + attachIdx}
              interactive={false}
            />
          </group>
        );
      }
      return null;
    });
  };

  const renderAvatarGhost = () => {
    if (!dragAvatar) return null;
    const avatar = avatars?.[dragAvatar];
    const slug = avatar?.card?.slug || "";
    if (!slug) return null;
    const rotZ =
      (dragAvatar === "p1" ? 0 : Math.PI) + (avatar?.tapped ? -Math.PI / 2 : 0);

    // Find attachments on avatar (index -1 means attached to avatar)
    const avatarCellKey = avatar?.pos
      ? `${avatar.pos[0]},${avatar.pos[1]}`
      : null;
    const avatarAttachments = avatarCellKey
      ? findAttachmentsFor(permanents, avatarCellKey, -1)
      : [];

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
        {renderAttachments(avatarAttachments, rotZ, 0)}
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

    const attachments = findAttachmentsFor(
      permanents,
      dragging.from,
      dragging.index,
    );

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
        {renderAttachments(attachments, rotZ, 0)}
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
