import CardOutline from "@/lib/game/components/CardOutline";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import type { GameState } from "@/lib/game/store/types";

export type MagicTargetOverlayProps = {
  tileX: number;
  tileY: number;
  pendingMagic: GameState["pendingMagic"];
  highlightColor?: string;
};

export function MagicTargetOverlay({
  tileX,
  tileY,
  pendingMagic,
  highlightColor = "#ef4444",
}: MagicTargetOverlayProps) {
  if (!pendingMagic || pendingMagic.status !== "choosingTarget") {
    return null;
  }

  const hints = pendingMagic.hints;
  const scope = hints?.scope || null;

  if (scope === "projectile") {
    const ox = pendingMagic.tile.x;
    const oy = pendingMagic.tile.y;
    const collinear = (ox === tileX || oy === tileY) && !(ox === tileX && oy === tileY);
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

