"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useOnline } from "../../layout";
import { useGameStore } from "@/lib/game/store";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import Board from "@/lib/game/Board";
import Hand3D from "@/lib/game/components/Hand3D";
import Piles3D from "@/lib/game/components/Piles3D";
import Hud3D from "@/lib/game/components/Hud3D";
import TextureCache from "@/lib/game/components/TextureCache";
import { MAT_PIXEL_W, MAT_PIXEL_H } from "@/lib/game/constants";
import Image from "next/image";
import ContextMenu from "@/components/game/ContextMenu";
import PlacementDialog from "@/components/game/PlacementDialog";
import PileSearchDialog from "@/components/game/PileSearchDialog";
import StatusBar from "@/components/game/StatusBar";
import LifeCounters from "@/components/game/LifeCounters";

export default function OnlineMatchPage() {
  const params = useParams();
  const matchId = useMemo(() => {
    const idParam = (params as Record<string, string | string[]>)?.id;
    return Array.isArray(idParam) ? idParam[0] : idParam;
  }, [params]);

  const { connected, match, joinMatch, chatLog, sendChat } = useOnline();

  // Ensure we are in the correct match when landing on /online/play/[id]
  useEffect(() => {
    if (!connected || !matchId) return;
    if (match?.id === matchId) return;
    void joinMatch(matchId);
  }, [connected, match?.id, matchId, joinMatch]);

  // Chat
  const [chatInput, setChatInput] = useState("");

  // 3D Board UI/store bindings
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
  const placementDialog = useGameStore((s) => s.placementDialog);
  const closePlacementDialog = useGameStore((s) => s.closePlacementDialog);
  const searchDialog = useGameStore((s) => s.searchDialog);
  const closeSearchDialog = useGameStore((s) => s.closeSearchDialog);
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const selectedAvatar = useGameStore((s) => s.selectedAvatar);
  const currentPlayer = useGameStore((s) => s.currentPlayer);

  // Camera controls ref for reset functionality
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const currentPlayerKey = currentPlayer === 1 ? "p1" : "p2";
  const [magnifierDelay, setMagnifierDelay] = useState(false);
  const selectedHandCard = (() => {
    if (!selected || selected.who !== currentPlayerKey) return null;
    const hand = zones[currentPlayerKey].hand || [];
    return hand[selected.index] ?? null;
  })();
  // Delay showing the magnifier to prevent it competing with preview
  useEffect(() => {
    if (selectedHandCard) {
      setMagnifierDelay(false);
      const timer = setTimeout(() => setMagnifierDelay(true), 100);
      return () => clearTimeout(timer);
    } else {
      setMagnifierDelay(false);
    }
  }, [selectedHandCard]);
  function resetCamera() {
    if (controlsRef.current) controlsRef.current.reset();
  }
  // Robust: reset drag flags when input ends, is canceled, or tab loses focus
  useEffect(() => {
    const reset = () => {
      setTimeout(() => {
        setDragFromHand(false);
        setDragFromPile(null);
      }, 0);
    };
    const onPointerUp = () => reset();
    const onPointerCancel = () => reset();
    const onMouseUp = () => reset();
    const onTouchEnd = () => reset();
    const onBlur = () => reset();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") reset();
    };
    const onPageHide = () => reset();
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

  const inThisMatch = !!matchId && match?.id === matchId;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Simple match summary */}
        <div className="flex items-center gap-3">
          <div className="text-sm opacity-80">Match</div>
          <div className="text-xs font-mono bg-slate-900/60 ring-1 ring-slate-800 rounded px-2 py-0.5">
            {matchId}
          </div>
          {!inThisMatch && (
            <div className="text-xs opacity-60">Joining…</div>
          )}
        </div>

        {/* Chat */}
        <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
          <div className="text-sm font-semibold opacity-90 mb-2">Chat</div>
          <div className="max-h-48 overflow-y-auto space-y-1 text-sm pr-1">
            {chatLog.length === 0 && <div className="opacity-60">No messages</div>}
            {chatLog.map((m, i) => (
              <div key={i} className="opacity-90">
                <span className="text-slate-300/80">[{m.scope}]</span>{" "}
                <span className="font-medium">{m.from?.displayName ?? "System"}</span>: {m.content}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
              placeholder="Type a message"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm"
              onClick={() => {
                const msg = chatInput.trim();
                if (!msg) return;
                sendChat(msg);
                setChatInput("");
              }}
              disabled={!connected}
            >
              Send
            </button>
          </div>
        </div>

        {/* 3D Game Board */}
        {inThisMatch ? (
          <div className="relative h-[calc(100vh-4rem)] w-full">
            {/* HUD overlays */}
            <StatusBar dragFromHand={dragFromHand} onCameraReset={resetCamera} />
            <LifeCounters dragFromHand={dragFromHand} />

            {/* Hover Preview Overlay (hidden if context menu or magnifier visible) */}
            {previewCard?.slug && !contextMenu && !selectedHandCard && (
              <div className="absolute right-3 top-20 z-20 pointer-events-none">
                {(() => {
                  const isSite = (previewCard?.type || "").toLowerCase().includes("site");
                  return (
                    <div className="relative">
                      <div
                        className={`relative ${isSite ? "aspect-[4/3] h-[300px] md:h-[380px]" : "aspect-[3/4] w-[300px] md:w-[380px]"} rounded-xl overflow-hidden ring-1 ring-white/20 shadow-2xl`}
                      >
                        <Image
                          src={`/api/images/${previewCard.slug}`}
                          alt={previewCard.name}
                          fill
                          sizes="(max-width:640px) 40vw, (max-width:1024px) 25vw, 20vw"
                          className={`${isSite ? "object-contain rotate-90" : "object-contain"}`}
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

            {/* Context Menu */}
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

            {/* Hand Card Magnifier (selected hand card) */}
            {(() => {
              const c = selectedHandCard;
              if (!c?.slug || dragFromHand || contextMenu || !magnifierDelay) return null;
              const isSite = (c.type || "").toLowerCase().includes("site");
              return (
                <div className="absolute right-3 top-20 z-20 pointer-events-none">
                  <div className="relative">
                    <div
                      className={`relative ${isSite ? "aspect-[4/3]" : "aspect-[3/4]"} h-[420px] md:h-[500px] lg:h-[560px] rounded-xl overflow-hidden ring-1 ring-white/20 shadow-2xl`}
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

            {/* 3D Board */}
            <Canvas
              camera={{ position: [0, 10, 0], fov: 50 }}
              shadows
              gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
              onPointerMissed={() => {
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
                ref={controlsRef}
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
        ) : (
          <div className="text-xs opacity-60">Join or start a match to render the 3D board.</div>
        )}
      </div>
    </div>
  );
}
