"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { Physics, RigidBody } from "@react-three/rapier";
import CardPlane from "@/lib/game/components/CardPlane";
import { useOnline } from "@/app/online/layout";
import { DraftState, TransportEventMap } from "@/lib/net/transport";
import Image from "next/image";

type Card = {
  id: string;
  name: string;
  slug: string;
  type: string;
  cost: string;
  rarity: string;
  element?: string[];
  power?: number;
  life?: number;
  text?: string;
  flavor?: string;
};

// DraftState is now imported from transport

interface OnlineDraftScreenProps {
  myPlayerKey: "p1" | "p2";
  playerNames: { p1: string; p2: string };
  onDraftComplete: (draftedCards: Card[]) => void;
}

export default function OnlineDraftScreen({
  myPlayerKey,
  playerNames,
  onDraftComplete,
}: OnlineDraftScreenProps) {
  const { transport, match } = useOnline();
  
  // Draft UI state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [staged, setStaged] = useState<Card | null>(null);
  const [ready, setReady] = useState(false);
  const [pick3D, setPick3D] = useState<Card[]>([]);
  const [packChoiceOverlay, setPackChoiceOverlay] = useState(false);
  
  // Draft game state (synchronized from server)
  const [draftState, setDraftState] = useState<DraftState>({
    phase: "waiting",
    packIndex: 0,
    pickNumber: 1,
    currentPacks: null,
    picks: [[], []],
    packDirection: "left",
    packChoice: [null, null],
    waitingFor: []
  });

  const myPlayerIndex = myPlayerKey === "p1" ? 0 : 1;
  const myPack = (draftState.currentPacks?.[myPlayerIndex] || []) as Card[];
  const myPicks = (draftState.picks[myPlayerIndex] || []) as Card[];

  // Camera controls
  const controlsRef = useRef(null);

  // Listen for draft state updates from server
  useEffect(() => {
    if (!transport) return;

    const handleDraftUpdate = (state: unknown) => {
      const draftState = state as DraftState;
      setDraftState(draftState);
      {
        const myPackSize = (draftState.currentPacks?.[myPlayerIndex] || []).length;
        console.log(`[DraftClient 2D] draftUpdate: phase=${draftState.phase} pack=${draftState.packIndex} pick=${draftState.pickNumber} myPack=${myPackSize} waitingFor=${draftState.waitingFor?.length ?? 0}`);
      }
      
      // Clear staged pick when new pack arrives
      if (draftState.phase === "picking") {
        console.log(
          `[DraftClient 2D] resetStaging <- phase=${draftState.phase} pack=${draftState.packIndex} pick=${draftState.pickNumber}`
        );
        setStaged(null);
        setReady(false);
      }
      
      // Handle draft completion
      if (draftState.phase === "complete") {
        const myFinalPicks = (draftState.picks[myPlayerIndex] || []) as Card[];
        onDraftComplete(myFinalPicks);
      }
    };

    // Register listener using the transport's on method
    const unsubscribe = transport.on("draftUpdate" as keyof TransportEventMap, handleDraftUpdate);

    return unsubscribe;
  }, [transport, myPlayerIndex, onDraftComplete]);

  // Start draft when both players are ready
  const handleStartDraft = useCallback(async () => {
    if (!transport || !match) return;
    
    setError(null);
    setLoading(true);
    
    try {
      const draftConfig = match.draftConfig ?? { setMix: ["Beta"], packCount: 3, packSize: 15 };
      console.log(`[DraftClient 2D] startDraft -> match=${match.id} cfg=${JSON.stringify(draftConfig)}`);
      await transport.startDraft?.({ matchId: match.id, draftConfig });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start draft");
    } finally {
      setLoading(false);
    }
  }, [transport, match]);

  // Handle card staging
  const handleStageCard = useCallback((card: Card) => {
    if (draftState.phase !== "picking" || ready) return;
    console.log(
      `[DraftClient 2D] stagePick -> cardId=${card.id} name=${card.name} pack=${draftState.packIndex} pick=${draftState.pickNumber}`
    );
    setStaged(card);
    setReady(false);
  }, [draftState.phase, ready, draftState.packIndex, draftState.pickNumber]);

  // Handle pick confirmation
  const handleConfirmPick = useCallback(() => {
    if (!staged || !transport || !match || ready) return;
    
    setReady(true);
    
    try {
      console.log(`[DraftClient 2D] makeDraftPick -> cardId=${staged.id} pack=${draftState.packIndex} pick=${draftState.pickNumber} match=${match.id}`);
      transport.makeDraftPick?.({
        matchId: match.id,
        cardId: staged.id,
        packIndex: draftState.packIndex,
        pickNumber: draftState.pickNumber
      });
    } catch {}
    
    // Add to local pick3D for animation
    setPick3D(prev => [...prev, staged]);
    
    // Clear staged (after confirm)
    console.log(`[DraftClient 2D] unstagePick -> cardId=${staged.id} (after confirm)`);
    setStaged(null);
  }, [staged, transport, match, ready, draftState.packIndex, draftState.pickNumber]);

  // Handle pack choice
  const handlePackChoice = useCallback((setName: string) => {
    if (!match || !transport) return;
    
    try {
      console.log(`[DraftClient 2D] chooseDraftPack -> pack=${draftState.packIndex} choice=${setName}`);
      transport.chooseDraftPack?.({
        matchId: match.id,
        setChoice: setName,
        packIndex: draftState.packIndex
      });
    } catch {}
    
    setPackChoiceOverlay(false);
  }, [match, transport, draftState.packIndex]);

  // Get opponent info
  const opponentKey = myPlayerKey === "p1" ? "p2" : "p1";
  const opponentIndex = 1 - myPlayerIndex;
  const opponentPicks = (draftState.picks[opponentIndex] || []) as Card[];

  // Render pack choice overlay
  if (packChoiceOverlay && draftState.packIndex < 3) {
    const availableSets = match?.draftConfig?.setMix || ["Beta"];
    
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-slate-900/95 rounded-xl p-8 max-w-2xl w-full">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Choose Pack {draftState.packIndex + 1}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableSets.map((setName) => (
              <button
                key={setName}
                onClick={() => handlePackChoice(setName)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg p-6 transition-colors group"
              >
                <div className="aspect-[4/3] bg-slate-700 rounded-lg mb-4 overflow-hidden">
                  <Image
                    src={`/api/assets/${setName.toLowerCase().replace(/\s+/g, '-')}-booster.png`}
                    alt={`${setName} booster`}
                    width={200}
                    height={150}
                    className="w-full h-full object-contain"
                    onError={() => {
                      // Handle error silently
                    }}
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

  // Show waiting screen before draft starts
  if (draftState.phase === "waiting") {
    return (
      <div className="w-full max-w-4xl mx-auto bg-slate-900/95 rounded-xl p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Draft Lobby</h2>
          
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Players</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{playerNames.p1}</span>
                  <span className="text-green-400">Ready</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">{playerNames.p2}</span>
                  <span className="text-green-400">Ready</span>
                </div>
              </div>
            </div>
            
            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Draft Settings</h3>
              <div className="space-y-2 text-slate-300">
                <div>Sets: {match?.draftConfig?.setMix?.join(", ") || "Beta"}</div>
                <div>Packs: 3</div>
                <div>Pack size: 15 cards</div>
                <div>Players: 2</div>
              </div>
            </div>
          </div>
          
          {error && (
            <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg text-red-200">
              {error}
            </div>
          )}
          
          <button
            onClick={handleStartDraft}
            disabled={loading}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
          >
            {loading ? "Starting Draft..." : "Start Draft"}
          </button>
        </div>
      </div>
    );
  }

  // Main draft interface
  return (
    <div className="fixed inset-0 w-screen h-screen bg-slate-900">
      {/* Draft UI Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-slate-800/90 backdrop-blur-sm border-b border-slate-600">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-6">
            <div className="text-white font-semibold">
              Pack {draftState.packIndex + 1} • Pick {draftState.pickNumber}
            </div>
            <div className="text-slate-300">
              {myPack.length} cards remaining
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-slate-300">
              Your picks: {myPicks.length}
            </div>
            <div className="text-slate-300">
              {playerNames[opponentKey]} picks: {opponentPicks.length}
            </div>
          </div>
        </div>
        
        {/* Pick status */}
        <div className="px-4 pb-4">
          {staged ? (
            <div className="flex items-center justify-between bg-blue-900/50 border border-blue-500 rounded-lg p-3">
              <div className="text-blue-200">
                Staged: <span className="font-semibold">{staged.name}</span>
              </div>
              <button
                onClick={handleConfirmPick}
                disabled={ready}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-semibold rounded transition-colors"
              >
                {ready ? "Waiting..." : "Confirm Pick"}
              </button>
            </div>
          ) : draftState.phase === "passing" ? (
            <div className="bg-yellow-900/50 border border-yellow-500 rounded-lg p-3 text-yellow-200">
              Waiting for packs to be passed...
            </div>
          ) : (
            <div className="text-slate-400 text-center">
              Click a card to stage your pick
            </div>
          )}
        </div>
      </div>

      {/* Pack choice button */}
      {draftState.packIndex < 3 && draftState.pickNumber === 1 && (
        <button
          onClick={() => setPackChoiceOverlay(true)}
          className="absolute top-20 right-4 z-20 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
        >
          Choose Pack {draftState.packIndex + 1}
        </button>
      )}

      {/* 3D Canvas */}
      <div className="absolute inset-0 w-full h-full pt-24">
        <Canvas
          camera={{ position: [0, 8, 12], fov: 60 }}
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true }}
        >
          <color attach="background" args={["#1e293b"]} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
          
          <Physics gravity={[0, -9.81, 0]}>
            {/* Current pack cards */}
            {myPack.map((card, idx) => (
              <group
                key={`${card.id}-${draftState.packIndex}-${draftState.pickNumber}`}
                position={[
                  (idx % 5 - 2) * 2.2,
                  0.1,
                  Math.floor(idx / 5) * -2.5
                ]}
                rotation={[0, 0, 0]}
              >
                <CardPlane
                  slug={card.slug}
                  width={1.5}
                  height={2.1}
                  onClick={() => handleStageCard(card)}
                  interactive={draftState.phase === "picking" && !ready}
                  elevation={staged?.id === card.id ? 0.2 : 0.1}
                />
              </group>
            ))}
            
            {/* Picked cards display (right side) */}
            {pick3D.slice(-15).map((card, idx) => (
              <group
                key={`picked-${card.id}-${idx}`}
                position={[
                  8 + (idx % 3) * 1.1,
                  0.1 + idx * 0.05,
                  (Math.floor(idx / 3) - 2) * 1.2
                ]}
                rotation={[0, 0, 0]}
                scale={[0.7, 0.7, 0.7]}
              >
                <CardPlane
                  slug={card.slug}
                  width={1.5}
                  height={2.1}
                  interactive={false}
                />
              </group>
            ))}
            
            {/* Ground plane */}
            <RigidBody type="fixed">
              <mesh receiveShadow position={[0, -0.5, 0]}>
                <boxGeometry args={[50, 1, 50]} />
                <meshStandardMaterial color="#334155" />
              </mesh>
            </RigidBody>
            
            {/* Labels */}
            <Text
              position={[0, 2, 4]}
              fontSize={0.8}
              color="white"
              anchorX="center"
              anchorY="middle"
            >
              Current Pack
            </Text>
            
            <Text
              position={[8, 2, 0]}
              fontSize={0.6}
              color="white"
              anchorX="center"
              anchorY="middle"
            >
              Your Picks
            </Text>
          </Physics>
          
          <OrbitControls
            ref={controlsRef}
            target={[0, 0, 0]}
            minDistance={5}
            maxDistance={25}
            maxPolarAngle={Math.PI / 2.2}
          />
        </Canvas>
      </div>
    </div>
  );
}
