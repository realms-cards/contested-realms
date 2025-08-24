"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Star, Dice6 } from "lucide-react";
import { useGameStore } from "@/lib/game/store";
import type { CardRef } from "@/lib/game/store";
import Board from "@/lib/game/Board";
import Image from "next/image";

export default function PlayPage() {
  const [die, setDie] = useState<number | null>(null);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const phase = useGameStore((s) => s.phase);
  const p1 = useGameStore((s) => s.players.p1);
  const p2 = useGameStore((s) => s.players.p2);
  const addLife = useGameStore((s) => s.addLife);
  const addMana = useGameStore((s) => s.addMana);
  const addThreshold = useGameStore((s) => s.addThreshold);
  const endTurn = useGameStore((s) => s.endTurn);
  const undo = useGameStore((s) => s.undo);
  const history = useGameStore((s) => s.history);
  const showGrid = useGameStore((s) => s.showGridOverlay);
  const toggleGrid = useGameStore((s) => s.toggleGridOverlay);
  const showPlaymat = useGameStore((s) => s.showPlaymat);
  const togglePlaymat = useGameStore((s) => s.togglePlaymat);
  const zones = useGameStore((s) => s.zones);
  const initLibraries = useGameStore((s) => s.initLibraries);
  const shuffleSpellbook = useGameStore((s) => s.shuffleSpellbook);
  const shuffleAtlas = useGameStore((s) => s.shuffleAtlas);
  const drawOpening = useGameStore((s) => s.drawOpening);
  const drawFrom = useGameStore((s) => s.drawFrom);
  const selectHandCard = useGameStore((s) => s.selectHandCard);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const setAvatarCard = useGameStore((s) => s.setAvatarCard);
  const placeAvatarAtStart = useGameStore((s) => s.placeAvatarAtStart);
  const setPhase = useGameStore((s) => s.setPhase);
  const mulliganWithSelection = useGameStore((s) => s.mulliganWithSelection);
  const mulligans = useGameStore((s) => s.mulligans);
  const mulliganDrawn = useGameStore((s) => s.mulliganDrawn);
  const events = useGameStore((s) => s.events);
  const selected = useGameStore((s) => s.selectedCard);
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const previewCard = useGameStore((s) => s.previewCard);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  // Context menu and tap actions
  const contextMenu = useGameStore((s) => s.contextMenu);
  const closeContextMenu = useGameStore((s) => s.closeContextMenu);
  const toggleTapSite = useGameStore((s) => s.toggleTapSite);
  const toggleTapPermanent = useGameStore((s) => s.toggleTapPermanent);
  const toggleTapAvatar = useGameStore((s) => s.toggleTapAvatar);
  const board = useGameStore((s) => s.board);
  const permanents = useGameStore((s) => s.permanents);
  const avatars = useGameStore((s) => s.avatars);
  const moveSiteToZone = useGameStore((s) => s.moveSiteToZone);
  const movePermanentToZone = useGameStore((s) => s.movePermanentToZone);
  const cur = currentPlayer === 1 ? p1 : p2;
  // Selected hand card (for magnifier)
  const selectedHandCard = (() => {
    if (!selected || selected.who !== "p1") return null;
    const hand = zones.p1.hand || [];
    return hand[selected.index] ?? null;
  })();

  // Context menu positioning
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(
    null
  );
  useLayoutEffect(() => {
    if (!contextMenu) {
      setMenuPos(null);
      return;
    }
    const margin = 8; // viewport padding
    const sx = contextMenu.screen?.x ?? window.innerWidth / 2;
    const sy = contextMenu.screen?.y ?? window.innerHeight / 2;
    const compute = () => {
      const el = menuRef.current;
      const w = el?.offsetWidth ?? 224; // w-56 = 14rem = 224px
      const h = el?.offsetHeight ?? 200; // guess before measured
      const maxLeft = Math.max(margin, window.innerWidth - w - margin);
      const maxTop = Math.max(margin, window.innerHeight - h - margin);
      const left = Math.min(Math.max(sx, margin), maxLeft);
      const top = Math.min(Math.max(sy, margin), maxTop);
      setMenuPos({ left, top });
    };
    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [contextMenu]);

  // Setup overlay: pick decks for both players and prepare hands
  const [decks, setDecks] = useState<
    { id: string; name: string; format: string }[]
  >([]);
  const [deckIdP1, setDeckIdP1] = useState<string>("");
  const [deckIdP2, setDeckIdP2] = useState<string>("");
  const [deckErrP1, setDeckErrP1] = useState<string | null>(null);
  const [deckErrP2, setDeckErrP2] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState<boolean>(true);
  const [prepared, setPrepared] = useState<boolean>(false);
  const [selP1, setSelP1] = useState<number[]>([]);
  const [doneP1, setDoneP1] = useState<boolean>(false);
  const [consoleOpen, setConsoleOpen] = useState<boolean>(true);
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

  // End hand-drag when mouse is released anywhere
  useEffect(() => {
    const onUp = () => {
      setDragFromHand(false);
      setDragFromPile(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [setDragFromHand, setDragFromPile]);

  async function loadDeckFor(
    who: "p1" | "p2",
    deckId: string
  ): Promise<boolean> {
    if (!deckId) return false;
    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(deckId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        (who === "p1" ? setDeckErrP1 : setDeckErrP2)("Failed to load deck");
        return false;
      }
      const data = await res.json();
      const rawSpellbook: CardRef[] = Array.isArray(data?.spellbook)
        ? (data.spellbook as CardRef[])
        : [];
      const rawAtlas: CardRef[] = Array.isArray(data?.atlas)
        ? (data.atlas as CardRef[])
        : [];
      const sideboard: CardRef[] = Array.isArray(data?.sideboard)
        ? (data.sideboard as CardRef[])
        : [];

      const isAvatar = (c: CardRef) =>
        typeof c?.type === "string" && c.type.toLowerCase().includes("avatar");
      const avatars = [...rawSpellbook, ...sideboard].filter(isAvatar);
      if (avatars.length !== 1) {
        (who === "p1" ? setDeckErrP1 : setDeckErrP2)(
          avatars.length === 0
            ? "Deck requires exactly 1 Avatar"
            : "Deck has multiple Avatars. Keep only one."
        );
        return false;
      }
      const avatar = avatars[0];

      const spellbook = rawSpellbook.filter((c: CardRef) => !isAvatar(c));

      if (rawAtlas.length < 12) {
        (who === "p1" ? setDeckErrP1 : setDeckErrP2)(
          "Atlas needs at least 12 sites"
        );
        return false;
      }
      if (spellbook.length < 24) {
        (who === "p1" ? setDeckErrP1 : setDeckErrP2)(
          "Spellbook needs at least 24 cards (excluding Avatar)"
        );
        return false;
      }

      initLibraries(who, spellbook, rawAtlas);
      shuffleSpellbook(who);
      shuffleAtlas(who);
      // Set avatar first so Spellslinger opening draw rule applies
      setAvatarCard(who, avatar);
      placeAvatarAtStart(who);
      drawOpening(who);
      return true;
    } catch {
      (who === "p1" ? setDeckErrP1 : setDeckErrP2)("Error loading deck");
      return false;
    }
  }

  async function prepareHands() {
    setDeckErrP1(null);
    setDeckErrP2(null);
    if (!deckIdP1 || !deckIdP2) return;
    const ok1 = await loadDeckFor("p1", deckIdP1);
    const ok2 = await loadDeckFor("p2", deckIdP2);
    if (ok1 && ok2) {
      setPhase("Start"); // wait to start until user clicks Start Game
      setPrepared(true);
    }
  }

  function startGame() {
    setSetupOpen(false);
    setPhase("Main");
  }

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full">
      {/* Setup Overlay */}
      {setupOpen && (
        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          {!prepared ? (
            // Step 1: Deck selection
            <div className="w-full max-w-5xl bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-lg font-semibold mb-2">Player 1 Deck</div>
                <select
                  className="w-full bg-black/40 rounded px-3 py-2 outline-none"
                  value={deckIdP1}
                  onChange={(e) => setDeckIdP1(e.target.value)}
                >
                  <option value="">Select…</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {deckErrP1 && (
                  <div className="text-red-300 text-xs mt-2">{deckErrP1}</div>
                )}
              </div>
              <div>
                <div className="text-lg font-semibold mb-2">Player 2 Deck</div>
                <select
                  className="w-full bg-black/40 rounded px-3 py-2 outline-none"
                  value={deckIdP2}
                  onChange={(e) => setDeckIdP2(e.target.value)}
                >
                  <option value="">Select…</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {deckErrP2 && (
                  <div className="text-red-300 text-xs mt-2">{deckErrP2}</div>
                )}
              </div>
              <div className="md:col-span-2 flex items-center justify-between pt-2">
                <div className="opacity-80 text-sm">
                  Select both decks, then prepare opening hands.
                </div>
                <div className="flex items-center gap-3">
                  <button
                    className="rounded bg-emerald-600/90 hover:bg-emerald-500 px-4 py-2"
                    disabled={!deckIdP1 || !deckIdP2}
                    onClick={prepareHands}
                  >
                    Prepare Hands
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Step 2: Dedicated mulligan screen (one round only)
            <div className="w-full max-w-6xl bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-lg font-semibold">
                  Mulligan (one round only)
                </div>
                <div className="text-sm opacity-80">
                  Select cards to put back. You&apos;ll draw the same number
                  from the appropriate pile.
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6">
                {/* P1 */}
                <div className="bg-black/30 rounded-xl p-4 ring-1 ring-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold">Player 1</div>
                    <div className="text-xs opacity-80">
                      Mulligans left: {mulligans.p1}
                    </div>
                  </div>
                  <div className="text-xs opacity-80 mb-2">
                    Click cards to select for mulligan.
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pb-2 pt-16">
                    {(zones.p1.hand || []).map((c, i) => {
                      const isSite = (c.type || "")
                        .toLowerCase()
                        .includes("site");
                      const picked = selP1.includes(i);
                      return (
                        <button
                          key={`${c.cardId}-${i}`}
                          className={`relative shrink-0 p-1 rounded border transition-transform duration-150 origin-center hover:scale-[2] hover:z-50 ${
                            picked
                              ? "border-amber-400 bg-amber-500/20"
                              : "border-white/15 bg-white/10 hover:bg-white/20"
                          }`}
                          title={c.name}
                          onClick={() =>
                            setSelP1((arr) =>
                              arr.includes(i)
                                ? arr.filter((x) => x !== i)
                                : [...arr, i]
                            )
                          }
                          disabled={mulligans.p1 <= 0 || doneP1}
                        >
                          {c.slug ? (
                            <div
                              className={`relative ${
                                isSite
                                  ? "aspect-[4/3] w-28"
                                  : "aspect-[3/4] h-28"
                              } rounded overflow-visible`}
                            >
                              <Image
                                src={`/api/images/${c.slug}`}
                                alt={c.name}
                                fill
                                sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                                className={`${
                                  isSite
                                    ? "object-contain rotate-90"
                                    : "object-cover"
                                }`}
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
                      disabled={
                        selP1.length === 0 || mulligans.p1 <= 0 || doneP1
                      }
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
                      <div className="text-xs opacity-80 mb-1">
                        Drawn replacements:
                      </div>
                      <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pt-12">
                        {mulliganDrawn.p1.map((c, i) => {
                          const isSite = (c.type || "")
                            .toLowerCase()
                            .includes("site");
                          return (
                            <div
                              key={`${c.cardId}-d-${i}`}
                              className="relative shrink-0 p-1 rounded border border-emerald-400 bg-emerald-500/10 transition-transform duration-150 origin-center hover:scale-[2] hover:z-50"
                            >
                              {c.slug ? (
                                <div
                                  className={`relative ${
                                    isSite
                                      ? "aspect-[4/3] w-24"
                                      : "aspect-[3/4] h-24"
                                  } rounded overflow-visible`}
                                >
                                  <Image
                                    src={`/api/images/${c.slug}`}
                                    alt={c.name}
                                    fill
                                    sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                                    className={`${
                                      isSite ? "object-contain rotate-90" : "object-cover"
                                    }`}
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
                  You can mulligan once only. After you are done, start the
                  game.
                </div>
                <button
                  className="rounded bg-indigo-600/90 hover:bg-indigo-500 px-4 py-2 disabled:opacity-50"
                  disabled={!doneP1}
                  onClick={startGame}
                >
                  Start Game
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HUD */}
      {/* Top-center status pill */}
      <div
        className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 ${
          dragFromHand ? "pointer-events-none" : "pointer-events-auto"
        }`}
      >
        <div className="flex items-center gap-3 rounded-full bg-black/60 backdrop-blur px-4 py-1.5 text-sm text-white shadow-lg ring-1 ring-white/10">
          <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
          <span className="opacity-80">Player</span>
          <span className="font-semibold">{currentPlayer}</span>
          <span className="opacity-50">•</span>
          <span className="opacity-80">Phase</span>
          <span className="font-semibold">{phase}</span>
          <button
            className="ml-2 rounded-full bg-emerald-600/90 hover:bg-emerald-500 text-white px-3 py-1"
            onClick={() => endTurn()}
          >
            End Turn
          </button>
          <button
            className="rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1 disabled:opacity-40"
            onClick={() => undo()}
            disabled={!history.length}
          >
            Undo
          </button>
          <button
            className={`rounded-full px-3 py-1 ${
              showGrid
                ? "bg-indigo-500 text-white"
                : "bg-white/15 hover:bg-white/25"
            }`}
            onClick={() => toggleGrid()}
          >
            {showGrid ? "Grid On" : "Grid Off"}
          </button>
          <button
            className={`rounded-full px-3 py-1 ${
              showPlaymat
                ? "bg-indigo-500 text-white"
                : "bg-white/15 hover:bg-white/25"
            }`}
            onClick={() => togglePlaymat()}
          >
            {showPlaymat ? "Mat On" : "Mat Off"}
          </button>
        </div>
      </div>

      {/* Left vertical life counters + Thresholds */}
      <div
        className={`absolute left-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-3 ${
          dragFromHand ? "pointer-events-none" : "pointer-events-auto"
        } text-white`}
      >
        {/* Current player thresholds (relocated from bottom bar) */}
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

      {/* Bottom resource/controls bar */}
      <div className="absolute inset-x-0 bottom-3 z-10 pointer-events-none">
        <div
          className={`${
            dragFromHand ? "pointer-events-none" : "pointer-events-auto"
          } mx-auto max-w-3xl rounded-xl bg-black/60 backdrop-blur px-4 py-2 text-sm text-white shadow-xl ring-1 ring-white/10 flex items-center justify-between`}
        >
          <div className="flex items-center gap-4">
            <span className="opacity-80">P{currentPlayer} Mana</span>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
                onClick={() => addMana(currentPlayer === 1 ? "p1" : "p2", -1)}
              >
                -
              </button>
              <span className="w-6 text-center font-semibold">{cur.mana}</span>
              <button
                className="px-2 py-0.5 rounded bg-white/15 hover:bg-white/25"
                onClick={() => addMana(currentPlayer === 1 ? "p1" : "p2", +1)}
              >
                +
              </button>
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

      {/* Event Console */}
      <div
        className={`absolute right-3 bottom-24 z-10 ${
          dragFromHand ? "pointer-events-none" : "pointer-events-auto"
        } text-white w-80`}
      >
        <div className="bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow">
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-semibold opacity-90">Console</span>
            <button
              className="rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-xs"
              onClick={() => setConsoleOpen((o) => !o)}
            >
              {consoleOpen ? "Collapse" : "Expand"}
            </button>
          </div>
          {consoleOpen && (
            <div className="max-h-64 overflow-y-auto px-3 pb-3 text-xs space-y-1">
              {events.length === 0 && (
                <div className="opacity-60">No events yet</div>
              )}
              {events.slice(-100).map((ev) => {
                const t = ev.text || "";
                const low = t.toLowerCase();
                const isWarn =
                  low.startsWith("warning") || low.startsWith("cannot");
                return (
                  <div
                    key={ev.id}
                    className={`opacity-85 ${isWarn ? "text-red-400" : ""}`}
                  >
                    • {ev.text}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Hover Preview Overlay (hidden if context menu or magnifier visible) */}
      {previewCard?.slug && !contextMenu && !selectedHandCard && (
        <div className="absolute right-3 top-20 z-20 pointer-events-none">
          {(() => {
            const isSite = (previewCard?.type || "")
              .toLowerCase()
              .includes("site");
            return (
              <div className="relative">
                <div
                  className={`relative ${
                    isSite ? "aspect-[4/3]" : "aspect-[3/4]"
                  } w-[300px] md:w-[380px] rounded-xl overflow-hidden ring-1 ring-white/20 shadow-2xl`}
                >
                  <Image
                    src={`/api/images/${previewCard.slug}`}
                    alt={previewCard.name}
                    fill
                    sizes="(max-width:640px) 40vw, (max-width:1024px) 25vw, 20vw"
                    className={`${
                      isSite ? "object-contain rotate-90" : "object-contain"
                    }`}
                  />
                </div>
                <button
                  className="pointer-events-auto absolute -top-2 -right-2 bg-black/70 text-white text-xs rounded-full px-2 py-1 ring-1 ring-white/10"
                  onClick={() => setPreviewCard(null)}
                  title="Close preview"
                >
                  ×
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Context Menu (cursor-positioned) */}
      {contextMenu && (
        <div
          className="absolute inset-0 z-30"
          onClick={() => closeContextMenu()}
          onContextMenu={(e) => {
            e.preventDefault();
            closeContextMenu();
          }}
        >
          <div
            ref={menuRef}
            className="absolute bg-zinc-900/90 backdrop-blur rounded-xl ring-1 ring-white/10 shadow-lg p-3 w-56 text-white pointer-events-auto"
            style={{
              left: (menuPos?.left ?? contextMenu.screen?.x ?? 16) + "px",
              top: (menuPos?.top ?? contextMenu.screen?.y ?? 16) + "px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const t = contextMenu.target;
              let header = "";
              let tapped = false;
              let doToggle: () => void = () => {};
              let doToHand: (() => void) | null = null;
              let doToGY: (() => void) | null = null;
              let doBanish: (() => void) | null = null;
              if (t.kind === "site") {
                const key = `${t.x},${t.y}`;
                const site = board.sites[key];
                header =
                  site?.card?.name || `Site #${t.y * board.size.w + t.x + 1}`;
                tapped = !!site?.tapped;
                doToggle = () => {
                  toggleTapSite(t.x, t.y);
                  closeContextMenu();
                };
                // Zone moves for sites
                doToHand = () => {
                  moveSiteToZone(t.x, t.y, "hand");
                  closeContextMenu();
                };
                doToGY = () => {
                  moveSiteToZone(t.x, t.y, "graveyard");
                  closeContextMenu();
                };
                doBanish = () => {
                  moveSiteToZone(t.x, t.y, "banished");
                  closeContextMenu();
                };
              } else if (t.kind === "permanent") {
                const item = (permanents[t.at] || [])[t.index];
                header = item?.card?.name || "Permanent";
                tapped = !!item?.tapped;
                doToggle = () => {
                  toggleTapPermanent(t.at, t.index);
                  closeContextMenu();
                };
                // Zone moves for permanents
                doToHand = () => {
                  movePermanentToZone(t.at, t.index, "hand");
                  closeContextMenu();
                };
                doToGY = () => {
                  movePermanentToZone(t.at, t.index, "graveyard");
                  closeContextMenu();
                };
                doBanish = () => {
                  movePermanentToZone(t.at, t.index, "banished");
                  closeContextMenu();
                };
              } else if (t.kind === "avatar") {
                const a = avatars[t.who];
                header = a?.card?.name || `${t.who.toUpperCase()} Avatar`;
                tapped = !!a?.tapped;
                doToggle = () => {
                  toggleTapAvatar(t.who);
                  closeContextMenu();
                };
                // No zone moves for avatars
              }
              const label = tapped ? "Untap" : "Tap";
              return (
                <div>
                  <div
                    className="text-sm font-semibold mb-2 truncate"
                    title={header}
                  >
                    {header}
                  </div>
                  <div className="space-y-2">
                    <button
                      className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                      onClick={doToggle}
                    >
                      {label}
                    </button>
                    {(doToHand || doToGY || doBanish) && (
                      <div className="space-y-2">
                        {doToHand && (
                          <button
                            className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                            onClick={doToHand}
                          >
                            Move to Hand
                          </button>
                        )}
                        {doToGY && (
                          <button
                            className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                            onClick={doToGY}
                          >
                            Move to Cemetery
                          </button>
                        )}
                        {doBanish && (
                          <button
                            className="w-full text-left rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                            onClick={doBanish}
                          >
                            Banish Card
                          </button>
                        )}
                      </div>
                    )}
                    <button
                      className="w-full text-left rounded bg-white/5 hover:bg-white/15 px-3 py-1"
                      onClick={() => closeContextMenu()}
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Piles & Graveyards - P2 (top-left) */}
      <div
        className={`absolute left-3 top-20 z-10 ${
          dragFromHand ? "pointer-events-none" : "pointer-events-auto"
        } text-white`}
      >
        <div className="bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow p-3 w-56">
          <div className="text-sm font-semibold mb-2">P2 Piles</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="col-span-1">
              <div className="rounded-lg bg-white/10 ring-1 ring-white/10 p-2 text-center">
                <div className="opacity-80">Spellbook</div>
                <div className="text-lg font-mono">
                  {zones.p2.spellbook.length}
                </div>
                {zones.p2.spellbook.length > 0 && (() => {
                  const top = zones.p2.spellbook[0];
                  const isSite = (top?.type || "").toLowerCase().includes("site");
                  return (
                    <button
                      className="mt-1 w-full rounded border border-white/15 bg-white/10 hover:bg-white/20 px-1 py-1"
                      title={top.name}
                      onMouseDown={() => {
                        setDragFromPile({ who: "p2", from: "spellbook", card: top });
                        setDragFromHand(true);
                      }}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      {top?.slug ? (
                        <div
                          className={`relative ${isSite ? "aspect-[4/3]" : "aspect-[3/4]"} w-20 mx-auto rounded overflow-visible`}
                        >
                          <Image
                            src={`/api/images/${top.slug}`}
                            alt={top.name}
                            fill
                            sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                            className={`${isSite ? "object-contain -rotate-90" : "object-cover"}`}
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-28 mx-auto grid place-items-center rounded bg-white/10 text-[10px] opacity-80">
                          {top?.name || "Top card"}
                        </div>
                      )}
                    </button>
                  );
                })()}
                <button
                  className="mt-1 w-full rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 disabled:opacity-40"
                  disabled={
                    currentPlayer !== 2 ||
                    (phase !== "Draw" && phase !== "Main")
                  }
                  onClick={() => drawFrom("p2", "spellbook", 1)}
                >
                  Draw
                </button>
              </div>
            </div>
            <div className="col-span-1">
              <div className="rounded-lg bg-white/10 ring-1 ring-white/10 p-2 text-center">
                <div className="opacity-80">Atlas</div>
                <div className="text-lg font-mono">{zones.p2.atlas.length}</div>
                {zones.p2.atlas.length > 0 && (() => {
                  const top = zones.p2.atlas[0];
                  const isSite = (top?.type || "").toLowerCase().includes("site");
                  return (
                    <button
                      className="mt-1 w-full rounded border border-white/15 bg-white/10 hover:bg-white/20 px-1 py-1"
                      title={top.name}
                      onMouseDown={() => {
                        setDragFromPile({ who: "p2", from: "atlas", card: top });
                        setDragFromHand(true);
                      }}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      {top?.slug ? (
                        <div
                          className={`relative ${isSite ? "aspect-[4/3]" : "aspect-[3/4]"} w-20 mx-auto rounded overflow-visible`}
                        >
                          <Image
                            src={`/api/images/${top.slug}`}
                            alt={top.name}
                            fill
                            sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                            className={`${isSite ? "object-contain -rotate-90" : "object-cover"}`}
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-28 mx-auto grid place-items-center rounded bg-white/10 text-[10px] opacity-80">
                          {top?.name || "Top card"}
                        </div>
                      )}
                    </button>
                  );
                })()}
                <button
                  className="mt-1 w-full rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 disabled:opacity-40"
                  disabled={
                    currentPlayer !== 2 ||
                    (phase !== "Draw" && phase !== "Main")
                  }
                  onClick={() => drawFrom("p2", "atlas", 1)}
                >
                  Draw
                </button>
              </div>
            </div>
            <div className="col-span-1">
              <div className="rounded-lg bg-white/10 ring-1 ring-white/10 p-2 text-center">
                <div className="opacity-80">Graveyard</div>
                <div className="text-lg font-mono">
                  {zones.p2.graveyard.length}
                </div>
                {zones.p2.graveyard.length > 0 && (() => {
                  const top = zones.p2.graveyard[0];
                  const isSite = (top?.type || "").toLowerCase().includes("site");
                  return (
                    <button
                      className="mt-1 w-full rounded border border-white/15 bg-white/10 hover:bg-white/20 px-1 py-1"
                      title={top.name}
                      onMouseDown={() => {
                        setDragFromPile({ who: "p2", from: "graveyard", card: top });
                        setDragFromHand(true);
                      }}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      {top?.slug ? (
                        <div
                          className={`relative ${isSite ? "aspect-[4/3]" : "aspect-[3/4]"} w-20 mx-auto rounded overflow-visible`}
                        >
                          <Image
                            src={`/api/images/${top.slug}`}
                            alt={top.name}
                            fill
                            sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                            className={`${isSite ? "object-contain -rotate-90" : "object-cover"}`}
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-28 mx-auto grid place-items-center rounded bg-white/10 text-[10px] opacity-80">
                          {top?.name || "Top card"}
                        </div>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Piles & Graveyards - P1 (bottom-left) */}
      <div
        className={`absolute left-3 bottom-24 z-10 ${
          dragFromHand ? "pointer-events-none" : "pointer-events-auto"
        } text-white`}
      >
        <div className="bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow p-3 w-56">
          <div className="text-sm font-semibold mb-2">P1 Piles</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="col-span-1">
              <div className="rounded-lg bg-white/10 ring-1 ring-white/10 p-2 text-center">
                <div className="opacity-80">Spellbook</div>
                <div className="text-lg font-mono">
                  {zones.p1.spellbook.length}
                </div>
                {zones.p1.spellbook.length > 0 && (() => {
                  const top = zones.p1.spellbook[0];
                  const isSite = (top?.type || "").toLowerCase().includes("site");
                  return (
                    <button
                      className="mt-1 w-full rounded border border-white/15 bg-white/10 hover:bg-white/20 px-1 py-1"
                      title={top.name}
                      onMouseDown={() => {
                        setDragFromPile({ who: "p1", from: "spellbook", card: top });
                        setDragFromHand(true);
                      }}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      {top?.slug ? (
                        <div
                          className={`relative ${isSite ? "aspect-[4/3]" : "aspect-[3/4]"} w-20 mx-auto rounded overflow-visible`}
                        >
                          <Image
                            src={`/api/images/${top.slug}`}
                            alt={top.name}
                            fill
                            sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                            className={`${isSite ? "object-contain -rotate-90" : "object-cover"}`}
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-28 mx-auto grid place-items-center rounded bg-white/10 text-[10px] opacity-80">
                          {top?.name || "Top card"}
                        </div>
                      )}
                    </button>
                  );
                })()}
                <button
                  className="mt-1 w-full rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 disabled:opacity-40"
                  disabled={
                    currentPlayer !== 1 ||
                    (phase !== "Draw" && phase !== "Main")
                  }
                  onClick={() => drawFrom("p1", "spellbook", 1)}
                >
                  Draw
                </button>
              </div>
            </div>
            <div className="col-span-1">
              <div className="rounded-lg bg-white/10 ring-1 ring-white/10 p-2 text-center">
                <div className="opacity-80">Atlas</div>
                <div className="text-lg font-mono">{zones.p1.atlas.length}</div>
                {zones.p1.atlas.length > 0 && (() => {
                  const top = zones.p1.atlas[0];
                  const isSite = (top?.type || "").toLowerCase().includes("site");
                  return (
                    <button
                      className="mt-1 w-full rounded border border-white/15 bg-white/10 hover:bg-white/20 px-1 py-1"
                      title={top.name}
                      onMouseDown={() => {
                        setDragFromPile({ who: "p1", from: "atlas", card: top });
                        setDragFromHand(true);
                      }}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      {top?.slug ? (
                        <div
                          className={`relative ${isSite ? "aspect-[4/3]" : "aspect-[3/4]"} w-20 mx-auto rounded overflow-visible`}
                        >
                          <Image
                            src={`/api/images/${top.slug}`}
                            alt={top.name}
                            fill
                            sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                            className={`${isSite ? "object-contain -rotate-90" : "object-cover"}`}
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-28 mx-auto grid place-items-center rounded bg-white/10 text-[10px] opacity-80">
                          {top?.name || "Top card"}
                        </div>
                      )}
                    </button>
                  );
                })()}
                <button
                  className="mt-1 w-full rounded bg-white/15 hover:bg-white/25 px-2 py-0.5 disabled:opacity-40"
                  disabled={
                    currentPlayer !== 1 ||
                    (phase !== "Draw" && phase !== "Main")
                  }
                  onClick={() => drawFrom("p1", "atlas", 1)}
                >
                  Draw
                </button>
              </div>
            </div>
            <div className="col-span-1">
              <div className="rounded-lg bg-white/10 ring-1 ring-white/10 p-2 text-center">
                <div className="opacity-80">Graveyard</div>
                <div className="text-lg font-mono">
                  {zones.p1.graveyard.length}
                </div>
                {zones.p1.graveyard.length > 0 && (() => {
                  const top = zones.p1.graveyard[0];
                  const isSite = (top?.type || "").toLowerCase().includes("site");
                  return (
                    <button
                      className="mt-1 w-full rounded border border-white/15 bg-white/10 hover:bg-white/20 px-1 py-1"
                      title={top.name}
                      onMouseDown={() => {
                        setDragFromPile({ who: "p1", from: "graveyard", card: top });
                        setDragFromHand(true);
                      }}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      {top?.slug ? (
                        <div
                          className={`relative ${isSite ? "aspect-[4/3]" : "aspect-[3/4]"} w-20 mx-auto rounded overflow-visible`}
                        >
                          <Image
                            src={`/api/images/${top.slug}`}
                            alt={top.name}
                            fill
                            sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                            className={`${isSite ? "object-contain -rotate-90" : "object-cover"}`}
                            draggable={false}
                          />
                        </div>
                      ) : (
                        <div className="w-20 h-28 mx-auto grid place-items-center rounded bg-white/10 text-[10px] opacity-80">
                          {top?.name || "Top card"}
                        </div>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hand panel (P1 only) */}
      <div className="absolute inset-x-0 bottom-20 z-10 pointer-events-none overflow-visible">
        <div
          className={`${
            dragFromHand ? "pointer-events-none" : "pointer-events-auto"
          } mx-auto max-w-5xl px-3 py-2 text-sm text-white overflow-visible`}
        >
          <div className="flex items-center gap-2 overflow-x-auto overflow-y-visible pt-16">
            {(zones.p1.hand || []).map((c, i) => {
              const isSel =
                selected && selected.who === "p1" && selected.index === i;
              const isSite = (c.type || "").toLowerCase().includes("site");
              return (
                <button
                  key={`${c.cardId}-${i}`}
                  className={`relative shrink-0 rounded border transition-transform duration-150 origin-bottom hover:scale-[1.5] hover:-translate-y-6 hover:z-50 ${
                    isSite ? "px-1 py-0.5" : "p-1"
                  } ${
                    isSel
                      ? "border-emerald-400 bg-emerald-500/20"
                      : "border-white/15 bg-white/10 hover:bg-white/20"
                  }`}
                  title={c.name}
                  onClick={() =>
                    isSel ? clearSelection() : selectHandCard("p1", i)
                  }
                  onMouseDown={() => {
                    // Start drag only if this card is already selected
                    if (
                      selected &&
                      selected.who === "p1" &&
                      selected.index === i
                    ) {
                      setDragFromHand(true);
                    }
                  }}
                  onDragStart={(e) => e.preventDefault()}
                >
                  {c.slug ? (
                    <div
                      className={`relative ${
                        isSite
                          ? "aspect-[4/3] w-28"
                          : "aspect-[3/4] h-28"
                      } rounded overflow-visible bg-muted/40`}
                    >
                      <Image
                        src={`/api/images/${c.slug}`}
                        alt={c.name}
                        fill
                        sizes="(max-width:640px) 25vw, (max-width:1024px) 20vw, 10vw"
                        className={`${
                          isSite ? "object-contain rotate-90" : "object-cover"
                        }`}
                        draggable={false}
                      />
                    </div>
                  ) : (
                    <div className="w-24 h-32 grid place-items-center rounded bg-white/10 text-xs opacity-80">
                      {c.name}
                    </div>
                  )}
                  <div className="text-[10px] mt-1 max-w-24 truncate opacity-90">
                    {c.name}
                  </div>
                </button>
              );
            })}
            {zones.p1.hand.length === 0 && (
              <div className="opacity-60">Hand is empty</div>
            )}
          </div>
        </div>
      </div>

      {/* Hand Card Magnifier (selected hand card) - moved to right side */}
      {(() => {
        const c = selectedHandCard;
        if (!c?.slug || dragFromHand || contextMenu) return null;
        const isSite = (c.type || "").toLowerCase().includes("site");
        return (
          <div className="absolute right-3 top-20 z-20 pointer-events-none">
            <div className="relative">
              <div
                className={`relative ${
                  isSite ? "aspect-[4/3]" : "aspect-[3/4]"
                } h-[420px] md:h-[500px] lg:h-[560px] rounded-xl overflow-hidden ring-1 ring-white/20 shadow-2xl`}
              >
                <Image
                  src={`/api/images/${c.slug}`}
                  alt={c.name}
                  fill
                  sizes="(max-width:640px) 85vw, (max-width:1024px) 60vw, 40vw"
                  className={`${isSite ? "object-contain rotate-90" : "object-contain"}`}
                />
              </div>
              <button
                className="pointer-events-auto absolute -top-2 -right-2 bg-black/70 text-white text-xs rounded-full px-2 py-1 ring-1 ring-white/10"
                onClick={() => clearSelection()}
                title="Close magnifier"
              >
                ×
              </button>
            </div>
          </div>
        );
      })()}

      {/* Board */}
      <Canvas camera={{ position: [0, 10, 0], fov: 50 }} shadows>
        <color attach="background" args={["#0b0b0c"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 12, 8]} intensity={1} castShadow />

        {/* Interactive board */}
        <Board />

        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enablePan={!dragFromHand}
          enableRotate={!dragFromHand}
          enableZoom
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  );
}
