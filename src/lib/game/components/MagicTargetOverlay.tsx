import CardOutline from "@/lib/game/components/CardOutline";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import type { GameState } from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";

export type MagicTargetOverlayProps = {
  tileX: number;
  tileY: number;
  pendingMagic: GameState["pendingMagic"];
  avatars: GameState["avatars"];
  highlightColor?: string;
  magicGuidesActive: GameState["magicGuidesActive"];
};

export function MagicTargetOverlay({
  tileX,
  tileY,
  pendingMagic,
  avatars,
  highlightColor = "#ef4444",
  magicGuidesActive,
}: MagicTargetOverlayProps) {
  if (!pendingMagic || !magicGuidesActive) {
    return null;
  }

  const hints = pendingMagic.hints;
  const scope = hints?.scope || null;
  const target = pendingMagic.target;

  // If a target is already selected (either in choosingTarget or confirm),
  // only highlight the selected target tile
  if (target) {
    const tileKey = `${tileX},${tileY}` as const;
    let isTargetTile = false;

    if (target.kind === "location" && target.at === tileKey) {
      isTargetTile = true;
    } else if (target.kind === "projectile") {
      // For projectiles, check firstHit or intended target
      // firstHit always has 'at' as CellKey for both permanents and avatars
      const hitTarget = target.firstHit || target.intended;
      if (hitTarget && "at" in hitTarget && hitTarget.at === tileKey) {
        isTargetTile = true;
      } else if (hitTarget && "seat" in hitTarget) {
        // intended target with seat (fallback for when firstHit not available)
        const avatarPos = avatars?.[hitTarget.seat]?.pos as
          | [number, number]
          | null;
        if (Array.isArray(avatarPos)) {
          const avatarTileKey = `${avatarPos[0]},${avatarPos[1]}`;
          if (avatarTileKey === tileKey) {
            isTargetTile = true;
          }
        }
      }
    }

    if (!isTargetTile) return null;

    return (
      <group>
        <CardOutline
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={0}
          elevation={0.00015}
          color={highlightColor}
          renderOrder={1100}
          pulse
        />
      </group>
    );
  }

  // No target selected yet - show all valid targets during choosingTarget
  if (pendingMagic.status !== "choosingTarget") {
    return null;
  }

  if (scope === "projectile") {
    // Use caster position as origin, not spell tile
    let ox = pendingMagic.tile.x;
    let oy = pendingMagic.tile.y;

    try {
      const caster = pendingMagic.caster;
      if (caster && caster.kind === "avatar") {
        const pos = avatars?.[caster.seat]?.pos as [number, number] | null;
        if (Array.isArray(pos)) {
          ox = pos[0];
          oy = pos[1];
        }
      } else if (caster && caster.kind === "permanent") {
        const [cx, cy] = String(caster.at).split(",").map(Number);
        if (Number.isFinite(cx) && Number.isFinite(cy)) {
          ox = cx;
          oy = cy;
        }
      } else {
        // Default to spell owner's avatar
        const seat = seatFromOwner(pendingMagic.spell.owner);
        const pos = avatars?.[seat]?.pos as [number, number] | null;
        if (Array.isArray(pos)) {
          ox = pos[0];
          oy = pos[1];
        }
      }
    } catch {}

    const collinear =
      (ox === tileX || oy === tileY) && !(ox === tileX && oy === tileY);
    if (!collinear) return null;
    return (
      <group>
        <CardOutline
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={0}
          elevation={0.00015}
          color={highlightColor}
          renderOrder={1100}
          pulse
        />
      </group>
    );
  }

  const allowLoc = hints?.allow?.location !== false;
  if (!allowLoc) return null;

  const dx = Math.abs(tileX - pendingMagic.tile.x);
  const dy = Math.abs(tileY - pendingMagic.tile.y);
  const man = dx + dy;

  let show = false;
  if (scope === null || scope === "global") show = true;
  else if (scope === "here") show = man === 0;
  else if (scope === "adjacent") show = man === 1;
  else if (scope === "nearby") show = man <= 2;

  if (!show) return null;

  return (
    <group>
      <CardOutline
        width={CARD_SHORT}
        height={CARD_LONG}
        rotationZ={0}
        elevation={0.00015}
        color={highlightColor}
        renderOrder={1100}
        pulse
      />
    </group>
  );
}
