"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOUSE } from "three";
import DraggableCard3D from "@/app/decks/editor-3d/DraggableCard3D";
import { useOnline } from "@/app/online/online-context";
import CardPreview from "@/components/game/CardPreview";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import { GlobalVideoOverlay } from "@/components/ui/GlobalVideoOverlay";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import { FEATURE_SEAT_VIDEO, FEATURE_AUDIO_ONLY } from "@/lib/flags";
import Board from "@/lib/game/Board";
import { toCardMetaMap, type ApiCardMetaRow } from "@/lib/game/cardMeta";
import {
  type BoosterCard,
  type CardMeta,
  type Pick3D,
  categorizeCard,
  computeStackPositions,
} from "@/lib/game/cardSorting";
import DraftPackHand3D from "@/lib/game/components/DraftPackHand3D";
import MouseTracker from "@/lib/game/components/MouseTracker";
import TextureCache from "@/lib/game/components/TextureCache";
import { CARD_LONG } from "@/lib/game/constants";
import { useDraft3DTransport } from "@/lib/hooks/useDraft3DTransport";
import type { DraftState, CustomMessage } from "@/lib/net/transport";
import { LegacySeatVideo3D } from "@/lib/rtc/SeatVideo3D";
import { useMatchWebRTC } from "@/lib/rtc/useMatchWebRTC";
import { useDraft3DSession } from "@/lib/stores/draft-3d-online";

// Card shape used by OnlineDraftScreen; keep compatible
type DraftCard = {
  id: string;
  name: string;
  cardName?: string;
  slug: string;
  type?: string;
  cost?: string;
  rarity?: string;
  setName?: string;
  [k: string]: unknown;
};

// Player ready message type
type PlayerReadyMessage = CustomMessage & {
  type: "playerReady";
  playerKey: "p1" | "p2";
  ready: boolean;
};

interface EnhancedOnlineDraft3DScreenProps {
  myPlayerKey: "p1" | "p2";
  playerNames: { p1: string; p2: string };
  onDraftComplete: (draftedCards: DraftCard[]) => void;
}

export default function EnhancedOnlineDraft3DScreen({
  myPlayerKey,
  playerNames,
  onDraftComplete,
}: EnhancedOnlineDraft3DScreenProps) {
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

  // Seat Video (WebRTC) prototype state (always call hook; gated by enabled flag)
  const rtc = useMatchWebRTC({
    enabled: FEATURE_SEAT_VIDEO || FEATURE_AUDIO_ONLY,
    transport,
    myPlayerId: myPlayerId ?? null,
    matchId: matchId ?? null,
  });

  // Enhanced 3D Draft UI state (ported from single-player)
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [packChoiceOverlay, setPackChoiceOverlay] = useState(false);
  const [ready, setReady] = useState(false);
  const [playerReadyStates, setPlayerReadyStates] = useState<{
    p1: boolean;
    p2: boolean;
  }>({ p1: false, p2: false });
  const [usedPacks, setUsedPacks] = useState<number[]>([]);
  const [shownPackOverlayForRound, setShownPackOverlayForRound] = useState<
    number | null
  >(null);

  // Enhanced hand and HUD state (from single-player draft-3d)
  const [pick3D, setPick3D] = useState<Pick3D[]>([]);
  const [nextPickId, setNextPickId] = useState(1);
  const [staged, setStaged] = useState<{
    idx: number;
    x: number;
    z: number;
  } | null>(null);
  const [readyIdx, setReadyIdx] = useState<number | null>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [isSortingEnabled, setIsSortingEnabled] = useState(true);
  const [metaByCardId, setMetaByCardId] = useState<Record<number, CardMeta>>(
    {}
  );

  // Extend DraftState with optional server-provided packs shape for precise set derivation
  type DraftStateWithGenerated = DraftState & {
    allGeneratedPacks?: DraftCard[][][];
  };

  // Enhanced preview and hover state
  const [hoverPreview, setHoverPreview] = useState<{
    slug: string;
    name: string;
    type: string | null;
  } | null>(null);
  const clearHoverTimerRef = useRef<number | null>(null);
  const currentHoverCardRef = useRef<string | null>(null);

  // Picks panel state (from single-player)
  const [picksOpen, setPicksOpen] = useState(true);
  const [compactPicks, setCompactPicks] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  // Once we've seen any non-waiting draft phase, never allow a later 'waiting' snapshot to regress UI
  const everOutOfWaitingRef = useRef(false);

  // Set screen type for video overlay
  useEffect(() => {
    updateScreenType("draft-3d");
    return undefined;
  }, [updateScreenType]);

  // Render order counter for stacking
  const roCounterRef = useRef(1500);
  const getTopRenderOrder = useCallback(() => {
    roCounterRef.current += 1;
    return roCounterRef.current;
  }, []);

  // Enhanced Draft-3D Online Integration
  const { sendCardPreview, sendStackInteraction, isConnected } =
    useDraft3DTransport({
      transport,
      sessionId: matchId || "unknown",
      playerId: myPlayerId || "unknown",
      onError: (error) => {
        console.error("[EnhancedOnlineDraft3D] Transport error:", error);
        setError(String(error));
      },
    });

  const { joinSession, leaveSession } = useDraft3DSession();

  // Initialize Draft-3D session
  useEffect(() => {
    if (matchId && myPlayerId && transport) {
      joinSession(matchId, myPlayerId);
    }
    return () => {
      leaveSession();
    };
  }, [matchId, myPlayerId, transport, joinSession, leaveSession]);

  // Helper functions for consistent hover management (from single-player)
  const showCardPreview = useCallback(
    (card: { slug: string; name: string; type: string | null }) => {
      if (clearHoverTimerRef.current) {
        window.clearTimeout(clearHoverTimerRef.current);
        clearHoverTimerRef.current = null;
      }
      currentHoverCardRef.current = card.slug;
      setHoverPreview(card);

      // Send preview to other players
      if (isConnected) {
        sendCardPreview(card.slug, "hover", { x: 0, y: 0.1, z: -0.5 }, "low");
      }
    },
    [isConnected, sendCardPreview]
  );

  const hideCardPreview = useCallback(() => {
    if (clearHoverTimerRef.current) {
      window.clearTimeout(clearHoverTimerRef.current);
    }
    clearHoverTimerRef.current = window.setTimeout(() => {
      currentHoverCardRef.current = null;
      setHoverPreview(null);
      clearHoverTimerRef.current = null;
    }, 1200); // Increased from 400ms to 1.2s for better card preview visibility
  }, []);

  // Convert DraftCard to BoosterCard format for Pick3D
  const draftCardToBoosterCard = useCallback(
    (card: DraftCard): BoosterCard => ({
      variantId: 0,
      slug: card.slug,
      finish: "Standard" as const,
      product: "Draft",
      rarity:
        (card.rarity as "Ordinary" | "Exceptional" | "Elite" | "Unique") ||
        "Ordinary",
      type: card.type || null,
      cardId: parseInt(card.id) || 0,
      cardName: card.cardName || card.name,
      setName: card.setName || "Beta",
    }),
    []
  );

  const PICK_CENTER = { x: 0, z: 0 };
  const PICK_RADIUS = CARD_LONG * 0.6;
  const STAGE_CLICK_POS = useMemo(() => ({ x: 0, z: 1.7 }), []);

  // Whether it's my turn to pick according to the server
  const amPicker = useMemo(() => {
    return (
      draftState.phase === "picking" &&
      !!myPlayerId &&
      draftState.waitingFor.includes(myPlayerId)
    );
  }, [draftState.phase, draftState.waitingFor, myPlayerId]);

  const myPack = useMemo(
    () => (draftState.currentPacks?.[myPlayerIndex] || []) as DraftCard[],
    [draftState.currentPacks, myPlayerIndex]
  );
  const myPicks = (draftState.picks[myPlayerIndex] || []) as DraftCard[];
  const oppPicks = (draftState.picks[1 - myPlayerIndex] || []) as DraftCard[];

  // Convert pack to BoosterCard format for DraftPackHand3D
  const packAsBoosterCards = useMemo(() => {
    return myPack.map(draftCardToBoosterCard);
  }, [myPack, draftCardToBoosterCard]);

  // Initialize/sync draft state from match, but never regress to an older phase/index
  useEffect(() => {
    if (!match?.draftState) return;

    const incoming = match.draftState as DraftState;
    const cur = draftState;

    if (everOutOfWaitingRef.current && incoming.phase === "waiting") {
      // We already progressed; ignore spurious regressions from stale snapshots
      return;
    }

    const phaseOrder: Record<string, number> = {
      waiting: 0,
      pack_selection: 1,
      picking: 2,
      passing: 3,
      complete: 4,
    };

    const isNewerOrEqual = (() => {
      const poCur = phaseOrder[cur?.phase ?? "waiting"] ?? 0;
      const poInc = phaseOrder[incoming?.phase ?? "waiting"] ?? 0;
      if (poInc > poCur) return true;
      if (poInc < poCur) return false;
      // Same phase: compare packIndex then pickNumber
      if ((incoming.packIndex ?? 0) > (cur.packIndex ?? 0)) return true;
      if ((incoming.packIndex ?? 0) < (cur.packIndex ?? 0)) return false;
      if ((incoming.pickNumber ?? 0) >= (cur.pickNumber ?? 0)) return true;
      return false;
    })();

    if (!isNewerOrEqual) {
      // Guard: ignore stale snapshot (prevents reverting from picking -> waiting)
      return;
    }

    console.log(
      `[EnhancedOnlineDraft3D] Initializing from match draft state: phase=${incoming.phase}`
    );
    setDraftState(incoming);

    if (incoming.phase === "picking") {
      setStaged(null);
      setReady(false);
    }

    // Rebuild pick3D array from existing picks
    const existingPicks = (incoming.picks[myPlayerIndex] || []) as DraftCard[];
    if (existingPicks.length > 0) {
      const rebuiltPick3D: Pick3D[] = existingPicks.map((card, idx) => ({
        id: idx + 1,
        card: draftCardToBoosterCard(card),
        x: 0,
        z: 0,
        zone: "Deck" as const,
      }));
      setPick3D(rebuiltPick3D);
      setNextPickId(existingPicks.length + 1);
    }
  }, [match?.draftState, draftState, myPlayerIndex, draftCardToBoosterCard]);

  // Client-side fallback: if both players are ready and we remain in 'waiting', auto-request start after ~1.1s
  useEffect(() => {
    if (!transport || !match) return;
    if (draftState.phase !== "waiting") return;
    if (!playerReadyStates.p1 || !playerReadyStates.p2) return;
    const t = window.setTimeout(() => {
      try {
        const baseCfg = match.draftConfig ?? { setMix: ["Beta"], packCount: 3, packSize: 15 };
        transport.startDraft?.({ matchId: match.id, draftConfig: baseCfg });
      } catch {}
    }, 1100);
    return () => window.clearTimeout(t);
  }, [transport, match, draftState.phase, playerReadyStates.p1, playerReadyStates.p2]);

  // Listen for server draft updates
  useEffect(() => {
    if (!transport) return;

    const handleDraftUpdate = (state: unknown) => {
      const s = state as DraftState;
      if (s?.phase && s.phase !== "waiting") {
        everOutOfWaitingRef.current = true;
      }
      setDraftState(s);
      console.log(
        `[EnhancedOnlineDraft3D] draftUpdate: phase=${s.phase} pack=${s.packIndex} pick=${s.pickNumber}`
      );

      if (s.phase === "picking") {
        setStaged(null);
        setReady(false);
      }

      if (s.phase === "complete") {
        const mine = (s.picks[myPlayerIndex] || []) as DraftCard[];
        console.log(
          `[EnhancedOnlineDraft3D] Draft complete! Picked ${mine.length} cards`
        );

        try {
          if (matchId) {
            localStorage.setItem(
              `draftedCards_${matchId}`,
              JSON.stringify(mine)
            );
          }
        } catch (err) {
          console.error(
            `[EnhancedOnlineDraft3D] Failed to save draft data:`,
            err
          );
        }

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

  // Fetch metadata for picked cards (for enhanced sorting and stats)
  useEffect(() => {
    if (pick3D.length === 0) {
      setMetaByCardId({});
      return;
    }

    const groups = new Map<string, Set<number>>();
    for (const p of pick3D) {
      const setName = p.card.setName || "Beta";
      if (!groups.has(setName)) groups.set(setName, new Set());
      const set = groups.get(setName);
      if (set) set.add(p.card.cardId);
    }

    const requests = Array.from(groups.entries()).map(([s, ids]) => {
      const params = new URLSearchParams();
      params.set("set", s);
      params.set("ids", Array.from(ids).join(","));
      return fetch(`/api/cards/meta?${params.toString()}`)
        .then((r) => r.json())
        .then((rows: ApiCardMetaRow[]) => rows)
        .catch(() => [] as ApiCardMetaRow[]);
    });

    Promise.all(requests)
      .then((chunks) => {
        const combined = chunks.flat();
        setMetaByCardId(toCardMetaMap(combined));
      })
      .catch((err) => {
        console.warn("Failed to fetch card metadata:", err);
      });
  }, [pick3D]);

  // Auto-pick logic and timely pack choice overlay
  useEffect(() => {
    // Show pack choice overlay immediately during server 'pack_selection'
    if (
      draftState.phase === "pack_selection" &&
      shownPackOverlayForRound !== draftState.packIndex
    ) {
      // New round: show overlay and clear any prior used pack indices
      setPackChoiceOverlay(true);
      setUsedPacks([]);
      setShownPackOverlayForRound(draftState.packIndex);
      return;
    }

    if (draftState.phase === "picking" && amPicker) {
      setReady(false);

      // Also show overlay at start of picking if it wasn't shown yet (rejoin case)
      if (
        draftState.pickNumber === 1 &&
        !packChoiceOverlay &&
        shownPackOverlayForRound !== draftState.packIndex &&
        myPack.length === 0
      ) {
        setPackChoiceOverlay(true);
        setShownPackOverlayForRound(draftState.packIndex);
        return;
      }

      // Auto-pick if only one card left
      if (myPack.length === 1 && !staged && !ready) {
        const lastCard = myPack[0];
        setStaged({ idx: 0, x: STAGE_CLICK_POS.x, z: STAGE_CLICK_POS.z });

        setTimeout(() => {
          if (!transport || !match) return;

          setReady(true);
          transport.makeDraftPick({
            matchId: match.id,
            cardId: lastCard.id,
            packIndex: draftState.packIndex,
            pickNumber: draftState.pickNumber,
          });
          setStaged(null);
        }, 500);
      }
    }
  }, [
    draftState,
    amPicker,
    staged,
    ready,
    myPack,
    transport,
    match,
    packChoiceOverlay,
    shownPackOverlayForRound,
    STAGE_CLICK_POS,
  ]);

  // Hide pack choice overlay when server enters picking phase (packs are assigned)
  useEffect(() => {
    if (draftState.phase === "picking") {
      if (packChoiceOverlay) setPackChoiceOverlay(false);
    }
  }, [draftState.phase, packChoiceOverlay]);

  // Enhanced Pick & Pass with staging mechanics (from single-player)
  const commitPickAndPass = useCallback(
    (cardIdx: number, wx: number, wz: number) => {
      if (!transport || !match || !amPicker) return;

      const card = myPack[cardIdx];
      if (!card) return;

      console.log(
        `[EnhancedOnlineDraft3D] commitPickAndPass -> cardId=${card.id}`
      );

      setReady(true);

      // Add picked card to 3D board display immediately
      const boosterCard = draftCardToBoosterCard(card);
      const newPick: Pick3D = {
        id: nextPickId,
        card: boosterCard,
        x: wx,
        z: wz,
        zone: wz < 0 ? "Deck" : "Sideboard",
      };
      setPick3D((prev) => [...prev, newPick]);
      setNextPickId((prev) => prev + 1);

      // Send stack interaction for enhanced multiplayer feedback
      sendStackInteraction("pick", [card.id], "current-pack", "picked-cards", {
        targetPosition: { x: wx, y: 0.1, z: wz },
        userInitiated: true,
        hasAnimation: true,
      });

      try {
        transport.makeDraftPick({
          matchId: match.id,
          cardId: card.id,
          packIndex: draftState.packIndex,
          pickNumber: draftState.pickNumber,
        });
      } catch (err) {
        console.error(`[EnhancedOnlineDraft3D] makeDraftPick error:`, err);
      }

      // Clear staged state
      setStaged(null);
      setReadyIdx(null);
      setSelectedRowIndex(null);
    },
    [
      transport,
      match,
      amPicker,
      myPack,
      draftCardToBoosterCard,
      nextPickId,
      sendStackInteraction,
      draftState,
    ]
  );

  // Ready state management (one-way: cannot unready)
  const handleToggleReady = useCallback(async () => {
    if (!transport || !match) return;
    // If already ready, do nothing
    if (playerReadyStates[myPlayerKey]) return;

    setPlayerReadyStates((prev) => ({ ...prev, [myPlayerKey]: true }));

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
      const baseCfg = match.draftConfig ?? {
        setMix: ["Beta"],
        packCount: 3,
        packSize: 15,
      };
      const setMix =
        Array.isArray(baseCfg.setMix) && baseCfg.setMix.length > 0
          ? baseCfg.setMix
          : ["Beta"];
      const packCount = Math.max(1, Number(baseCfg.packCount) || 3);
      let packCounts: Record<string, number> | undefined = undefined;
      if (baseCfg) {
        const bc = baseCfg as unknown as {
          packCounts?: Record<string, number>;
        };
        const pc = bc.packCounts;
        if (pc && typeof pc === "object") {
          const total = Object.values(pc).reduce(
            (a, b) => a + (Number(b) || 0),
            0
          );
          packCounts = total === packCount ? pc : undefined;
        }
      }
      if (!packCounts) {
        // Evenly distribute packCount across setMix
        const counts: Record<string, number> = {};
        const n = setMix.length;
        for (const s of setMix) counts[s] = 0;
        const base = Math.floor(packCount / n);
        const rem = packCount % n;
        setMix.forEach((s, i) => {
          counts[s] = base + (i < rem ? 1 : 0);
        });
        packCounts = counts;
      }
      const draftConfig = {
        ...baseCfg,
        setMix,
        packCount,
        packCounts,
      } as typeof baseCfg & { packCounts: Record<string, number> };
      await transport.startDraft?.({ matchId: match.id, draftConfig });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start draft");
    } finally {
      setLoading(false);
    }
  }, [transport, match, playerReadyStates]);

  // Pack choice handling
  const handlePackChoice = useCallback(
    async (packIndex: number) => {
      if (!transport || !match) return;

      try {
        // Derive setChoice from server-generated packs to ensure exact match
        const s = draftState as DraftStateWithGenerated;
        const packsMaybe = s.allGeneratedPacks?.[myPlayerIndex] as
          | DraftCard[][]
          | undefined;
        const myPacks: DraftCard[][] = Array.isArray(packsMaybe)
          ? packsMaybe
          : [];
        const first = myPacks[packIndex] && myPacks[packIndex][0];
        const setChoice: string =
          (first && (first.setName as string)) || "Beta";

        transport.chooseDraftPack?.({
          matchId: match.id,
          setChoice,
          packIndex: draftState.packIndex, // server tracks the round internally
        });
      } catch (err) {
        console.error(`[EnhancedOnlineDraft3D] chooseDraftPack error:`, err);
      }

      setUsedPacks((prev) => [...prev, packIndex]);
      setPackChoiceOverlay(false);
    },
    [draftState, myPlayerIndex, transport, match]
  );

  // Enhanced stats calculations (from single-player)
  const yourCounts = useMemo(() => {
    const map = new Map<
      number,
      { name: string; rarity: string; count: number }
    >();
    for (const pick of pick3D) {
      const it = map.get(pick.card.cardId) || {
        name: pick.card.cardName,
        rarity: pick.card.rarity,
        count: 0,
      };
      it.count += 1;
      map.set(pick.card.cardId, it);
    }
    return Array.from(map.entries())
      .map(([cardId, v]) => ({ cardId, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [pick3D]);

  // Calculate threshold summary and picks by type (from single-player)
  const thresholdSummary = useMemo(() => {
    const summary = { air: 0, water: 0, earth: 0, fire: 0 };
    const elements = new Set<string>();

    for (const pick of pick3D) {
      const meta = metaByCardId[pick.card.cardId];
      if (meta?.thresholds) {
        Object.keys(meta.thresholds).forEach((element) => {
          const value = meta.thresholds?.[element] ?? 0;
          if (value > 0) {
            elements.add(element);
            summary[element as keyof typeof summary] = Math.max(
              summary[element as keyof typeof summary],
              value
            );
          }
        });
      }
    }

    return { summary, elements: Array.from(elements) };
  }, [pick3D, metaByCardId]);

  const picksByType = useMemo(() => {
    const counts = { creatures: 0, spells: 0, sites: 0, avatars: 0 };
    for (const pick of pick3D) {
      const meta = metaByCardId[pick.card.cardId];
      const category = categorizeCard(pick.card, meta);
      counts[category as keyof typeof counts]++;
    }
    return counts;
  }, [pick3D, metaByCardId]);

  // Create sorted stack positions (from single-player)
  const stackPositions = useMemo(() => {
    return computeStackPositions(pick3D, metaByCardId, isSortingEnabled, true);
  }, [pick3D, isSortingEnabled, metaByCardId]);

  // Calculate stack sizes for hitbox optimization (from single-player)
  const stackSizes = useMemo(() => {
    if (!stackPositions) return new Map<string, number>();

    const sizeMap = new Map<string, number>();
    const stackGroups = new Map<string, number>();

    for (const [, pos] of stackPositions) {
      const key = `${pos.x.toFixed(3)},${pos.z.toFixed(3)}`;
      stackGroups.set(key, (stackGroups.get(key) || 0) + 1);
    }

    for (const [, pos] of stackPositions) {
      const key = `${pos.x.toFixed(3)},${pos.z.toFixed(3)}`;
      sizeMap.set(key, stackGroups.get(key) || 1);
    }

    return sizeMap;
  }, [stackPositions]);

  // Spacebar Pick & Pass (only when draft in progress and a card is staged)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draftState.phase !== "picking") return;
      if (!amPicker) return;
      if (e.code !== "Space") return;
      const ae = document.activeElement as HTMLElement | null;
      const isTyping =
        ae &&
        (ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          ae.isContentEditable);
      if (isTyping) return;

      // Stop the event from being processed by other handlers (like OrbitControls)
      e.preventDefault();
      e.stopPropagation();

      if (staged) {
        commitPickAndPass(staged.idx, staged.x, staged.z);
      }
    };
    // Use capture phase to get the event before other handlers
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [draftState.phase, amPicker, staged, commitPickAndPass]);

  const needsPackChoice =
    (draftState.phase === "pack_selection" || draftState.phase === "picking") &&
    amPicker &&
    draftState.pickNumber === 1 &&
    !staged &&
    shownPackOverlayForRound !== draftState.packIndex;

  // Debug: trace UI gating for pack visibility
  useEffect(() => {
    try {
      console.log(
        "[EnhancedOnlineDraft3D] gate",
        {
          phase: draftState.phase,
          packIndex: draftState.packIndex,
          pickNumber: draftState.pickNumber,
          amPicker,
          packChoiceOverlay,
          needsPackChoice,
          myPackSize: myPack.length,
        }
      );
    } catch {}
  }, [draftState.phase, draftState.packIndex, draftState.pickNumber, amPicker, packChoiceOverlay, needsPackChoice, myPack.length]);

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
                {Object.entries(playerNames).map(([key, name]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-slate-300">{name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          playerReadyStates[
                            key as keyof typeof playerReadyStates
                          ]
                            ? "text-green-400"
                            : "text-slate-400"
                        }
                      >
                        {playerReadyStates[
                          key as keyof typeof playerReadyStates
                        ]
                          ? "Ready"
                          : "Not Ready"}
                      </span>
                      {myPlayerKey === key && !playerReadyStates[key as keyof typeof playerReadyStates] && (
                        <button
                          onClick={handleToggleReady}
                          className="px-3 py-1 rounded text-sm font-medium bg-green-600 hover:bg-green-700 text-white"
                        >
                          Ready
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-6">
              <h3 className="text-xl font-semibold text-white mb-4">
                Enhanced Draft Settings
              </h3>
              <div className="space-y-2 text-slate-300">
                <div>
                  Sets: {match?.draftConfig?.setMix?.join(", ") || "Beta"}
                </div>
                <div>Packs: {match?.draftConfig?.packCount ?? 3}</div>
                <div>Pack size: {match?.draftConfig?.packSize ?? 15} cards</div>
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
            disabled={loading || !playerReadyStates.p1 || !playerReadyStates.p2}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors"
          >
            {loading
              ? "Starting Enhanced Draft..."
              : !playerReadyStates.p1 || !playerReadyStates.p2
              ? "Waiting for both players to be ready..."
              : "Start Enhanced Draft"}
          </button>
        </div>
      </div>
    );
  }

  // Pack choice overlay (enhanced with better visuals)
  const totalPacks = match?.draftConfig?.packCount ?? 3;
  if (packChoiceOverlay && draftState.packIndex < totalPacks) {
    // Derive set order directly from server-generated packs to avoid any mismatch
    const s = draftState as DraftStateWithGenerated;
    const packsMaybe = s.allGeneratedPacks?.[myPlayerIndex] as
      | DraftCard[][]
      | undefined;
    const myPacks: DraftCard[][] = Array.isArray(packsMaybe) ? packsMaybe : [];
    const availableSets: string[] = myPacks.map((pack: DraftCard[]) => {
      const first = pack && pack[0];
      return (first && (first.setName as string)) || "Beta";
    });
    const packs = availableSets.map((_, idx) => idx);

    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="rounded-xl p-6 bg-black/80 ring-1 ring-white/30 text-white w-[min(92vw,720px)] shadow-2xl">
          <div className="text-lg font-semibold mb-3">
            Choose a pack to crack (Round {draftState.packIndex + 1}/
            {totalPacks})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {packs.map((packIdx) => {
              const isUsed = usedPacks.includes(packIdx);
              const setName =
                availableSets[packIdx] ||
                availableSets[packIdx % availableSets.length];
              const assetName = (() => {
                const s = (setName || "").toLowerCase();
                if (s.includes("arthur")) return "arthurian-booster.png";
                if (s.includes("alpha")) return "alphabeta-booster.png";
                if (s.includes("beta")) return "alphabeta-booster.png";
                return "alphabeta-booster.png";
              })();

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
      {/* Enhanced 3D Stage */}
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
            <Board noRaycast={true} />
          </Physics>

          {/* Seat Video planes at player positions (fixed orientation toward board) */}
          {rtc.featureEnabled && (
            <>
              <LegacySeatVideo3D who={myPlayerKey} stream={rtc.localStream} />
              <LegacySeatVideo3D who={opponentKey} stream={rtc.remoteStream} />
            </>
          )}

          <TextureCache />

          {/* Enhanced Mouse tracking for precise card hover detection */}
          <MouseTracker
            cards={pick3D}
            onHover={(card) => {
              if (card) {
                showCardPreview({
                  slug: card.slug,
                  name: card.name,
                  type: card.type,
                });
              } else {
                hideCardPreview();
              }
            }}
          />

          {/* Enhanced Draft Pack Hand (from single-player) */}
          {draftState.phase !== "complete" &&
            !packChoiceOverlay &&
            packAsBoosterCards.length > 0 && (
              <DraftPackHand3D
                cards={packAsBoosterCards}
                disabled={!amPicker}
                allowHoverWhenDisabled={!amPicker} // Allow hover previews when waiting for turn
                opacity={!amPicker ? 0.6 : 1.0} // Dim cards when waiting for turn
                hiddenIndex={staged?.idx ?? null}
                onDragChange={setOrbitLocked}
                getTopRenderOrder={getTopRenderOrder}
                onHoverInfo={(info) => {
                  if (info) {
                    showCardPreview(info);
                  } else if (amPicker) {
                    // Only do complex hover handling when it's the picker's turn
                    const currentSlug = currentHoverCardRef.current;
                    if (currentSlug) {
                      const isHandCard = packAsBoosterCards.some(
                        (c) => c.slug === currentSlug
                      );
                      if (isHandCard) {
                        const sel = selectedRowIndex;
                        if (sel != null) {
                          const c = packAsBoosterCards[sel];
                          if (c)
                            showCardPreview({
                              slug: c.slug,
                              name: c.cardName,
                              type: c.type ?? null,
                            });
                          else hideCardPreview();
                        } else hideCardPreview();
                      }
                    }
                  } else {
                    // When not the active picker, just hide preview
                    hideCardPreview();
                  }
                }}
                onDragMove={(idx, wx, wz) => {
                  const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
                  if (d > PICK_RADIUS) setReadyIdx(idx);
                  else if (readyIdx === idx) setReadyIdx(null);
                }}
                onRelease={(idx, wx, wz) => {
                  // Only allow staging when it's the player's turn
                  if (!amPicker) return;

                  const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
                  if (d > PICK_RADIUS) {
                    setStaged({ idx, x: wx, z: wz });
                    setSelectedRowIndex(null);
                    const c = packAsBoosterCards[idx];
                    if (c)
                      showCardPreview({
                        slug: c.slug,
                        name: c.cardName,
                        type: c.type ?? null,
                      });
                  } else if (staged && staged.idx === idx) {
                    setStaged(null);
                  }
                }}
                selectedIndex={selectedRowIndex}
                onSelectIndex={(idx) => {
                  setSelectedRowIndex(idx);
                  if (idx != null) {
                    // Only allow staging when it's the player's turn
                    if (amPicker) {
                      setStaged({
                        idx,
                        x: STAGE_CLICK_POS.x,
                        z: STAGE_CLICK_POS.z,
                      });
                      setSelectedRowIndex(null);
                    }
                    const c = packAsBoosterCards[idx];
                    if (c)
                      showCardPreview({
                        slug: c.slug,
                        name: c.cardName,
                        type: c.type ?? null,
                      });
                  } else {
                    hideCardPreview();
                  }
                }}
                orbitLocked={orbitLocked}
              />
            )}

          {/* Enhanced staged card representation */}
          {staged && !needsPackChoice && packAsBoosterCards[staged.idx] && (
            <DraggableCard3D
              key={`staged-${draftState.packIndex}-${draftState.pickNumber}-${staged.idx}`}
              slug={packAsBoosterCards[staged.idx]?.slug || ""}
              isSite={(packAsBoosterCards[staged.idx]?.type || "")
                .toLowerCase()
                .includes("site")}
              x={staged.x}
              z={staged.z}
              onDrop={(wx, wz) => {
                // Only allow moving staged cards when it's the player's turn
                if (!amPicker) return;
                setStaged((prev) =>
                  prev && prev.idx === staged.idx
                    ? { ...prev, x: wx, z: wz }
                    : prev
                );
              }}
              onDragChange={setOrbitLocked}
              getTopRenderOrder={getTopRenderOrder}
              lockUpright
              onHoverChange={(hover) => {
                if (hover && !orbitLocked) {
                  const c = packAsBoosterCards[staged.idx];
                  if (!c) return;
                  showCardPreview({
                    slug: c.slug,
                    name: c.cardName,
                    type: c.type,
                  });
                }
              }}
              onRelease={(wx, wz) => {
                // Only allow unstaging when it's the player's turn
                if (!amPicker) return;
                const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
                if (d <= PICK_RADIUS) {
                  setStaged(null);
                }
              }}
            />
          )}

          {/* Enhanced picked cards with proper sorting */}
          {pick3D.length > 0 && (
            <group>
              {pick3D.map((p) => {
                const isSite = (p.card.type || "")
                  .toLowerCase()
                  .includes("site");

                const stackPos = stackPositions?.get(p.id);
                const x = stackPos
                  ? stackPos.x + stackPos.stackIndex * 0.03
                  : p.x;
                const z = stackPos ? stackPos.z : p.z;
                const y = stackPos ? 0.002 + stackPos.stackIndex * 0.05 : 0.002;
                const isVisible = stackPos ? stackPos.isVisible : true;
                const baseRO = stackPos
                  ? 1600 + stackPos.stackIndex * 10
                  : 1500;

                const stackKey = stackPos
                  ? `${stackPos.x.toFixed(3)},${stackPos.z.toFixed(3)}`
                  : null;
                const totalInStack = stackKey
                  ? stackSizes.get(stackKey) || 1
                  : 1;
                const stackIndex = stackPos ? stackPos.stackIndex : 0;

                return (
                  <DraggableCard3D
                    key={`pick-${p.id}`}
                    slug={p.card.slug}
                    isSite={isSite}
                    x={x}
                    z={z}
                    y={y}
                    baseRenderOrder={baseRO}
                    stackIndex={stackIndex}
                    totalInStack={totalInStack}
                    cardId={p.id}
                    onDrop={(wx, wz) => {
                      if (!isSortingEnabled) {
                        setPick3D((prev) =>
                          prev.map((it) =>
                            it.id === p.id ? { ...it, x: wx, z: wz } : it
                          )
                        );
                      }
                    }}
                    onDragChange={setOrbitLocked}
                    getTopRenderOrder={getTopRenderOrder}
                    lockUpright
                    disabled={isSortingEnabled && !isVisible}
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
            mouseButtons={{
              LEFT: MOUSE.PAN,
              MIDDLE: MOUSE.DOLLY,
              RIGHT: MOUSE.ROTATE,
            }}
          />
        </Canvas>
      </div>

      {/* Enhanced Overlays */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        {/* Enhanced Top controls */}
        <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-end gap-4 pointer-events-auto select-none relative">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-fantaisie text-white">
              Enhanced Draft
            </div>
            <button
              onClick={() => setHelpOpen(true)}
              className="h-9 w-9 grid place-items-center rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 transition-all"
              title="Enhanced Draft controls"
            >
              <span className="font-fantaisie text-xl font-bold">?</span>
            </button>
          </div>

          {/* Enhanced sorting controls */}
          {pick3D.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsSortingEnabled(!isSortingEnabled)}
                title={
                  isSortingEnabled
                    ? "Disable auto-stacking"
                    : "Enable auto-stacking"
                }
                className={`h-9 w-9 rounded-full grid place-items-center ring-1 transition ${
                  isSortingEnabled
                    ? "bg-emerald-500 text-black ring-emerald-400 hover:bg-emerald-400"
                    : "bg-white/15 text-white ring-white/30 hover:bg-white/25"
                }`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5"
                >
                  <path d="M3 7h3.586a2 2 0 0 1 1.414.586l6.828 6.828A2 2 0 0 0 16.242 15H21v2h-4.758a4 4 0 0 1-2.829-1.172L6.586 9.414A2 2 0 0 0 5.172 9H3V7zm0 10h5l2 2H3v-2zm18-8h-5l-2-2H21v2z" />
                </svg>
              </button>
            </div>
          )}

          {/* Enhanced draft status */}
          {draftState.phase !== "complete" && (
            <div className="absolute left-1/2 -translate-x-1/2 top-4 z-[55] pointer-events-auto text-center">
              {/* Pick & Pass button - only show when a card is staged */}
              {staged && (
                <button
                  onClick={() =>
                    commitPickAndPass(staged.idx, staged.x, staged.z)
                  }
                  disabled={!amPicker}
                  className="h-10 px-4 rounded border border-emerald-500 text-emerald-400 font-semibold disabled:opacity-50 bg-transparent hover:text-emerald-300 hover:border-emerald-400"
                >
                  Pick & Pass:{" "}
                  <span className="font-fantaisie text-lg md:text-xl">
                    {packAsBoosterCards[staged.idx]?.cardName ?? "Card"}
                  </span>
                </button>
              )}
              <div className="mt-1 text-[11px] text-white/40 pointer-events-none">
                Pack {draftState.packIndex + 1} / 3 • Pick{" "}
                {draftState.pickNumber} / 15 •
                {draftState.phase === "passing" && (
                  <span>
                    {" "}
                    Passing{" "}
                    {draftState.packDirection === "left" ? "Left" : "Right"}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="ml-auto flex items-center gap-4 text-slate-300">
            <div>Your picks: {myPicks.length}</div>
            <div>
              {playerNames[opponentKey]} picks: {oppPicks.length}
            </div>
          </div>
        </div>

        {/* Enhanced Pick status panel */}
        <div className="w-full pl-4 pr-0 pb-6 pt-2 pointer-events-none select-none">
          <div className="grid grid-cols-12 gap-3 lg:gap-4">
            <div className="col-span-12 lg:col-span-8" />
            <div className="col-span-12 lg:col-span-4 justify-self-end pr-0">
              <div className="rounded p-3 bg-black/80 ring-1 ring-white/30 shadow-lg pointer-events-none">
                <div className="font-medium mb-2 text-white flex items-center justify-between">
                  <span>Your Picks ({pick3D.length})</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCompactPicks((v) => !v)}
                      className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20 pointer-events-auto"
                      title="Toggle compact view"
                    >
                      {compactPicks ? "Comfort" : "Compact"}
                    </button>
                    <button
                      onClick={() => setPicksOpen((v) => !v)}
                      className="text-xs px-2 py-1 bg-white/10 rounded hover:bg-white/20 pointer-events-auto"
                    >
                      {picksOpen ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {/* Enhanced stats row */}
                {pick3D.length > 0 && (
                  <div className="mb-2 text-[11px] text-white/90 flex flex-wrap items-center gap-3 pointer-events-auto">
                    <div className="flex items-center gap-2">
                      <span className="opacity-80">Types:</span>
                      <span>C {picksByType.creatures}</span>
                      <span>S {picksByType.spells}</span>
                      <span>Sites {picksByType.sites}</span>
                      <span>A {picksByType.avatars}</span>
                    </div>
                    {thresholdSummary.elements.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="opacity-80">Thresholds:</span>
                        {thresholdSummary.elements.map((element) => (
                          <span
                            key={element}
                            className="inline-flex items-center gap-1"
                          >
                            <Image
                              src={`/api/assets/${element}.png`}
                              alt={element}
                              width={14}
                              height={14}
                              className="pointer-events-none select-none"
                            />
                            <span className="capitalize">
                              {
                                thresholdSummary.summary[
                                  element as keyof typeof thresholdSummary.summary
                                ]
                              }
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Enhanced picks list */}
                {picksOpen && (
                  <div
                    className={`max-h-[52vh] overflow-auto pr-2 grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2 gap-2 text-xs pointer-events-auto`}
                  >
                    {yourCounts.map((it) => {
                      const meta = metaByCardId[it.cardId];
                      const t =
                        (meta?.thresholds as
                          | Record<string, number>
                          | undefined) || {};
                      const order = ["air", "water", "earth", "fire"] as const;
                      const cardSlug = pick3D.find(
                        (p) => p.card.cardId === it.cardId
                      )?.card.slug;
                      const cardType = pick3D.find(
                        (p) => p.card.cardId === it.cardId
                      )?.card.type;
                      const isSite = (cardType || "")
                        .toLowerCase()
                        .includes("site");

                      return (
                        <div
                          key={it.cardId}
                          className={`rounded ${
                            compactPicks ? "p-1" : "p-2"
                          } bg-black/70 ring-1 ring-white/25 text-white`}
                          onMouseEnter={() => {
                            if (cardSlug) {
                              showCardPreview({
                                slug: cardSlug,
                                name: it.name,
                                type: cardType || null,
                              });
                            }
                          }}
                          onMouseLeave={() => {
                            hideCardPreview();
                          }}
                        >
                          {compactPicks ? (
                            <div className="flex items-center justify-between gap-2">
                              <div className="truncate max-w-[60%] font-medium">
                                {it.name}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1 opacity-90">
                                  {order.map((k) =>
                                    t[k] ? (
                                      <span
                                        key={k}
                                        className="inline-flex items-center gap-0.5"
                                      >
                                        {Array.from({ length: t[k] }).map(
                                          (_, i) => (
                                            <Image
                                              key={`${k}-${i}`}
                                              src={`/api/assets/${k}.png`}
                                              alt={k}
                                              width={12}
                                              height={12}
                                              className="pointer-events-none select-none"
                                              priority={false}
                                            />
                                          )
                                        )}
                                      </span>
                                    ) : null
                                  )}
                                </div>
                                {meta?.cost != null &&
                                  meta.cost > 0 &&
                                  (meta.cost >= 1 && meta.cost <= 9 ? (
                                    <NumberBadge
                                      value={meta.cost as Digit}
                                      size={20}
                                      strokeWidth={6}
                                    />
                                  ) : (
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-black text-[11px] font-bold">
                                      {meta.cost}
                                    </span>
                                  ))}
                                <div className="text-right font-semibold">
                                  x{it.count}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2">
                              {cardSlug ? (
                                <div
                                  className={`relative flex-none ${
                                    isSite
                                      ? "aspect-[4/3] w-14"
                                      : "aspect-[3/4] w-12"
                                  } rounded overflow-hidden ring-1 ring-white/10 bg-black/40`}
                                >
                                  <Image
                                    src={`/api/images/${cardSlug}`}
                                    alt={it.name}
                                    fill
                                    className={`${
                                      isSite
                                        ? "object-cover rotate-90"
                                        : "object-cover"
                                    }`}
                                    sizes="(max-width:640px) 20vw, (max-width:1024px) 15vw, 10vw"
                                    priority={false}
                                  />
                                </div>
                              ) : null}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between">
                                  <div className="min-w-0">
                                    <div
                                      className="font-semibold truncate"
                                      title={it.name}
                                    >
                                      {it.name}
                                    </div>
                                    <div className="opacity-90 text-xs">
                                      {it.rarity}
                                    </div>
                                  </div>
                                  <div className="text-right font-semibold">
                                    x{it.count}
                                  </div>
                                </div>
                                <div className="mt-1 flex items-center flex-wrap gap-2 opacity-90">
                                  <div className="flex items-center gap-2">
                                    {order.map((k) =>
                                      t[k] ? (
                                        <span
                                          key={k}
                                          className="inline-flex items-center gap-1"
                                        >
                                          {Array.from({ length: t[k] }).map(
                                            (_, i) => (
                                              <Image
                                                key={`${k}-${i}`}
                                                src={`/api/assets/${k}.png`}
                                                alt={k}
                                                width={16}
                                                height={16}
                                                className="pointer-events-none select-none"
                                                priority={false}
                                              />
                                            )
                                          )}
                                        </span>
                                      ) : null
                                    )}
                                  </div>
                                  {meta?.cost != null &&
                                    meta.cost > 0 &&
                                    (meta.cost >= 1 && meta.cost <= 9 ? (
                                      <NumberBadge
                                        value={meta.cost as Digit}
                                        size={24}
                                        strokeWidth={6}
                                      />
                                    ) : (
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white text-black text-xs font-bold">
                                        {meta.cost}
                                      </span>
                                    ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Hover Preview Overlay */}
        {hoverPreview && !orbitLocked && (
          <CardPreview card={hoverPreview} anchor="top-left" />
        )}

        {/* Enhanced help overlay */}
        {helpOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-auto">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setHelpOpen(false)}
            />
            <div className="relative bg-slate-900 text-white rounded-lg p-6 w-[min(90vw,720px)] ring-1 ring-white/20 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-semibold">Enhanced Draft Help</div>
                <button
                  onClick={() => setHelpOpen(false)}
                  className="h-8 w-8 grid place-items-center rounded bg-white/10 hover:bg-white/20"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4 text-sm opacity-90">
                <div>
                  <div className="font-medium mb-1 text-yellow-400">
                    ✨ Enhanced Features
                  </div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Advanced hand management with keyboard controls</li>
                    <li>Real-time card preview sharing with other players</li>
                    <li>Automatic card sorting and stack organization</li>
                    <li>Enhanced statistics and threshold tracking</li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1">Picking cards</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Hover cards in your hand to preview (left side)</li>
                    <li>Click or drag cards outward to stage them</li>
                    <li>
                      Press <b>Spacebar</b> or click <b>Pick & Pass</b> to
                      commit
                    </li>
                    <li>Drag staged cards back inside to unstage</li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1">Keyboard controls</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      <b>Left/Right</b>: Browse cards in hand
                    </li>
                    <li>
                      <b>Enter</b>: Stage the focused card
                    </li>
                    <li>
                      <b>Space</b>: Pick & Pass if a card is staged
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-1">Enhanced sorting</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Auto-stack picks by mana cost and type</li>
                    <li>Toggle sorting to manually arrange cards</li>
                    <li>Cards automatically organize for deck building</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced pack choice quick button */}
        {needsPackChoice && (
          <button
            onClick={() => setPackChoiceOverlay(true)}
            className="absolute top-20 right-4 z-30 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
          >
            Choose Pack {draftState.packIndex + 1}
          </button>
        )}

        {/* Video Overlay */}
        <GlobalVideoOverlay
          position="top-right"
          showUserAvatar={true}
          transport={transport}
          myPlayerId={myPlayerId}
          matchId={matchId}
          userDisplayName={me?.displayName || ""}
          userAvatarUrl={undefined} // No avatar URL available yet
          rtc={rtc}
        />
      </div>
    </div>
  );
}
