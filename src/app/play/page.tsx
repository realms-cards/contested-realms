"use client";

import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Star, Dice6 } from "lucide-react";
import { useGameStore } from "@/lib/game/store";
import Board from "@/lib/game/Board";

export default function PlayPage() {
  const [die, setDie] = useState<number | null>(null);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const phase = useGameStore((s) => s.phase);
  const p1 = useGameStore((s) => s.players.p1);
  const p2 = useGameStore((s) => s.players.p2);
  const addLife = useGameStore((s) => s.addLife);
  const addMana = useGameStore((s) => s.addMana);
  const addThreshold = useGameStore((s) => s.addThreshold);
  const nextPhase = useGameStore((s) => s.nextPhase);
  const sitePlacementMode = useGameStore((s) => s.sitePlacementMode);
  const toggleSitePlacement = useGameStore((s) => s.toggleSitePlacement);
  const showGrid = useGameStore((s) => s.showGridOverlay);
  const toggleGrid = useGameStore((s) => s.toggleGridOverlay);
  const zones = useGameStore((s) => s.zones);
  const initLibraries = useGameStore((s) => s.initLibraries);
  const shuffleSpellbook = useGameStore((s) => s.shuffleSpellbook);
  const shuffleAtlas = useGameStore((s) => s.shuffleAtlas);
  const drawFrom = useGameStore((s) => s.drawFrom);
  const drawOpening = useGameStore((s) => s.drawOpening);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const selected = useGameStore((s) => s.selectedCard);
  const cur = currentPlayer === 1 ? p1 : p2;
  const curKey = currentPlayer === 1 ? "p1" : "p2" as const;

  // Deck list and loader (P1 for now)
  const [decks, setDecks] = useState<{ id: string; name: string; format: string }[]>([]);
  const [deckId, setDeckId] = useState<string>("");
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/decks", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setDecks(Array.isArray(data) ? data : []);
      } catch {}
    })();
  }, []);

  async function loadDeck() {
    if (!deckId) return;
    const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const spellbook = Array.isArray(data?.spellbook) ? data.spellbook : [];
    const atlas = Array.isArray(data?.atlas) ? data.atlas : [];
    initLibraries("p1", spellbook, atlas);
    shuffleSpellbook("p1");
    shuffleAtlas("p1");
    drawOpening("p1");
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full">
      {/* HUD */}
      {/* Top-center status pill */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-auto">
        <div className="flex items-center gap-3 rounded-full bg-black/60 backdrop-blur px-4 py-1.5 text-sm text-white shadow-lg ring-1 ring-white/10">
          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
          <span className="opacity-80">Player</span>
          <span className="font-semibold">{currentPlayer}</span>
          <span className="opacity-50">•</span>
          <span className="opacity-80">Phase</span>
          <span className="font-semibold">{phase}</span>
          <button
            className="ml-2 rounded-full bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1"
            onClick={() => nextPhase()}
          >
            Next
          </button>
          <button
            className={`rounded-full px-3 py-1 ${sitePlacementMode ? "bg-blue-500 text-white" : "bg-white/15 hover:bg-white/25"}`}
            onClick={() => toggleSitePlacement()}
          >
            {sitePlacementMode ? "Placing Site…" : "Place Site"}
          </button>
          <button
            className={`rounded-full px-3 py-1 ${showGrid ? "bg-indigo-500 text-white" : "bg-white/15 hover:bg-white/25"}`}
            onClick={() => toggleGrid()}
          >
            {showGrid ? "Grid On" : "Grid Off"}
          </button>
        </div>
      </div>

      {/* Top-right deck loader */}
      <div className="absolute top-3 right-3 z-10 pointer-events-auto text-white">
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur rounded-xl px-3 py-2 ring-1 ring-white/10">
          <span className="opacity-80">P1 Deck</span>
          <select
            className="bg-black/40 rounded px-2 py-1 outline-none"
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
          >
            <option value="">Select…</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button className="rounded bg-emerald-600/90 hover:bg-emerald-500 px-3 py-1" onClick={loadDeck}>Load</button>
          <button className="rounded bg-white/15 hover:bg-white/25 px-2 py-1" onClick={() => shuffleSpellbook("p1")}>Shuffle S</button>
          <button className="rounded bg-white/15 hover:bg-white/25 px-2 py-1" onClick={() => shuffleAtlas("p1")}>Shuffle A</button>
          <button className="rounded bg-white/15 hover:bg-white/25 px-2 py-1" onClick={() => drawFrom("p1", 'spellbook', 1)}>Draw S</button>
          <button className="rounded bg-white/15 hover:bg-white/25 px-2 py-1" onClick={() => drawFrom("p1", 'atlas', 1)}>Draw A</button>
          <button className="rounded bg-white/15 hover:bg-white/25 px-2 py-1" onClick={() => drawOpening("p1")}>Opening</button>
        </div>
      </div>

      {/* Left vertical life counters */}
      <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3 pointer-events-auto text-white">
        <div className="flex items-center gap-2">
          <div className="w-14 h-14 grid place-items-center rounded-xl bg-black/70 shadow-lg ring-1 ring-white/10 text-2xl font-bold">{p1.life}</div>
          <div className="flex flex-col gap-1">
            <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addLife("p1", +1)}>+</button>
            <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addLife("p1", -1)}>-</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-14 h-14 grid place-items-center rounded-xl bg-black/70 shadow-lg ring-1 ring-white/10 text-2xl font-bold">{p2.life}</div>
          <div className="flex flex-col gap-1">
            <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addLife("p2", +1)}>+</button>
            <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addLife("p2", -1)}>-</button>
          </div>
        </div>
      </div>

      {/* Bottom resource/controls bar */}
      <div className="absolute inset-x-0 bottom-3 z-10 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-xl bg-black/60 backdrop-blur px-4 py-2 text-sm text-white shadow-xl ring-1 ring-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="opacity-80">P{currentPlayer} Mana</span>
            <div className="flex items-center gap-2">
              <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addMana(currentPlayer === 1 ? "p1" : "p2", -1)}>-</button>
              <span className="w-6 text-center font-semibold">{cur.mana}</span>
              <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addMana(currentPlayer === 1 ? "p1" : "p2", +1)}>+</button>
            </div>
            <span className="opacity-50">|</span>
            <div className="flex items-center gap-3">
              <span className="opacity-80">Thresholds</span>
              <div className="flex items-center gap-2">
                <span className="rounded-full w-3 h-3 bg-sky-400 inline-block" />
                <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addThreshold(currentPlayer === 1 ? "p1" : "p2", "air", -1)}>-</button>
                <span className="w-5 text-center">{cur.thresholds.air}</span>
                <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addThreshold(currentPlayer === 1 ? "p1" : "p2", "air", +1)}>+</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full w-3 h-3 bg-cyan-400 inline-block" />
                <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addThreshold(currentPlayer === 1 ? "p1" : "p2", "water", -1)}>-</button>
                <span className="w-5 text-center">{cur.thresholds.water}</span>
                <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addThreshold(currentPlayer === 1 ? "p1" : "p2", "water", +1)}>+</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full w-3 h-3 bg-amber-500 inline-block" />
                <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addThreshold(currentPlayer === 1 ? "p1" : "p2", "earth", -1)}>-</button>
                <span className="w-5 text-center">{cur.thresholds.earth}</span>
                <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addThreshold(currentPlayer === 1 ? "p1" : "p2", "earth", +1)}>+</button>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full w-3 h-3 bg-red-500 inline-block" />
                <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addThreshold(currentPlayer === 1 ? "p1" : "p2", "fire", -1)}>-</button>
                <span className="w-5 text-center">{cur.thresholds.fire}</span>
                <button className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25" onClick={() => addThreshold(currentPlayer === 1 ? "p1" : "p2", "fire", +1)}>+</button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="opacity-70">Turn</span>
            <span className="font-semibold">P{currentPlayer}</span>
            <span className="opacity-50">•</span>
            <span className="opacity-70">{phase}</span>
            <span className="opacity-50">|</span>
            <button
              className="flex items-center gap-1 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1"
              onClick={() => setDie(1 + Math.floor(Math.random() * 6))}
            >
              <Dice6 className="w-4 h-4" />
              <span>Roll</span>
            </button>
            <div className="w-8 text-center font-mono">{die ?? "-"}</div>
          </div>
        </div>
      </div>

      {/* Hand panel */}
      <div className="absolute inset-x-0 bottom-20 z-10 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-5xl rounded-xl bg-black/50 backdrop-blur px-3 py-2 text-sm text-white shadow ring-1 ring-white/10">
          <div className="flex items-center gap-2 overflow-x-auto">
            {(zones[curKey].hand || []).map((c, i) => {
              const isSel = selected && selected.who === curKey && selected.index === i;
              return (
                <button
                  key={`${c.cardId}-${i}`}
                  className={`shrink-0 px-2 py-1 rounded border ${isSel ? "border-emerald-400 bg-emerald-500/20" : "border-white/15 bg-white/10 hover:bg-white/20"}`}
                  title={c.name}
                  onClick={() => (isSel ? clearSelection() : selectHandCard(curKey, i))}
                >
                  <div className="text-xs opacity-70">{(c.type || "").split(",")[0]}</div>
                  <div className="text-sm font-medium max-w-40 truncate">{c.name}</div>
                </button>
              );
            })}
            {zones[curKey].hand.length === 0 && (
              <div className="opacity-60">Hand is empty</div>
            )}
          </div>
        </div>
      </div>

      {/* Board */}
      <Canvas camera={{ position: [8, 8, 8], fov: 50 }} shadows>
        <color attach="background" args={["#0b0b0c"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 12, 8]} intensity={1} castShadow />

        {/* Interactive board */}
        <Board />

        <OrbitControls makeDefault enablePan enableRotate enableZoom maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
    </div>
  );
}
