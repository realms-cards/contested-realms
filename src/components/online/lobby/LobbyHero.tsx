"use client";

import { Icon } from "@iconify/react";

function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

interface LobbyHeroProps {
  /** Players waiting in the constructed queue */
  queueSize: number;
  /** Server wait estimate in seconds while searching, otherwise null */
  estimatedWait: number | null;
  /** Lobbies with a match in progress */
  liveCount: number;
  /** Rules-engine games (vs CPU, in the browser) in progress; not joinable, shown when > 0 */
  engineCount?: number;
}

/** Title row: "The Lobby" centred, queue + live stats on the right. */
export default function LobbyHero({
  queueSize,
  estimatedWait,
  liveCount,
  engineCount = 0,
}: LobbyHeroProps) {
  return (
    <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_auto_1fr] md:gap-6">
      <div className="hidden md:block" />
      <div className="text-center font-rc-mono text-xs leading-[1.8] tracking-[0.12em] text-rc-fg-subtle md:text-right">
        QUEUE{" "}
        <span className="tabular-nums text-rc-fg-strong">
          {estimatedWait !== null ? formatSeconds(estimatedWait) : queueSize}
        </span>{" "}
        {estimatedWait !== null ? "est" : "waiting"} ·{" "}
        <span
          className="animate-rc-blink text-rc-danger"
          style={{ animationDuration: "1.6s" }}
        >
          ●
        </span>{" "}
        <span className="tabular-nums">{liveCount}</span> LIVE
        {engineCount > 0 && (
          <span
            className="whitespace-nowrap"
            data-testid="lobby-engine-count"
            title="Games against the CPU in the Rules Engine right now"
          >
            {" "}
            ·{" "}
            <Icon
              icon="game-icons:gears"
              width={12}
              height={12}
              aria-hidden="true"
              className="inline-block align-[-1px] text-rc-fg-subtle"
            />{" "}
            <span className="tabular-nums text-rc-fg-strong">
              {engineCount}
            </span>{" "}
            {engineCount === 1 ? "GAME" : "GAMES"} IN THE RULES ENGINE
          </span>
        )}
      </div>
    </div>
  );
}
