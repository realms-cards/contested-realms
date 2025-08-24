"use client";

import { useGameStore } from "@/lib/game/store";

interface LifeCountersProps {
  dragFromHand: boolean;
}

export default function LifeCounters({ dragFromHand }: LifeCountersProps) {
  const p1 = useGameStore((s) => s.players.p1);
  const p2 = useGameStore((s) => s.players.p2);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const addLife = useGameStore((s) => s.addLife);
  const addThreshold = useGameStore((s) => s.addThreshold);
  
  const cur = currentPlayer === 1 ? p1 : p2;

  return (
    <div
      className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-white`}
    >
      {/* Current player thresholds */}
      <div className="rounded-xl bg-black/70 shadow-lg ring-1 ring-white/10 p-3 w-48">
        <div className="text-xs opacity-80 mb-2">
          P{currentPlayer} Thresholds
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full w-3 h-3 bg-sky-400 inline-block" />
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() =>
                addThreshold(currentPlayer === 1 ? "p1" : "p2", "air", -1)
              }
            >
              -
            </button>
            <span className="w-5 text-center">{cur.thresholds.air}</span>
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() =>
                addThreshold(currentPlayer === 1 ? "p1" : "p2", "air", +1)
              }
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full w-3 h-3 bg-cyan-400 inline-block" />
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() =>
                addThreshold(currentPlayer === 1 ? "p1" : "p2", "water", -1)
              }
            >
              -
            </button>
            <span className="w-5 text-center">{cur.thresholds.water}</span>
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() =>
                addThreshold(currentPlayer === 1 ? "p1" : "p2", "water", +1)
              }
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full w-3 h-3 bg-amber-500 inline-block" />
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() =>
                addThreshold(currentPlayer === 1 ? "p1" : "p2", "earth", -1)
              }
            >
              -
            </button>
            <span className="w-5 text-center">{cur.thresholds.earth}</span>
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() =>
                addThreshold(currentPlayer === 1 ? "p1" : "p2", "earth", +1)
              }
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full w-3 h-3 bg-red-500 inline-block" />
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() =>
                addThreshold(currentPlayer === 1 ? "p1" : "p2", "fire", -1)
              }
            >
              -
            </button>
            <span className="w-5 text-center">{cur.thresholds.fire}</span>
            <button
              className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
              onClick={() =>
                addThreshold(currentPlayer === 1 ? "p1" : "p2", "fire", +1)
              }
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* P1 Life */}
      <div className="flex items-center gap-2">
        <div className="w-14 h-14 grid place-items-center rounded-xl bg-black/70 shadow-lg ring-1 ring-white/10 text-2xl font-bold">
          {p1.life}
        </div>
        <div className="flex flex-col gap-1">
          <button
            className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
            onClick={() => addLife("p1", +1)}
          >
            +
          </button>
          <button
            className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
            onClick={() => addLife("p1", -1)}
          >
            -
          </button>
        </div>
      </div>
      
      {/* P2 Life */}
      <div className="flex items-center gap-2">
        <div className="w-14 h-14 grid place-items-center rounded-xl bg-black/70 shadow-lg ring-1 ring-white/10 text-2xl font-bold">
          {p2.life}
        </div>
        <div className="flex flex-col gap-1">
          <button
            className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
            onClick={() => addLife("p2", +1)}
          >
            +
          </button>
          <button
            className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
            onClick={() => addLife("p2", -1)}
          >
            -
          </button>
        </div>
      </div>
    </div>
  );
}