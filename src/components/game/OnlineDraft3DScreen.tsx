"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import Board from "@/lib/game/Board";
import Piles3D from "@/lib/game/components/Piles3D";
import TextureCache from "@/lib/game/components/TextureCache";
import CardPlane from "@/lib/game/components/CardPlane";
import { MAT_PIXEL_W, MAT_PIXEL_H, CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import type { ThreeEvent } from "@react-three/fiber";
import type { Group } from "three";
import { MOUSE } from "three";
import Image from "next/image";

import { useOnline } from "@/app/online/online-context";
import type { DraftState, CustomMessage } from "@/lib/net/transport";

// Card shape used by OnlineDraftScreen; keep compatible
type DraftCard = {
  id: string; // server pick token/id
  name: string;
  cardName?: string;
  slug: string;
  type?: string;
  cost?: string;
  rarity?: string;
  // additional possible fields from server are tolerated
  [k: string]: unknown;
};

// Player ready message type
type PlayerReadyMessage = CustomMessage & {
  type: 'playerReady';
  playerKey: 'p1' | 'p2';
  ready: boolean;
};

interface OnlineDraft3DScreenProps {
  myPlayerKey: "p1" | "p2";
  playerNames: { p1: string; p2: string };
  onDraftComplete: (draftedCards: DraftCard[]) => void;
}

function DraggableCard3D({
  slug,
  isSite,
  x,
  z,
  onDrop,
  disabled,
  onDragChange,
  rotationZ: extraRotZ = 0,
  onDragMove,
  onRelease,
  getTopRenderOrder,
  onHoverChange,
  lockUpright,
}: {
  slug: string;
  isSite: boolean;
  x: number;
  z: number;
  onDrop?: (wx: number, wz: number) => void;
  disabled?: boolean;
  onDragChange?: (dragging: boolean) => void;
  rotationZ?: number;
  onDragMove?: (wx: number, wz: number) => void;
  onRelease?: (wx: number, wz: number, wasDragging: boolean) => void;
  getTopRenderOrder?: () => number;
  onHoverChange?: (hovering: boolean) => void;
  lockUpright?: boolean;
}) {
  const ref = useRef<Group | null>(null);
  const dragStart = useRef<{
    x: number;
    z: number;
    time: number;
    screenX: number;
    screenY: number;
  } | null>(null);
  const dragging = useRef(false);
  const upCleanupRef = useRef<(() => void) | null>(null);
  const roRef = useRef<number>(1500);
  const [isDragging, setIsDragging] = useState(false);
  const [uprightLocked, setUprightLocked] = useState(false);

  const setPos = useCallback((wx: number, wz: number, lift = false) => {
    if (!ref.current) return;
    ref.current.position.set(wx, lift ? 0.25 : 0.002, wz);
  }, []);

  const rotZ = (isSite ? -Math.PI / 2 : 0) + (isDragging || lockUpright || uprightLocked ? 0 : extraRotZ);

  return (
    <group ref={ref} position={[x, 0.002, z]}>
      <mesh
        position={[0, 0.01, 0]}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
          onHoverChange?.(false);
          dragStart.current = {
            x: e.point.x,
            z: e.point.z,
            time: Date.now(),
            screenX: e.clientX,
            screenY: e.clientY,
          };
          if (getTopRenderOrder) {
            const next = getTopRenderOrder();
            roRef.current = next;
          }
          onDragChange?.(true);
          if (!upCleanupRef.current) {
            const earlyUp = () => {
              onDragChange?.(false);
              dragStart.current = null;
              dragging.current = false;
              setIsDragging(false);
              if (upCleanupRef.current) {
                upCleanupRef.current();
                upCleanupRef.current = null;
              }
            };
            window.addEventListener("pointerup", earlyUp, { once: true });
            upCleanupRef.current = () => window.removeEventListener("pointerup", earlyUp);
          }
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          const s = dragStart.current;
          if (!s) return;
          const held = Date.now() - s.time;
          const dx = e.clientX - s.screenX;
          const dy = e.clientY - s.screenY;
          const dist = Math.hypot(dx, dy);
          const PIX_THRESH = 6;
          if (!dragging.current && held >= 50 && dist > PIX_THRESH) {
            dragging.current = true;
            setIsDragging(true);
            setUprightLocked(true);
            const handleUp = () => {
              onDragChange?.(false);
              dragStart.current = null;
              dragging.current = false;
              setIsDragging(false);
              if (upCleanupRef.current) {
                upCleanupRef.current();
                upCleanupRef.current = null;
              }
            };
            window.addEventListener("pointerup", handleUp, { once: true });
            upCleanupRef.current = () => window.removeEventListener("pointerup", handleUp);
          }
          if (dragging.current) {
            e.stopPropagation();
            const wx = e.point.x;
            const wz = e.point.z;
            setPos(wx, wz, true);
            onDragMove?.(wx, wz);
          }
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          if (disabled) return;
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
          const wasDragging = dragging.current;
          const wx = e.point.x;
          const wz = e.point.z;
          setPos(wx, wz, false);
          dragStart.current = null;
          dragging.current = false;
          setIsDragging(false);
          onDragChange?.(false);
          if (upCleanupRef.current) {
            upCleanupRef.current();
            upCleanupRef.current = null;
          }
          if (onDrop && wasDragging) onDrop(wx, wz);
          onRelease?.(wx, wz, wasDragging);
        }}
        onPointerOver={() => {
          if (disabled) return;
          onHoverChange?.(true);
        }}
        onPointerOut={() => {
          onHoverChange?.(false);
        }}
      >
        <boxGeometry args={[CARD_SHORT * 1.05, 0.02, CARD_LONG * 1.05]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} depthTest={false} />
      </mesh>

      <group>
        <CardPlane
          slug={slug}
          width={CARD_SHORT}
          height={CARD_LONG}
          rotationZ={rotZ}
          upright={false}
          depthWrite={false}
          depthTest={false}
          renderOrder={roRef.current}
          interactive={false}
          elevation={0.002}
        />
      </group>
    </group>
  );
}

export default function OnlineDraft3DScreen({
  myPlayerKey,
  playerNames,
  onDraftComplete,
}: OnlineDraft3DScreenProps) {
  const { transport, match, me } = useOnline();

  // Server-driven draft state
  const [draftState, setDraftState] = useState<DraftState>({
    phase: "waiting",
    packIndex: 0,
    pickNumber: 1,
    currentPacks: null,
    picks: [[], []],
    packDirection: "left",
    packChoice: [null, null],
    waitingFor: [],
  });

  const myPlayerIndex = myPlayerKey === "p1" ? 0 : 1;
  const opponentKey = myPlayerKey === "p1" ? "p2" : "p1";
  const myPlayerId = useMemo(() => me?.id ?? match?.players?.[myPlayerIndex]?.id ?? null, [me?.id, match?.players, myPlayerIndex]);

  // Local UI state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{ slug: string; name: string; type: string | null } | null>(null);
  const [packChoiceOverlay, setPackChoiceOverlay] = useState(false);
  const [ready, setReady] = useState(false);
  const [playerReadyStates, setPlayerReadyStates] = useState<{p1: boolean, p2: boolean}>({p1: false, p2: false});

  // Render order counter for stacking
  const roCounterRef = useRef(1500);
  const getTopRenderOrder = useCallback(() => {
    roCounterRef.current += 1;
    return roCounterRef.current;
  }, []);

  // Arrange current pack into a hand-style fan
  const packLayout = useMemo(() => {
    const pack = (draftState.currentPacks?.[myPlayerIndex] || []) as DraftCard[];
    const n = pack.length;
    if (n === 0) return [] as { x: number; z: number; rot: number }[];
    const maxAngle = Math.min(0.85, (n - 1) * 0.09);
    const step = n > 1 ? maxAngle / (n - 1) : 0;
    const start = -maxAngle / 2;
    const spacing = CARD_SHORT * 1.05;
    const arcDepth = CARD_LONG * 0.35;
    const centerX = 0;
    const centerZ = -1.4;
    return new Array(n).fill(0).map((_, i) => {
      const a = start + i * step;
      const x = centerX + (i - (n - 1) / 2) * spacing;
      const z = centerZ - Math.abs(Math.sin(a)) * arcDepth;
      const rot = a * 0.75;
      return { x, z, rot };
    });
  }, [draftState.currentPacks, myPlayerIndex]);

  // Staging flow
  const [staged, setStaged] = useState<{ card: DraftCard; x: number; z: number } | null>(null);
  const [readyIdx, setReadyIdx] = useState<number | null>(null);
  const PICK_CENTER = { x: 0, z: 0 };
  const PICK_RADIUS = CARD_LONG * 0.6;

  // Whether it's my turn to pick according to the server
  const amPicker = useMemo(() => {
    return draftState.phase === "picking" && !!myPlayerId && draftState.waitingFor.includes(myPlayerId);
  }, [draftState.phase, draftState.waitingFor, myPlayerId]);

  const myPack = (draftState.currentPacks?.[myPlayerIndex] || []) as DraftCard[];
  const myPicks = (draftState.picks[myPlayerIndex] || []) as DraftCard[];
  const oppPicks = (draftState.picks[1 - myPlayerIndex] || []) as DraftCard[];

  // Listen for server draft updates
  useEffect(() => {
    if (!transport) return;

    const handleDraftUpdate = (state: unknown) => {
      const s = state as DraftState;
      setDraftState(s);
      {
        const myPackSize = (s.currentPacks?.[myPlayerIndex] || []).length;
        console.log(`[DraftClient 3D] draftUpdate: phase=${s.phase} pack=${s.packIndex} pick=${s.pickNumber} myPack=${myPackSize} waitingFor=${s.waitingFor?.length ?? 0}`);
      }
      // UI reset will occur when it's our turn again (see effect below)
      if (s.phase === "complete") {
        const mine = (s.picks[myPlayerIndex] || []) as DraftCard[];
        onDraftComplete(mine);
      }
    };

    const handlePlayerReady = (message: CustomMessage) => {
      if (message.type === 'playerReady') {
        const readyMessage = message as PlayerReadyMessage;
        setPlayerReadyStates(prev => ({ ...prev, [readyMessage.playerKey]: readyMessage.ready }));
      }
    };

    const offDraft = transport.on("draftUpdate", handleDraftUpdate);
    const offMessage = transport.on("message", handlePlayerReady);
    
    return () => {
      try {
        offDraft();
        offMessage?.();
      } catch (err) {
        console.warn('Error cleaning up transport listeners:', err);
      }
    };
  }, [transport, myPlayerIndex, onDraftComplete]);

  // When a new pick for me becomes available, unlock UI and clear any previous staged state
  useEffect(() => {
    if (draftState.phase === "picking" && amPicker) {
      setReady(false);
    }
  }, [draftState.phase, draftState.packIndex, draftState.pickNumber, amPicker]);

  // Toggle ready state
  const handleToggleReady = useCallback(async () => {
    if (!transport || !match) return;
    
    const newReadyState = !playerReadyStates[myPlayerKey];
    setPlayerReadyStates(prev => ({ ...prev, [myPlayerKey]: newReadyState }));
    
    // Notify other player of ready state change
    try {
      const message: PlayerReadyMessage = {
        type: 'playerReady',
        playerKey: myPlayerKey,
        ready: newReadyState
      };
      await transport.sendMessage?.(message);
    } catch (err) {
      console.error('Failed to send ready state:', err);
    }
  }, [transport, match, myPlayerKey, playerReadyStates]);

  // Start draft
  const handleStartDraft = useCallback(async () => {
    if (!transport || !match) return;
    if (!playerReadyStates.p1 || !playerReadyStates.p2) return;
    
    setError(null);
    setLoading(true);
    try {
      const draftConfig = match.draftConfig ?? { setMix: ["Beta"], packCount: 3, packSize: 15 };
      console.log(`[DraftClient 3D] startDraft -> match=${match.id} cfg=${JSON.stringify(draftConfig)}`);
      await transport.startDraft?.({ matchId: match.id, draftConfig });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start draft");
    } finally {
      setLoading(false);
    }
  }, [transport, match, playerReadyStates]);

  // Choose which set to open for this packIndex
  const handlePackChoice = useCallback(
    (setName: string) => {
      if (!match || !transport) return;
      try {
        console.log(`[DraftClient 3D] chooseDraftPack -> pack=${draftState.packIndex} choice=${setName}`);
        transport.chooseDraftPack?.({ matchId: match.id, setChoice: setName, packIndex: draftState.packIndex });
      } catch {}
      setPackChoiceOverlay(false);
    },
    [match, transport, draftState.packIndex]
  );

  // Confirm pick (use staged card)
  const handleConfirmPick = useCallback(() => {
    if (!staged || !transport || !match || ready) return;
    setReady(true);
    try {
      console.log(`[DraftClient 3D] makeDraftPick -> cardId=${staged.card.id} pack=${draftState.packIndex} pick=${draftState.pickNumber} match=${match.id}`);
      transport.makeDraftPick?.({
        matchId: match.id,
        cardId: staged.card.id,
        packIndex: draftState.packIndex,
        pickNumber: draftState.pickNumber,
      });
    } catch {}
    // Clear staged immediately after confirming
    setStaged(null);
  }, [staged, transport, match, ready, draftState.packIndex, draftState.pickNumber]);

  const needsPackChoice =
    draftState.phase === "picking" && amPicker && draftState.pickNumber === 1 && (match?.draftConfig?.setMix?.length || 0) > 1;

  // UI: Lobby (phase waiting)
  if (draftState.phase === "waiting") {
    return (
      <div className="w-full max-w-4xl mx-auto bg-slate-900/95 rounded-xl p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Draft Lobby</h2>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Players</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{playerNames.p1}</span>
                  <div className="flex items-center gap-2">
                    <span className={playerReadyStates.p1 ? "text-green-400" : "text-slate-400"}>
                      {playerReadyStates.p1 ? "Ready" : "Not Ready"}
                    </span>
                    {myPlayerKey === "p1" && (
                      <button
                        onClick={handleToggleReady}
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          playerReadyStates.p1 
                            ? "bg-red-600 hover:bg-red-700 text-white" 
                            : "bg-green-600 hover:bg-green-700 text-white"
                        }`}
                      >
                        {playerReadyStates.p1 ? "Not Ready" : "Ready"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{playerNames.p2}</span>
                  <div className="flex items-center gap-2">
                    <span className={playerReadyStates.p2 ? "text-green-400" : "text-slate-400"}>
                      {playerReadyStates.p2 ? "Ready" : "Not Ready"}
                    </span>
                    {myPlayerKey === "p2" && (
                      <button
                        onClick={handleToggleReady}
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          playerReadyStates.p2 
                            ? "bg-red-600 hover:bg-red-700 text-white" 
                            : "bg-green-600 hover:bg-green-700 text-white"
                        }`}
                      >
                        {playerReadyStates.p2 ? "Not Ready" : "Ready"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Draft Settings</h3>
              <div className="space-y-2 text-slate-300">
                <div>Sets: {match?.draftConfig?.setMix?.join(", ") || "Beta"}</div>
                <div>Packs: {match?.draftConfig?.packCount ?? 3}</div>
                <div>Pack size: {match?.draftConfig?.packSize ?? 15} cards</div>
                <div>Players: 2</div>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">{error}</div>
          )}

          <button
            onClick={handleStartDraft}
            disabled={loading || !playerReadyStates.p1 || !playerReadyStates.p2}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
          >
            {loading 
              ? "Starting Draft..." 
              : (!playerReadyStates.p1 || !playerReadyStates.p2)
                ? "Waiting for both players to be ready..."
                : "Start Draft"
            }
          </button>
        </div>
      </div>
    );
  }

  // Pack choice overlay
  if (packChoiceOverlay && draftState.packIndex < 3) {
    const availableSets = match?.draftConfig?.setMix || ["Beta"];
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-slate-900/95 rounded-xl p-8 max-w-2xl w-full">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Choose Pack {draftState.packIndex + 1}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableSets.map((setName) => (
              <button
                key={setName}
                onClick={() => handlePackChoice(setName)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg p-6 transition-colors group"
              >
                <div className="aspect-[4/3] bg-slate-700 rounded-lg mb-4 overflow-hidden">
                  <Image
                    src={`/api/assets/${setName.toLowerCase().replace(/\s+/g, "-")}-booster.png`}
                    alt={`${setName} booster`}
                    width={200}
                    height={150}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-white font-semibold">{setName}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen">
      {/* 3D Stage */}
      <div className="absolute inset-0 w-full h-full">
        <Canvas camera={{ position: [0, 10, 0], fov: 50 }} shadows gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}>
          <color attach="background" args={["#0b0b0c"]} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 12, 8]} intensity={1.35} castShadow />

          <Physics gravity={[0, -9.81, 0]}>
            <Board />
          </Physics>

          <Piles3D owner="p1" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />
          <Piles3D owner="p2" matW={MAT_PIXEL_W} matH={MAT_PIXEL_H} />

          <TextureCache />

          {/* Current pack */}
          {draftState.phase !== "complete" && (
            <group>
              {myPack.map((c, idx) => {
                const pos = packLayout[idx] ?? { x: 0, z: 0, rot: 0 };
                const isSite = (c.type || "").toLowerCase().includes("site");
                return (
                  <DraggableCard3D
                    key={`pack-${draftState.packIndex}-${draftState.pickNumber}-${c.id}-${idx}`}
                    slug={c.slug}
                    isSite={isSite}
                    x={pos.x}
                    z={pos.z}
                    disabled={!amPicker}
                    onDragChange={setOrbitLocked}
                    rotationZ={pos.rot}
                    getTopRenderOrder={getTopRenderOrder}
                    onHoverChange={(hover) => {
                      if (hover && !orbitLocked)
                        setHoverPreview({ slug: c.slug, name: c.cardName ?? c.name, type: c.type ?? null });
                      else setHoverPreview(null);
                    }}
                    onDragMove={(wx, wz) => {
                      const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
                      if (d > PICK_RADIUS) setReadyIdx(idx);
                      else if (readyIdx === idx) setReadyIdx(null);
                    }}
                    onRelease={(wx, wz, wasDragging) => {
                      if (!wasDragging) return;
                      const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
                      if (d > PICK_RADIUS) {
                        console.log(
                          `[DraftClient 3D] stagePick -> cardId=${c.id} name=${c.cardName ?? c.name} pack=${draftState.packIndex} pick=${draftState.pickNumber} at=(${wx.toFixed(
                            2
                          )},${wz.toFixed(2)})`
                        );
                        setStaged({ card: c, x: wx, z: wz });
                      } else if (staged?.card?.id === c.id) {
                        console.log(`[DraftClient 3D] unstagePick -> cardId=${c.id}`);
                        setStaged(null);
                      }
                    }}
                  />
                );
              })}
            </group>
          )}

          <OrbitControls
            makeDefault
            target={[0, 0, 0]}
            enabled={!orbitLocked}
            enablePan
            enableRotate={false}
            enableZoom
            enableDamping
            dampingFactor={0.08}
            screenSpacePanning
            panSpeed={1.2}
            zoomSpeed={0.75}
            minDistance={1}
            maxDistance={36}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2.05}
            mouseButtons={{ LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
          />
        </Canvas>
      </div>

      {/* Overlays */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        {/* Header */}
        <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-end gap-4 pointer-events-auto select-none">
          <div className="text-3xl font-fantaisie text-white">Draft</div>
          <div className="text-white/80">
            Pack {draftState.packIndex + 1} • Pick {draftState.pickNumber}
          </div>
          <div className="ml-auto flex items-center gap-4 text-slate-300">
            <div>Your picks: {myPicks.length}</div>
            <div>{playerNames[opponentKey]} picks: {oppPicks.length}</div>
          </div>
        </div>

        {/* Pick status + actions */}
        <div className="max-w-7xl mx-auto px-4">
          {staged ? (
            <div className="flex items-center justify-between bg-blue-900/50 border border-blue-500 rounded-lg p-3">
              <div className="text-blue-200">
                Staged: <span className="font-semibold">{staged.card.name}</span>
              </div>
              <div className="flex items-center gap-3">
                {needsPackChoice && (
                  <button
                    onClick={() => setPackChoiceOverlay(true)}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded transition-colors"
                  >
                    Choose Pack {draftState.packIndex + 1}
                  </button>
                )}
                <button
                  onClick={handleConfirmPick}
                  disabled={ready || !amPicker}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-semibold rounded transition-colors"
                >
                  {amPicker ? (ready ? "Waiting..." : "Confirm Pick") : "Waiting..."}
                </button>
              </div>
            </div>
          ) : draftState.phase === "passing" ? (
            <div className="bg-yellow-900/50 border border-yellow-500 rounded-lg p-3 text-yellow-200">
              Waiting for packs to be passed...
            </div>
          ) : draftState.phase === "picking" && !amPicker ? (
            <div className="bg-slate-800/70 border border-slate-600 rounded-lg p-3 text-slate-200 text-center">
              Waiting for other players to pick...
            </div>
          ) : (
            <div className="text-slate-400 text-center">Drag a card beyond the center ring to stage your pick</div>
          )}
        </div>

        {/* Hover preview */}
        {hoverPreview?.slug && (
          <div className="absolute right-3 top-20 z-30 pointer-events-none">
            <div className="relative">
              <div className={`relative ${(hoverPreview.type || "").toLowerCase().includes("site") ? "aspect-[4/3] h-[300px] md:h-[380px]" : "aspect-[3/4] w-[300px] md:w-[380px]"} rounded-xl overflow-hidden ring-1 ring-white/20 shadow-2xl`}>
                <Image src={`/api/images/${hoverPreview.slug}`} alt={hoverPreview.name} fill sizes="(max-width:640px) 40vw, (max-width:1024px) 25vw, 20vw" className={`${(hoverPreview.type || "").toLowerCase().includes("site") ? "object-contain rotate-90" : "object-contain"}`} />
              </div>
              <button
                className="pointer-events-auto absolute -top-2 -right-2 bg-black/70 text-white text-xs rounded-full px-2 py-1 ring-1 ring-white/10"
                onClick={() => setHoverPreview(null)}
                title="Close preview"
              >
                ×
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pack choice quick button (top-right) */}
      {needsPackChoice && (
        <button
          onClick={() => setPackChoiceOverlay(true)}
          className="absolute top-20 right-4 z-30 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
        >
          Choose Pack {draftState.packIndex + 1}
        </button>
      )}
    </div>
  );
}
