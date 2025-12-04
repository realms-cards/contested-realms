"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { MOUSE, TOUCH } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOnline } from "@/app/online/online-context";
import {
  WaitingOverlay,
  useWaitingOverlay,
} from "@/components/draft/WaitingOverlay";
import {
  DynamicBoard as Board,
  DynamicPiles3D as Piles3D,
} from "@/components/game/dynamic-3d";
import { GlobalVideoOverlay } from "@/components/ui/GlobalVideoOverlay";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import TrackpadOrbitAdapter from "@/lib/controls/TrackpadOrbitAdapter";
import {
  useDeckPersistence,
  useSubmissionCoordination,
} from "@/lib/draft/hooks/useDeckPersistence";
import { useDraftSync, usePickTimer } from "@/lib/draft/hooks/useDraftSync";
import { toCardMetaMap, type ApiCardMetaRow } from "@/lib/game/cardMeta";
import {
  type Pick3D,
  type BoosterCard,
  type CardMeta,
  computeStackPositions,
} from "@/lib/game/cardSorting";
import CardPlane from "@/lib/game/components/CardPlane";
import TextureCache from "@/lib/game/components/TextureCache";
import {
  MAT_PIXEL_W,
  MAT_PIXEL_H,
  CARD_LONG,
  CARD_SHORT,
} from "@/lib/game/constants";
import { Physics } from "@/lib/game/physics";
import { useGameStore } from "@/lib/game/store";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";
import type { DraftState, CustomMessage } from "@/lib/net/transport";
import { getBoosterAssetName } from "@/lib/utils/booster-assets";

// Import new draft sync system

// Card shape used by OnlineDraftScreen; keep compatible
interface DraftCard {
  id: string; // server pick token/id
  name: string;
  cardName?: string;
  slug: string;
  type?: string;
  cost?: string;
  rarity?: "common" | "uncommon" | "rare" | "mythic" | string;
  setName?: string; // Set information from server
}

// Player ready message type
type PlayerReadyMessage = CustomMessage & {
  type: "playerReady";
  playerKey: "p1" | "p2";
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
  onHoverStart,
  onHoverEnd,
  lockUpright,
  onClick,
  cardName,
  cardType,
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
  onHoverStart?: (card: {
    slug: string;
    name: string;
    type: string | null;
  }) => void;
  onHoverEnd?: () => void;
  lockUpright?: boolean;
  onClick?: () => void;
  cardName?: string;
  cardType?: string | null;
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

  const rotZ =
    (isSite ? -Math.PI / 2 : 0) +
    (isDragging || lockUpright || uprightLocked ? 0 : extraRotZ);
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
            upCleanupRef.current = () =>
              window.removeEventListener("pointerup", earlyUp);
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
            upCleanupRef.current = () =>
              window.removeEventListener("pointerup", handleUp);
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

          // Handle click (when not dragging)
          if (!wasDragging && onClick) {
            onClick();
          }
        }}
        onPointerOver={() => {
          if (disabled) return;
          onHoverChange?.(true);
          onHoverStart?.({
            slug,
            name: cardName ?? slug,
            type: cardType ?? null,
          });
        }}
        onPointerOut={() => {
          onHoverChange?.(false);
          onHoverEnd?.();
        }}
      >
        <boxGeometry args={[CARD_SHORT * 1.05, 0.02, CARD_LONG * 1.05]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
        />
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
  const matchId = match?.id ?? null;
  const router = useRouter();
  const { updateScreenType } = useVideoOverlay();

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
  const myPlayerId = useMemo(
    () => me?.id ?? match?.players?.[myPlayerIndex]?.id ?? null,
    [me?.id, match?.players, myPlayerIndex]
  );

  useEffect(() => {
    useGameStore.getState().resetGameState();
  }, []);

  // Local UI state
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<{
    slug: string;
    name: string;
    type: string | null;
  } | null>(null);
  const [packChoiceOverlay, setPackChoiceOverlay] = useState(false);
  const [ready, setReady] = useState(false);
  const [playerReadyStates, setPlayerReadyStates] = useState<{
    p1: boolean;
    p2: boolean;
  }>({ p1: false, p2: false });
  const autoReadySentRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);
  const [usedPacks, setUsedPacks] = useState<number[]>([]); // Track which pack indices have been used
  const [shownPackOverlayForRound, setShownPackOverlayForRound] = useState<
    number | null
  >(null); // Track if we've shown overlay for current round
  const [pickTimeRemaining, setPickTimeRemaining] = useState<number>(0);

  // Render order counter for stacking
  const roCounterRef = useRef(1500);
  const getTopRenderOrder = useCallback(() => {
    roCounterRef.current += 1;
    return roCounterRef.current;
  }, []);

  // Arrange current pack into a hand-style fan
  const packLayout = useMemo(() => {
    const pack = (draftState.currentPacks?.[myPlayerIndex] ||
      []) as DraftCard[];
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
  const [staged, setStaged] = useState<{
    card: DraftCard;
    x: number;
    z: number;
  } | null>(null);
  const [readyIdx, setReadyIdx] = useState<number | null>(null);

  // 3D state for picked cards on the board
  const [pick3D, setPick3D] = useState<Pick3D[]>([]);
  const [nextPickId, setNextPickId] = useState(1);
  const [isSortingEnabled, setIsSortingEnabled] = useState(true);
  const pick3DRef = useRef<Pick3D[]>(pick3D);
  useEffect(() => {
    pick3DRef.current = pick3D;
  }, [pick3D]);
  const isSortingEnabledRef = useRef(isSortingEnabled);
  useEffect(() => {
    isSortingEnabledRef.current = isSortingEnabled;
  }, [isSortingEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("draft3d_sorting_pref");
      if (raw === "on") setIsSortingEnabled(true);
      else if (raw === "off") setIsSortingEnabled(false);
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "draft3d_sorting_pref",
        isSortingEnabled ? "on" : "off"
      );
    } catch {}
  }, [isSortingEnabled]);

  // Card metadata for proper sorting (same as editor-3d)
  const [metaByCardId, setMetaByCardId] = useState<Record<number, CardMeta>>(
    {}
  );

  // Convert DraftCard to BoosterCard format for Pick3D
  const draftCardToBoosterCard = useCallback(
    (card: DraftCard): BoosterCard => ({
      variantId: 0, // Not available in draft context
      slug: card.slug,
      finish: "Standard" as const,
      product: "Draft",
      rarity:
        (card.rarity as "Ordinary" | "Exceptional" | "Elite" | "Unique") ||
        "Ordinary",
      type: card.type || null,
      cardId: parseInt(card.id) || 0,
      cardName: card.cardName || card.name,
      setName: card.setName || "Beta", // Include set information from server
    }),
    []
  );
  const PICK_CENTER = { x: 0, z: 0 };
  const PICK_RADIUS = CARD_LONG * 0.6;

  // Whether it's my turn to pick according to the server
  const amPicker = useMemo(() => {
    return (
      draftState.phase === "picking" &&
      !!myPlayerId &&
      draftState.waitingFor.includes(myPlayerId)
    );
  }, [draftState.phase, draftState.waitingFor, myPlayerId]);

  // Set screen type for video overlay
  useEffect(() => {
    updateScreenType("draft-3d");
    return undefined;
  }, [updateScreenType]);

  // New draft sync system integration
  const draftSync = useDraftSync(myPlayerKey);
  // TODO(draft-online): Wire playerSync to visualize presence/hover states.
  // const playerSync = usePlayerSync();
  const pickTimer = usePickTimer();

  // Deck persistence system
  const deckPersistence = useDeckPersistence(
    matchId || "default-session",
    myPlayerKey
  );
  const submissionCoordination = useSubmissionCoordination(
    matchId || "default-session",
    myPlayerKey
  );

  // Waiting overlay integration
  const waitingState = useWaitingOverlay({
    getWaitingState: () => submissionCoordination.waitingState,
  });

  const myPack = (draftState.currentPacks?.[myPlayerIndex] ||
    []) as DraftCard[];
  const myPicks = (draftState.picks[myPlayerIndex] || []) as DraftCard[];
  const oppPicks = (draftState.picks[1 - myPlayerIndex] || []) as DraftCard[];

  console.log(
    `[DraftClient 3D] Component state - myPlayerKey:${myPlayerKey} packChoiceOverlay:${packChoiceOverlay} packIndex:${draftState.packIndex} myPackSize:${myPack.length}`
  );

  // Initialize draft state from match on component mount (for rejoining players)
  useEffect(() => {
    if (match?.draftState) {
      console.log(
        `[DraftClient 3D] Initializing from match draft state: phase=${match.draftState.phase} pack=${match.draftState.packIndex} pick=${match.draftState.pickNumber}`
      );
      setDraftState(match.draftState);

      // Clear staged pick and reset ready state when rejoining during picking phase
      if (match.draftState.phase === "picking") {
        console.log(
          `[DraftClient 3D] Clearing staged pick and ready state for rejoin during picking phase`
        );
        setStaged(null);
        setReady(false);
      }

      // Rebuild pick3D array from existing picks for visual board representation
      const existingPicks = (match.draftState.picks[myPlayerIndex] ||
        []) as DraftCard[];
      if (existingPicks.length > 0) {
        console.log(
          `[DraftClient 3D] Rebuilding ${existingPicks.length} picked cards for 3D board display`
        );
        const rebuiltPick3D: Pick3D[] = existingPicks.map((card, idx) => ({
          id: idx + 1,
          card: draftCardToBoosterCard(card),
          x: 0, // Default position - will be arranged by computeStackPositions
          z: 0,
          zone: "Deck" as const,
        }));
        setPick3D(rebuiltPick3D);
        setNextPickId(existingPicks.length + 1);
      }
    }
  }, [match?.draftState, myPlayerIndex, draftCardToBoosterCard]);

  // Listen for server draft updates
  useEffect(() => {
    if (!transport) return;

    const handleDraftUpdate = (state: DraftState) => {
      setDraftState(state);
      {
        const myPackSize = (state.currentPacks?.[myPlayerIndex] || []).length;
        console.log(
          `[DraftClient 3D] draftUpdate: phase=${state.phase} pack=${
            state.packIndex
          } pick=${state.pickNumber} myPack=${myPackSize} waitingFor=${
            state.waitingFor?.length ?? 0
          }`
        );
      }

      // Clear staged pick when new pack arrives (similar to 2D version)
      if (state.phase === "picking") {
        console.log(
          `[DraftClient 3D] resetStaging <- phase=${state.phase} pack=${state.packIndex} pick=${state.pickNumber}`
        );
        setStaged(null);
        setReady(false);
      }

      // Handle draft completion and transition to editor-3d
      if (state.phase === "complete") {
        const mine = (state.picks[myPlayerIndex] || []) as DraftCard[];
        console.log(
          `[DraftClient 3D] Draft complete! Picked ${mine.length} cards`
        );

        // Save draft picks to local storage for deck building
        try {
          if (matchId) {
            localStorage.setItem(
              `draftedCards_${matchId}`,
              JSON.stringify(mine)
            );
            console.log(
              `[DraftClient 3D] Draft data saved to localStorage for matchId: ${matchId}`
            );

            // Persist 3D layout and stack preferences for deck editor
            try {
              const latestPick3D = Array.isArray(pick3DRef.current)
                ? pick3DRef.current
                : [];
              const layout =
                !isSortingEnabledRef.current && latestPick3D.length > 0
                  ? latestPick3D.map((p) => ({
                      cardId: p.card.cardId,
                      zone: p.zone,
                      x: p.x,
                      z: p.z,
                    }))
                  : [];
              const layoutKey = `draftLayout_draft_${String(matchId)}`;
              const prefsKey = `draftStackPrefs_draft_${String(matchId)}`;
              localStorage.setItem(layoutKey, JSON.stringify(layout));
              localStorage.setItem(
                prefsKey,
                JSON.stringify({
                  isSortingEnabled: isSortingEnabledRef.current,
                })
              );
            } catch (layoutErr) {
              console.warn(
                "[DraftClient 3D] Failed to persist 3D layout for editor-3d:",
                layoutErr
              );
            }
          }
        } catch (err) {
          console.error(`[DraftClient 3D] Failed to save draft data:`, err);
        }

        // Navigate to 3D editor in draft mode
        setTimeout(() => {
          if (matchId) {
            router.push(`/decks/editor-3d?draft=true&matchId=${matchId}`);
          }
        }, 600);

        onDraftComplete(mine);
      }
    };

    const handlePlayerReady = (message: CustomMessage) => {
      if (message.type === "playerReady") {
        const readyMessage = message as PlayerReadyMessage;
        setPlayerReadyStates((prev) => ({
          ...prev,
          [readyMessage.playerKey]: readyMessage.ready,
        }));
      }
    };

    const offDraft = transport.on("draftUpdate", handleDraftUpdate);
    const offMessage = transport.on("message", handlePlayerReady);

    return () => {
      try {
        offDraft();
        offMessage?.();
      } catch (err) {
        console.warn("Error cleaning up transport listeners:", err);
      }
    };
  }, [transport, myPlayerIndex, onDraftComplete, matchId, router]);

  // Fetch metadata for picked cards (for proper sorting)
  useEffect(() => {
    if (pick3D.length === 0) {
      setMetaByCardId({});
      return;
    }

    // Group by set (similar to editor-3d)
    const groups = new Map<string, Set<number>>();
    for (const p of pick3D) {
      const setName = p.card.setName || "Beta";
      if (!groups.has(setName)) groups.set(setName, new Set());
      const set = groups.get(setName);
      if (set) set.add(p.card.cardId);
    }

    // Fetch metadata for each set
    const requests = Array.from(groups.entries()).map(([s, ids]) => {
      const params = new URLSearchParams();
      params.set("set", s);
      params.set("ids", Array.from(ids).join(","));
      return fetch(`/api/cards/meta?${params.toString()}`)
        .then((r) => r.json())
        .then(
          (
            rows: {
              cardId: number;
              cost: number | null;
              thresholds: Record<string, number> | null;
              attack: number | null;
              defence: number | null;
            }[]
          ) => rows
        );
    });

    Promise.all(requests)
      .then((chunks) => {
        const combined = chunks.flat() as ApiCardMetaRow[];
        setMetaByCardId(toCardMetaMap(combined));
      })
      .catch((err) => {
        console.warn("Failed to fetch card metadata:", err);
      });
  }, [pick3D]);

  // When a new pick for me becomes available, unlock UI and clear any previous staged state
  // Ready state (one-way)
  const handleToggleReady = useCallback(async () => {
    if (!transport || !match) return;
    // If already ready, ignore
    if (playerReadyStates[myPlayerKey]) return;

    setPlayerReadyStates((prev) => ({ ...prev, [myPlayerKey]: true }));

    // Notify other player of ready state change
    try {
      const message: PlayerReadyMessage = {
        type: "playerReady",
        playerKey: myPlayerKey,
        ready: true,
      };
      await transport.sendMessage?.(message);
    } catch (err) {
      console.error("Failed to send ready state:", err);
    }
  }, [transport, match, myPlayerKey, playerReadyStates]);

  // Start draft
  const handleStartDraft = useCallback(async () => {
    if (!transport || !match) return;
    if (!playerReadyStates.p1 || !playerReadyStates.p2) return;

    setError(null);
    setLoading(true);
    try {
      const draftConfig = match.draftConfig ?? {
        setMix: ["Beta"],
        packCount: 3,
        packSize: 15,
      };
      console.log(
        `[DraftClient 3D] startDraft -> match=${match.id} cfg=${JSON.stringify(
          draftConfig
        )}`
      );
      await transport.startDraft?.({ matchId: match.id, draftConfig });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start draft");
    } finally {
      setLoading(false);
    }
  }, [transport, match, playerReadyStates]);

  // Auto-ready the local player when entering the waiting lobby
  useEffect(() => {
    if (!transport || !match) return;
    if (draftState.phase !== "waiting") return;
    if (autoReadySentRef.current) return;
    autoReadySentRef.current = true;

    (async () => {
      try {
        await handleToggleReady();
      } catch (err) {
        try {
          console.warn("[DraftClient 3D] Auto-ready failed:", err);
        } catch {}
      }
    })();
  }, [transport, match, draftState.phase, handleToggleReady]);

  // Auto-start the draft once both players are ready (client-side coordination)
  useEffect(() => {
    if (!transport || !match) return;
    if (draftState.phase !== "waiting") return;
    if (!playerReadyStates.p1 || !playerReadyStates.p2) return;
    if (autoStartAttemptedRef.current) return;
    autoStartAttemptedRef.current = true;

    const t = window.setTimeout(() => {
      void handleStartDraft();
    }, 800);

    return () => window.clearTimeout(t);
  }, [
    transport,
    match,
    draftState.phase,
    playerReadyStates.p1,
    playerReadyStates.p2,
    handleStartDraft,
  ]);

  // Handle pack selection and notify server
  const handlePackChoice = useCallback(
    async (packIndex: number) => {
      console.log(
        `[DraftClient 3D] handlePackChoice called - packIndex:${packIndex} transport:${!!transport} match:${!!match}`
      );

      if (!transport || !match) {
        console.error(
          `[DraftClient 3D] Cannot choose pack - transport:${!!transport} match:${!!match}`
        );
        return;
      }

      console.log(
        `[DraftClient 3D] Pack ${packIndex + 1} selected for round ${
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
          `[DraftClient 3D] chooseDraftPack -> setChoice=${setChoice} packIndex=${draftState.packIndex} match=${match.id}`
        );

        if (transport.chooseDraftPack) {
          transport.chooseDraftPack({
            matchId: match.id,
            setChoice,
            packIndex: draftState.packIndex,
          });
        } else {
          console.error(
            `[DraftClient 3D] chooseDraftPack method not available on transport`
          );
        }
      } catch (err) {
        console.error(`[DraftClient 3D] chooseDraftPack error:`, err);
      }

      setUsedPacks((prev) => [...prev, packIndex]);
      setPackChoiceOverlay(false);
    },
    [draftState.packIndex, transport, match]
  );

  // Enhanced pick handling with new sync system
  const handlePickAndPass = useCallback(
    async (cardToPick?: DraftCard | null) => {
      const stagedCard = cardToPick ?? staged?.card;
      if (!stagedCard || !transport || !match || ready) {
        console.warn(
          `[DraftClient 3D] handlePickAndPass blocked - staged:${!!stagedCard} transport:${!!transport} match:${!!match} ready:${ready}`
        );
        return;
      }

      console.log(
        `[DraftClient 3D] makeDraftPick -> cardId=${stagedCard.id} pack=${draftState.packIndex} pick=${draftState.pickNumber} match=${match.id}`
      );

      setReady(true);

      // Use new sync system if connected, fallback to old transport
      if (draftSync.isConnected) {
        try {
          const result = await draftSync.makePickAttempt(stagedCard.id);
          if (!result.success) {
            console.error(
              `[DraftClient 3D] New sync pick failed: ${result.message}`
            );
            setReady(false);
            return;
          }
        } catch (err) {
          console.error(`[DraftClient 3D] New sync pick error:`, err);
          setReady(false);
          return;
        }
      } else {
        if (!transport.makeDraftPick) {
          console.error(
            `[DraftClient 3D] transport.makeDraftPick is not available!`
          );
          return;
        }

        try {
          transport.makeDraftPick({
            matchId: match.id,
            cardId: stagedCard.id,
            packIndex: draftState.packIndex,
            pickNumber: draftState.pickNumber,
          });
        } catch (err) {
          console.error(`[DraftClient 3D] makeDraftPick error:`, err);
          setReady(false);
          return;
        }
      }

      const boosterCard = draftCardToBoosterCard(stagedCard);
      const newPick: Pick3D = {
        id: nextPickId,
        card: boosterCard,
        x: staged?.x ?? 0,
        z: staged?.z ?? 0,
        zone: (staged?.z ?? 0) < 0 ? "Deck" : "Sideboard",
      };
      setPick3D((prev) => [...prev, newPick]);
      setNextPickId((prev) => prev + 1);

      if (myPlayerIndex >= 0) {
        setDraftState((prev) => {
          if (!prev || !Array.isArray(prev.picks)) return prev;
          const nextPicks = prev.picks.map((p) =>
            Array.isArray(p) ? [...(p as DraftCard[])] : []
          ) as DraftCard[][];
          const mine = Array.isArray(nextPicks[myPlayerIndex])
            ? (nextPicks[myPlayerIndex] as DraftCard[])
            : [];

          const alreadyPresent = mine.some(
            (card) => card.id === stagedCard.id && card.slug === stagedCard.slug
          );
          const updatedMine = alreadyPresent ? mine : [...mine, stagedCard];
          nextPicks[myPlayerIndex] = updatedMine;

          return {
            ...prev,
            picks: nextPicks,
          };
        });
      }

      try {
        await deckPersistence.addStandardCards([stagedCard.id]);
      } catch (err) {
        console.warn(
          `[DraftClient 3D] Failed to add drafted card to persistence:`,
          err
        );
      }

      setStaged(null);
    },
    [
      staged,
      transport,
      match,
      ready,
      draftState.packIndex,
      draftState.pickNumber,
      draftCardToBoosterCard,
      nextPickId,
      draftSync,
      deckPersistence,
      myPlayerIndex,
    ]
  );
  useEffect(() => {
    if (draftState.phase === "picking" && amPicker) {
      setReady(false);

      // Show pack choice overlay at the start of each pack (only once per round)
      if (
        draftState.pickNumber === 1 &&
        !packChoiceOverlay &&
        shownPackOverlayForRound !== draftState.packIndex
      ) {
        console.log(
          `[DraftClient 3D] Showing pack choice overlay for pack ${
            draftState.packIndex + 1
          }`
        );
        setPackChoiceOverlay(true);
        setShownPackOverlayForRound(draftState.packIndex);
        return; // Don't auto-pick when pack choice is needed
      }

      // Auto-pick if only one card left in pack
      const myPack = (draftState.currentPacks?.[myPlayerIndex] ||
        []) as DraftCard[];
      if (myPack.length === 1 && !staged && !ready) {
        const lastCard = myPack[0];
        console.log(
          `[DraftClient 3D] Auto-picking last card: ${lastCard.name} (${lastCard.id})`
        );

        // Stage the card first
        setStaged({ card: lastCard, x: 0, z: 0 });

        // Then auto-pick it after a short delay
        setTimeout(() => {
          if (!transport || !match) return;

          console.log(
            `[DraftClient 3D] Auto-handlePickAndPass -> cardId=${lastCard.id} pack=${draftState.packIndex} pick=${draftState.pickNumber}`
          );

          void handlePickAndPass(lastCard);
        }, 500); // Small delay to show the staging visually
      }
    }
  }, [
    draftState.phase,
    draftState.packIndex,
    draftState.pickNumber,
    amPicker,
    staged,
    ready,
    myPlayerIndex,
    transport,
    match,
    draftState,
    packChoiceOverlay,
    shownPackOverlayForRound,
    handlePickAndPass,
  ]);

  // Keyboard event handling for spacebar pick and pass
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle spacebar when a card is staged and it's the player's turn
      if (event.code === "Space" && staged && amPicker && !ready) {
        event.preventDefault();
        console.log(
          `[DraftClient 3D] Spacebar pressed - triggering pick and pass`
        );
        handlePickAndPass();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [staged, amPicker, ready, handlePickAndPass]);

  // Local visual countdown for current pick (no autopick). Starts when it's my turn.
  useEffect(() => {
    if (draftState.phase !== "picking" || !amPicker) {
      setPickTimeRemaining(0);
      return;
    }
    const durationSec = 60; // default visual timer for 2P draft
    const startedAt = Date.now();
    const update = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, durationSec - elapsed);
      setPickTimeRemaining(remaining);
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [draftState.phase, draftState.packIndex, draftState.pickNumber, amPicker]);

  // Create sorted stack positions for picked cards
  const stackedPositions = useMemo(() => {
    return computeStackPositions(pick3D, metaByCardId, isSortingEnabled);
  }, [pick3D, metaByCardId, isSortingEnabled]);

  // Need pack choice at the start of each pack (like offline draft) - but only before any picks are made
  const needsPackChoice =
    draftState.phase === "picking" &&
    amPicker &&
    draftState.pickNumber === 1 &&
    !staged &&
    shownPackOverlayForRound !== draftState.packIndex;

  // UI: Lobby (phase waiting)
  if (draftState.phase === "waiting") {
    return (
      <div className="w-full max-w-4xl mx-auto bg-slate-900/95 rounded-xl p-8">
        <div className="text-center space-y-6">
          <h2 className="text-3xl font-bold text-white">Preparing Draft…</h2>

          <p className="text-slate-300">
            Setting up draft between{" "}
            <span className="font-semibold">{playerNames.p1}</span> and{" "}
            <span className="font-semibold">{playerNames.p2}</span>. This should
            only take a moment.
          </p>

          <div className="flex flex-col md:flex-row justify-center gap-8 text-sm text-slate-300">
            <div>
              <div className="font-semibold text-white mb-1">Players</div>
              <div>{playerNames.p1}</div>
              <div>{playerNames.p2}</div>
            </div>
            <div>
              <div className="font-semibold text-white mb-1">
                Draft Settings
              </div>
              <div>
                Sets: {match?.draftConfig?.setMix?.join(", ") || "Beta"}
              </div>
              <div>Packs: {match?.draftConfig?.packCount ?? 3}</div>
              <div>Pack size: {match?.draftConfig?.packSize ?? 15} cards</div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 inline-block px-4 py-2 rounded bg-red-900/60 border border-red-500 text-red-100 text-sm">
              {error}
            </div>
          ) : (
            <div className="mt-4 text-slate-400 text-sm">
              {loading
                ? "Starting draft…"
                : "Waiting for the server to start the draft…"}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Pack choice overlay - show all 3 packs visually
  if (packChoiceOverlay && draftState.packIndex < 3) {
    console.log(
      `[DraftClient 3D] Rendering pack choice overlay - packIndex:${draftState.packIndex}`
    );

    // Add debugging for button clicks
    const debugHandlePackChoice = (packIndex: number) => {
      console.log(
        `[DraftClient 3D] Pack button clicked - packIndex:${packIndex}`
      );
      handlePackChoice(packIndex);
    };
    // Build actual pack sequence from packCounts
    const packCounts = match?.draftConfig?.packCounts || {};
    const packSequence: string[] = [];
    for (const [setName, count] of Object.entries(packCounts)) {
      for (let i = 0; i < count; i++) {
        packSequence.push(setName);
      }
    }
    // Fallback to setMix if packCounts is empty
    const availableSets =
      packSequence.length > 0
        ? packSequence
        : match?.draftConfig?.setMix || ["Beta", "Beta", "Beta"];
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
                availableSets[packIdx % availableSets.length]; // Cycle through available sets
              const assetName = getBoosterAssetName(setName);

              return (
                <button
                  key={`pack-opt-${packIdx}`}
                  onClick={() => !isUsed && debugHandlePackChoice(packIdx)}
                  disabled={isUsed}
                  className={`group rounded-lg p-3 bg-black/60 ring-1 ring-white/25 text-left ${
                    isUsed
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-black/50"
                  }`}
                  aria-label={`${isUsed ? "Used" : "Open"} pack ${packIdx + 1}`}
                >
                  <div
                    className={`relative w-full h-40 sm:h-48 md:h-56 rounded-md overflow-hidden ring-1 ring-white/15 bg-black/40 ${
                      !isUsed ? "group-hover:ring-white/30" : ""
                    }`}
                  >
                    {assetName ? (
                      <Image
                        src={`/api/assets/${assetName}`}
                        alt={`Pack ${packIdx + 1}`}
                        fill
                        sizes="(max-width:640px) 80vw, (max-width:1024px) 30vw, 20vw"
                        className="object-contain"
                        priority
                        unoptimized
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-sm opacity-70">
                        Pack {packIdx + 1}
                      </div>
                    )}
                    {/* Pack label badge */}
                    <div className="absolute bottom-1 left-1 right-1 text-[11px] px-2 py-1 rounded bg-black/60 text-white text-center pointer-events-none">
                      {setName} - Pack {packIdx + 1}
                    </div>
                  </div>
                  <div className="mt-2 text-xs opacity-70 text-center">
                    {isUsed ? "Already used" : "Click to open"}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen">
      {/* 3D Stage */}
      <div className="absolute inset-0 w-full h-full">
        <Canvas
          camera={{ position: [0, 10, 0], fov: 50 }}
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
        >
          <color attach="background" args={["#0b0b0c"]} />
          <ambientLight intensity={0.8} />
          <directionalLight
            position={[10, 12, 8]}
            intensity={1.35}
            castShadow
          />

          <Physics gravity={[0, -9.81, 0]}>
            <Board interactionMode="spectator" />
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
                    cardName={c.cardName ?? c.name ?? c.slug}
                    cardType={c.type ?? null}
                    disabled={!amPicker}
                    onDragChange={setOrbitLocked}
                    rotationZ={pos.rot}
                    getTopRenderOrder={getTopRenderOrder}
                    onHoverStart={(preview) => {
                      if (!orbitLocked) setHoverPreview(preview ?? null);
                    }}
                    onHoverEnd={() => setHoverPreview(null)}
                    onClick={() => {
                      if (!amPicker) return;
                      console.log(
                        `[DraftClient 3D] clickStage -> cardId=${c.id} name=${
                          c.cardName ?? c.name
                        } pack=${draftState.packIndex} pick=${
                          draftState.pickNumber
                        }`
                      );
                      // Stage the card at a position slightly away from center
                      const stageX = pos.x + 0.5;
                      const stageZ = pos.z + 0.5;
                      setStaged({ card: c, x: stageX, z: stageZ });
                    }}
                    onDragMove={(wx, wz) => {
                      const d = Math.hypot(
                        wx - PICK_CENTER.x,
                        wz - PICK_CENTER.z
                      );
                      if (d > PICK_RADIUS) setReadyIdx(idx);
                      else if (readyIdx === idx) setReadyIdx(null);
                    }}
                    onRelease={(wx, wz, wasDragging) => {
                      if (!wasDragging) return;
                      const d = Math.hypot(
                        wx - PICK_CENTER.x,
                        wz - PICK_CENTER.z
                      );
                      if (d > PICK_RADIUS) {
                        console.log(
                          `[DraftClient 3D] stagePick -> cardId=${c.id} name=${
                            c.cardName ?? c.name
                          } pack=${draftState.packIndex} pick=${
                            draftState.pickNumber
                          } at=(${wx.toFixed(2)},${wz.toFixed(2)})`
                        );
                        setStaged({ card: c, x: wx, z: wz });
                      } else if (staged?.card?.id === c.id) {
                        console.log(
                          `[DraftClient 3D] unstagePick -> cardId=${c.id}`
                        );
                        setStaged(null);
                      }
                    }}
                  />
                );
              })}
            </group>
          )}

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
                      width={isSite ? CARD_LONG : CARD_SHORT}
                      height={isSite ? CARD_SHORT : CARD_LONG}
                      rotationZ={isSite ? -Math.PI / 2 : 0}
                      elevation={0.01 + stackPos.stackIndex * 0.01}
                      onPointerOver={() => {
                        if (!orbitLocked)
                          setHoverPreview({
                            slug: p.card.slug,
                            name: p.card.cardName,
                            type: p.card.type,
                          });
                      }}
                      onPointerOut={() => setHoverPreview(null)}
                    />
                  </group>
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
            minDistance={2}
            maxDistance={28}
            minPolarAngle={0.05}
            maxPolarAngle={0.35}
            mouseButtons={{
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.PAN,
            }}
            touches={{ TWO: TOUCH.PAN }}
          />
          <ClampOrbitTarget bounds={{ minX: -8, maxX: 8, minZ: -6, maxZ: 6 }} />
          <KeyboardPanControls enabled={!orbitLocked} />
          <TrackpadOrbitAdapter />
        </Canvas>
      </div>

      {/* Overlays */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        {/* Header */}
        <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-end gap-4 pointer-events-auto select-none">
          <div className="text-3xl font-fantaisie text-white">Draft</div>
          <div className="text-white/80">
            Pack {draftState.packIndex + 1} / 3 • Pick {draftState.pickNumber} /
            15
            {draftState.phase === "passing" && (
              <span>
                {" "}
                • Passing{" "}
                {draftState.packDirection === "left" ? "Left" : "Right"}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-4 text-slate-300">
            <div>Your picks: {myPicks.length}</div>
            <div>
              {playerNames[opponentKey]} picks: {oppPicks.length}
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

        {/* Pick status + actions */}
        <div className="max-w-7xl mx-auto px-4">
          {(() => {
            console.log(
              `[DraftClient 3D] Render state - staged:${!!staged} phase:${
                draftState.phase
              } ready:${ready} amPicker:${amPicker}`
            );
            return null;
          })()}
          {staged ? (
            <div className="flex items-center justify-between bg-blue-900/50 border border-blue-500 rounded-lg p-3">
              <div className="text-blue-200">
                Staged:{" "}
                <span className="font-semibold">{staged.card.name}</span>
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
              </div>
            </div>
          ) : draftState.phase === "passing" ? (
            <div className="bg-yellow-900/50 border border-yellow-500 rounded-lg p-3 text-yellow-200">
              Passing packs{" "}
              {draftState.packDirection === "left" ? "left" : "right"}...
            </div>
          ) : draftState.phase === "picking" && !amPicker ? (
            <div className="bg-slate-800/70 border border-slate-600 rounded-lg p-3 text-slate-200 text-center">
              Waiting for other players to pick...
            </div>
          ) : (
            <div className="text-slate-400 text-center">
              Drag a card beyond the center ring to stage your pick
            </div>
          )}
        </div>

        {/* Hover preview */}
        {hoverPreview?.slug && (
          <div className="absolute right-3 top-20 z-30 pointer-events-none">
            <div className="relative">
              <div
                className={`relative ${
                  (hoverPreview.type || "").toLowerCase().includes("site")
                    ? "aspect-[4/3] h-[300px] md:h-[380px]"
                    : "aspect-[3/4] w-[300px] md:w-[380px]"
                } rounded-xl overflow-hidden ring-1 ring-white/20 shadow-2xl`}
              >
                <Image
                  src={`/api/images/${hoverPreview.slug}`}
                  alt={hoverPreview.name}
                  fill
                  sizes="(max-width:640px) 40vw, (max-width:1024px) 25vw, 20vw"
                  className={`${
                    (hoverPreview.type || "").toLowerCase().includes("site")
                      ? "object-contain rotate-90"
                      : "object-contain"
                  }`}
                />
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

        {/* Your Picks sidebar (left side) */}
        {myPicks.length > 0 && (
          <div className="absolute left-4 top-32 z-30 max-w-xs pointer-events-auto">
            <div className="bg-black/80 ring-1 ring-white/30 shadow-lg rounded-lg">
              <div className="p-3 border-b border-white/10">
                <div className="font-medium text-white flex items-center justify-between">
                  <span>Your Picks ({myPicks.length})</span>
                </div>
              </div>
              <div className="p-2 max-h-80 overflow-auto">
                <div className="grid gap-1 text-xs">
                  {myPicks.map((card, idx) => (
                    <div
                      key={`pick-${idx}-${card.id}`}
                      className="p-2 bg-black/50 ring-1 ring-white/20 rounded text-white hover:bg-black/70 transition-colors cursor-pointer"
                      onMouseEnter={() => {
                        setHoverPreview({
                          slug: card.slug,
                          name: card.name || card.cardName || `Card ${card.id}`,
                          type: card.type ?? null,
                        });
                      }}
                      onMouseLeave={() => setHoverPreview(null)}
                    >
                      <div className="font-medium truncate">
                        {card.name || card.cardName || `Card ${card.id}`}
                      </div>
                      {card.type && (
                        <div className="text-xs text-white/70 truncate">
                          {card.type}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
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

      {/* Pick & Pass button (bottom-center) */}
      {staged && (
        <button
          onClick={() => {
            console.log(`[DraftClient 3D] Pick & Pass button clicked!`);
            handlePickAndPass();
          }}
          disabled={ready || !amPicker}
          className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors shadow-lg"
          onMouseOver={() =>
            console.log(
              `[DraftClient 3D] Button hover - disabled:${ready || !amPicker}`
            )
          }
        >
          {amPicker
            ? ready
              ? `Waiting for ${draftState.waitingFor.length - 1} other player${
                  draftState.waitingFor.length - 1 === 1 ? "" : "s"
                }...`
              : "Pick & Pass"
            : "Waiting..."}
        </button>
      )}

      {/* New sync system waiting overlay */}
      <WaitingOverlay
        waitingState={waitingState}
        onCancel={() => {
          console.log("[OnlineDraft3DScreen] Waiting overlay cancelled");
          submissionCoordination.updateSubmissionStatus("failed");
        }}
        onDismiss={() => {
          console.log("[OnlineDraft3DScreen] Waiting overlay dismissed");
        }}
      />

      {/* Sync status indicator */}
      {draftSync.isConnected && (
        <div className="fixed top-4 right-4 z-40 bg-black/80 text-white px-3 py-1 rounded-lg text-sm">
          <div className="flex items-center space-x-2">
            <div
              className={`w-2 h-2 rounded-full ${
                draftSync.connectionQuality === "excellent"
                  ? "bg-green-500"
                  : draftSync.connectionQuality === "good"
                  ? "bg-yellow-500"
                  : draftSync.connectionQuality === "poor"
                  ? "bg-orange-500"
                  : "bg-red-500"
              }`}
            />
            <span>Sync: {draftSync.connectionQuality}</span>
            {draftSync.syncLatency > 0 && (
              <span className="text-xs text-gray-400">
                ({draftSync.syncLatency}ms)
              </span>
            )}
          </div>
          {draftSync.waitingForPlayers && (
            <div className="text-xs text-gray-400 mt-1">
              Waiting for {draftSync.waitingPlayers.length} player(s)
            </div>
          )}
          {(pickTimer.hasTimeRemaining || pickTimeRemaining > 0) && (
            <div className="text-xs mt-1">
              Pick timer:{" "}
              {pickTimer.hasTimeRemaining
                ? pickTimer.timeRemaining
                : pickTimeRemaining}
              s
            </div>
          )}
        </div>
      )}

      {/* Persistence status indicator */}
      {deckPersistence.isDirty && (
        <div className="fixed top-16 right-4 z-40 bg-orange-500/80 text-white px-2 py-1 rounded text-xs">
          Unsaved changes
        </div>
      )}

      {/* Video Overlay */}
      <GlobalVideoOverlay position="top-right" showUserAvatar={true} />
    </div>
  );
}

function ClampOrbitTarget({
  bounds,
}: {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}) {
  const { controls, camera, invalidate } = useThree((state) => ({
    controls: state.controls as OrbitControlsImpl | undefined,
    camera: state.camera,
    invalidate: state.invalidate,
  }));

  useEffect(() => {
    if (!controls) return;
    let offset = camera.position.clone().sub(controls.target.clone());

    const updateOffset = () => {
      offset = camera.position.clone().sub(controls.target.clone());
    };

    const clampTarget = () => {
      const target = controls.target;
      const clampedX = Math.max(bounds.minX, Math.min(bounds.maxX, target.x));
      const clampedZ = Math.max(bounds.minZ, Math.min(bounds.maxZ, target.z));
      if (clampedX !== target.x || clampedZ !== target.z) {
        target.set(clampedX, target.y, clampedZ);
        camera.position.copy(target.clone().add(offset));
        controls.update();
        invalidate();
      }
    };

    controls.addEventListener("start", updateOffset);
    controls.addEventListener("change", clampTarget);
    return () => {
      controls.removeEventListener("start", updateOffset);
      controls.removeEventListener("change", clampTarget);
    };
  }, [
    bounds.maxX,
    bounds.maxZ,
    bounds.minX,
    bounds.minZ,
    camera,
    controls,
    invalidate,
  ]);

  return null;
}

function KeyboardPanControls({
  enabled = true,
  step = 0.4,
}: {
  enabled?: boolean;
  step?: number;
}) {
  const { controls } = useThree((state) => ({
    controls: state.controls as OrbitControlsImpl | undefined,
  }));
  useOrbitKeyboardPan(controls, { enabled, panStep: step });
  return null;
}
