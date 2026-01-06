"use client";

import Image from "next/image";
import { useGameStore } from "@/lib/game/store";
import type { CardRef, PlayerKey } from "@/lib/game/store";

interface PileZonesProps {
  player: PlayerKey;
  position: "top" | "bottom";
  dragFromHand: boolean;
}

export default function PileZones({
  player,
  position,
  dragFromHand,
}: PileZonesProps) {
  const zones = useGameStore((s) => s.zones);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const phase = useGameStore((s) => s.phase);
  const drawFrom = useGameStore((s) => s.drawFrom);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  // Subscribe to permanents to trigger re-render when Doomsday Cult enters/leaves
  const _permanents = useGameStore((s) => s.permanents);
  const isDoomsdayCultActive = useGameStore((s) => s.isDoomsdayCultActive);

  // Compute whether Doomsday Cult is active (depends on _permanents subscription)
  const doomsdayCultActive = isDoomsdayCultActive();

  const playerNum = player === "p1" ? 1 : 2;
  const playerZones = zones[player];

  const positionClasses =
    position === "top" ? "absolute left-3 top-20" : "absolute left-3 bottom-24";

  const handleDragStart = (
    from: "spellbook" | "atlas" | "graveyard",
    card: CardRef
  ) => {
    setDragFromPile({
      who: player,
      from,
      card,
    });
    setDragFromHand(true);
  };

  const renderPile = (
    pileType: "spellbook" | "atlas" | "graveyard",
    displayName: string,
    cards: CardRef[]
  ) => {
    const topCard = cards[0];
    const canDraw =
      currentPlayer === playerNum && (phase === "Draw" || phase === "Main");

    // Spellbook shows card back unless Doomsday Cult reveals it
    // Atlas and graveyard always show card face
    const showCardFace =
      pileType !== "spellbook" ||
      (pileType === "spellbook" && doomsdayCultActive);

    return (
      <div className="col-span-1">
        <div
          className={`rounded-lg bg-white/10 ring-1 p-2 text-center ${
            pileType === "spellbook" && doomsdayCultActive
              ? "ring-orange-500/50"
              : "ring-white/10"
          }`}
        >
          <div className="opacity-80">{displayName}</div>
          <div className="text-lg font-mono">{cards.length}</div>

          {cards.length > 0 && topCard && (
            <button
              className="mt-1 w-full rounded border border-white/15 bg-white/10 hover:bg-white/20 px-1 py-1"
              title={showCardFace ? topCard.name : "Spellbook"}
              onMouseDown={() => handleDragStart(pileType, topCard)}
              onDragStart={(e) => e.preventDefault()}
            >
              {showCardFace && topCard?.slug ? (
                <div className="relative aspect-[3/4] w-20 mx-auto rounded overflow-visible">
                  <Image
                    src={`/api/images/${topCard.slug}`}
                    alt={topCard.name}
                    fill
                    sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                    className="object-cover"
                    draggable={false}
                    unoptimized
                  />
                </div>
              ) : (
                <div className="w-20 h-28 mx-auto grid place-items-center rounded bg-gradient-to-br from-indigo-900 to-purple-900 text-[10px] opacity-80 ring-1 ring-white/20">
                  <span className="text-white/60">🂠</span>
                </div>
              )}
            </button>
          )}

          {pileType !== "graveyard" && (
            <button
              className="mt-1 w-full rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 disabled:opacity-40"
              disabled={!canDraw}
              onClick={() => drawFrom(player, pileType, 1)}
            >
              Draw
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`${positionClasses} z-10 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-white`}
    >
      <div className="bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow p-3 w-56">
        <div className="text-sm font-semibold mb-2">
          {player.toUpperCase()} Piles
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {renderPile("spellbook", "Spellbook", playerZones.spellbook)}
          {renderPile("atlas", "Atlas", playerZones.atlas)}
          {renderPile("graveyard", "Graveyard", playerZones.graveyard)}
        </div>
      </div>
    </div>
  );
}
