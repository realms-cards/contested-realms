"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { useGameStore } from "@/lib/game/store";
import Board from "@/lib/game/Board";
import Hand3D from "@/lib/game/components/Hand3D";
import Piles3D from "@/lib/game/components/Piles3D";
import TokenPile3D from "@/lib/game/components/TokenPile3D";
import Hud3D from "@/lib/game/components/Hud3D";
import TextureCache from "@/lib/game/components/TextureCache";
import { MAT_PIXEL_W, MAT_PIXEL_H, BASE_TILE_SIZE, MAT_RATIO } from "@/lib/game/constants";
import Image from "next/image";
import CardPreview from "@/components/game/CardPreview";
import DeckSelector from "@/components/game/DeckSelector";
import OnlineMulliganScreen from "@/components/game/OnlineMulliganScreen";
import StatusBar from "@/components/game/StatusBar";
import LifeCounters from "@/components/game/LifeCounters";
import ContextMenu from "@/components/game/ContextMenu";
import PlacementDialog from "@/components/game/PlacementDialog";
import PileSearchDialog from "@/components/game/PileSearchDialog";
import { LocalTransport } from "@/lib/net/localTransport";

export default function PlayPage() {
  const dragFromHand = useGameStore((s) => s.dragFromHand);
  const dragFromPile = useGameStore((s) => s.dragFromPile);
  const setDragFromHand = useGameStore((s) => s.setDragFromHand);
  const setDragFromPile = useGameStore((s) => s.setDragFromPile);
  const previewCard = useGameStore((s) => s.previewCard);
  const setPreviewCard = useGameStore((s) => s.setPreviewCard);
  const contextMenu = useGameStore((s) => s.contextMenu);
  const closeContextMenu = useGameStore((s) => s.closeContextMenu);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const selected = useGameStore((s) => s.selectedCard);
  const zones = useGameStore((s) => s.zones);
  const events = useGameStore((s) => s.events);
  const setPhase = useGameStore((s) => s.setPhase);
  const placementDialog = useGameStore((s) => s.placementDialog);
  const closePlacementDialog = useGameStore((s) => s.closePlacementDialog);
  const searchDialog = useGameStore((s) => s.searchDialog);
  const closeSearchDialog = useGameStore((s) => s.closeSearchDialog);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const selectedAvatar = useGameStore((s) => s.selectedAvatar);
  const players = useGameStore((s) => s.players);
  const boardSize = useGameStore((s) => s.board.size);
  // Selected hand card (for magnifier) - show for current player
  const currentPlayerKey = currentPlayer === 1 ? "p1" : "p2";
  const [magnifierDelay, setMagnifierDelay] = useState(false);
  const selectedHandCard = (() => {
    if (!selected || selected.who !== currentPlayerKey) return null;
    const hand = zones[currentPlayerKey].hand || [];
    return hand[selected.index] ?? null;
  })();

  // Delay showing the magnifier to prevent it from competing with preview
  useEffect(() => {
    if (selectedHandCard) {
      setMagnifierDelay(false);
      const timer = setTimeout(() => setMagnifierDelay(true), 100);
      return () => clearTimeout(timer);
    } else {
      setMagnifierDelay(false);
    }
  }, [selectedHandCard]);

  // LocalTransport wiring for offline play
  const transportRef = useRef<LocalTransport | null>(null);
  const transport = useMemo(() => {
    if (!transportRef.current) transportRef.current = new LocalTransport();
    return transportRef.current;
  }, []);

  // Batch incoming server patches to a single RAF to avoid rapid re-entrancy
  const patchQueueRef = useRef<Array<{ patch: unknown; t?: number }>>([]);
  const patchFlushScheduledRef = useRef<boolean>(false);
  const queueServerPatch = (patch: unknown, t?: number) => {
    patchQueueRef.current.push({ patch, t });
    if (patchFlushScheduledRef.current) return;
    patchFlushScheduledRef.current = true;
    requestAnimationFrame(() => {
      patchFlushScheduledRef.current = false;
      const items = patchQueueRef.current;
      patchQueueRef.current = [];
      for (const it of items) {
        try {
          useGameStore.getState().applyServerPatch(it.patch, it.t);
        } catch (e) {
          try { console.warn("applyServerPatch failed", e); } catch {}
        }
      }
    });
  };

  // Inject transport into store once; remove on unmount
  useEffect(() => {
    useGameStore.getState().setTransport(transport);
    return () => {
      try {
        useGameStore.getState().setTransport(null);
      } catch {}
    };
  }, [transport]);

  // Connect LocalTransport and subscribe to events
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    (async () => {
      try {
        let displayName = "Offline Player";
        try { displayName = localStorage.getItem("sorcery:playerName") || displayName; } catch {}
        await transport.connect({ displayName });
      } catch (e) {
        try { console.warn("LocalTransport connect failed", e); } catch {}
      }
    })();

    unsubscribers.push(
      transport.on("statePatch", (p) => {
        queueServerPatch(p.patch, p.t);
      }),
      transport.on("resync", (p) => {
        const snap = p.snapshot as { game?: unknown; t?: number };
        if (snap?.game) {
          queueServerPatch(snap.game, typeof snap.t === "number" ? snap.t : undefined);
        }
      }),
      transport.on("error", (p) => {
        try { console.warn("local transport error", p); } catch {}
      })
    );

    return () => {
      unsubscribers.forEach((u) => u());
      transport.disconnect();
    };
  }, [transport]);

  // Setup state
  const [setupOpen, setSetupOpen] = useState<boolean>(true);
  const [prepared, setPrepared] = useState<boolean>(false);
  const [consoleOpen, setConsoleOpen] = useState<boolean>(false);
  // Hotseat: Player 1 performs mulligans for both players; start after both are ready
  const [p1Ready, setP1Ready] = useState<boolean>(false);
  const [p2Ready, setP2Ready] = useState<boolean>(false);

  // Event console: autoscroll and text formatting
  const eventsRef = useRef<HTMLDivElement | null>(null);
  // Camera controls ref for reset functionality
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  function formatEventText(text: string): string {
    // Redact opponent (P2) drawn card names while preserving the rest
    let t = text || "";
    // Case 1: P2 draws 'Card Name' ...
    t = t.replace(/^(P2 draws )'[^']+'/i, "$1a card");
    // Case 2: Cannot draw 'Card Name' ...: P2 is not the current player
    t = t.replace(
      /^Cannot draw '.*?'( from .+: P2 is not the current player)$/i,
      "Cannot draw a card$1"
    );
    return t;
  }

  // Autoscroll to latest event when events change or console opens
  useEffect(() => {
    if (!consoleOpen) return;
    const el = eventsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length, consoleOpen]);

  // Robust: reset drag flags when input ends, is canceled, or tab loses focus
  useEffect(() => {
    const reset = (reason?: string) => {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[drag] reset via ${reason || "unknown"}`);
      }
      // Defer to allow any drop/pointerup handlers to run first
      setTimeout(() => {
        setDragFromHand(false);
        setDragFromPile(null);
      }, 0);
    };

    const onPointerUp = () => reset("pointerup");
    const onPointerCancel = () => reset("pointercancel");
    const onMouseUp = () => reset("mouseup");
    const onTouchEnd = () => reset("touchend");
    const onBlur = () => reset("blur");
    const onVisibility = () => {
      if (document.visibilityState !== "visible") reset("visibilitychange");
    };
    const onPageHide = () => reset("pagehide");

    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [setDragFromHand, setDragFromPile]);

  const startGame = useCallback(() => {
    setSetupOpen(false);
    setPhase("Main");
  }, [setPhase]);

  // Start once both players are confirmed in hotseat mulligan
  useEffect(() => {
    if (prepared && p1Ready && p2Ready) {
      startGame();
    }
  }, [prepared, p1Ready, p2Ready, startGame]);

  function resetCamera() {
    if (controlsRef.current) {
      // Reset camera position and rotation to default
      controlsRef.current.reset();
    }
  }

  // Dynamic page title for offline play
  useEffect(() => {
    const baseTitle = "Contested Realms";

    if (setupOpen) {
      document.title = `${baseTitle} - Game Setup`;
      return;
    }

    const p1Life = players.p1?.life;
    const p2Life = players.p2?.life;

    let title = `${baseTitle} - Offline`;

    // Add life info if available
    if (p1Life !== undefined && p2Life !== undefined) {
      title += ` (P1: ${p1Life} vs P2: ${p2Life})`;
    }

    // Add turn info
    title += ` - P${currentPlayer}'s Turn`;

    document.title = title;
  }, [setupOpen, players.p1?.life, players.p2?.life, currentPlayer]);

  // Compute playmat world extents from board size for camera clamping
  const baseGridW = boardSize.w * BASE_TILE_SIZE;
  const baseGridH = boardSize.h * BASE_TILE_SIZE;
  let matW = baseGridW;
  let matH = baseGridW / MAT_RATIO;
  if (matH < baseGridH) {
    matH = baseGridH;
    matW = baseGridH * MAT_RATIO;
  }
  const minDist = Math.max(2, Math.min(matW, matH) * 0.25);
  const maxDist = Math.max(14, Math.hypot(matW, matH) * 1.3);
  const clampControls = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    const halfW = matW / 2;
    const halfH = matH / 2;
    const t = c.target;
    let changed = false;
    if (t.x < -halfW) {
      t.x = -halfW;
      changed = true;
    } else if (t.x > halfW) {
      t.x = halfW;
      changed = true;
    }
    if (t.z < -halfH) {
      t.z = -halfH;
      changed = true;
    } else if (t.z > halfH) {
      t.z = halfH;
      changed = true;
    }
    if (t.y !== 0) {
      t.y = 0;
      changed = true;
    }
    if (changed) c.update();
  }, [matW, matH]);

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full">
      {/* Setup Overlay */}
      {setupOpen && (
        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          {!prepared ? (
            <DeckSelector onPrepareComplete={() => setPrepared(true)} />
          ) : (
            <div className="w-full max-w-6xl mx-auto space-y-4">
              <OnlineMulliganScreen
                myPlayerKey="p1"
                playerNames={{ p1: "Player 1", p2: "Player 2" }}
                finalizeLabel="Ready"
                onStartGame={() => setP1Ready(true)}
              />
              <OnlineMulliganScreen
                myPlayerKey="p2"
                playerNames={{ p1: "Player 1", p2: "Player 2" }}
                finalizeLabel="Ready"
                onStartGame={() => setP2Ready(true)}
              />
              {!(p1Ready && p2Ready) && (
                <div className="text-center text-xs opacity-80 text-white">
                  Hotseat: Player 1 confirms mulligans for both players. Click Ready on each to begin.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* HUD */}
      <StatusBar dragFromHand={dragFromHand} onCameraReset={resetCamera} />

      <LifeCounters dragFromHand={dragFromHand} />

      {/* <ResourceBar dragFromHand={dragFromHand} /> */}

      {/* Event Console */}
      <div
        className={`absolute left-3 bottom-2 z-10 ${
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
            <div
              ref={eventsRef}
              className="max-h-64 overflow-y-auto px-3 pb-3 text-xs space-y-1"
            >
              {events.length === 0 && (
                <div className="opacity-60">No events yet</div>
              )}
              {events.slice(-100).map((ev) => {
                const t = ev.text || "";
                const low = t.toLowerCase();
                const isWarn =
                  low.startsWith("warning") || low.startsWith("cannot");
                const isSearch = low.startsWith("search:");
                return (
                  <div
                    key={ev.id}
                    className={`opacity-85 ${
                      isWarn
                        ? "text-red-400"
                        : isSearch
                        ? "text-yellow-400"
                        : ""
                    }`}
                  >
                    • {formatEventText(ev.text)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Hover Preview Overlay (hidden if context menu or magnifier visible) */}
      {previewCard?.slug && !contextMenu && !selectedHandCard && (
        <CardPreview card={previewCard} anchor="top-right" onClose={() => setPreviewCard(null)} />
      )}

      {contextMenu && (
        <ContextMenu
          onClose={() => {
            clearSelection();
            setPreviewCard(null);
            closeContextMenu();
          }}
        />
      )}

      {/* Global dialogs */}
      {placementDialog && (
        <PlacementDialog
          cardName={placementDialog.cardName}
          pileName={placementDialog.pileName}
          onChoice={(pos) => {
            placementDialog.onPlace(pos);
            closePlacementDialog();
          }}
          onCancel={() => closePlacementDialog()}
        />
      )}

      {searchDialog && (
        <PileSearchDialog
          pileName={searchDialog.pileName}
          cards={searchDialog.cards}
          onSelectCard={(card) => {
            searchDialog.onSelectCard(card);
            closeSearchDialog();
          }}
          onClose={() => closeSearchDialog()}
        />
      )}

      {/* Replaced 2D overlays with 3D piles and hand inside Canvas */}

      {/* Hand Card Magnifier (selected hand card) - moved to right side */}
      {(() => {
        const c = selectedHandCard;
        if (!c?.slug || dragFromHand || contextMenu || !magnifierDelay)
          return null;
        const isSite = (c.type || "").toLowerCase().includes("site");
        return (
          <div className="absolute right-3 top-20 z-30 pointer-events-none">
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
                  className={`${
                    isSite ? "object-contain rotate-90" : "object-contain"
                  }`}
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
      <Canvas
        camera={{ position: [0, 10, 0], fov: 50 }}
        shadows
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          alpha: false,
        }}
        onPointerMissed={() => {
          // Don't clear selection during drags to prevent orbit interference
          if (!dragFromHand && !dragFromPile) {
            clearSelection();
            closeContextMenu();
            setPreviewCard(null);
          }
        }}
      >
        <color attach="background" args={["#0b0b0c"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 12, 8]} intensity={1} castShadow />

        {/* Interactive board (physics-enabled) */}
        <Physics gravity={[0, -9.81, 0]}>
          <Board />
        </Physics>

        {/* 3D Piles (sides of the board) */}
        <Piles3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
        <Piles3D owner="p2" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
        {/* Token piles (face-up) */}
        <TokenPile3D owner="p1" />
        <TokenPile3D owner="p2" />

        {/* 3D HUD (thresholds, life, mana) */}
        <Hud3D owner="p1" />
        <Hud3D owner="p2" />

        {/* 3D Hand anchored to the camera (current player) */}
        <Hand3D
          owner={currentPlayerKey}
          matW={MAT_PIXEL_W}
          matH={MAT_PIXEL_H}
        />

        {/* Invisible texture cache for smooth loading */}
        <TextureCache />

        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[0, 0, 0]}
          enabled={
            !dragFromHand &&
            !dragFromPile &&
            !selected &&
            !selectedPermanent &&
            !selectedAvatar
          }
          enablePan={
            !dragFromHand &&
            !dragFromPile &&
            !selected &&
            !selectedPermanent &&
            !selectedAvatar
          }
          enableRotate={
            !dragFromHand &&
            !dragFromPile &&
            !selected &&
            !selectedPermanent &&
            !selectedAvatar
          }
          enableZoom={!dragFromHand && !dragFromPile}
          enableDamping={false}
          onChange={clampControls}
          minDistance={minDist}
          maxDistance={maxDist}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.4}
        />
      </Canvas>
    </div>
  );
}
