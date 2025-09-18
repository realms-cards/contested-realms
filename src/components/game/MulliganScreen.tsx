"use client";

import Image from "next/image";
import { useState } from "react";
import { useGameStore } from "@/lib/game/store";

interface MulliganScreenProps {
  onStartGame: () => void;
}

export default function MulliganScreen({ onStartGame }: MulliganScreenProps) {
  const zones = useGameStore((s) => s.zones);
  const mulligans = useGameStore((s) => s.mulligans);
  const mulliganDrawn = useGameStore((s) => s.mulliganDrawn);
  const mulliganWithSelection = useGameStore((s) => s.mulliganWithSelection);
  const finalizeMulligan = useGameStore((s) => s.finalizeMulligan);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  
  const [selP1, setSelP1] = useState<number[]>([]);
  const [doneP1, setDoneP1] = useState<boolean>(false);
  const [selP2, setSelP2] = useState<number[]>([]);
  const [doneP2, setDoneP2] = useState<boolean>(false);

  return (
    <div className="w-full max-w-6xl bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-lg font-semibold">
          Mulligan (one round only)
        </div>
        <div className="text-sm opacity-80">
          Select up to 3 cards to put back. You&apos;ll draw the same number from the appropriate pile.
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-black/30 rounded-xl p-4 ring-1 ring-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Player 1</div>
            <div className="text-xs opacity-80">
              Mulligans left: {mulligans.p1}
            </div>
          </div>
          
          <div className="text-xs opacity-80 mb-2">
            {!doneP1 && mulligans.p1 > 0 ? "Click cards to select for mulligan (max 3)." : mulligans.p1 === 0 ? "Mulligan used." : "Mulligan complete."}
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pb-2 pt-16 min-h-[200px]">
            {(zones.p1.hand || []).map((c, i) => {
              const isSite = (c.type || "").toLowerCase().includes("site");
              const picked = selP1.includes(i);
              return (
                <button
                  key={`${c.cardId}-${i}`}
                  className={`relative flex-shrink-0 transition-all duration-200 ${
                    !doneP1 && mulligans.p1 > 0 ? "hover:scale-105 hover:-translate-y-4" : ""
                  } ${picked ? "ring-2 ring-red-400 -translate-y-2" : ""} ${
                    mulligans.p1 <= 0 || doneP1 ? "cursor-default" : "cursor-pointer"
                  }`}
                  title={c.name}
                  onClick={() => {
                    if (mulligans.p1 <= 0 || doneP1) return;
                    setSelP1((arr) =>
                      arr.includes(i)
                        ? arr.filter((x) => x !== i)
                        : arr.length >= 3 ? arr // Maximum 3 cards can be mulliganed
                        : [...arr, i]
                    )
                  }}
                  onMouseEnter={() => setPreviewCard(c)}
                  onMouseLeave={() => setPreviewCard(null)}
                >
                  {c.slug ? (
                    <div
                      className={`relative ${
                        isSite ? "aspect-[4/3] w-32" : "aspect-[3/4] w-24"
                      } rounded-lg overflow-hidden ring-1 ring-white/20 shadow-lg ${
                        picked ? "opacity-70" : ""} ${mulligans.p1 <= 0 || doneP1 ? "opacity-60" : ""
                      }`}
                    >
                      <Image
                        src={`/api/images/${c.slug}`}
                        alt={c.name}
                        fill
                        sizes="120px"
                        className={`${isSite ? "object-contain rotate-90" : "object-contain"}`}
                      />
                    </div>
                  ) : (
                    <div className="w-24 h-32 grid place-items-center rounded bg-white/10 text-xs opacity-80">
                      {c.name}
                    </div>
                  )}
                </button>
              );
            })}
            {zones.p1.hand.length === 0 && (
              <div className="opacity-60">Hand is empty</div>
            )}
          </div>
          
          <div className="mt-2 flex items-center gap-2">
            <button
              className="rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-sm"
              disabled={selP1.length === 0 || mulligans.p1 <= 0 || doneP1}
              onClick={() => {
                if (selP1.length) {
                  mulliganWithSelection(
                    "p1",
                    selP1.slice().sort((a, b) => a - b)
                  );
                  setSelP1([]);
                  setDoneP1(true);
                }
              }}
            >
              Mulligan Selected
            </button>
            <button
              className="rounded bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
              disabled={doneP1}
              onClick={() => setDoneP1(true)}
            >
              Skip
            </button>
          </div>
          
          {mulliganDrawn.p1.length > 0 && (
            <div className="mt-3">
              <div className="text-xs opacity-80 mb-1">Drawn replacements:</div>
              <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pt-12">
                {mulliganDrawn.p1.map((c, i) => {
                  const isSite = (c.type || "").toLowerCase().includes("site");
                  return (
                    <div
                      key={`${c.cardId}-d-${i}`}
                      className="relative flex-shrink-0 transition-all duration-200 hover:scale-105 hover:-translate-y-2"
                      onMouseEnter={() => setPreviewCard(c)}
                      onMouseLeave={() => setPreviewCard(null)}
                    >
                      {c.slug ? (
                        <div
                          className={`relative ${
                            isSite ? "aspect-[4/3] w-28" : "aspect-[3/4] w-20"
                          } rounded-lg overflow-hidden ring-1 ring-emerald-400/40 shadow`}
                        >
                          <Image
                            src={`/api/images/${c.slug}`}
                            alt={c.name}
                            fill
                            sizes="100px"
                            className={`${isSite ? "object-contain rotate-90" : "object-contain"}`}
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-28 grid place-items-center rounded bg-white/10 text-[10px] opacity-80">
                          {c.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="bg-black/30 rounded-xl p-4 ring-1 ring-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold">Player 2</div>
            <div className="text-xs opacity-80">
              Mulligans left: {mulligans.p2}
            </div>
          </div>
          
          <div className="text-xs opacity-80 mb-2">
            {!doneP2 && mulligans.p2 > 0 ? "Click cards to select for mulligan (max 3)." : mulligans.p2 === 0 ? "Mulligan used." : "Mulligan complete."}
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pb-2 pt-16 min-h-[200px]">
            {(zones.p2.hand || []).map((c, i) => {
              const isSite = (c.type || "").toLowerCase().includes("site");
              const picked = selP2.includes(i);
              return (
                <button
                  key={`${c.cardId}-${i}`}
                  className={`relative flex-shrink-0 transition-all duration-200 ${
                    !doneP2 && mulligans.p2 > 0 ? "hover:scale-105 hover:-translate-y-4" : ""
                  } ${picked ? "ring-2 ring-red-400 -translate-y-2" : ""} ${
                    mulligans.p2 <= 0 || doneP2 ? "cursor-default" : "cursor-pointer"
                  }`}
                  title={c.name}
                  onClick={() => {
                    if (mulligans.p2 <= 0 || doneP2) return;
                    setSelP2((arr) =>
                      arr.includes(i)
                        ? arr.filter((x) => x !== i)
                        : arr.length >= 3 ? arr // Maximum 3 cards can be mulliganed
                        : [...arr, i]
                    )
                  }}
                  onMouseEnter={() => setPreviewCard(c)}
                  onMouseLeave={() => setPreviewCard(null)}
                >
                  {c.slug ? (
                    <div
                      className={`relative ${
                        isSite ? "aspect-[4/3] w-32" : "aspect-[3/4] w-24"
                      } rounded-lg overflow-hidden ring-1 ring-white/20 shadow-lg ${
                        picked ? "opacity-70" : ""} ${mulligans.p2 <= 0 || doneP2 ? "opacity-60" : ""
                      }`}
                    >
                      <Image
                        src={`/api/images/${c.slug}`}
                        alt={c.name}
                        fill
                        sizes="120px"
                        className={`${isSite ? "object-contain rotate-90" : "object-contain"}`}
                      />
                    </div>
                  ) : (
                    <div className="w-24 h-32 grid place-items-center rounded bg-white/10 text-xs opacity-80">
                      {c.name}
                    </div>
                  )}
                </button>
              );
            })}
            {zones.p2.hand.length === 0 && (
              <div className="opacity-60">Hand is empty</div>
            )}
          </div>
          
          <div className="mt-2 flex items-center gap-2">
            <button
              className="rounded bg-white/15 hover:bg-white/25 px-3 py-1 text-sm"
              disabled={selP2.length === 0 || mulligans.p2 <= 0 || doneP2}
              onClick={() => {
                if (selP2.length) {
                  mulliganWithSelection(
                    "p2",
                    selP2.slice().sort((a, b) => a - b)
                  );
                  setSelP2([]);
                  setDoneP2(true);
                }
              }}
            >
              Mulligan Selected
            </button>
            <button
              className="rounded bg-white/10 hover:bg-white/20 px-3 py-1 text-sm"
              disabled={doneP2}
              onClick={() => setDoneP2(true)}
            >
              Skip
            </button>
          </div>
          
          {mulliganDrawn.p2.length > 0 && (
            <div className="mt-3">
              <div className="text-xs opacity-80 mb-1">Drawn replacements:</div>
              <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pt-12">
                {mulliganDrawn.p2.map((c, i) => {
                  const isSite = (c.type || "").toLowerCase().includes("site");
                  return (
                    <div
                      key={`${c.cardId}-d-${i}`}
                      className="relative flex-shrink-0 transition-all duration-200 hover:scale-105 hover:-translate-y-2"
                      onMouseEnter={() => setPreviewCard(c)}
                      onMouseLeave={() => setPreviewCard(null)}
                    >
                      {c.slug ? (
                        <div
                          className={`relative ${
                            isSite ? "aspect-[4/3] w-28" : "aspect-[3/4] w-20"
                          } rounded-lg overflow-hidden ring-1 ring-emerald-400/40 shadow`}
                        >
                          <Image
                            src={`/api/images/${c.slug}`}
                            alt={c.name}
                            fill
                            sizes="100px"
                            className={`${isSite ? "object-contain rotate-90" : "object-contain"}`}
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-28 grid place-items-center rounded bg-white/10 text-[10px] opacity-80">
                          {c.name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs opacity-70">
          You can mulligan once only. After you are done, start the game.
        </div>
        <button
          className="rounded bg-indigo-600/90 hover:bg-indigo-500 px-4 py-2 disabled:opacity-50"
          disabled={!doneP1 || !doneP2}
          onClick={() => {
            finalizeMulligan();
            onStartGame();
          }}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}