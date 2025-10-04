"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOUSE } from "three";
import DraggableCard3D from "@/app/decks/editor-3d/DraggableCard3D";
import { useOnline } from "@/app/online/online-context";
import UserBadge from "@/components/auth/UserBadge";
import CardPreview from "@/components/game/CardPreview";
import { NumberBadge } from "@/components/game/manacost";
import type { Digit } from "@/components/game/manacost";
import { GlobalVideoOverlay } from "@/components/ui/GlobalVideoOverlay";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import type { SearchResult } from "@/lib/deckEditor/search";
import Board from "@/lib/game/Board";
import type { ApiCardMetaRow } from "@/lib/game/cardMeta";
import { toCardMetaMap } from "@/lib/game/cardMeta";
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

// Card shape used by tournament draft
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

  const myPlayerIndex = mySeatNumber - 1; // seatNumber is 1-based, array index is 0-based
  const rtc = voice?.rtc ?? null;

  // Enhanced 3D Draft UI state
  const [orbitLocked, setOrbitLocked] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [packChoiceOverlay, setPackChoiceOverlay] = useState(false);
  const [ready, setReady] = useState(false);
  const [usedPacks, setUsedPacks] = useState<number[]>([]);
  const [shownPackOverlayForRound, setShownPackOverlayForRound] = useState<number | null>(null);
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
  const [isSortingEnabled] = useState(true);
  const [sortMode] = useState<"mana" | "element">("mana");
  const [metaByCardId, setMetaByCardId] = useState<Record<number, CardMeta>>({});
  const [layoutMetaByCardId, setLayoutMetaByCardId] = useState<Record<number, CardMeta>>({});
  const [slugToCardId] = useState<Record<string, number>>({});
  // Keep track of an in-flight pick to avoid server poll briefly re-adding the picked card
  const pickInFlightRef = useRef<{ packIndex: number; pickNumber: number; cardId: string } | null>(null);

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

  // At the start of each pack/round, show a pack opening overlay. Prefer explicit pack_selection phase.
  useEffect(() => {
    // Show overlay as soon as we enter pack_selection (only once per round)
    if (draftState.phase === "pack_selection" && shownPackOverlayForRound !== draftState.packIndex) {
      setPackChoiceOverlay(true);
      setShownPackOverlayForRound(draftState.packIndex);
      return;
    }
    // Fallback: if we somehow enter picking at pick 1 and haven't shown overlay yet, gate once
    if (draftState.phase === "picking" && draftState.pickNumber === 1) {
      const amPickerNow = draftState.waitingFor.includes(myPlayerId);
      if (!amPickerNow) return;
      if (shownPackOverlayForRound === draftState.packIndex) return;
      const myRoundPack = (draftState.currentPacks?.[myPlayerIndex] || []) as DraftCard[];
      if (!Array.isArray(myRoundPack) || myRoundPack.length === 0) return;
      setPackChoiceOverlay(true);
      setShownPackOverlayForRound(draftState.packIndex);
      return;
    }
  }, [draftState.phase, draftState.pickNumber, draftState.packIndex, draftState.currentPacks, draftState.waitingFor, myPlayerId, myPlayerIndex, shownPackOverlayForRound]);

  // Track if we've sent choose-pack for a given round
  const chosenPackForRoundRef = useRef<Set<number>>(new Set());

  // Auto-select pack for this player when entering pack_selection so the server can distribute packs.
  // Server will auto-finalize remaining seats and ensure uniqueness per round.
  useEffect(() => {
    if (draftState.phase !== "pack_selection") return;
    const round = draftState.packIndex;
    if (chosenPackForRoundRef.current.has(round)) return;
    chosenPackForRoundRef.current.add(round);
    fetch(`/api/draft-sessions/${draftSessionId}/choose-pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packIndex: round }),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }));
        console.warn('[TournamentDraft3D] choose-pack failed:', err?.error || res.status);
      }
    }).catch((err) => {
      console.warn('[TournamentDraft3D] choose-pack network error:', err);
    });
  }, [draftState.phase, draftState.packIndex, draftSessionId]);
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

  // Auto-start draft and poll for state updates
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const pollDraftState = async () => {
      try {
        const res = await fetch(`/api/draft-sessions/${draftSessionId}/state`);
        if (!res.ok) return;

        const data = await res.json();
        if (!mounted) return;

        if (data.draftState) {
          let s = data.draftState as DraftState;
          // Reconcile: if we have a pick in flight for this same pickNumber/packIndex, hide that card from our local pack
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
            cp[myPlayerIndex] = seatPack.filter((c) => c.id !== inflight.cardId);
            // Optimistically also remove me from waitingFor to avoid misleading hint
            const waiting = Array.isArray(s.waitingFor)
              ? s.waitingFor.filter((pid) => pid !== myPlayerId)
              : s.waitingFor;
            s = { ...s, currentPacks: cp, waitingFor: waiting } as DraftState;
          }
          setDraftState(s);
          if (data.draftState.phase !== "waiting") {
            everOutOfWaitingRef.current = true;
          }

          // Handle completion via polling as well (write picks to localStorage and navigate)
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
                    (typeof c.slug === "string" && slugToCardId[c.slug])
                      ? slugToCardId[c.slug]
                      : (Number(c.id) || 0),
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
                `[TournamentDraft3D] Failed to save draft data (poll path):`,
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
        console.error('[TournamentDraft3D] Error polling state:', err);
      }
    };

    const startDraft = async () => {
      try {
        const res = await fetch(`/api/draft-sessions/${draftSessionId}/start`, {
          method: 'POST',
        });
        if (!res.ok) {
          const error = await res.json();
          // Ignore "already started" errors
          if (!error.error?.includes('already started')) {
            console.error('[TournamentDraft3D] Error starting draft:', error);
          }
        }
      } catch (err) {
        console.error('[TournamentDraft3D] Error starting draft:', err);
      }
    };

    // Start draft immediately
    startDraft();

    // Poll for updates every 2 seconds
    pollInterval = setInterval(pollDraftState, 2000);
    pollDraftState(); // Initial poll

    return () => {
      mounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [draftSessionId, myPlayerId, myPlayerIndex, onDraftComplete, slugToCardId]);

  // Load tournament packConfiguration to display all booster packs (usually 3)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/draft-sessions/${draftSessionId}`);
        if (!res.ok) return;
        const j = await res.json();
        const cfg = Array.isArray(j?.packConfiguration) ? j.packConfiguration : [];
        const seq: string[] = [];
        for (const entry of cfg) {
          const setId = typeof entry?.setId === 'string' ? entry.setId : 'Beta';
          const count = Number(entry?.packCount) || 0;
          for (let i = 0; i < count; i++) seq.push(setId);
        }
        if (mounted) setPackSequence(seq);
      } catch {}
    })();
    return () => { mounted = false; };
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
      let resolvedId = 0;
      if (card && typeof card.slug === "string") {
        const mapped = slugToCardId[card.slug];
        if (
          typeof mapped === "number" &&
          Number.isFinite(mapped) &&
          mapped > 0
        ) {
          resolvedId = mapped;
        }
      }
      if (!resolvedId) {
        const n = Number(card?.id);
        if (Number.isFinite(n) && n > 0) resolvedId = n;
      }
      return {
        variantId: 0,
        slug: card.slug,
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

  const PICK_CENTER = { x: 0, z: 0 };
  const PICK_RADIUS = CARD_LONG * 0.6;
  const STAGE_CLICK_POS = useMemo(() => ({ x: 0, z: 1.7 }), []);
  const STAGE_CLICK_X = STAGE_CLICK_POS.x;
  const STAGE_CLICK_Z = STAGE_CLICK_POS.z;

  // Whether it's my turn to pick according to the server
  const amPicker = useMemo(() => {
    return (
      draftState.phase === "picking" &&
      draftState.waitingFor.includes(myPlayerId)
    );
  }, [draftState.phase, draftState.waitingFor, myPlayerId]);

  const myPack = useMemo(
    () => (draftState.currentPacks?.[myPlayerIndex] || []) as DraftCard[],
    [draftState.currentPacks, myPlayerIndex]
  );

  // Convert pack to BoosterCard format
  const packAsBoosterCards = useMemo(() => {
    return myPack.map(draftCardToBoosterCard);
  }, [myPack, draftCardToBoosterCard]);

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
    const serverSeatPicks = (draftState.picks[myPlayerIndex] || []) as DraftCard[];
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
  }, [draftState.picks, myPlayerIndex, pick3D, nextPickId, draftCardToBoosterCard]);

  // Listen for server draft updates (this would come from tournament draft socket events)
  useEffect(() => {
    if (!transport) return;

    const handleDraftUpdate = (state: unknown) => {
      const s = state as DraftState;
      if (s?.phase && s.phase !== "waiting") {
        everOutOfWaitingRef.current = true;
      }
      setDraftState(s);
      console.log(
        `[TournamentDraft3D] draftUpdate: phase=${s.phase} pack=${s.packIndex} pick=${s.pickNumber}`
      );

      if (s.phase === "picking") {
        setStaged(null);
        setReady(false);
      }

      if (s.phase === "complete") {
        const mine = (s.picks[myPlayerIndex] || []) as DraftCard[];
        console.log(
          `[TournamentDraft3D] Draft complete! Picked ${mine.length} cards`
        );

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
                (typeof c.slug === "string" && slugToCardId[c.slug])
                  ? slugToCardId[c.slug]
                  : (Number(c.id) || 0),
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
            `[TournamentDraft3D] Failed to save draft data:`,
            err
          );
        }

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
  }, [transport, myPlayerIndex, onDraftComplete, draftSessionId, slugToCardId]);

  // Fetch metadata for picked cards
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

  // Enhanced Pick & Pass with staging mechanics
  const commitPickAndPass = useCallback(
    (cardIdx: number, wx: number, wz: number) => {
      if (!amPicker) return;

      const card = myPack[cardIdx];
      if (!card) return;

      console.log(
        `[TournamentDraft3D] commitPickAndPass -> cardId=${card.id}`
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

      // Optimistically remove the picked card from our local pack and remove us from waitingFor
      setDraftState((prev) => {
        if (prev.phase !== "picking") return prev;
        const packs = Array.isArray(prev.currentPacks) ? [...prev.currentPacks] : prev.currentPacks;
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

      // Send stack interaction for enhanced multiplayer feedback
      sendStackInteraction("pick", [card.id], "current-pack", "picked-cards", {
        targetPosition: { x: wx, y: 0.1, z: wz },
        userInitiated: true,
        hasAnimation: true,
      });

      try {
        // Send pick to server via tournament draft API
        fetch(`/api/draft-sessions/${draftSessionId}/pick`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardId: card.id,
            packIndex: draftState.packIndex,
            pickNumber: draftState.pickNumber,
          }),
        }).then(async (res) => {
          if (res.ok) {
            // Server acknowledged; clear in-flight marker
            pickInFlightRef.current = null;
          }
          if (!res.ok) {
            const err = await res.json().catch(() => ({} as { error?: string }));
            console.warn('[TournamentDraft3D] makeDraftPick failed:', err?.error || res.status);
            // Revert optimistic removal if rejected
            setDraftState((prev) => {
              if (prev.phase !== "picking") return prev;
              const packs = Array.isArray(prev.currentPacks) ? [...prev.currentPacks] : prev.currentPacks;
              if (Array.isArray(packs)) {
                const seatPack = (packs[myPlayerIndex] || []) as DraftCard[];
                // If the card is missing due to our optimistic removal, put it back
                if (!seatPack.find((c) => c.id === card.id)) {
                  packs[myPlayerIndex] = [card as DraftCard, ...seatPack];
                }
              }
              // Put us back into waitingFor
              const waiting = Array.isArray(prev.waitingFor)
                ? (prev.waitingFor.includes(myPlayerId) ? prev.waitingFor : [...prev.waitingFor, myPlayerId])
                : prev.waitingFor;
              return { ...prev, currentPacks: packs, waitingFor: waiting };
            });
          }
        }).catch((err) => {
          console.error(`[TournamentDraft3D] makeDraftPick network error:`, err);
        });
      } catch (err) {
        console.error(`[TournamentDraft3D] makeDraftPick error:`, err);
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
    for (const pick of pick3D) {
      const meta = metaByCardId[pick.card.cardId];
      const category = categorizeCard(pick.card, meta);
      counts[category as keyof typeof counts]++;
    }
    return counts;
  }, [pick3D, metaByCardId]);

  // Create sorted stack positions
  const stackPositions = useMemo(() => {
    if (!isSortingEnabled) return null;
    if (sortMode === "mana") {
      return computeStackPositions(pick3D, layoutMetaByCardId, true, true);
    }
    // Element grouping implementation...
    return null;
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
      commitPickAndPass(0, STAGE_CLICK_X, STAGE_CLICK_Z);
      if (autoPickTimerRef.current) {
        window.clearTimeout(autoPickTimerRef.current);
      }
      autoPickTimerRef.current = null;
    }, 500);
    return () => {
      if (autoPickTimerRef.current) {
        window.clearTimeout(autoPickTimerRef.current);
        autoPickTimerRef.current = null;
      }
    };
  }, [draftState.phase, amPicker, myPack, staged, packChoiceOverlay, ready, commitPickAndPass, STAGE_CLICK_X, STAGE_CLICK_Z]);

  // Skip the waiting phase - show draft UI with loading overlay
  const showLoadingOverlay = draftState.phase === "waiting" && packAsBoosterCards.length === 0;

  // Main 3D draft UI (similar to EnhancedOnlineDraft3DScreen but adapted)
  return (
    <div className="fixed inset-0 w-screen h-screen">
      <div className="absolute inset-0 w-full h-full">
        <Canvas
          camera={{ position: [0, 10, 0], fov: 50 }}
          shadows
          gl={{ preserveDrawingBuffer: false, antialias: true, alpha: false }}
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
                onHoverInfo={(info) => {
                  if (info) {
                    showCardPreview(info);
                  } else {
                    hideCardPreview();
                  }
                }}
                onDragMove={(idx, wx, wz) => {
                  if (!amPicker || ready) return;
                  const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
                  if (d > PICK_RADIUS) setReadyIdx(idx);
                  else if (readyIdx === idx) setReadyIdx(null);
                }}
                onRelease={(idx, wx, wz) => {
                  if (!amPicker || ready) return;

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
              cardName={packAsBoosterCards[staged.idx]?.cardName ?? packAsBoosterCards[staged.idx]?.slug ?? ""}
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
                const d = Math.hypot(wx - PICK_CENTER.x, wz - PICK_CENTER.z);
                if (d <= PICK_RADIUS) {
                  setStaged(null);
                  hideCardPreview();
                }
              }}
              preferRaster
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
                    preferRaster
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

      {/* Overlays */}
      <div className="absolute inset-0 z-20 pointer-events-none select-none">
        <UserBadge variant="floating" />
        <div className="max-w-7xl mx-auto p-4 flex flex-wrap items-end gap-4 pointer-events-auto select-none relative">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-fantaisie text-white">
              Tournament Draft
            </div>
          </div>

          {draftState.phase !== "complete" && (
            <div className="absolute left-1/2 -translate-x-1/2 top-4 z-[55] pointer-events-auto text-center">
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
                Pack {draftState.packIndex + 1} • Pick{" "}
                {draftState.pickNumber}
              </div>
              {draftState.phase === "picking" && draftState.waitingFor.length > 0 && (
                <div className="mt-0.5 text-[11px] text-white/50 pointer-events-none">
                  Waiting for {draftState.waitingFor.filter((id) => id !== myPlayerId).length} player{draftState.waitingFor.filter((id) => id !== myPlayerId).length === 1 ? "" : "s"} to pick & pass…
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
          <CardPreview card={hoverPreview} anchor="top-left" />
        )}

        {/* Loading overlay for waiting phase */}
        {showLoadingOverlay && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-slate-900/95 rounded-xl p-8 ring-1 ring-white/20 text-white text-center">
              <h2 className="text-2xl font-bold mb-4">Starting Tournament Draft</h2>
              <div className="text-slate-300 mb-6">Generating packs and initializing draft...</div>
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
              </div>
            </div>
          </div>
        )}

        {/* Pack opening overlay (UI-only gating, tournament sets are preconfigured per round) */}
        {packChoiceOverlay && draftState.phase !== "complete" && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto">
            <div className="rounded-xl p-6 bg-black/80 ring-1 ring-white/30 text-white w-[min(92vw,900px)] shadow-2xl">
              <div className="text-lg font-semibold mb-3 text-center">
                Choose a pack to open (Round {draftState.packIndex + 1})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(packSequence.length > 0 ? packSequence : ["Booster","Booster","Booster"]).map((setName, packIdx) => {
                  const s = (setName || "").toLowerCase();
                  const assetName = s.includes("arthur") ? "arthurian-booster.png" : "alphabeta-booster.png";
                  const isAlreadyUsed = usedPacks.includes(packIdx) || packIdx < draftState.packIndex;
                  const isUpcoming = packIdx > draftState.packIndex;
                  return (
                    <div key={`pack-${packIdx}`} className={`group rounded-lg p-3 bg-black/60 ring-1 ring-white/25 text-left ${isAlreadyUsed ? 'opacity-50' : ''}`}>
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
                          <div className="absolute top-1 right-1 text-[10px] px-2 py-0.5 rounded bg-emerald-600/80">Opened</div>
                        )}
                        {isUpcoming && (
                          <div className="absolute top-1 right-1 text-[10px] px-2 py-0.5 rounded bg-slate-600/80">Upcoming</div>
                        )}
                      </div>
                      <div className="mt-3 flex justify-center">
                        <button
                          onClick={async () => {
                            if (isAlreadyUsed) return;
                            try {
                              const res = await fetch(`/api/draft-sessions/${draftSessionId}/choose-pack`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ packIndex: packIdx, setChoice: setName }),
                              });
                              setUsedPacks((prev) => prev.includes(packIdx) ? prev : [...prev, packIdx]);
                              // Only close the overlay if server moved us into picking
                              try {
                                const payload = await res.json();
                                const nextPhase = (payload && typeof payload === 'object')
                                  ? (payload.draftState?.phase ?? payload.phase)
                                  : undefined;
                                if (nextPhase === 'picking') {
                                  setPackChoiceOverlay(false);
                                }
                              } catch {
                                // ignore JSON errors; overlay will auto-close when phase updates
                              }
                            } catch (e) {
                              console.warn('[TournamentDraft3D] choose-pack failed', e);
                            }
                          }}
                          disabled={isAlreadyUsed}
                          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${!isAlreadyUsed ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-slate-700 text-slate-300 cursor-not-allowed'}`}
                        >
                          {!isAlreadyUsed ? 'Open Pack' : 'Opened'}
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
