"use client";

import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/lib/game/store";
import type { GameState } from "@/lib/game/store/types";

/** How long the CPU may sit on its own turn without changing the game before a skip is offered. */
export const CPU_STUCK_AFTER_MS = 30000;

const BTN =
  "relative flex min-w-0 items-center gap-1.5 px-3 py-2 font-rc-sans text-sm text-rc-moonlight transition-colors bg-rc-moonlight/8 hover:bg-rc-moonlight/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rc-accent-ring";

const selectWatch = (s: GameState) => ({
  cpuMatch: s.opponentPlayerId?.startsWith("cpu_") === true && !!s.actorKey && !s.matchEnded,
  actorKey: s.actorKey,
  currentPlayer: s.currentPlayer,
  turn: s.turn,
  phase: s.phase,
  // What a CPU that is still acting keeps changing.
  permanents: s.permanents,
  zones: s.zones,
  avatars: s.avatars,
  board: s.board,
  // An open effect, combat or trigger list is the game waiting on the human, not a stuck CPU.
  waitingOnHuman: !!(s.pendingMagic || s.pendingCombat || s.cpuPendingTriggerCount || s.cpuTriggerOptions?.length),
});

type Watched = ReturnType<typeof selectWatch>;
/** The game as it looked when the idle timer was armed; any later change makes it stale. */
type Armed = Pick<Watched, "turn" | "phase" | "permanents" | "zones" | "avatars" | "board">;

/**
 * Escape hatch for a CPU that has stopped acting on its own turn (a crashing or disconnected bot
 * otherwise freezes the match). After CPU_STUCK_AFTER_MS with no change, offers to end the CPU's
 * turn. It sends the same message the CPU controller already sends to close the CPU's End phase, so
 * the server's End-phase gate accepts it from this human client.
 */
export default function CpuStuckBypass() {
  const watch = useGameStore(useShallow(selectWatch));
  const cpuNum = watch.actorKey === "p1" ? 2 : 1;
  const cpuTurn = watch.cpuMatch && watch.currentPlayer === cpuNum && !watch.waitingOnHuman;
  const [armed, setArmed] = useState<Armed | null>(null);

  useEffect(() => {
    if (!cpuTurn) return;
    const snapshot: Armed = {
      turn: watch.turn, phase: watch.phase, permanents: watch.permanents,
      zones: watch.zones, avatars: watch.avatars, board: watch.board,
    };
    // Set in a timer callback, so a CPU that changes anything restarts the clock by re-running this.
    const timer = setTimeout(() => setArmed(snapshot), CPU_STUCK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [cpuTurn, watch.turn, watch.phase, watch.permanents, watch.zones, watch.avatars, watch.board]);

  const stuck =
    cpuTurn && !!armed &&
    armed.turn === watch.turn && armed.phase === watch.phase && armed.permanents === watch.permanents &&
    armed.zones === watch.zones && armed.avatars === watch.avatars && armed.board === watch.board;
  if (!stuck) return null;

  const skip = () => {
    const state = useGameStore.getState();
    const human = state.actorKey === "p1" ? 1 : 2;
    state.log("Skipped the CPU's turn: it stopped responding.");
    state.transport?.sendAction({ currentPlayer: human, phase: "Start", cpuEndResolved: `${state.turn}:${state.currentPlayer}` });
    setArmed(null);
  };

  return (
    <div role="group" aria-label="CPU unresponsive" className="flex overflow-hidden rounded-rc-md bg-[rgba(7,10,20,0.85)] shadow-rc-panel ring-1 ring-rc-moonlight/35">
      <button type="button" onClick={skip} className={BTN} title="The CPU has not acted for a while. End its turn and continue.">
        CPU stuck? Skip its turn
      </button>
    </div>
  );
}
