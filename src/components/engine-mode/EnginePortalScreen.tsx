"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { ClientCanvas } from "@/components/game/ClientCanvas";
import { RcButton } from "@/components/ui/rc-button";
import { harbingerTiles } from "@/lib/engine-mode/projection";
import { HUMAN_SEAT, useEngineSession } from "@/lib/engine-mode/session";
import D20Dice from "@/lib/game/components/D20Dice";
import { PLAYER_COLORS } from "@/lib/game/constants";
import type { PlayerKey } from "@/lib/game/store/types";
import { viewFor } from "@sorcery/shared";

const PORTAL_DICE_COLOR = "#22c55e";
const SEAT_NAME: Record<PlayerKey, string> = { p1: "You", p2: "Computer" };

/**
 * Harbinger setup before the mulligan, as in our regular games: each Harbinger rolls three d20s
 * for its portal tiles. The engine already fixed the portents from the game seed, so the dice land
 * on those tiles; you roll your own dice, the computer's roll by themselves. Continue opens the
 * portals on the board.
 */
export default function EnginePortalScreen() {
  const game = useEngineSession((s) => s.game);
  const revealPortals = useEngineSession((s) => s.revealPortals);
  const tiles = useMemo(() => (game ? harbingerTiles(viewFor(game, HUMAN_SEAT)) : {}), [game]);
  const seats = (["p1", "p2"] as const).filter((seat) => tiles[seat]);

  // per seat and die: rolled yet, and finished animating
  const [rolled, setRolled] = useState<Record<string, boolean>>({});
  const [settled, setSettled] = useState<Record<string, boolean>>({});
  const key = (seat: PlayerKey, i: number) => `${seat}:${i}`;

  // the computer rolls its dice one after another
  useEffect(() => {
    if (!tiles.p2) return;
    const timers = [0, 1, 2].map((i) => setTimeout(() => setRolled((r) => ({ ...r, [key("p2", i)]: true })), 700 + i * 600));
    return () => timers.forEach(clearTimeout);
  }, [tiles.p2]);

  const allSettled = seats.every((seat) => [0, 1, 2].every((i) => settled[key(seat, i)]));
  if (!seats.length) return null;

  return (
    <div className="pointer-events-auto w-[min(92vw,880px)] rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-4 font-rc-sans text-rc-fg shadow-rc-panel sm:p-6">
      <div className="mb-4 text-center">
        <div className="font-rc-display text-[22px] leading-none text-rc-fg-strong sm:text-[26px]">Harbinger Portal Setup</div>
        <div className="mt-2 text-sm text-rc-fg-muted">
          {tiles.p1 && !allSettled ? "Click each die to roll for your portal tiles." : null}
          {!tiles.p1 && !allSettled ? "The computer's Harbinger is rolling for portal tiles…" : null}
          {allSettled ? "The portents are set." : null}
        </div>
      </div>

      {seats.map((seat) => (
        <section key={seat} className="mb-4">
          <div className="mb-2 text-center font-rc-mono text-xs tracking-[0.08em]" style={{ color: PLAYER_COLORS[seat] }}>
            {SEAT_NAME[seat]} — Harbinger
          </div>
          <div className="h-[22vh] min-h-[150px] overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30">
            <ClientCanvas camera={{ position: [0, 0, 5], fov: 60 }}>
              <ambientLight intensity={0.4} />
              <directionalLight position={[5, 5, 5]} intensity={0.8} />
              <Suspense fallback={null}>
              {[0, 1, 2].map((i) => {
                const isRolled = rolled[key(seat, i)] ?? false;
                return (
                  <D20Dice
                    key={i}
                    playerName={`Die ${i + 1}`}
                    player={seat}
                    position={[(i - 1) * 2.5, 0, 0]}
                    roll={isRolled ? (tiles[seat]?.[i] ?? null) : null}
                    isRolling={isRolled}
                    customColor={PORTAL_DICE_COLOR}
                    onRoll={seat === "p1" && !isRolled ? () => setRolled((r) => ({ ...r, [key(seat, i)]: true })) : undefined}
                    onRollComplete={() => setSettled((s) => ({ ...s, [key(seat, i)]: true }))}
                  />
                );
              })}
              </Suspense>
            </ClientCanvas>
          </div>
          <div className="mt-2 flex justify-center gap-3 text-sm">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`rounded-rc-md px-3 py-1 ring-1 ${settled[key(seat, i)] ? "bg-rc-success/15 ring-rc-success/35" : "bg-black/30 ring-rc-line/12"}`}
              >
                <span className="font-rc-mono text-xs text-rc-fg-muted">Tile </span>
                <span className="rc-stat">{settled[key(seat, i)] ? tiles[seat]?.[i] : "—"}</span>
              </span>
            ))}
          </div>
        </section>
      ))}

      <div className="flex justify-center gap-2">
        {tiles.p1 && !allSettled && (
          <RcButton
            variant="outline"
            size="sm"
            onClick={() => setRolled((r) => ({ ...r, [key("p1", 0)]: true, [key("p1", 1)]: true, [key("p1", 2)]: true }))}
          >
            Roll all
          </RcButton>
        )}
        <RcButton size="sm" disabled={!allSettled} onClick={revealPortals}>
          Open the portals
        </RcButton>
      </div>
    </div>
  );
}
