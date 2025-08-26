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
import OnlineDeckSelector from "@/components/game/OnlineDeckSelector";
import OnlineMulliganScreen from "@/components/game/OnlineMulliganScreen";

export default function OnlineMatchPage() {
  const params = useParams();
  const matchId = useMemo(() => {
    const idParam = (params as Record<string, string | string[]>)?.id;
    return Array.isArray(idParam) ? idParam[0] : idParam;
  }, [params]);

  const { connected, match, joinMatch, chatLog, sendChat, me } = useOnline();
  
  // Determine which player this client is
  const myPlayerId = me?.id;
  const myPlayerNumber = useMemo(() => {
    if (!match?.players || !myPlayerId) return null;
    const index = match.players.findIndex(p => p.id === myPlayerId);
    return index === 0 ? 1 : index === 1 ? 2 : null;
  }, [match?.players, myPlayerId]);
  const myPlayerKey = myPlayerNumber === 1 ? "p1" : myPlayerNumber === 2 ? "p2" : null;

  // Get player nicknames
  const playerNames = useMemo(() => {
    if (!match?.players) return { p1: "Player 1", p2: "Player 2" };
    const p1Name = match.players[0]?.displayName || "Player 1";
    const p2Name = match.players[1]?.displayName || "Player 2";
    return { p1: p1Name, p2: p2Name };
  }, [match?.players]);

  // Ensure we are in the correct match when landing on /online/play/[id]
  useEffect(() => {
    if (!connected || !matchId) return;
    if (match?.id === matchId) return;
    void joinMatch(matchId);
  }, [connected, match?.id, matchId, joinMatch]);

  // Setup state (like offline play)
  const [setupOpen, setSetupOpen] = useState<boolean>(true);
  const [prepared, setPrepared] = useState<boolean>(false);

  // Chat
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState<boolean>(false);

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
  const setPhase = useGameStore((s) => s.setPhase);

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

  function startGame() {
    setSetupOpen(false);
    setPhase("Main");
  }

  const inThisMatch = !!matchId && match?.id === matchId;

  return (
    <div className="relative h-[calc(100vh-4rem)] w-full">
      {!inThisMatch && (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-xl font-semibold mb-2">Joining Match</div>
            <div className="text-sm opacity-60">Match ID: {matchId}</div>
          </div>
        </div>
      )}

      {/* Setup Overlay - only show when in match and setup is open */}
      {inThisMatch && setupOpen && myPlayerKey && (
        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          {!prepared ? (
            <OnlineDeckSelector 
              myPlayerKey={myPlayerKey}
              playerNames={playerNames}
              onPrepareComplete={() => setPrepared(true)} 
            />
          ) : (
            <OnlineMulliganScreen 
              myPlayerKey={myPlayerKey}
              playerNames={playerNames}
              onStartGame={startGame} 
            />
          )}
        </div>
      )}

      {/* Match Info Overlay */}
      <div className="absolute top-3 left-3 z-10 bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow px-3 py-2">
        <div className="text-sm font-semibold mb-1">Online Match</div>
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-blue-400">{playerNames.p1}</span>
            {myPlayerNumber === 1 && <span className="text-green-400">(You)</span>}
            <span className="opacity-50">vs</span>
            <span className="text-red-400">{playerNames.p2}</span>
            {myPlayerNumber === 2 && <span className="text-green-400">(You)</span>}
          </div>
          <div className="font-mono opacity-60">ID: {matchId}</div>
        </div>
        {!inThisMatch && (
          <div className="text-xs opacity-60 mt-1">Joining…</div>
        )}
      </div>

      {/* Chat Toggle Button */}
      <button
        className="absolute top-3 right-3 z-10 bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow px-3 py-2 text-sm hover:bg-black/80"
        onClick={() => setChatOpen(!chatOpen)}
      >
        Chat {chatLog.length > 0 && `(${chatLog.length})`}
      </button>

      {/* Chat Overlay - positioned like the event console in offline play */}
      {chatOpen && (
        <div className="absolute left-3 bottom-2 z-10 text-white w-80 bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow">
          <div className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-semibold opacity-90">Chat</span>
            <button
              className="rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-xs"
              onClick={() => setChatOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto px-3 pb-3 text-xs space-y-1">
            {chatLog.length === 0 && <div className="opacity-60">No messages</div>}
            {chatLog.map((m, i) => (
              <div key={i} className="opacity-90">
                <span className="text-slate-300/80">[{m.scope}]</span>{" "}
                <span className="font-medium">{m.from?.displayName ?? "System"}</span>: {m.content}
              </div>
            ))}
          </div>
          <div className="px-3 pb-3 flex gap-2">
            <input
              className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-xs"
              placeholder="Type a message"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const msg = chatInput.trim();
                  if (!msg) return;
                  sendChat(msg);
                  setChatInput("");
                }
              }}
            />
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-xs"
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
      )}

      {inThisMatch && (
        <>
          {/* HUD overlays - same as offline */}
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

          {/* 3D Board Canvas - full screen */}
          <Canvas
            camera={{ 
              // Position camera based on player seat
              // P1 looks from south to north, P2 looks from north to south
              position: myPlayerNumber === 1 ? [0, 10, 5] : [0, 10, -5], 
              fov: 50 
            }}
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

            {/* 3D Hands - only show my hand in online play */}
            {myPlayerKey && (
              <Hand3D owner={myPlayerKey} matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
            )}

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
              // Adjust rotation constraints based on player position
              minAzimuthAngle={myPlayerNumber === 2 ? Math.PI - 0.5 : -0.5}
              maxAzimuthAngle={myPlayerNumber === 2 ? Math.PI + 0.5 : 0.5}
            />
          </Canvas>
        </>
      )}
    </div>
  );
}
