"use client";

import Image from "next/image";
import { HUMAN_SEAT, useEngineSession } from "@/lib/engine-mode/session";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { affinity } from "@sorcery/shared";

/** Same element order, icons and hues as the regular PlayerResourcePanels / Threshold3D. */
const ELEMENTS = [
  { key: "air" as const, icon: "/air.png", color: "#93c5fd" },
  { key: "water" as const, icon: "/water.png", color: "#67e8f9" },
  { key: "earth" as const, icon: "/earth.png", color: "#f59e0b" },
  { key: "fire" as const, icon: "/fire.png", color: "#f87171" },
];

/**
 * Mana and threshold readout for engine matches. Laid out by the right-edge column in
 * EngineMatch, which stacks the action rail underneath it.
 * The numbers come straight from the rules engine — `affinity()` is the same function casting
 * checks use, and mana is the engine's own pool — so what you see is exactly what you can pay.
 */
export default function EngineResourcePanels() {
  const game = useEngineSession((s) => s.game);
  useEngineSession((s) => s.rev);
  if (!game || game.phase === "mulligan" || game.phase === "over") return null;

  return (
    <div className="pointer-events-none flex flex-col items-end gap-2">
      {([1, 0] as const).map((seat) => {
        const seatKey = seat === HUMAN_SEAT ? "p1" : "p2";
        const thresholds = affinity(game, seat);
        const mana = game.players[seat].mana;
        const spent = (game.flow as { manaSpent?: Record<number, number> } | undefined)?.manaSpent?.[seat] ?? 0;
        const total = mana + spent;
        const active = ELEMENTS.filter((el) => (thresholds[el.key] ?? 0) > 0);
        const manaColor = mana === 0 ? "#ef4444" : mana < total ? "#fbbf24" : "#fbf6e8";
        return (
          <div
            key={seat}
            className="pointer-events-auto flex min-w-[72px] flex-col items-center gap-1 rounded-rc-md border bg-[rgba(7,10,20,0.85)] px-2.5 py-2 shadow-rc-panel"
            style={{ borderColor: `${PLAYER_COLORS[seatKey]}55` }}
            title={seat === HUMAN_SEAT ? "Your mana and thresholds" : "Computer's mana and thresholds"}
          >
            <span className="font-rc-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: PLAYER_COLORS[seatKey] }}>
              {seat === HUMAN_SEAT ? "You" : "CPU"}
            </span>
            <span className="font-rc-mono text-sm font-bold tabular-nums" style={{ color: manaColor }} title={`${mana} available / ${total} total mana`}>
              {mana}/{total}
            </span>
            <div className="flex items-center gap-1">
              {active.length === 0 && <span className="font-rc-sans text-[10px] text-rc-fg-subtle">no thresh</span>}
              {active.map((el) => (
                <span key={el.key} className="flex items-center gap-0.5" title={`${el.key} ${thresholds[el.key]}`}>
                  <Image src={el.icon} alt={el.key} width={12} height={12} unoptimized />
                  <span className="font-rc-mono text-[11px] tabular-nums" style={{ color: el.color }}>
                    {thresholds[el.key]}
                  </span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
