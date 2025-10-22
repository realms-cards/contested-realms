"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOUSE, TOUCH } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import DraggableCard3D from "@/app/decks/editor-3d/DraggableCard3D";
import { useOnline } from "@/app/online/online-context";
import UserBadge from "@/components/auth/UserBadge";
import CardPreviewOverlay from "@/components/game/CardPreviewOverlay";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import { GlobalVideoOverlay } from "@/components/ui/GlobalVideoOverlay";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import type { SearchResult } from "@/lib/deckEditor/search";
import Board from "@/lib/game/Board";
import type { ApiCardMetaRow } from "@/lib/game/cardMeta";
import { toCardMetaMap, mergeCardMetaMaps } from "@/lib/game/cardMeta";
import {
  categorizeCard,
  computeStackPositions,
  type BoosterCard,
  type CardMeta,
  type Pick3D,
} from "@/lib/game/cardSorting";
import DraftPackHand3D from "@/lib/game/components/DraftPackHand3D";
import MouseTracker from "@/lib/game/components/MouseTracker";
import { CARD_LONG } from "@/lib/game/constants";
import { useDraft3DTransport } from "@/lib/hooks/useDraft3DTransport";
import type { DraftState } from "@/lib/net/transport";
import { useDraft3DSession } from "@/lib/stores/draft-3d-online";
import type { DraftCard } from "@/types/draft";
import { useGameStore } from "@/lib/game/store";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";

const TournamentPresenceOverlay = dynamic(
  () => import("@/components/tournament/TournamentPresenceOverlay"),
  { ssr: false }
);

type DraftParticipant = {
  playerId: string;
  playerName: string;
  seatNumber: number;
  status: string;
};

// Player ready message type
// (player ready messaging omitted in this screen)

interface TournamentDraft3DScreenProps {
  draftSessionId: string;
  tournamentId: string;
  myPlayerId: string;
  mySeatNumber: number;
  participants: DraftParticipant[];
  playerNamesBySeat: Record<number, string>;
  onDraftComplete: (draftedCards: DraftCard[]) => void;
}

export default function TournamentDraft3DScreen({
  draftSessionId,
  tournamentId,
  myPlayerId,
  mySeatNumber,
  participants,
  onDraftComplete,
}: TournamentDraft3DScreenProps) {
  const { transport, me, voice } = useOnline();
  const { updateScreenType } = useVideoOverlay();

  // Server-driven draft state
  const [draftState, setDraftState] = useState<DraftState>({
    phase: "waiting",
    packIndex: 0,
    pickNumber: 1,
    currentPacks: null,
    picks: participants.map(() => []),
    packDirection: "left",
    packChoice: participants.map(() => null),
    waitingFor: [],
  });

  useEffect(() => {
    useGameStore.getState().resetGameState();
  }, []);

  const myPlayerIndex = mySeatNumber - 1; // seatNumber is 1-based, array index is 0-based
  const rtc = voice?.rtc ?? null;

  // Enhanced 3D Draft UI state
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [packChoiceOverlay, setPackChoiceOverlay] = useState(false);
  const [ready, setReady] = useState(false);
  const [usedPacks, setUsedPacks] = useState<number[]>([]);
  const [shownPackOverlayForRound, setShownPackOverlayForRound] = useState<
    number | null
  >(null);
  const [packSequence, setPackSequence] = useState<string[]>([]); // tournament-configured sets per round

  // Enhanced hand and HUD state
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
  const [sortMode, setSortMode] = useState<"mana" | "element">("mana");
  const [metaByCardId, setMetaByCardId] = useState<Record<number, CardMeta>>(
    {}
  );
  const [layoutMetaByCardId, setLayoutMetaByCardId] = useState<
    Record<number, CardMeta>
  >({});
  const [slugToCardId, setSlugToCardId] = useState<Record<string, number>>({});
  // Keep track of an in-flight pick to avoid server poll briefly re-adding the picked card
  const pickInFlightRef = useRef<{
    packIndex: number;
    pickNumber: number;
    cardId: string;
  } | null>(null);
  const pickInFlightSinceRef = useRef<number>(0);

  // Enhanced preview and hover state
  const [hoverPreview, setHoverPreview] = useState<{
    slug: string;
    name: string;
    type: string | null;
  } | null>(null);
  const clearHoverTimerRef = useRef<number | null>(null);
  const currentHoverCardRef = useRef<string | null>(null);
  const lastSentHoverSlugRef = useRef<string | null>(null);
  const lastHoverSentAtRef = useRef<number>(0);
  const hoverSendTimerRef = useRef<number | null>(null);

  // Picks panel state
  const [picksOpen, setPicksOpen] = useState(true);
  const [compactPicks, setCompactPicks] = useState(true);
  const everOutOfWaitingRef = useRef(false);
  const draftStateRef = useRef(draftState);
  useEffect(() => {
    draftStateRef.current = draftState;
  }, [draftState]);
  // Ensure we only handle completion once, even if both polling and socket fire
  const completionHandledRef = useRef(false);
  const pick3DRef = useRef<Pick3D[]>(pick3D);
  useEffect(() => {
    pick3DRef.current = pick3D;
  }, [pick3D]);

  // Join the server room for this tournament draft session to receive real-time updates
  const joinSentRef = useRef(false);
  const joinAckTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    if (!transport || !draftSessionId || joinSentRef.current) return;
    let mounted = true;
    const canSend = () => {
      try {
        const anyT = transport as unknown as {
          isConnected?: () => boolean;
          getConnectionState?: () => string;
        };
        const connected =
          anyT?.isConnected?.() === true ||
          anyT?.getConnectionState?.() === "connected";
        // require a stable player id so server presence doesn't record 'unknown'
        const haveMe = !!me?.id;
        return connected && haveMe;
      } catch {
        return false;
      }
    };
    const handleJoined = (payload: unknown) => {
      const p = payload as { sessionId?: string } | null;
      if (!mounted) return;
      if (p?.sessionId === draftSessionId) {
        joinSentRef.current = true;
        if (joinAckTimeoutRef.current) {
          window.clearTimeout(joinAckTimeoutRef.current);
          joinAckTimeoutRef.current = null;
        }
        // Safety net: if we haven't received a draftUpdate yet and are still "waiting",
        // fetch a snapshot once to advance the UI. This avoids being stuck on the loading overlay
        // in case the join raced with the first broadcast.
        try {
          setTimeout(async () => {
            if (!mounted) return;
            if (draftStateRef.current?.phase !== "waiting") return;
            try {
              const res = await fetch(
                `/api/draft-sessions/${draftSessionId}/state`,
                { cache: "no-store" }
              );
              if (!res.ok) return;
              const data = await res.json();
              if (data?.draftState) {
                setDraftState(data.draftState as DraftState);
              }
            } catch {}
          }, 50);
        } catch {}
      }
    };
    let offJoined: (() => void) | null = null;
    try {
      offJoined = transport.on("draft:session:joined", handleJoined);
    } catch {}

    // Join draft session once - server will respond with draft:session:joined
    const tryJoin = () => {
      if (!mounted || joinSentRef.current) return;
      if (!canSend()) return;
      try {
        console.log(
          "[TournamentDraft3D] Attempting to join draft session:",
          draftSessionId
        );
        transport.emit("draft:session:join", {
          sessionId: draftSessionId,
          playerId: myPlayerId,
          playerName: me?.displayName || "",
          reconnection: false,
        });
        // Set timeout to retry if no response received within 5s
        if (joinAckTimeoutRef.current)
          window.clearTimeout(joinAckTimeoutRef.current);
        joinAckTimeoutRef.current = window.setTimeout(() => {
          if (!joinSentRef.current && mounted) {
            console.warn(
              "[TournamentDraft3D] No join response after 5s, retrying once"
            );
            tryJoin();
          }
        }, 5000);
      } catch (e) {
        console.warn("[TournamentDraft3D] failed to join draft room", e);
      }
    };

    // Wait briefly for transport to be ready, then join once
    const readyCheckId = window.setTimeout(() => {
      if (canSend() && !joinSentRef.current) {
        tryJoin();
      }
    }, 100);

    return () => {
      mounted = false;
      window.clearTimeout(readyCheckId);
      if (joinAckTimeoutRef.current) {
        window.clearTimeout(joinAckTimeoutRef.current);
        joinAckTimeoutRef.current = null;
      }
      if (offJoined) {
        try {
          offJoined();
        } catch {}
      }
      try {
        transport.emit("draft:session:leave", {
          sessionId: draftSessionId,
          playerId: myPlayerId,
        });
      } catch {}
    };
  }, [transport, draftSessionId, myPlayerId, me?.displayName, me?.id]);

  // At the start of each pack/round, show a pack opening overlay when server is in pack_selection.
  useEffect(() => {
    // Show overlay as soon as we enter pack_selection (only once per round)
    if (
      draftState.phase === "pack_selection" &&
      shownPackOverlayForRound !== draftState.packIndex
    ) {
      setPackChoiceOverlay(true);
      setShownPackOverlayForRound(draftState.packIndex);
      return;
    }
    // When server jumps straight to picking for next round, we will auto-choose below; avoid showing overlay here.
  }, [
    draftState.phase,
    draftState.pickNumber,
    draftState.packIndex,
    draftState.currentPacks,
    draftState.waitingFor,
    myPlayerId,
    myPlayerIndex,
    shownPackOverlayForRound,
  ]);

  // Track if we've sent choose-pack for a given round
  const chosenPackForRoundRef = useRef<Set<number>>(new Set());

  // Auto-select pack for this player so the server can distribute packs.
  // Trigger when entering pack_selection OR when the server immediately moves to picking at pick 1 of a new round.
  // Use socket event to keep hot path on the socket server.
  useEffect(() => {
    const round = draftState.packIndex;
    const inPackSelection = draftState.phase === "pack_selection";
    const inNextRoundPicking =
      draftState.phase === "picking" && draftState.pickNumber === 1;
    if (!inPackSelection && !inNextRoundPicking) return;
    if (chosenPackForRoundRef.current.has(round)) return;
    if (!transport) return;
    try {
      transport.emit("chooseTournamentDraftPack", {
        sessionId: draftSessionId,
        packIndex: round,
      });
      // Mark chosen only after successful emit
      chosenPackForRoundRef.current.add(round);
    } catch (err) {
      console.warn("[TournamentDraft3D] choose-pack emit error:", err);
    }
    // If we were already in picking (fallback path), proactively close overlay if open
    if (inNextRoundPicking) {
      setPackChoiceOverlay(false);
    }
  }, [
    draftState.phase,
    draftState.pickNumber,
    draftState.packIndex,
    draftSessionId,
    transport,
  ]);
  const autoPickTimerRef = useRef<number | null>(null);

  // Close the pack overlay as soon as we enter picking
  useEffect(() => {
    if (draftState.phase === "picking" && packChoiceOverlay) {
      setPackChoiceOverlay(false);
    }
  }, [draftState.phase, packChoiceOverlay]);

  // Set screen type for video overlay
  useEffect(() => {
    updateScreenType("draft-3d");
    return undefined;
  }, [updateScreenType]);

  // Note: Presence tracking is handled by TournamentPresenceOverlay component

  // Auto-start draft exactly once per session when everyone is connected
  // Note: Draft auto-start is handled by the tournament system

  // Poll for state only when socket is disconnected and tab is visible
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;
    let isPolling = false; // Prevent concurrent polls

    const shouldPoll = () => {
      try {
        const anyT = transport as unknown as {
          isConnected?: () => boolean;
          getConnectionState?: () => string;
        };
        const connected =
          anyT?.isConnected?.() === true ||
          anyT?.getConnectionState?.() === "connected";
        if (connected) return false;
      } catch {}
      if (draftStateRef.current?.phase === "complete") return false;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return false;
      return true;
    };

    const pollDraftState = async () => {
      if (!mounted || !shouldPoll() || isPolling) return;
      isPolling = true;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
        const res = await fetch(`/api/draft-sessions/${draftSessionId}/state`, {
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) {
          console.warn(`[TournamentDraft3D] Poll failed: ${res.status}`);
          return;
        }
        const data = await res.json();
        if (!mounted) return;
        if (data.draftState) {
          let s = data.draftState as DraftState;
          const inflight = pickInFlightRef.current;
          if (
            inflight &&
            s.phase === "picking" &&
            s.packIndex === inflight.packIndex &&
            s.pickNumber === inflight.pickNumber &&
            Array.isArray(s.currentPacks)
          ) {
            const cp = [...s.currentPacks];
            const seatPack = (cp[myPlayerIndex] || []) as DraftCard[];
            cp[myPlayerIndex] = seatPack.filter(
              (c) => c.id !== inflight.cardId
            );
            const waiting = Array.isArray(s.waitingFor)
              ? s.waitingFor.filter((pid) => pid !== myPlayerId)
              : s.waitingFor;
            s = { ...s, currentPacks: cp, waitingFor: waiting } as DraftState;
          }
          setDraftState(s);
          if (s.phase !== "waiting") everOutOfWaitingRef.current = true;
          if (s.phase === "complete" && !completionHandledRef.current) {
            const mine = (s.picks[myPlayerIndex] || []) as DraftCard[];
            try {
              if (draftSessionId) {
                localStorage.setItem(
                  `draftedCards_${draftSessionId}`,
                  JSON.stringify(mine)
                );
                const resolved: SearchResult[] = mine.map((c) => ({
                  variantId: 0,
                  slug: c.slug,
                  finish: "Standard",
                  product: "Draft",
                  cardId:
                    typeof c.slug === "string" && slugToCardId[c.slug]
                      ? slugToCardId[c.slug]
                      : Number(c.id) || 0,
                  cardName: c.cardName || c.name,
                  set: c.setName || "Beta",
                  type: c.type || null,
                  rarity: (c.rarity as SearchResult["rarity"]) || null,
                }));
                localStorage.setItem(
                  `draftedCardsResolved_${draftSessionId}`,
                  JSON.stringify(resolved)
                );
              }
            } catch (err) {
              console.error(
                "[TournamentDraft3D] Failed to save draft data (poll path):",
                err
              );
            }
            completionHandledRef.current = true;
            setTimeout(() => {
              onDraftComplete(mine);
            }, 600);
          }
        }
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        if (!isAbort) {
          console.error("[TournamentDraft3D] Error polling state:", err);
        }
      } finally {
        isPolling = false;
      }
    };

    const start = () => {
      if (!shouldPoll() || pollInterval) return;
      pollInterval = setInterval(pollDraftState, 5000); // Increased from 2.5s to 5s
      void pollDraftState();
    };
    const stop = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    start();
    const onVis = () => {
      stop();
      start();
    };
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", onVis);
    return () => {
      mounted = false;
      stop();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", onVis);
    };
  }, [
    draftSessionId,
    myPlayerId,
    myPlayerIndex,
    onDraftComplete,
    slugToCardId,
    transport,
  ]);

  // Load tournament packConfiguration to display all booster packs (usually 3)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/draft-sessions/${draftSessionId}`);
        if (!res.ok) return;
        const j = await res.json();
        const cfg = Array.isArray(j?.packConfiguration)
          ? j.packConfiguration
          : [];
        const seq: string[] = [];
        for (const entry of cfg) {
          const setId = typeof entry?.setId === "string" ? entry.setId : "Beta";
          const count = Number(entry?.packCount) || 0;
          for (let i = 0; i < count; i++) seq.push(setId);
        }
        if (mounted) setPackSequence(seq);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [draftSessionId]);

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
      sessionId: draftSessionId,
      playerId: myPlayerId,
      onError: (error) => {
        console.error("[TournamentDraft3D] Transport error:", error);
        setError(String(error));
      },
    });

  // Centralize network sending of hover preview
  useEffect(() => {
    if (!isConnected) return;
    if (!hoverPreview?.slug) return;
    if (hoverSendTimerRef.current) {
      window.clearTimeout(hoverSendTimerRef.current);
      hoverSendTimerRef.current = null;
    }
    const slug = hoverPreview.slug;
    hoverSendTimerRef.current = window.setTimeout(() => {
      const now = performance.now();
      const lastSlug = lastSentHoverSlugRef.current;
      const lastAt = lastHoverSentAtRef.current;
      if (lastSlug !== slug || now - lastAt > 800) {
        sendCardPreview(slug, "hover", { x: 0, y: 0.1, z: -0.5 }, "low");
        lastSentHoverSlugRef.current = slug;
        lastHoverSentAtRef.current = now;
      }
    }, 120);
    return () => {
      if (hoverSendTimerRef.current) {
        window.clearTimeout(hoverSendTimerRef.current);
        hoverSendTimerRef.current = null;
      }
    };
  }, [hoverPreview, isConnected, sendCardPreview]);

  // Keep a stable snapshot of metadata for layout
  useEffect(() => {
    if (!isSortingEnabled) return;
    if (pick3D.length === 0) {
      setLayoutMetaByCardId({});
      return;
    }
    setLayoutMetaByCardId((prev) => {
      const next: Record<number, CardMeta> = { ...prev };
      let changed = false;
      for (const p of pick3D) {
        const id = p.card.cardId;
        if (id && !next[id]) {
          next[id] = metaByCardId[id] ?? {
            cost: 0,
            attack: null,
            defence: null,
            thresholds: null,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pick3D, metaByCardId, isSortingEnabled]);

  // When user toggles sort mode, allow reflow
  useEffect(() => {
    if (!isSortingEnabled) return;
    if (pick3D.length === 0) return;
    setLayoutMetaByCardId((prev) => {
      const next: Record<number, CardMeta> = { ...prev };
      for (const p of pick3D) {
        const id = p.card.cardId;
        const m = metaByCardId[id];
        if (m) next[id] = m;
      }
      return next;
    });
  }, [sortMode, isSortingEnabled, pick3D, metaByCardId]);

  const { joinSession, leaveSession } = useDraft3DSession();

  // Initialize Draft-3D session
  useEffect(() => {
    if (draftSessionId && myPlayerId && transport) {
      joinSession(draftSessionId, myPlayerId);
    }
    return () => {
      leaveSession();
    };
  }, [draftSessionId, myPlayerId, transport, joinSession, leaveSession]);

  // Helper functions for consistent hover management
  const showCardPreview = useCallback(
    (card: { slug: string; name: string; type: string | null }) => {
      if (clearHoverTimerRef.current) {
        window.clearTimeout(clearHoverTimerRef.current);
        clearHoverTimerRef.current = null;
      }
      currentHoverCardRef.current = card.slug;
      setHoverPreview(card);
    },
    []
  );

  const hideCardPreview = useCallback(() => {
    if (clearHoverTimerRef.current) {
      window.clearTimeout(clearHoverTimerRef.current);
    }
    clearHoverTimerRef.current = window.setTimeout(() => {
      currentHoverCardRef.current = null;
      setHoverPreview(null);
      clearHoverTimerRef.current = null;
    }, 1200);
  }, []);

  // Convert DraftCard to BoosterCard format
  const draftCardToBoosterCard = useCallback(
    (card: DraftCard): BoosterCard => {
      const slug = typeof card?.slug === "string" ? card.slug : "";
      let resolvedId = 0;

      // First try slug mapping (this is populated by metadata fetch)
      if (slug) {
        const mapped = slugToCardId[slug];
        if (
          typeof mapped === "number" &&
          Number.isFinite(mapped) &&
          mapped > 0
        ) {
          resolvedId = mapped;
        }
      }

      // Fallback to card.id if available
      if (!resolvedId) {
        const numericId = Number(card?.id);
        if (Number.isFinite(numericId) && numericId > 0) {
          resolvedId = numericId;
        }
      }

      // If still no ID, use 0 - metadata will fix this later
      // DO NOT use fallback hash - it prevents proper metadata lookup

      return {
        variantId: 0,
        slug,
        finish: "Standard" as const,
        product: "Draft",
        rarity:
          (card.rarity as "Ordinary" | "Exceptional" | "Elite" | "Unique") ||
          "Ordinary",
        type: card.type || null,
        cardId: resolvedId,
        cardName: card.cardName || card.name,
        setName: card.setName || "Beta",
      };
    },
    [slugToCardId]
  );

  const PICK_CENTER_POS = { x: 0, z: 0 };
  const PICK_RADIUS = CARD_LONG * 0.6;
  const STAGE_CLICK_POS = useMemo(() => ({ x: 0, z: 1.7 }), []);

  const myPack = useMemo(
    () => (draftState.currentPacks?.[myPlayerIndex] || []) as DraftCard[],
    [draftState.currentPacks, myPlayerIndex]
  );

  // Whether it's my turn to pick according to the server
  const amPicker = useMemo(() => {
    const result =
      draftState.phase === "picking" &&
      draftState.waitingFor.includes(myPlayerId);
    console.log(
      `[TournamentDraft3D] amPicker=${result} phase=${
        draftState.phase
      } waitingFor=${JSON.stringify(
        draftState.waitingFor
      )} myPlayerId=${myPlayerId} myPack.length=${myPack.length}`
    );
    return result;
  }, [draftState.phase, draftState.waitingFor, myPlayerId, myPack.length]);

  // Convert pack to BoosterCard format
  const packAsBoosterCards = useMemo(() => {
    return myPack.map(draftCardToBoosterCard);
  }, [myPack, draftCardToBoosterCard]);

  // Keep a stable snapshot of metadata for layout to avoid jitter when meta arrives later
  useEffect(() => {
    if (!isSortingEnabled) return;
    if (pick3D.length === 0) {
      setLayoutMetaByCardId({});
      return;
    }
    setLayoutMetaByCardId((prev) => {
      const next: Record<number, CardMeta> = { ...prev };
      let changed = false;
      for (const p of pick3D) {
        const id = p.card.cardId;
        if (id && !next[id]) {
          next[id] = metaByCardId[id] ?? {
            cost: 0,
            attack: null,
            defence: null,
            thresholds: null,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pick3D, metaByCardId, isSortingEnabled]);

  // When user toggles sort mode, allow reflow using the best available metadata
  useEffect(() => {
    if (!isSortingEnabled) return;
    if (pick3D.length === 0) return;
    setLayoutMetaByCardId((prev) => {
      const next: Record<number, CardMeta> = { ...prev };
      for (const p of pick3D) {
        const id = p.card.cardId;
        const m = metaByCardId[id];
        if (m) next[id] = m;
      }
      return next;
    });
  }, [sortMode, isSortingEnabled, pick3D, metaByCardId]);

  // Resolve cardIds and metadata by variant slug; request only missing data and dedupe/abort inflight queries
  const inflightMetaAbortRef = useRef<AbortController | null>(null);
  const lastMetaReqKeyRef = useRef<string>("");
  useEffect(() => {
    try {
      const neededBySet = new Map<string | null, Set<string>>();
      const ensureGroup = (setName: string | null) => {
        let group = neededBySet.get(setName);
        if (!group) {
          group = new Set<string>();
          neededBySet.set(setName, group);
        }
        return group;
      };
      const needsMeta = (slug: string): boolean => {
        const mappedId = slugToCardId[slug];
        if (!mappedId || mappedId === 0) return true;
        const m = metaByCardId[mappedId];
        return !m; // fetch only when we truly lack meta
      };

      // Slugs from current pack (my seat) – high priority
      const curPack = (draftState.currentPacks?.[myPlayerIndex] ||
        []) as DraftCard[];
      for (const c of curPack) {
        if (!c?.slug) continue;
        if (!needsMeta(c.slug)) continue;
        const setName = c.setName || null;
        console.log(`[TournamentDraft3D] Need meta for pack card: ${c.slug} (set: ${setName})`);
        ensureGroup(setName).add(c.slug);
      }
      // Slugs from already picked cards – only if meta is still missing
      for (const p of pick3D) {
        const s = p.card.slug;
        if (!s) continue;
        if (!needsMeta(s)) continue;
        const setName = (p.card.setName as string | undefined) || null;
        console.log(`[TournamentDraft3D] Need meta for picked card: ${s} (set: ${setName}, cardId: ${p.card.cardId})`);
        ensureGroup(setName).add(s);
      }

      type MetaByVariantRow = {
        slug: string;
        cardId: number;
        cost: number | null;
        thresholds: Record<string, number> | null;
        attack: number | null;
        defence: number | null;
      };
      // Build request key for dedupe
      const reqEntries: Array<[string | null, string[]]> = [];
      for (const [setName, slugs] of neededBySet.entries()) {
        if (!slugs || slugs.size === 0) continue;
        reqEntries.push([setName, Array.from(slugs).sort()]);
      }
      if (reqEntries.length === 0) {
        console.log("[TournamentDraft3D] No metadata needed, all cards already have meta");
        return;
      }
      const reqKey = JSON.stringify(reqEntries);
      if (reqKey === lastMetaReqKeyRef.current) {
        console.log("[TournamentDraft3D] Metadata request deduped (same as last request)");
        return;
      }
      console.log(`[TournamentDraft3D] Requesting metadata for ${reqEntries.length} set groups:`, reqEntries);
      lastMetaReqKeyRef.current = reqKey;

      // Abort inflight request, if any
      if (inflightMetaAbortRef.current) {
        inflightMetaAbortRef.current.abort();
      }
      const ac = new AbortController();
      inflightMetaAbortRef.current = ac;

      const requests: Promise<MetaByVariantRow[]>[] = [];
      for (const [setName, slugs] of neededBySet.entries()) {
        if (!slugs || slugs.size === 0) continue;
        const params = new URLSearchParams();
        params.set("slugs", Array.from(slugs).join(","));
        if (setName) params.set("set", setName);
        const url = `/api/cards/meta-by-variant?${params.toString()}`;
        console.log(`[TournamentDraft3D] Fetching from: ${url}`);
        requests.push(
          fetch(url, {
            signal: ac.signal,
          })
            .then((r) => {
              console.log(`[TournamentDraft3D] Fetch response status: ${r.status} ${r.statusText}`);
              if (!r.ok) {
                console.error(`[TournamentDraft3D] Fetch failed with status ${r.status}`);
                return [] as MetaByVariantRow[];
              }
              return r.json() as Promise<MetaByVariantRow[]>;
            })
            .catch((err) => {
              const isAbort = (ac.signal && ac.signal.aborted) || (err instanceof Error && err.name === "AbortError");
              if (!isAbort) {
                console.error(`[TournamentDraft3D] Fetch error:`, err);
              }
              return [] as MetaByVariantRow[];
            })
        );
      }

      Promise.all(requests)
        .then((chunks) => {
          if (ac.signal.aborted) return;
          const rows = chunks.flat();
          console.log(`[TournamentDraft3D] Metadata fetch completed: ${rows.length} rows returned`);
          if (!rows || rows.length === 0) {
            console.warn("[TournamentDraft3D] No metadata rows returned from API");
            return;
          }
          const newSlugMap: Record<string, number> = {};
          const metaRows: ApiCardMetaRow[] = rows.map((r: MetaByVariantRow) => {
            newSlugMap[r.slug] = Number(r.cardId) || 0;
            console.log(`[TournamentDraft3D] Mapping ${r.slug} -> cardId ${r.cardId}, cost: ${r.cost}, atk/def: ${r.attack}/${r.defence}`);
            return {
              cardId: Number(r.cardId) || 0,
              cost: r.cost ?? null,
              thresholds:
                (r.thresholds as Record<string, number> | null) ?? null,
              attack: r.attack ?? null,
              defence: r.defence ?? null,
            } satisfies ApiCardMetaRow;
          });

          // Update slug->cardId map
          setSlugToCardId((prev) => {
            const updated = { ...prev, ...newSlugMap };
            console.log(`[TournamentDraft3D] Updated slugToCardId map, now has ${Object.keys(updated).length} entries`);
            return updated;
          });

          // Merge metadata
          const incoming = toCardMetaMap(metaRows);
          setMetaByCardId((prev) => {
            const merged = mergeCardMetaMaps(prev, incoming);
            console.log(`[TournamentDraft3D] Merged metadata, now has ${Object.keys(merged).length} cardIds with meta`);
            return merged;
          });

          // Patch existing picks with resolved cardIds if needed and collect id changes
          const idChanges: Array<{ oldId: number; newId: number }> = [];
          setPick3D((prev) =>
            prev.map((p) => {
              const mapped = newSlugMap[p.card.slug];
              if (mapped && p.card.cardId !== mapped) {
                idChanges.push({ oldId: p.card.cardId, newId: mapped });
                return { ...p, card: { ...p.card, cardId: mapped } };
              }
              return p;
            })
          );

          // Re-key layout metadata to follow new cardIds to avoid jitter
          if (idChanges.length > 0) {
            setLayoutMetaByCardId((prev) => {
              const next = { ...prev } as Record<number, CardMeta>;
              for (const { oldId, newId } of idChanges) {
                if (oldId && newId && next[oldId] && !next[newId]) {
                  next[newId] = next[oldId];
                }
                delete next[oldId];
              }
              // Apply freshest incoming meta when available
              for (const { newId } of idChanges) {
                if (incoming[newId]) next[newId] = incoming[newId];
              }
              return next;
            });
          }
        })
        .catch(() => {});
    } catch {}
    return () => {
      if (inflightMetaAbortRef.current) {
        inflightMetaAbortRef.current.abort();
      }
    };
  }, [
    draftState.currentPacks,
    myPlayerIndex,
    pick3D,
    slugToCardId,
    metaByCardId,
  ]);

  // When server (via polling) indicates it's our turn again, clear local ready guard
  useEffect(() => {
    if (draftState.phase !== "picking") return;
    if (draftState.waitingFor.includes(myPlayerId)) {
      setReady(false);
    }
  }, [draftState.phase, draftState.waitingFor, myPlayerId]);

  // Rebuild/augment local pick3D from server state picks so reload continues seamlessly
  useEffect(() => {
    if (!Array.isArray(draftState.picks)) return;
    const serverSeatPicks = (draftState.picks[myPlayerIndex] ||
      []) as DraftCard[];
    if (serverSeatPicks.length === 0) return;

    // Count local picks by slug
    const localCounts = new Map<string, number>();
    for (const p of pick3D) {
      const s = p.card.slug;
      localCounts.set(s, (localCounts.get(s) ?? 0) + 1);
    }

    // Determine missing picks compared to server
    const serverSeen = new Map<string, number>();
    const toAppend: DraftCard[] = [];
    for (const c of serverSeatPicks) {
      const s = c.slug;
      const curr = serverSeen.get(s) ?? 0;
      serverSeen.set(s, curr + 1);
      const have = localCounts.get(s) ?? 0;
      if ((serverSeen.get(s) ?? 0) > have) {
        toAppend.push(c);
      }
    }

    if (toAppend.length === 0) return;

    // Append missing picks with default positions (they will be stacked/sorted later)
    setPick3D((prev) => {
      const startId = nextPickId;
      const added: Pick3D[] = toAppend.map((c, idx) => ({
        id: startId + idx,
        card: draftCardToBoosterCard(c),
        x: (idx % 6) * 0.35 - 1.05,
        z: -1.4 - Math.floor(idx / 6) * 0.35,
        zone: "Deck",
      }));
      return [...prev, ...added];
    });
    setNextPickId((n) => n + toAppend.length);
  }, [
    draftState.picks,
    myPlayerIndex,
    pick3D,
    nextPickId,
    draftCardToBoosterCard,
  ]);

  // Listen for server draft updates (this would come from tournament draft socket events)
  useEffect(() => {
    if (!transport) return;

    const handleDraftUpdate = (state: unknown) => {
      const s = state as DraftState & { _seq?: number };
      if (s?.phase && s.phase !== "waiting") {
        everOutOfWaitingRef.current = true;
      }

      // Reject out-of-order updates using sequence number (pack*1000 + pick)
      const currentSeq = (Number(draftStateRef.current?.packIndex) || 0) * 1000 +
                         (Number(draftStateRef.current?.pickNumber) || 0);
      const newSeq = (Number(s.packIndex) || 0) * 1000 + (Number(s.pickNumber) || 0);

      if (draftStateRef.current?.phase === "picking" && s.phase === "picking" && newSeq < currentSeq) {
        console.warn(`[TournamentDraft3D] Rejecting out-of-order update: currentSeq=${currentSeq} newSeq=${newSeq} (pack ${s.packIndex} pick ${s.pickNumber})`);
        return;
      }

      const inflight = pickInFlightRef.current;

      // Check if server has confirmed our pick before accepting the update
      if (inflight) {
        const sameRound =
          s.phase === "picking" &&
          Number(s.packIndex) === Number(inflight.packIndex) &&
          Number(s.pickNumber) === Number(inflight.pickNumber);

        if (sameRound) {
          const seatCandidate = Array.isArray(s.currentPacks)
            ? s.currentPacks[myPlayerIndex]
            : null;
          const mySeatPack = Array.isArray(seatCandidate)
            ? (seatCandidate as DraftCard[])
            : [];
          const stillHasCard = mySeatPack.some((c) => c && c.id === inflight.cardId);
          const iAmWaiting = Array.isArray(s.waitingFor) && s.waitingFor.includes(myPlayerId);

          // If server still has our card and we're still waiting, the pick wasn't processed
          if (stillHasCard && iAmWaiting) {
            const timeSincePick = Date.now() - pickInFlightSinceRef.current;
            if (timeSincePick < 2000) {
              // Too soon - this is likely a stale broadcast racing with our pick
              console.log(`[TournamentDraft3D] Ignoring stale pre-pick update (${timeSincePick}ms old)`);
              return;
            } else {
              // Too long - pick might have been lost, re-emit once
              console.warn(`[TournamentDraft3D] Pick not confirmed after ${timeSincePick}ms, re-emitting`);
              try {
                transport?.emit("makeTournamentDraftPick", {
                  sessionId: draftSessionId,
                  cardId: inflight.cardId,
                });
                pickInFlightSinceRef.current = Date.now(); // Reset timer
              } catch (err) {
                console.error("[TournamentDraft3D] Re-emit failed:", err);
              }
              return; // Don't update state yet, wait for confirmation
            }
          }
        }
      }

      setDraftState(s);
      console.log(
        `[TournamentDraft3D] draftUpdate: phase=${s.phase} pack=${s.packIndex} pick=${s.pickNumber}`
      );

      // Clear in-flight pick marker after accepting server update
      if (inflight) {
        console.log(`[TournamentDraft3D] Clearing in-flight pick marker`);
        pickInFlightRef.current = null;
        pickInFlightSinceRef.current = 0;
      }

      // Only clear staged/ready when transitioning INTO picking phase (not on every picking update)
      if (s.phase === "picking" && draftStateRef.current?.phase !== "picking") {
        setStaged(null);
        setReady(false);
      }

      if (s.phase === "complete" && !completionHandledRef.current) {
        const mine = (s.picks[myPlayerIndex] || []) as DraftCard[];
        console.log(
          `[TournamentDraft3D] Draft complete! Picked ${mine.length} cards`
        );

        try {
          if (draftSessionId) {
            const storageSuffix = myPlayerId
              ? `${draftSessionId}_${myPlayerId}`
              : draftSessionId;
            localStorage.setItem(
              `draftedCards_${storageSuffix}`,
              JSON.stringify(mine)
            );
            if (myPlayerId) {
              localStorage.setItem(
                `draftedCards_${draftSessionId}`,
                JSON.stringify(mine)
              );
            }
            const resolved: SearchResult[] = mine.map((c) => ({
              variantId: 0,
              slug: c.slug,
              finish: "Standard",
              product: "Draft",
              cardId:
                typeof c.slug === "string" && slugToCardId[c.slug]
                  ? slugToCardId[c.slug]
                  : Number(c.id) || 0,
              cardName: c.cardName || c.name,
              set: c.setName || "Beta",
              type: c.type || null,
              rarity: (c.rarity as SearchResult["rarity"]) || null,
            }));
            localStorage.setItem(
              `draftedCardsResolved_${storageSuffix}`,
              JSON.stringify(resolved)
            );
            if (myPlayerId) {
              localStorage.setItem(
                `draftedCardsResolved_${draftSessionId}`,
                JSON.stringify(resolved)
              );
            }
          }
        } catch (err) {
          console.error(`[TournamentDraft3D] Failed to save draft data:`, err);
        }

        completionHandledRef.current = true;
        console.log(`[TournamentDraft3D] Calling onDraftComplete callback...`);
        setTimeout(() => {
          onDraftComplete(mine);
        }, 600);
      }
    };

    const offDraft = transport.on("draftUpdate", handleDraftUpdate);

    return () => {
      try {
        offDraft();
      } catch (err) {
        console.warn("Error cleaning up transport listeners:", err);
      }
    };
  }, [
    transport,
    myPlayerIndex,
    onDraftComplete,
    draftSessionId,
    slugToCardId,
    myPlayerId,
  ]);

  // Metadata is now fetched by the slug-based effect above (lines 763-943)
  // which runs for both current pack AND picked cards, and properly handles
  // cardId resolution via slug mapping. This duplicate cardId-based fetch
  // was causing metadata to be cleared on reload when picks had cardId=0.

  // Enhanced Pick & Pass with staging mechanics
  const commitPickAndPass = useCallback(
    (cardIdx: number, wx: number, wz: number) => {
      if (!amPicker) return;
      if (pickInFlightRef.current) return;

      const card = myPack[cardIdx];
      if (!card) return;

      console.log(`[TournamentDraft3D] commitPickAndPass -> cardId=${card.id}`);

      setReady(true);

      // Add picked card to 3D board display immediately
      const boosterCard = draftCardToBoosterCard(card);
      console.log(`[TournamentDraft3D] Adding pick: slug=${boosterCard.slug} cardId=${boosterCard.cardId} type=${boosterCard.type} cardName=${boosterCard.cardName}`);
      const optimisticPickId = nextPickId;
      const newPick: Pick3D = {
        id: optimisticPickId,
        card: boosterCard,
        x: wx,
        z: wz,
        zone: wz < 0 ? "Deck" : "Sideboard",
      };
      setPick3D((prev) => [...prev, newPick]);
      setNextPickId((prev) => prev + 1);
      const revertOptimisticPick = () => {
        setPick3D((prev) => prev.filter((p) => p.id !== optimisticPickId));
      };

      // Optimistically remove the picked card from our local pack and remove us from waitingFor
      setDraftState((prev) => {
        if (prev.phase !== "picking") return prev;
        const packs = Array.isArray(prev.currentPacks)
          ? [...prev.currentPacks]
          : prev.currentPacks;
        if (Array.isArray(packs)) {
          const seatPack = (packs[myPlayerIndex] || []) as DraftCard[];
          packs[myPlayerIndex] = seatPack.filter((c) => c.id !== card.id);
        }
        const waiting = Array.isArray(prev.waitingFor)
          ? prev.waitingFor.filter((pid) => pid !== myPlayerId)
          : prev.waitingFor;
        return { ...prev, currentPacks: packs, waitingFor: waiting };
      });

      // Mark in-flight pick so poll reconciliation hides this card locally until server confirms
      pickInFlightRef.current = {
        packIndex: draftState.packIndex,
        pickNumber: draftState.pickNumber,
        cardId: card.id,
      };
      pickInFlightSinceRef.current = Date.now();

      // Send stack interaction for enhanced multiplayer feedback
      sendStackInteraction("pick", [card.id], "current-pack", "picked-cards", {
        targetPosition: { x: wx, y: 0.1, z: wz },
        userInitiated: true,
        hasAnimation: true,
      });

      // Use socket event (same pattern as lobby drafts) instead of HTTP fetch
      try {
        if (!transport) {
          console.error("[TournamentDraft3D] No transport available for pick");
          revertOptimisticPick();
          setReady(false);
          pickInFlightRef.current = null;
          return;
        }

        // Emit socket event - server will handle via makeTournamentDraftPick handler
        transport.emit("makeTournamentDraftPick", {
          sessionId: draftSessionId,
          cardId: card.id,
        });
        console.log(
          `[TournamentDraft3D] Emitted makeTournamentDraftPick: session=${draftSessionId} cardId=${card.id}`
        );
        // Pick will be acknowledged via socket broadcast (draftUpdate event)
        // pickInFlightRef will be cleared when we receive the draftUpdate
      } catch (err) {
        console.error("[TournamentDraft3D] Socket emit error:", err);
        revertOptimisticPick();
        setReady(false);
        pickInFlightRef.current = null;
      }

      // Clear staged state
      setStaged(null);
      setReadyIdx(null);
      setSelectedRowIndex(null);
    },
    [
      amPicker,
      myPack,
      draftCardToBoosterCard,
      nextPickId,
      sendStackInteraction,
      draftState,
      draftSessionId,
      myPlayerId,
      myPlayerIndex,
      transport,
    ]
  );

  // Calculate stats
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

  // (threshold summary not displayed in this screen)

  const picksByType = useMemo(() => {
    const counts = { creatures: 0, spells: 0, sites: 0, avatars: 0 };
    console.log(`[TournamentDraft3D] Calculating picksByType for ${pick3D.length} picks, metaByCardId has ${Object.keys(metaByCardId).length} entries`);
    for (const pick of pick3D) {
      const meta = metaByCardId[pick.card.cardId];
      const category = categorizeCard(pick.card, meta);
      console.log(`[TournamentDraft3D] Pick ${pick.card.slug} (cardId ${pick.card.cardId}): meta=${meta ? `cost:${meta.cost} atk:${meta.attack} def:${meta.defence}` : 'NO META'} -> category: ${category}`);
      counts[category as keyof typeof counts]++;
    }
    console.log(`[TournamentDraft3D] Final counts:`, counts);
    return counts;
  }, [pick3D, metaByCardId]);

  // Create sorted stack positions using the editor-3d utility and frozen layout meta
  // Treat all picks as Deck to match editor-3d stacking behavior
  const stackPositions = useMemo(() => {
    if (!isSortingEnabled) return null;
    return computeStackPositions(
      pick3D,
      layoutMetaByCardId,
      isSortingEnabled,
      true,
      { sortMode }
    );
  }, [pick3D, isSortingEnabled, layoutMetaByCardId, sortMode]);

  // Calculate stack sizes for hitbox optimization
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

  // Spacebar Pick & Pass
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (draftState.phase !== "picking") return;
      if (!amPicker) return;
      if (ready) return;
      if (e.code !== "Space") return;
      const ae = document.activeElement as HTMLElement | null;
      const isTyping =
        ae &&
        (ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          ae.isContentEditable);
      if (isTyping) return;

      e.preventDefault();
      e.stopPropagation();

      if (staged) {
        commitPickAndPass(staged.idx, staged.x, staged.z);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [draftState.phase, amPicker, staged, commitPickAndPass, ready]);

  // Auto-pick the last remaining card in pack when it's our turn
  useEffect(() => {
    if (draftState.phase !== "picking") return;
    if (!amPicker) return;
    if (packChoiceOverlay) return;
    if (ready) return;
    const myP = myPack;
    if (staged || !Array.isArray(myP)) return;
    if (myP.length !== 1) return;
    if (autoPickTimerRef.current) {
      window.clearTimeout(autoPickTimerRef.current);
      autoPickTimerRef.current = null;
    }
    autoPickTimerRef.current = window.setTimeout(() => {
      // pick the sole card
      commitPickAndPass(0, STAGE_CLICK_POS.x, STAGE_CLICK_POS.z);
      if (autoPickTimerRef.current) {
        window.clearTimeout(autoPickTimerRef.current);
      }
      autoPickTimerRef.current = null;
    }, 5_000);
    return () => {
      if (autoPickTimerRef.current) {
        window.clearTimeout(autoPickTimerRef.current);
        autoPickTimerRef.current = null;
      }
    };
  }, [
    draftState.phase,
    amPicker,
    myPack,
    staged,
    packChoiceOverlay,
    ready,
    commitPickAndPass,
    STAGE_CLICK_POS,
  ]);

  // Skip the waiting phase - show draft UI with loading overlay
  const showLoadingOverlay =
    draftState.phase === "waiting" && packAsBoosterCards.length === 0;

  // Monitor WebGL context loss and automatically restore
  useEffect(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      console.warn(
        "[TournamentDraft3D] WebGL context lost - attempting recovery"
      );
    };

    const handleContextRestored = () => {
      console.log("[TournamentDraft3D] WebGL context restored successfully");
      // Force re-render to reload textures
      window.location.reload();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, []);

  // Main 3D draft UI (similar to EnhancedOnlineDraft3DScreen but adapted)
  return (
    <div className="fixed inset-0 w-screen h-screen">
      <div className="absolute inset-0 w-full h-full">
        <Canvas
          camera={{ position: [0, 10, 0], fov: 50 }}
          shadows
          gl={{
            preserveDrawingBuffer: false,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
            failIfMajorPerformanceCaveat: false,
          }}
          frameloop="always"
        >
          <color attach="background" args={["#0b0b0c"]} />
          <ambientLight intensity={0.8} />
          <directionalLight
            position={[10, 12, 8]}
            intensity={1.35}
            castShadow
          />

          <Physics gravity={[0, -9.81, 0]}>
            <Board noRaycast={true} interactionMode="spectator" />
          </Physics>

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

          {/* Draft Pack Hand */}
          {draftState.phase !== "complete" &&
            !packChoiceOverlay &&
            packAsBoosterCards.length > 0 && (
              <DraftPackHand3D
                cards={packAsBoosterCards}
                disabled={!amPicker || ready}
                allowHoverWhenDisabled={!amPicker}
                opacity={!amPicker || ready ? 0.6 : 1.0}
                hiddenIndex={staged?.idx ?? null}
                onDragChange={setOrbitLocked}
                getTopRenderOrder={getTopRenderOrder}
                transitionEnabled
                transitionKey={`${draftState.packIndex}:${draftState.pickNumber}`}
                passDirection={
                  draftState.packDirection === "right" ? "right" : "left"
                }
                transitionDurationMs={480}
                onHoverInfo={(info) => {
                  if (info) {
                    showCardPreview(info);
                  } else {
                    hideCardPreview();
                  }
                }}
                onDragMove={(idx, wx, wz) => {
                  if (!amPicker || ready) return;
                  const d = Math.hypot(
                    wx - PICK_CENTER_POS.x,
                    wz - PICK_CENTER_POS.z
                  );
                  if (d > PICK_RADIUS) setReadyIdx(idx);
                  else if (readyIdx === idx) setReadyIdx(null);
                }}
                onRelease={(idx, wx, wz) => {
                  if (!amPicker || ready) return;

                  const d = Math.hypot(
                    wx - PICK_CENTER_POS.x,
                    wz - PICK_CENTER_POS.z
                  );
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
                  if (ready) return;
                  setSelectedRowIndex(idx);
                  if (idx != null) {
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

          {/* Staged card */}
          {staged && packAsBoosterCards[staged.idx] && (
            <DraggableCard3D
              key={`staged-${draftState.packIndex}-${draftState.pickNumber}-${staged.idx}`}
              slug={packAsBoosterCards[staged.idx]?.slug || ""}
              isSite={(packAsBoosterCards[staged.idx]?.type || "")
                .toLowerCase()
                .includes("site")}
              x={staged.x}
              z={staged.z}
              cardId={packAsBoosterCards[staged.idx]?.cardId}
              cardName={
                packAsBoosterCards[staged.idx]?.cardName ??
                packAsBoosterCards[staged.idx]?.slug ??
                ""
              }
              cardType={packAsBoosterCards[staged.idx]?.type ?? null}
              onDrop={(wx, wz) => {
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
              onHoverStart={(preview) => {
                if (!preview || orbitLocked) return;
                showCardPreview(preview);
              }}
              onHoverEnd={() => {
                hideCardPreview();
              }}
              onRelease={(wx, wz) => {
                if (!amPicker || ready) return;
                const d = Math.hypot(
                  wx - PICK_CENTER_POS.x,
                  wz - PICK_CENTER_POS.z
                );
                if (d <= PICK_RADIUS) {
                  setStaged(null);
                  hideCardPreview();
                }
              }}
            />
          )}

          {/* Picked cards */}
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
                    cardId={p.id}
                    cardName={p.card.cardName ?? p.card.slug}
                    cardType={p.card.type ?? null}
                    y={y}
                    baseRenderOrder={baseRO}
                    stackIndex={stackIndex}
                    totalInStack={totalInStack}
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
                    onHoverStart={(preview) => {
                      if (!preview || orbitLocked) return;
                      showCardPreview(preview);
                    }}
                    onHoverEnd={() => {
                      hideCardPreview();
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
            minDistance={2}
            maxDistance={28}
            minPolarAngle={0.05}
            maxPolarAngle={0.35}
            mouseButtons={{
              LEFT: MOUSE.ROTATE,
              MIDDLE: MOUSE.PAN,
              RIGHT: MOUSE.ROTATE,
            }}
            touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.PAN }}
          />
          <ClampOrbitTarget bounds={{ minX: -8, maxX: 8, minZ: -6, maxZ: 6 }} />
          <KeyboardPanControls enabled={!orbitLocked} />
        </Canvas>
      </div>

      {/* Presence overlay - positioned outside pointer-events-none for hover to work */}
      <TournamentPresenceOverlay
        tournamentId={tournamentId}
        draftSessionId={draftSessionId}
        position="top-left"
      />

      {/* Overlays */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        <UserBadge variant="floating" />
        <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-end gap-4 pointer-events-auto select-none relative">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-fantaisie text-white">
              Tournament Draft
            </div>
            {pick3D.length > 0 && (
              <div className="flex items-center gap-2 ml-2 pointer-events-auto">
                <button
                  onClick={() => setIsSortingEnabled(!isSortingEnabled)}
                  title={
                    isSortingEnabled
                      ? "Disable auto-stacking"
                      : "Enable auto-stacking"
                  }
                  className={`text-xs px-2 py-1 rounded ring-1 transition ${
                    isSortingEnabled
                      ? "bg-emerald-500 text-black ring-emerald-400 hover:bg-emerald-400"
                      : "bg-white/15 text-white ring-white/30 hover:bg-white/25"
                  }`}
                >
                  {isSortingEnabled ? "Auto-stack: On" : "Auto-stack: Off"}
                </button>
                {isSortingEnabled && (
                  <button
                    onClick={() =>
                      setSortMode((m) => (m === "mana" ? "element" : "mana"))
                    }
                    title={
                      sortMode === "mana"
                        ? "Group by element thresholds"
                        : "Group by mana cost"
                    }
                    className={`text-xs px-2 py-1 rounded ring-1 transition ${
                      sortMode === "mana"
                        ? "bg-white/15 text-white ring-white/30 hover:bg-white/25"
                        : "bg-indigo-500 text-black ring-indigo-400 hover:bg-indigo-400"
                    }`}
                  >
                    {sortMode === "mana" ? "Sort: Mana" : "Sort: Element"}
                  </button>
                )}
              </div>
            )}
          </div>

          {draftState.phase !== "complete" && (
            <div className="absolute left-1/2 -translate-x-1/2 top-12 z-[55] pointer-events-auto text-center">
              {staged && (
                <button
                  onClick={() =>
                    commitPickAndPass(staged.idx, staged.x, staged.z)
                  }
                  disabled={!amPicker || ready}
                  className="h-10 px-4 rounded border border-emerald-500 text-emerald-400 font-semibold disabled:opacity-50 bg-transparent hover:text-emerald-300 hover:border-emerald-400"
                >
                  Pick & Pass:{" "}
                  <span className="font-fantaisie text-lg md:text-xl">
                    {packAsBoosterCards[staged.idx]?.cardName ?? "Card"}
                  </span>
                </button>
              )}
              <div className="mt-1 text-[11px] text-white/40 pointer-events-none">
                Pack {draftState.packIndex + 1} • Pick {draftState.pickNumber}
              </div>
              {draftState.phase === "picking" &&
                draftState.waitingFor.length > 0 && (
                  <div className="mt-0.5 text-[11px] text-white/50 pointer-events-none">
                    {amPicker ? (
                      <>Your turn to pick & pass…</>
                    ) : (
                      <>
                        Waiting for {draftState.waitingFor.length} player
                        {draftState.waitingFor.length === 1 ? "" : "s"} to pick
                        & pass…
                      </>
                    )}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Picks panel */}
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

                {pick3D.length > 0 && (
                  <div className="mb-2 text-[11px] text-white/90 flex flex-wrap items-center gap-3 pointer-events-auto">
                    <div className="flex items-center gap-2">
                      <span className="opacity-80">Types:</span>
                      <span>C {picksByType.creatures}</span>
                      <span>S {picksByType.spells}</span>
                      <span>Sites {picksByType.sites}</span>
                    </div>
                  </div>
                )}

                {picksOpen && (
                  <div className="max-h-[52vh] overflow-auto pr-2 grid gap-2 text-xs pointer-events-auto">
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
                                type: null,
                              });
                            }
                          }}
                          onMouseLeave={() => {
                            hideCardPreview();
                          }}
                        >
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
                                            style={{
                                              width: "auto",
                                              height: "auto",
                                            }}
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {hoverPreview && !orbitLocked && (
          <CardPreviewOverlay card={hoverPreview} anchor="top-left" />
        )}

        {/* Loading overlay for waiting phase */}
        {showLoadingOverlay && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-slate-900/95 rounded-xl p-8 ring-1 ring-white/20 text-white text-center">
              <h2 className="text-2xl font-bold">Loading Draft Interface</h2>
              <div className="mt-4 flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
              </div>
            </div>
          </div>
        )}

        {/* Pack opening overlay (UI-only gating, tournament sets are preconfigured per round) */}
        {packChoiceOverlay && draftState.phase !== "complete" && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto select-none">
            <div className="rounded-xl p-6 bg-black/80 ring-1 ring-white/30 text-white w-[min(92vw,900px)] shadow-2xl select-none">
              <div className="text-lg font-semibold mb-3 text-center">
                Choose a pack to open (Round {draftState.packIndex + 1})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(packSequence.length > 0
                  ? packSequence
                  : ["Booster", "Booster", "Booster"]
                ).map((setName, packIdx) => {
                  const s = (setName || "").toLowerCase();
                  const assetName = s.includes("arthur")
                    ? "arthurian-booster.png"
                    : "alphabeta-booster.png";
                  const isAlreadyUsed =
                    usedPacks.includes(packIdx) ||
                    packIdx < draftState.packIndex;
                  const isUpcoming = packIdx > draftState.packIndex;
                  return (
                    <div
                      key={`pack-${packIdx}`}
                      className={`group rounded-lg p-3 bg-black/60 ring-1 ring-white/25 text-left select-none ${
                        isAlreadyUsed ? "opacity-50" : ""
                      }`}
                    >
                      <div className="relative w-full h-44 md:h-56 rounded-md overflow-hidden ring-1 ring-white/15 bg-black/40 group-hover:ring-white/30">
                        <Image
                          src={`/api/assets/${assetName}`}
                          alt={`${setName} booster pack`}
                          fill
                          sizes="(max-width:640px) 80vw, (max-width:1024px) 30vw, 25vw"
                          className="object-contain"
                          priority
                          unoptimized
                        />
                        <div className="absolute bottom-1 left-1 right-1 text-[11px] px-2 py-1 rounded bg-black/60 text-white text-center pointer-events-none">
                          {setName}
                        </div>
                        {isAlreadyUsed && (
                          <div className="absolute top-1 right-1 text-[10px] px-2 py-0.5 rounded bg-emerald-600/80">
                            Opened
                          </div>
                        )}
                        {isUpcoming && (
                          <div className="absolute top-1 right-1 text-[10px] px-2 py-0.5 rounded bg-slate-600/80">
                            Upcoming
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex justify-center">
                        <button
                          onClick={async () => {
                            if (isAlreadyUsed) return;
                            // Optimistic UI: mark opened and close overlay immediately for instant feedback
                            setUsedPacks((prev) =>
                              prev.includes(packIdx) ? prev : [...prev, packIdx]
                            );
                            try {
                              chosenPackForRoundRef.current.add(
                                draftState.packIndex
                              );
                            } catch {}
                            setPackChoiceOverlay(false);
                            try {
                              const res = await fetch(
                                `/api/draft-sessions/${draftSessionId}/choose-pack`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    packIndex: packIdx,
                                    setChoice: setName,
                                  }),
                                }
                              );
                              if (!res.ok) {
                                // Revert optimistic UI on failure and reopen overlay
                                setUsedPacks((prev) =>
                                  prev.filter((i) => i !== packIdx)
                                );
                                try {
                                  chosenPackForRoundRef.current.delete(
                                    draftState.packIndex
                                  );
                                } catch {}
                                setPackChoiceOverlay(true);
                              }
                            } catch (e) {
                              console.warn(
                                "[TournamentDraft3D] choose-pack failed",
                                e
                              );
                              // Network failure: revert optimistic UI and reopen overlay
                              setUsedPacks((prev) =>
                                prev.filter((i) => i !== packIdx)
                              );
                              try {
                                chosenPackForRoundRef.current.delete(
                                  draftState.packIndex
                                );
                              } catch {}
                              setPackChoiceOverlay(true);
                            }
                          }}
                          disabled={isAlreadyUsed}
                          className={`px-4 py-2 rounded-lg font-semibold transition-colors select-none ${
                            !isAlreadyUsed
                              ? "bg-purple-600 hover:bg-purple-700 text-white"
                              : "bg-slate-700 text-slate-300 cursor-not-allowed"
                          }`}
                        >
                          {!isAlreadyUsed ? "Open Pack" : "Opened"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <GlobalVideoOverlay
          position="top-right"
          showUserAvatar={false}
          transport={transport}
          myPlayerId={myPlayerId}
          matchId={draftSessionId}
          userDisplayName={me?.displayName || ""}
          userAvatarUrl={undefined}
          rtc={rtc}
        />
      </div>
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
  }, [bounds.maxX, bounds.maxZ, bounds.minX, bounds.minZ, camera, controls, invalidate]);

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
