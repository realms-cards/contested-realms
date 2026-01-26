"use client";

import { OrbitControls, Text } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnline } from "@/app/online/online-context";
import { GlobalVideoOverlay } from "@/components/ui/GlobalVideoOverlay";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import {
  type Pick3D,
  type BoosterCard,
  type CardMeta,
  computeStackPositions,
} from "@/lib/game/cardSorting";
import CardPlane from "@/lib/game/components/CardPlane";
import { Physics } from "@/lib/game/physics";
import { DraftState, TransportEventMap } from "@/lib/net/transport";
import { getBoosterAssetName } from "@/lib/utils/booster-assets";

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
  setName?: string;
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
  const { transport, match, me } = useOnline();
  const matchId = match?.id ?? null;
  const router = useRouter();
  const { updateScreenType } = useVideoOverlay();

  // Draft UI state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [staged, setStaged] = useState<Card | null>(null);
  const [ready, setReady] = useState(false);
  const [pick3D, setPick3D] = useState<Pick3D[]>([]);
  const [nextPickId, setNextPickId] = useState(1);
  const [isSortingEnabled, setIsSortingEnabled] = useState(true);
  const [packChoiceOverlay, setPackChoiceOverlay] = useState(false);
  const [usedPacks, setUsedPacks] = useState<number[]>([]); // Track which pack indices have been used
  const [shownPackOverlayForRound, setShownPackOverlayForRound] = useState<
    number | null
  >(null); // Track if we've shown overlay for current round

  // Convert Card to BoosterCard format for Pick3D
  const cardToBoosterCard = useCallback(
    (card: Card): BoosterCard => ({
      variantId: 0, // Not available in draft context
      slug: card.slug,
      finish: "Standard" as const,
      product: "Draft",
      rarity:
        (card.rarity as "Ordinary" | "Exceptional" | "Elite" | "Unique") ||
        "Ordinary",
      type: card.type || null,
      cardId: parseInt(card.id) || 0,
      cardName: card.name,
      setName: card.setName || "Beta", // Include set information from server
    }),
    []
  );

  // Draft game state (synchronized from server)
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
  const myPack = (draftState.currentPacks?.[myPlayerIndex] || []) as Card[];
  const myPicks = (draftState.picks[myPlayerIndex] || []) as Card[];
  // Determine if it's my turn to pick
  const myPlayerId = useMemo(
    () => me?.id ?? match?.players?.[myPlayerIndex]?.id ?? null,
    [me?.id, match?.players, myPlayerIndex]
  );
  const amPicker = useMemo(() => {
    return (
      draftState.phase === "picking" &&
      !!myPlayerId &&
      draftState.waitingFor.includes(myPlayerId)
    );
  }, [draftState.phase, draftState.waitingFor, myPlayerId]);

  // Camera controls
  const controlsRef = useRef(null);

  // Set screen type for video overlay
  useEffect(() => {
    updateScreenType("draft");
    return undefined;
  }, [updateScreenType]);

  // Initialize draft state from match on component mount (for rejoining players)
  useEffect(() => {
    if (match?.draftState) {
      console.log(
        `[DraftClient 2D] Initializing from match draft state: phase=${match.draftState.phase} pack=${match.draftState.packIndex} pick=${match.draftState.pickNumber}`
      );
      setDraftState(match.draftState);
    }
    return undefined;
  }, [match?.draftState]);

  // Listen for draft state updates from server
  useEffect(() => {
    if (!transport) return;

    const handleDraftUpdate = (state: unknown) => {
      const draftState = state as DraftState;
      setDraftState(draftState);
      {
        const myPackSize = (draftState.currentPacks?.[myPlayerIndex] || [])
          .length;
        console.log(
          `[DraftClient 2D] draftUpdate: phase=${draftState.phase} pack=${
            draftState.packIndex
          } pick=${draftState.pickNumber} myPack=${myPackSize} waitingFor=${
            draftState.waitingFor?.length ?? 0
          }`
        );
      }

      // Clear staged pick when new pack arrives and handle auto-pick
      if (draftState.phase === "picking") {
        console.log(
          `[DraftClient 2D] resetStaging <- phase=${draftState.phase} pack=${draftState.packIndex} pick=${draftState.pickNumber}`
        );
        setStaged(null);
        setReady(false);

        // Show pack choice overlay at the start of each pack (only once per round)
        const amPicker = draftState.waitingFor.includes(me?.id || "");
        if (
          draftState.pickNumber === 1 &&
          amPicker &&
          !packChoiceOverlay &&
          shownPackOverlayForRound !== draftState.packIndex
        ) {
          console.log(
            `[DraftClient 2D] Showing pack choice overlay for pack ${
              draftState.packIndex + 1
            }`
          );
          setPackChoiceOverlay(true);
          setShownPackOverlayForRound(draftState.packIndex);
          return; // Don't auto-pick when pack choice is needed
        }

        // Auto-pick if only one card left in pack
        const myPack = (draftState.currentPacks?.[myPlayerIndex] ||
          []) as Card[];
        if (myPack.length === 1 && !staged && !ready) {
          const lastCard = myPack[0];
          console.log(
            `[DraftClient 2D] Auto-picking last card: ${lastCard.name} (${lastCard.id})`
          );

          // Stage the card first
          setStaged(lastCard);

          // Then auto-pick it after a short delay
          setTimeout(() => {
            if (!transport || !match) return;

            console.log(
              `[DraftClient 2D] Auto-makeDraftPick -> cardId=${lastCard.id} pack=${draftState.packIndex} pick=${draftState.pickNumber}`
            );

            setReady(true);

            try {
              transport.makeDraftPick({
                matchId: match.id,
                cardId: lastCard.id,
                packIndex: draftState.packIndex,
                pickNumber: draftState.pickNumber,
              });
            } catch (err) {
              console.error(`[DraftClient 2D] Auto-pick error:`, err);
            }

            // Add auto-picked card to 3D board display
            const boosterCard = cardToBoosterCard(lastCard);
            const newPick: Pick3D = {
              id: nextPickId,
              card: boosterCard,
              x: Math.random() * 4 - 2,
              z: Math.random() * 4 - 2,
              zone: "Deck" as const,
            };
            setPick3D((prev) => [...prev, newPick]);
            setNextPickId((prev) => prev + 1);
            setStaged(null);
          }, 500); // Small delay to show the staging visually
        }
      }

      // Handle draft completion and transition to editor-3d
      if (draftState.phase === "complete") {
        const myFinalPicks = (draftState.picks[myPlayerIndex] || []) as Card[];
        console.log(
          `[DraftClient 2D] Draft complete! Picked ${myFinalPicks.length} cards`
        );

        // Save draft picks to local storage for deck building
        try {
          if (matchId) {
            localStorage.setItem(
              `draftedCards_${matchId}`,
              JSON.stringify(myFinalPicks)
            );
            console.log(
              `[DraftClient 2D] Draft data saved to localStorage for matchId: ${matchId}`
            );
          }
        } catch (err) {
          console.error(`[DraftClient 2D] Failed to save draft data:`, err);
        }

        // Navigate to 3D editor in draft mode
        setTimeout(() => {
          if (matchId)
            router.push(`/decks/editor-3d?draft=true&matchId=${matchId}`);
        }, 600);

        onDraftComplete(myFinalPicks);
      }
    };

    // Register listener using the transport's on method
    const unsubscribe = transport.on(
      "draftUpdate" as keyof TransportEventMap,
      handleDraftUpdate
    );

    return unsubscribe;
  }, [
    transport,
    myPlayerIndex,
    onDraftComplete,
    matchId,
    match,
    staged,
    ready,
    me,
    packChoiceOverlay,
    usedPacks,
    shownPackOverlayForRound,
    cardToBoosterCard,
    nextPickId,
    router,
  ]);

  // Start draft when both players are ready
  const handleStartDraft = useCallback(async () => {
    if (!transport || !match) return;

    setError(null);
    setLoading(true);

    try {
      const draftConfig = match.draftConfig ?? {
        setMix: ["Beta"],
        packCount: 3,
        packSize: 15,
      };
      console.log(
        `[DraftClient 2D] startDraft -> match=${match.id} cfg=${JSON.stringify(
          draftConfig
        )}`
      );
      await transport.startDraft?.({ matchId: match.id, draftConfig });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start draft");
    } finally {
      setLoading(false);
    }
  }, [transport, match]);

  // Handle card staging
  const handleStageCard = useCallback(
    (card: Card) => {
      console.log(
        `[DraftClient 2D] handleStageCard called - phase:${draftState.phase} ready:${ready}`
      );
      if (draftState.phase !== "picking" || ready) {
        console.warn(
          `[DraftClient 2D] handleStageCard blocked - phase:${draftState.phase} ready:${ready}`
        );
        return;
      }
      console.log(
        `[DraftClient 2D] stagePick -> cardId=${card.id} name=${card.name} pack=${draftState.packIndex} pick=${draftState.pickNumber}`
      );
      setStaged(card);
      setReady(false);
    },
    [draftState.phase, ready, draftState.packIndex, draftState.pickNumber]
  );

  // Handle pick and pass when button is clicked
  const handlePickAndPass = useCallback(() => {
    console.log(
      `[DraftClient 2D] handlePickAndPass called - staged:${!!staged} transport:${!!transport} match:${!!match} ready:${ready}`
    );

    if (!staged || !transport || !match || ready) {
      console.warn(
        `[DraftClient 2D] handlePickAndPass blocked - staged:${!!staged} transport:${!!transport} match:${!!match} ready:${ready}`
      );
      return;
    }

    console.log(
      `[DraftClient 2D] makeDraftPick -> cardId=${staged.id} pack=${draftState.packIndex} pick=${draftState.pickNumber} match=${match.id}`
    );

    setReady(true);

    if (!transport.makeDraftPick) {
      console.error(
        `[DraftClient 2D] transport.makeDraftPick is not available!`
      );
      return;
    }

    try {
      transport.makeDraftPick({
        matchId: match.id,
        cardId: staged.id,
        packIndex: draftState.packIndex,
        pickNumber: draftState.pickNumber,
      });
    } catch (err) {
      console.error(`[DraftClient 2D] makeDraftPick error:`, err);
    }

    // Add picked card to 3D board display
    const boosterCard = cardToBoosterCard(staged);
    const newPick: Pick3D = {
      id: nextPickId,
      card: boosterCard,
      x: Math.random() * 4 - 2, // Random position for now
      z: Math.random() * 4 - 2,
      zone: "Deck" as const,
    };
    setPick3D((prev) => [...prev, newPick]);
    setNextPickId((prev) => prev + 1);

    // Clear staged after pick
    console.log(`[DraftClient 2D] pickAndPass -> cardId=${staged.id}`);
    setStaged(null);
  }, [
    staged,
    transport,
    match,
    ready,
    draftState.packIndex,
    draftState.pickNumber,
    cardToBoosterCard,
    nextPickId,
  ]);

  // Keyboard event handling for spacebar pick and pass
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle spacebar when a card is staged and it's the player's turn
      if (event.code === "Space" && staged && amPicker && !ready) {
        event.preventDefault();
        console.log(
          `[DraftClient 2D] Spacebar pressed - triggering pick and pass`
        );
        handlePickAndPass();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [staged, ready, handlePickAndPass, amPicker]);

  // Create sorted stack positions for picked cards
  const stackedPositions = useMemo(() => {
    return computeStackPositions(
      pick3D,
      {} as Record<number, CardMeta>,
      isSortingEnabled
    );
  }, [pick3D, isSortingEnabled]);

  // Handle pack selection and notify server
  const handlePackChoice = useCallback(
    async (packIndex: number) => {
      if (!transport || !match) {
        console.error(
          `[DraftClient 2D] Cannot choose pack - transport:${!!transport} match:${!!match}`
        );
        return;
      }

      console.log(
        `[DraftClient 2D] Pack ${packIndex + 1} selected for round ${
          draftState.packIndex + 1
        }`
      );

      // Send pack choice to server
      try {
        // Determine the set choice based on pack index
        const draftConfig = match.draftConfig ?? {
          setMix: ["Beta"],
          packCount: 3,
          packSize: 15,
          packCounts: {},
        };
        // Build actual pack sequence from packCounts
        const packSequence: string[] = [];
        if (
          draftConfig.packCounts &&
          typeof draftConfig.packCounts === "object"
        ) {
          for (const [setName, count] of Object.entries(
            draftConfig.packCounts
          )) {
            for (let i = 0; i < count; i++) {
              packSequence.push(setName);
            }
          }
        }
        // Use the exact set for this pack index, or fallback to setMix
        const setChoice =
          packSequence[packIndex] ||
          draftConfig.setMix[
            Math.min(packIndex, draftConfig.setMix.length - 1)
          ] ||
          "Beta";

        console.log(
          `[DraftClient 2D] chooseDraftPack -> setChoice=${setChoice} packIndex=${draftState.packIndex} match=${match.id}`
        );

        if (transport.chooseDraftPack) {
          transport.chooseDraftPack({
            matchId: match.id,
            setChoice,
            packIndex: draftState.packIndex,
          });
        } else {
          console.error(
            `[DraftClient 2D] chooseDraftPack method not available on transport`
          );
        }
      } catch (err) {
        console.error(`[DraftClient 2D] chooseDraftPack error:`, err);
      }

      setUsedPacks((prev) => [...prev, packIndex]);
      setPackChoiceOverlay(false);
    },
    [draftState.packIndex, transport, match]
  );

  // Get opponent info
  const opponentKey = myPlayerKey === "p1" ? "p2" : "p1";
  const opponentIndex = 1 - myPlayerIndex;
  const opponentPicks = (draftState.picks[opponentIndex] || []) as Card[];

  // Render pack choice overlay - show all 3 packs visually
  if (packChoiceOverlay && draftState.packIndex < 3) {
    // Build actual pack sequence from packCounts
    const packCounts = match?.draftConfig?.packCounts || {};
    const packSequence: string[] = [];
    for (const [setName, count] of Object.entries(packCounts)) {
      for (let i = 0; i < count; i++) {
        packSequence.push(setName);
      }
    }
    // Fallback to setMix if packCounts is empty
    let availableSets =
      packSequence.length > 0
        ? packSequence
        : match?.draftConfig?.setMix || ["Beta", "Beta", "Beta"];

    // For cube drafts, always label packs with the cube name rather than
    // underlying card set names, so all players see consistent cube labels.
    if (match?.draftConfig?.cubeId) {
      const cubeLabel = match.draftConfig.cubeName || "Custom Cube";
      availableSets = availableSets.map(() => cubeLabel);
    }
    // Always show 3 packs, one for each round
    const packs = [0, 1, 2];

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="rounded-xl p-6 bg-black/80 ring-1 ring-white/30 text-white w-[min(92vw,720px)] shadow-2xl">
          <div className="text-lg font-semibold mb-3">
            Choose a pack to crack (Round {draftState.packIndex + 1}/3)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {packs.map((packIdx) => {
              const isUsed = usedPacks.includes(packIdx);
              const setName =
                availableSets[packIdx] ||
                availableSets[packIdx % availableSets.length]; // Use exact pack or cycle if needed
              const assetName = getBoosterAssetName(setName);

              return (
                <button
                  key={`pack-opt-${packIdx}`}
                  onClick={() => !isUsed && handlePackChoice(packIdx)}
                  disabled={isUsed}
                  className={`group rounded-lg p-3 bg-black/60 ring-1 ring-white/25 text-left ${
                    isUsed
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-black/50"
                  }`}
                  aria-label={`${isUsed ? "Used" : "Open"} pack ${packIdx + 1}`}
                >
                  <div className="relative w-full h-40 sm:h-48 md:h-56 rounded-md overflow-hidden ring-1 ring-white/15 bg-black/40 group-hover:ring-white/30">
                    {assetName ? (
                      <Image
                        src={`/api/assets/${assetName}`}
                        alt={`${setName} booster pack`}
                        fill
                        sizes="(max-width:640px) 80vw, (max-width:1024px) 30vw, 20vw"
                        className="object-contain"
                        priority
                        unoptimized
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-sm opacity-70">
                        {setName || "Booster"}
                      </div>
                    )}
                    {/* Set label badge */}
                    <div className="absolute bottom-1 left-1 right-1 text-[11px] px-2 py-1 rounded bg-black/60 text-white text-center pointer-events-none">
                      {setName || "Booster"}
                    </div>
                  </div>
                  <div className="mt-2 text-xs opacity-70 text-center">
                    Click to open
                  </div>
                </button>
              );
            })}
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
              <h3 className="text-xl font-semibold text-white mb-4">
                Draft Settings
              </h3>
              <div className="space-y-2 text-slate-300">
                <div>
                  Sets: {match?.draftConfig?.setMix?.join(", ") || "Beta"}
                </div>
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
              Pack {draftState.packIndex + 1} / 3 • Pick {draftState.pickNumber}{" "}
              / 15
              {draftState.phase === "passing" && (
                <span>
                  {" "}
                  • Passing{" "}
                  {draftState.packDirection === "left" ? "Left" : "Right"}
                </span>
              )}
            </div>
            <div className="text-slate-300">
              {myPack.length} cards remaining
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-slate-300">Your picks: {myPicks.length}</div>
            <div className="text-slate-300">
              {playerNames[opponentKey]} picks: {opponentPicks.length}
            </div>
            {pick3D.length > 0 && (
              <button
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  isSortingEnabled
                    ? "bg-green-600 text-white"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
                onClick={() => setIsSortingEnabled(!isSortingEnabled)}
                title="Sort picked cards by type"
              >
                Sort: {isSortingEnabled ? "ON" : "OFF"}
              </button>
            )}
          </div>
        </div>

        {/* Pick status */}
        <div className="px-4 pb-4">
          {(() => {
            console.log(
              `[DraftClient 2D] Render state - staged:${!!staged} phase:${
                draftState.phase
              } ready:${ready}`
            );
            return null;
          })()}
          {staged ? (
            <div className="flex items-center justify-between bg-blue-900/50 border border-blue-500 rounded-lg p-3">
              <div className="text-blue-200">
                Staged: <span className="font-semibold">{staged.name}</span>
              </div>
              <button
                onClick={() => {
                  console.log(`[DraftClient 2D] Pick & Pass button clicked!`);
                  handlePickAndPass();
                }}
                disabled={ready}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-semibold rounded transition-colors"
              >
                {ready
                  ? `Waiting for ${
                      draftState.waitingFor.length - 1
                    } other player${
                      draftState.waitingFor.length - 1 === 1 ? "" : "s"
                    }...`
                  : "Pick & Pass"}
              </button>
            </div>
          ) : draftState.phase === "passing" ? (
            <div className="bg-yellow-900/50 border border-yellow-500 rounded-lg p-3 text-yellow-200">
              Passing packs{" "}
              {draftState.packDirection === "left" ? "left" : "right"}...
            </div>
          ) : (
            <div className="text-slate-400 text-center">
              Click a card to stage your pick
            </div>
          )}
        </div>
      </div>

      {/* Pack choice button - only show before any picks are made */}
      {draftState.packIndex < 3 &&
        draftState.pickNumber === 1 &&
        !staged &&
        shownPackOverlayForRound !== draftState.packIndex && (
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
          <directionalLight
            position={[10, 10, 5]}
            intensity={1}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={50}
            shadow-camera-left={-15}
            shadow-camera-right={15}
            shadow-camera-top={15}
            shadow-camera-bottom={-15}
            shadow-bias={-0.0005}
          />

          <Physics gravity={[0, -9.81, 0]}>
            {/* Current pack cards */}
            {myPack.map((card, idx) => (
              <group
                key={`${card.id}-${draftState.packIndex}-${draftState.pickNumber}`}
                position={[
                  ((idx % 5) - 2) * 2.2,
                  0.1,
                  Math.floor(idx / 5) * -2.5,
                ]}
                rotation={[0, 0, 0]}
              >
                <CardPlane
                  slug={card.slug}
                  width={1.5}
                  height={2.1}
                  onClick={() => {
                    console.log(
                      `[DraftClient 2D] Card clicked: ${card.name} (${card.id})`
                    );
                    handleStageCard(card);
                  }}
                  interactive={draftState.phase === "picking" && !ready}
                  elevation={staged?.id === card.id ? 0.2 : 0.1}
                />
              </group>
            ))}

            {/* Picked cards display (right side) */}
            {pick3D.slice(-15).map((pick, idx) => (
              <group
                key={`picked-${pick.id}-${idx}`}
                position={[
                  8 + (idx % 3) * 1.1,
                  0.1 + idx * 0.05,
                  (Math.floor(idx / 3) - 2) * 1.2,
                ]}
                rotation={[0, 0, 0]}
                scale={[0.7, 0.7, 0.7]}
              >
                <CardPlane
                  slug={pick.card.slug}
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
              font="/fantaisie_artistiqu.ttf"
              position={[0, 2, 4]}
              fontSize={0.8}
              color="white"
              anchorX="center"
              anchorY="middle"
            >
              Current Pack
            </Text>

            <Text
              font="/fantaisie_artistiqu.ttf"
              position={[8, 2, 0]}
              fontSize={0.6}
              color="white"
              anchorX="center"
              anchorY="middle"
            >
              Your Picks
            </Text>
          </Physics>

          {/* Picked cards displayed on the board */}
          {pick3D.length > 0 && (
            <group>
              {pick3D.map((p) => {
                const stackPos = stackedPositions?.get(p.id) || {
                  x: p.x,
                  z: p.z,
                  stackIndex: 0,
                  isVisible: true,
                };
                if (!stackPos.isVisible) return null;

                const isSite = (p.card.type || "")
                  .toLowerCase()
                  .includes("site");
                return (
                  <group
                    key={`pick-${p.id}`}
                    position={[
                      stackPos.x,
                      0.01 + stackPos.stackIndex * 0.01,
                      stackPos.z,
                    ]}
                  >
                    <CardPlane
                      slug={p.card.slug}
                      width={isSite ? 3.5 : 2.5}
                      height={isSite ? 2.5 : 3.5}
                      rotationZ={isSite ? -Math.PI / 2 : 0}
                      elevation={0.01 + stackPos.stackIndex * 0.01}
                    />
                  </group>
                );
              })}
            </group>
          )}

          <OrbitControls
            ref={controlsRef}
            target={[0, 0, 0]}
            minDistance={5}
            maxDistance={25}
            maxPolarAngle={Math.PI / 2.2}
          />
        </Canvas>
      </div>

      {/* Video Overlay */}
      <GlobalVideoOverlay
        position="top-right"
        showUserAvatar={true}
        transport={transport}
        myPlayerId={me?.id || null}
        matchId={matchId}
        userDisplayName={me?.displayName || ""}
        userAvatarUrl={undefined} // No avatar URL available yet
      />
    </div>
  );
}
