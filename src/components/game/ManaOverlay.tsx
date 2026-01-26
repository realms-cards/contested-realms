"use client";

import { ManaCounterHUD } from "@/components/game/manacost";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import { siteProvidesMana } from "@/lib/game/store/utils/resourceHelpers";

export interface ManaOverlayProps {
  owner: PlayerKey;
}

/**
 * 2D overlay for mana display - positioned via CSS to avoid z-index issues with Hand3D
 */
export default function ManaOverlay({ owner }: ManaOverlayProps) {
  const ownerNum = owner === "p1" ? 1 : 2;

  // Subscribe to player state (like LifeCounters does) - this triggers re-renders on changes
  const playerState = useGameStore((s) => s.players[owner]);
  const sites = useGameStore((s) => s.board.sites);
  const actorKey = useGameStore((s) => s.actorKey);
  const addMana = useGameStore((s) => s.addMana);
  const dragFromHand = useGameStore((s) => s.dragFromHand);

  // Compute mana from subscribed state
  const playerMana = playerState?.mana ?? 0;
  let baseMana = 0;
  for (const site of Object.values(sites)) {
    if (!site) continue;
    if (site.owner === ownerNum && siteProvidesMana(site.card ?? null)) {
      baseMana++;
    }
  }
  const mana = Math.max(0, baseMana + playerMana);

  const canAdjust = (actorKey ? actorKey === owner : true) && !dragFromHand;
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
