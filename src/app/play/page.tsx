"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { useGameStore } from "@/lib/game/store";
import Board from "@/lib/game/Board";
import Hand3D from "@/lib/game/components/Hand3D";
import Piles3D from "@/lib/game/components/Piles3D";
import Hud3D from "@/lib/game/components/Hud3D";
import TextureCache from "@/lib/game/components/TextureCache";
import { MAT_PIXEL_W, MAT_PIXEL_H } from "@/lib/game/constants";
import Image from "next/image";
import DeckSelector from "@/components/game/DeckSelector";
import MulliganScreen from "@/components/game/MulliganScreen";
import StatusBar from "@/components/game/StatusBar";
import LifeCounters from "@/components/game/LifeCounters";
import ContextMenu from "@/components/game/ContextMenu";
import PlacementDialog from "@/components/game/PlacementDialog";
import PileSearchDialog from "@/components/game/PileSearchDialog";

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
  // Selected hand card (for magnifier) - show for current player
  const currentPlayerKey = currentPlayer === 1 ? "p1" : "p2";
  const selectedHandCard = (() => {
    if (!selected || selected.who !== currentPlayerKey) return null;
    const hand = zones[currentPlayerKey].hand || [];
    return hand[selected.index] ?? null;
  })();

  // Setup state
  const [setupOpen, setSetupOpen] = useState<boolean>(true);
  const [prepared, setPrepared] = useState<boolean>(false);
  const [consoleOpen, setConsoleOpen] = useState<boolean>(true);

  // Event console: autoscroll and text formatting
  const eventsRef = useRef<HTMLDivElement | null>(null);
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
            <DeckSelector onPrepareComplete={() => setPrepared(true)} />
          ) : (
            <MulliganScreen onStartGame={startGame} />
          )}
        </div>
      )}

      {/* HUD */}
      <StatusBar dragFromHand={dragFromHand} />

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
        <div className="absolute right-3 top-20 z-20 pointer-events-none">
          {(() => {
            const isSite = (previewCard?.type || "")
              .toLowerCase()
              .includes("site");
            return (
              <div className="relative">
                <div
                  className={`relative ${
                    isSite ? "aspect-[4/3] h-[300px] md:h-[380px]" : "aspect-[3/4] w-[300px] md:w-[380px]"
                  } rounded-xl overflow-hidden ring-1 ring-white/20 shadow-2xl`}
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
          alpha: false
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

        {/* 3D HUD (thresholds, life, mana) */}
        <Hud3D owner="p1" />
        <Hud3D owner="p2" />

        {/* 3D Hand anchored to the camera (current player) */}
        <Hand3D owner={currentPlayerKey} matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />

        {/* Invisible texture cache for smooth loading */}
        <TextureCache />

        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enabled={!dragFromHand && !dragFromPile && !selected && !selectedPermanent && !selectedAvatar}
          enablePan={!dragFromHand && !dragFromPile && !selected && !selectedPermanent && !selectedAvatar}
          enableRotate={!dragFromHand && !dragFromPile && !selected && !selectedPermanent && !selectedAvatar}
          enableZoom={!dragFromHand && !dragFromPile}
          enableDamping={false}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>
    </div>
  );
}
