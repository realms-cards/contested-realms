"use client";

import { useEffect } from "react";
import { cpuRevealsPending, useCpuReveals } from "@/lib/game/cpu/revealQueue";
import { useGameStore } from "@/lib/game/store";
import type { CustomMessage } from "@/lib/net/transport";

/** After returning to the tab, the human gets this long before the CPU may act again (the bot adds its own resume beat). */
export const CPU_TAB_RETURN_BEAT_MS = 1000;

/**
 * Mounted with the visible game HUD, after setup and turn overlays.
 * The CPU acts only while this reports the board visible: not while paused, while the tab
 * is hidden (plus a short beat after returning), or while a CPU play reveal is up or queued.
 */
export default function CpuBoardReady({paused = false}: {paused?: boolean}) {
  const phase = useGameStore(state => state.phase);
  const matchId = useGameStore(state => state.matchId);
  const cpu = useGameStore(state => state.opponentPlayerId?.startsWith("cpu_") === true);
  const transport = useGameStore(state => state.transport);
  useEffect(() => {
    if (!cpu || !matchId || !transport || phase === "Setup") return;
    let returnedAt = 0;
    let beat: number | undefined;
    const ready = () => {
      const visible = !paused && document.visibilityState === "visible" && !cpuRevealsPending() && Date.now()-returnedAt >= CPU_TAB_RETURN_BEAT_MS;
      transport.sendMessage?.({type:"cpuHumanReady",matchId,visible} as unknown as CustomMessage);
    };
    const onVisibility = () => {
      const hidden = document.visibilityState !== "visible";
      // Nobody can read a reveal in a hidden tab: its countdown waits too.
      useCpuReveals.getState().setHidden(hidden);
      window.clearTimeout(beat);
      if (!hidden) {
        returnedAt = Date.now();
        beat = window.setTimeout(ready,CPU_TAB_RETURN_BEAT_MS);
      }
      ready();
    };
    // Synchronous: the pause reaches the bot before the resolve message that follows a revealed effect.
    const unsubscribe = useCpuReveals.subscribe((state,previous) => {
      if ((state.queue.length > 0) !== (previous.queue.length > 0)) ready();
    });
    useCpuReveals.getState().setHidden(document.visibilityState !== "visible");
    ready();
    const timer = window.setInterval(ready,2000);
    document.addEventListener("visibilitychange",onVisibility);
    return () => {
      unsubscribe();
      window.clearInterval(timer); window.clearTimeout(beat); document.removeEventListener("visibilitychange",onVisibility);
      useCpuReveals.getState().setHidden(false);
      transport.sendMessage?.({type:"cpuHumanReady",matchId,visible:false} as unknown as CustomMessage);
    };
  },[cpu,matchId,phase,transport,paused]);
  return null;
}
