"use client";

import { ManaCounterHUD } from "@/components/game/manacost";
import { useGameStore, type PlayerKey } from "@/lib/game/store";

export interface ManaOverlayProps {
  owner: PlayerKey;
}

/**
 * 2D overlay for mana display - positioned via CSS to avoid z-index issues with Hand3D
 */
export default function ManaOverlay({ owner }: ManaOverlayProps) {
  const baseMana = useGameStore((s) => s.getBaseMana(owner));
  const mana = useGameStore((s) => s.getAvailableMana(owner));
  const actorKey = useGameStore((s) => s.actorKey);
  const addMana = useGameStore((s) => s.addMana);
  const dragFromHand = useGameStore((s) => s.dragFromHand);

  const canAdjust = (actorKey ? actorKey === owner : true) && !dragFromHand;

  // P1 = bottom-right, P2 = top-right (from viewer's perspective)
  const isP1 = owner === "p1";

  return (
    <div
      className={`absolute z-10 pointer-events-auto ${
        isP1 ? "bottom-28 right-3" : "top-3 right-3"
      }`}
    >
      <ManaCounterHUD
        value={mana}
        total={baseMana}
        onIncrement={canAdjust ? () => addMana(owner, 1) : undefined}
        onDecrement={canAdjust ? () => addMana(owner, -1) : undefined}
        disableInc={!canAdjust}
        disableDec={!canAdjust}
        size={20}
      />
    </div>
  );
}
