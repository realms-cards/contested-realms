"use client";

import { useEffect } from "react";
import { useGameStore } from "@/lib/game/store";
import type { CustomMessage } from "@/lib/net/transport";

/** Mounted with the visible game HUD, after setup and turn overlays. */
export default function CpuBoardReady({paused = false}: {paused?: boolean}) {
  const phase = useGameStore(state => state.phase);
  const matchId = useGameStore(state => state.matchId);
  const cpu = useGameStore(state => state.opponentPlayerId?.startsWith("cpu_") === true);
  const transport = useGameStore(state => state.transport);
  useEffect(() => {
    if (!cpu || !matchId || !transport || phase === "Setup") return;
    const ready = () => {
      transport.sendMessage?.({type:"cpuHumanReady",matchId,visible:!paused && document.visibilityState === "visible"} as unknown as CustomMessage);
    };
    ready();
    const timer = window.setInterval(ready,2000);
    document.addEventListener("visibilitychange",ready);
    return () => {
      window.clearInterval(timer); document.removeEventListener("visibilitychange",ready);
      transport.sendMessage?.({type:"cpuHumanReady",matchId,visible:false} as unknown as CustomMessage);
    };
  },[cpu,matchId,phase,transport,paused]);
  return null;
}
