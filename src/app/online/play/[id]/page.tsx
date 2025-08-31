"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { MAT_PIXEL_W, MAT_PIXEL_H, BASE_TILE_SIZE, MAT_RATIO } from "@/lib/game/constants";
import Image from "next/image";
import ContextMenu from "@/components/game/ContextMenu";
import PlacementDialog from "@/components/game/PlacementDialog";
import PileSearchDialog from "@/components/game/PileSearchDialog";
import OnlineDeckSelector from "@/components/game/OnlineDeckSelector";
import OnlineSealedDeckLoader from "@/components/game/OnlineSealedDeckLoader";
import OnlineD20Screen from "@/components/game/OnlineD20Screen";
import OnlineMulliganScreen from "@/components/game/OnlineMulliganScreen";
import OnlineStatusBar from "@/components/game/OnlineStatusBar";
import OnlineLifeCounters from "@/components/game/OnlineLifeCounters";
import OnlineConsole from "@/components/game/OnlineConsole";
import MatchInfoPopup from "@/components/game/MatchInfoPopup";
import MatchEndOverlay from "@/components/game/MatchEndOverlay";

export default function OnlineMatchPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = useMemo(() => {
    const idParam = (params as Record<string, string | string[]>)?.id;
    return Array.isArray(idParam) ? idParam[0] : idParam;
  }, [params]);

  const {
    transport,
    connected,
    match,
    joinMatch,
    chatLog,
    sendChat,
    leaveMatch,
    resync,
    me,
    resyncing,
  } = useOnline();

  // Determine which player this client is
  const myPlayerId = me?.id;
  const myPlayerNumber = useMemo(() => {
    if (!match?.players || !myPlayerId) return null;
    const index = match.players.findIndex((p) => p.id === myPlayerId);
    return index === 0 ? 1 : index === 1 ? 2 : null;
  }, [match?.players, myPlayerId]);
  const myPlayerKey =
    myPlayerNumber === 1 ? "p1" : myPlayerNumber === 2 ? "p2" : null;

  // One-shot guards for rejoin flow per connection
  const lastConnectedRef = useRef<boolean>(false);
  const resyncSentForRef = useRef<string | null>(null);
  const rejoinChatSentForRef = useRef<string | null>(null);
  const prevMatchIdRef = useRef<string | null>(null);
  const prevMatchStatusRef = useRef<"waiting" | "deck_construction" | "in_progress" | "ended" | null>(
    null
  );
  const joinAttemptedForRef = useRef<string | null>(null);

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
    if (match?.id === matchId) {
      // Arrived or already in: clear join attempt flag
      if (joinAttemptedForRef.current === matchId)
        joinAttemptedForRef.current = null;
      return;
    }
    if (joinAttemptedForRef.current === matchId) return;
    try {
      console.debug("[online] joinMatch ->", { matchId });
    } catch {}
    joinAttemptedForRef.current = matchId;
    void joinMatch(matchId);
  }, [connected, match?.id, matchId, joinMatch]);

  // Track connection edges to reset one-shot guards per reconnect
  useEffect(() => {
    if (connected && !lastConnectedRef.current) {
      // Rising edge: just connected, clear per-connection guards
      resyncSentForRef.current = null;
      rejoinChatSentForRef.current = null;
      joinAttemptedForRef.current = null;
    }
    lastConnectedRef.current = connected;
  }, [connected]);

  // Also reset one-shot guards if we are no longer in this match (e.g., user left)
  useEffect(() => {
    if (!matchId) return;
    if (match?.id !== matchId) {
      if (resyncSentForRef.current === matchId) resyncSentForRef.current = null;
      if (rejoinChatSentForRef.current === matchId)
        rejoinChatSentForRef.current = null;
    }
  }, [match?.id, matchId]);

  // Request full state sync and send rejoin chat exactly once per connection and match
  useEffect(() => {
    if (!connected || match?.id !== matchId) return;

    // One-shot resync per connection for this match id
    if (resyncSentForRef.current !== matchId) {
      // Debug: track resync emission
      try {
        console.debug("[online] resync ->", {
          matchId,
          because: "joined or rejoined",
        });
      } catch {}
      resync();
      resyncSentForRef.current = matchId;
    }

    // One-shot chat per connection if rejoining an in-progress match
    const prevStatus =
      prevMatchIdRef.current === matchId ? prevMatchStatusRef.current : null;
    const transitioningFromWaiting =
      prevStatus === "waiting" && match?.status === "in_progress";
    if (
      match?.status === "in_progress" &&
      rejoinChatSentForRef.current !== matchId &&
      !transitioningFromWaiting
    ) {
      const myName = me?.displayName || "A player";
      try {
        console.debug("[online] rejoin chat ->", { matchId, name: myName });
      } catch {}
      sendChat(`${myName} has rejoined the match.`, "match");
      rejoinChatSentForRef.current = matchId;
    }

    // Update previous status tracking for next pass
    prevMatchIdRef.current = matchId;
    prevMatchStatusRef.current = match?.status ?? null;
  }, [
    connected,
    match?.id,
    matchId,
    match?.status,
    me?.displayName,
    resync,
    sendChat,
  ]);

  // Game store selectors needed for setup
  const serverPhase = useGameStore((s) => s.phase);

  // Setup state (like offline play)
  // Default CLOSED to avoid flashing overlay on rejoin; we'll open it for new/waiting matches
  const [setupOpen, setSetupOpen] = useState<boolean>(false);
  const [prepared, setPrepared] = useState<boolean>(false);
  const [d20RollingComplete, setD20RollingComplete] = useState<boolean>(false);

  // Control setup overlay based on match status
  useEffect(() => {
    // Only react once we know we're in this specific match
    if (!matchId || match?.id !== matchId) return;
    if (!match) return;

    if (match.status === "in_progress") {
      // Ongoing match: ensure overlay is closed; do NOT override phase here
      if (setupOpen) setSetupOpen(false);
    } else if (match.status === "waiting" || match.status === "deck_construction") {
      // During setup (including deck construction and mulligan), keep overlay open
      if (!setupOpen) setSetupOpen(true);
    } else {
      // Ended or unknown: keep overlay closed
      if (setupOpen) setSetupOpen(false);
    }
  }, [matchId, match, match?.id, match?.status, setupOpen]);

  // Reset setup wizard when entering a different match (fresh waiting match)
  useEffect(() => {
    // When match id changes, restart the setup steps so we don't skip phases
    setPrepared(false);
    setD20RollingComplete(false);
  }, [match?.id]);

  // Also close setup if server advances phase to Main (in case match.status races)
  useEffect(() => {
    if (setupOpen && serverPhase === "Main") {
      setSetupOpen(false);
    }
  }, [serverPhase, setupOpen]);

  // Chat
  const [chatInput, setChatInput] = useState("");

  // Match info popup
  const [matchInfoOpen, setMatchInfoOpen] = useState<boolean>(false);

  // Match end overlay
  const [matchEndOverlayOpen, setMatchEndOverlayOpen] =
    useState<boolean>(false);
  const [matchEndOverlayDismissed, setMatchEndOverlayDismissed] =
    useState<boolean>(false);

  // Debug: page mount/unmount
  useEffect(() => {
    try {
      console.debug("[page] OnlineMatchPage mount");
    } catch {}
    return () => {
      try {
        console.debug("[page] OnlineMatchPage unmount");
      } catch {}
    };
  }, []);

  // Debug: resyncing transitions (controls Physics mount/unmount)
  useEffect(() => {
    try {
      console.debug("[physics] resyncing ->", { resyncing, matchId });
    } catch {}
  }, [resyncing, matchId]);

  // Tiny helper component to log Physics world lifecycle
  function PhysicsProbe({ mid }: { mid: string | undefined | null }) {
    useEffect(() => {
      try {
        console.debug("[physics] mount", { matchId: mid });
      } catch {}
      return () => {
        try {
          console.debug("[physics] unmount", { matchId: mid });
        } catch {}
      };
    }, [mid]);
    return null;
  }

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
  const matchEnded = useGameStore((s) => s.matchEnded);
  const winner = useGameStore((s) => s.winner);
  const boardSize = useGameStore((s) => s.board.size);
  // Extract store-derived dependencies for effects to satisfy ESLint
  const playersState = useGameStore((s) => s.players);
  const currentPlayerState = useGameStore((s) => s.currentPlayer);

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

  function finishSetup() {
    // Do not close overlay or advance phase locally.
    // finalizeMulligan() already notified the server via transport.mulliganDone().
    // Wait for server 'matchStarted' and/or 'statePatch' to flip status/phase.
  }

  // Show match end overlay when match ends (but only if not already dismissed)
  useEffect(() => {
    if (matchEnded && !matchEndOverlayOpen && !matchEndOverlayDismissed) {
      setMatchEndOverlayOpen(true);
    }
  }, [matchEnded, matchEndOverlayOpen, matchEndOverlayDismissed]);

  // Check if we're in the correct match
  const inThisMatch = !!matchId && match?.id === matchId;

  // Dynamic page title with comprehensive match info
  useEffect(() => {
    const baseTitle = "Contested Realms";

    if (!connected) {
      document.title = `${baseTitle} - Disconnected`;
      return;
    }

    if (!inThisMatch) {
      document.title = `${baseTitle} - Joining Match...`;
      return;
    }

    if (!match || !myPlayerKey) {
      document.title = `${baseTitle} - Loading Match...`;
      return;
    }

    const players = useGameStore.getState().players;
    const currentPlayerNum = useGameStore.getState().currentPlayer;
    const myLife = players[myPlayerKey]?.life;
    const opponentKey = myPlayerKey === "p1" ? "p2" : "p1";
    const opponentLife = players[opponentKey]?.life;
    const opponentName = playerNames[opponentKey];

    let title = `${baseTitle} vs ${opponentName}`;

    // Add life info
    if (myLife !== undefined && opponentLife !== undefined) {
      title += ` (${myLife} vs ${opponentLife})`;
    }

    // Add turn info
    const isMyTurn = myPlayerNumber === currentPlayerNum;
    if (isMyTurn) {
      title += ` - Your Turn`;
    } else {
      title += ` - ${opponentName}'s Turn`;
    }

    // Add match end state
    if (matchEnded) {
      if (winner === myPlayerKey) {
        title = `${baseTitle} - Victory! vs ${opponentName}`;
      } else if (winner === opponentKey) {
        title = `${baseTitle} - Defeat vs ${opponentName}`;
      } else {
        title = `${baseTitle} - Draw vs ${opponentName}`;
      }
    }

    document.title = title;
  }, [
    connected,
    inThisMatch,
    match,
    myPlayerKey,
    myPlayerNumber,
    playerNames,
    matchEnded,
    winner,
    playersState,
    currentPlayerState,
  ]);

  // Compute playmat extents and zoom limits for camera clamping
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
    if (t.x < -halfW) { t.x = -halfW; changed = true; }
    else if (t.x > halfW) { t.x = halfW; changed = true; }
    if (t.z < -halfH) { t.z = -halfH; changed = true; }
    else if (t.z > halfH) { t.z = halfH; changed = true; }
    if (t.y !== 0) { t.y = 0; changed = true; }
    if (changed) c.update();
  }, [matW, matH]);

  return (
    <div className="fixed inset-0 w-screen h-screen">
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
          {match?.status === "deck_construction" ? (
            // Redirect to 3D editor for sealed deck construction
            <div className="w-full max-w-2xl mx-auto bg-slate-900/95 rounded-xl p-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-white mb-4">Sealed Deck Construction</h2>
                <div className="space-y-4">
                  <div className="text-slate-300">
                    <div className="mb-2">Starting 3D deck construction...</div>
                    <div className="text-white font-medium">
                      {playerNames.p1} vs {playerNames.p2}
                    </div>
                  </div>
                  <div className="flex items-center justify-center">
                    <button
                      onClick={() => {
                        // Navigate to 3D editor with sealed mode
                        const params = new URLSearchParams({
                          sealed: 'true',
                          matchId: match.id,
                          timeLimit: match.sealedConfig?.timeLimit?.toString() || '40',
                          packCount: match.sealedConfig?.packCount?.toString() || '6',
                          setMix: match.sealedConfig?.setMix?.join(',') || 'Beta',
                          constructionStartTime: match.sealedConfig?.constructionStartTime?.toString() || Date.now().toString()
                        });
                        
                        // Open in new window so we can receive postMessage
                        const editorWindow = window.open(`/decks/editor-3d?${params.toString()}`, '_blank');
                        
                        // Listen for sealed deck submission
                        const handleMessage = (event: MessageEvent) => {
                          if (event.origin !== window.location.origin) return;
                          if (event.data.type === 'sealedDeckSubmission') {
                            // Submit deck using transport
                            if (transport) {
                              transport.submitDeck(event.data.deck);
                              console.log("Sealed deck submitted:", event.data.deck);
                            }
                            // Close editor window
                            if (editorWindow) {
                              editorWindow.close();
                            }
                            // Clean up listener
                            window.removeEventListener('message', handleMessage);
                          }
                        };
                        
                        window.addEventListener('message', handleMessage);
                        
                        // Clean up if editor window is closed manually
                        const checkClosed = setInterval(() => {
                          if (editorWindow?.closed) {
                            window.removeEventListener('message', handleMessage);
                            clearInterval(checkClosed);
                          }
                        }, 1000);
                      }}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors"
                    >
                      Open 3D Deck Constructor
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : !prepared ? (
            match?.matchType === "sealed" ? (
              <OnlineSealedDeckLoader
                match={match}
                myPlayerKey={myPlayerKey}
                playerNames={playerNames}
                onPrepareComplete={() => setPrepared(true)}
              />
            ) : (
              <OnlineDeckSelector
                myPlayerKey={myPlayerKey}
                playerNames={playerNames}
                onPrepareComplete={() => setPrepared(true)}
              />
            )
          ) : !d20RollingComplete ? (
            <OnlineD20Screen
              myPlayerKey={myPlayerKey}
              playerNames={playerNames}
              onRollingComplete={() => setD20RollingComplete(true)}
            />
          ) : (
            <OnlineMulliganScreen
              myPlayerKey={myPlayerKey}
              playerNames={playerNames}
              onStartGame={finishSetup}
            />
          )}
        </div>
      )}

      {inThisMatch && (
        <>
          {/* Online Status Bar with turn restrictions */}
          {myPlayerNumber && (
            <OnlineStatusBar
              dragFromHand={dragFromHand}
              myPlayerNumber={myPlayerNumber}
              playerNames={playerNames}
              onCameraReset={resetCamera}
              onOpenMatchInfo={() => setMatchInfoOpen(true)}
            />
          )}
          <OnlineLifeCounters
            dragFromHand={dragFromHand}
            myPlayerKey={myPlayerKey}
            playerNames={playerNames}
          />

          {/* Online Console with Events and Chat tabs */}
          <OnlineConsole
            dragFromHand={dragFromHand}
            chatLog={chatLog}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendChat={sendChat}
            onLeaveMatch={leaveMatch}
            connected={connected}
          />

          {/* Hover Preview Overlay (hidden if context menu or magnifier visible) */}
          {previewCard?.slug && !contextMenu && !selectedHandCard && (
            <div className="absolute right-3 top-20 z-30 pointer-events-none">
              {(() => {
                const isSite = (previewCard?.type || "")
                  .toLowerCase()
                  .includes("site");
                return (
                  <div className="relative">
                    <div
                      className={`relative ${
                        isSite
                          ? "aspect-[4/3] h-[300px] md:h-[380px]"
                          : "aspect-[3/4] w-[300px] md:w-[380px]"
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

          {/* Match Info Popup */}
          <MatchInfoPopup
            isOpen={matchInfoOpen}
            onClose={() => setMatchInfoOpen(false)}
            matchId={matchId || ""}
            playerNames={playerNames}
            myPlayerNumber={myPlayerNumber}
            connected={connected}
          />

          {/* Match End Overlay */}
          <MatchEndOverlay
            isVisible={matchEndOverlayOpen}
            winner={winner}
            playerNames={playerNames}
            myPlayerKey={myPlayerKey}
            onClose={() => {
              setMatchEndOverlayOpen(false);
              setMatchEndOverlayDismissed(true);
            }}
            onLeave={() => {
              leaveMatch();
              router.push("/online/lobby");
            }}
          />

          {/* 3D Board Canvas - fills entire viewport */}
          <div className="absolute inset-0 w-full h-full">
            <Canvas
              camera={{
                // Position camera based on player seat
                // P1 looks from south to north, P2 looks from north to south
                position: myPlayerNumber === 1 ? [0, 10, 5] : [0, 10, -5],
                fov: 50,
              }}
              shadows
              gl={{
                preserveDrawingBuffer: true,
                antialias: true,
                alpha: false,
              }}
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
              <directionalLight
                position={[10, 12, 8]}
                intensity={1}
                castShadow
              />

              {/* Interactive board (physics-enabled) */}
              {!resyncing && (
                <Physics key={match?.id || "no-match"} gravity={[0, -9.81, 0]}>
                  <PhysicsProbe mid={match?.id} />
                  <Board />
                </Physics>
              )}

              {/* 3D Piles (sides of the board) */}
              <Piles3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
              <Piles3D owner="p2" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />

              {/* 3D HUD (thresholds, life, mana) */}
              <Hud3D owner="p1" />
              <Hud3D owner="p2" />

              {/* 3D Hands - only show my hand in online play */}
              {myPlayerKey && (
                <Hand3D
                  owner={myPlayerKey}
                  matW={MAT_PIXEL_W}
                  matH={MAT_PIXEL_H}
                />
              )}

              {/* Invisible texture cache for smooth loading */}
              <TextureCache />

              <OrbitControls
                ref={controlsRef}
                makeDefault
                target={[0, 0, 0]}
                enabled={
                  !resyncing &&
                  !dragFromHand &&
                  !dragFromPile &&
                  !selected &&
                  !selectedPermanent &&
                  !selectedAvatar
                }
                enablePan={
                  !resyncing &&
                  !dragFromHand &&
                  !dragFromPile &&
                  !selected &&
                  !selectedPermanent &&
                  !selectedAvatar
                }
                enableRotate={
                  !resyncing &&
                  !dragFromHand &&
                  !dragFromPile &&
                  !selected &&
                  !selectedPermanent &&
                  !selectedAvatar
                }
                enableZoom={!resyncing && !dragFromHand && !dragFromPile}
                enableDamping={false}
                onChange={clampControls}
                minDistance={minDist}
                maxDistance={maxDist}
                minPolarAngle={0}
                maxPolarAngle={Math.PI / 2.4}
                // Adjust rotation constraints based on player position
                minAzimuthAngle={myPlayerNumber === 2 ? Math.PI - 0.5 : -0.5}
                maxAzimuthAngle={myPlayerNumber === 2 ? Math.PI + 0.5 : 0.5}
              />
            </Canvas>
          </div>
        </>
      )}
    </div>
  );
}
