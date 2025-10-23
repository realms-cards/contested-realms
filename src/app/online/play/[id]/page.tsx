"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOnline } from "@/app/online/online-context";
import UserBadge from "@/components/auth/UserBadge";
import CardPreview from "@/components/game/CardPreview";
import ContextMenu from "@/components/game/ContextMenu";
import EnhancedOnlineDraft3DScreen from "@/components/game/EnhancedOnlineDraft3DScreen";
import GameToolbox from "@/components/game/GameToolbox";
import { InteractionConsentDialog } from "@/components/game/InteractionConsentDialog";
import MatchEndOverlay from "@/components/game/MatchEndOverlay";
import MatchInfoPopup from "@/components/game/MatchInfoPopup";
import OnlineConsole from "@/components/game/OnlineConsole";
import OnlineD20Screen from "@/components/game/OnlineD20Screen";
import OnlineDeckSelector from "@/components/game/OnlineDeckSelector";
import OnlineDraftDeckLoader from "@/components/game/OnlineDraftDeckLoader";
import OnlineLifeCounters from "@/components/game/OnlineLifeCounters";
import OnlineMulliganScreen from "@/components/game/OnlineMulliganScreen";
import OnlineSealedDeckLoader from "@/components/game/OnlineSealedDeckLoader";
import OnlineStatusBar from "@/components/game/OnlineStatusBar";
// (moved GameToolbox import up to satisfy lint ordering)
import PileSearchDialog from "@/components/game/PileSearchDialog";
import PlacementDialog from "@/components/game/PlacementDialog";
import { GlobalVideoOverlay } from "@/components/ui/GlobalVideoOverlay";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import TrackpadOrbitAdapter from "@/lib/controls/TrackpadOrbitAdapter";
import Board from "@/lib/game/Board";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import Hand3D from "@/lib/game/components/Hand3D";
import Hud3D from "@/lib/game/components/Hud3D";
import Piles3D from "@/lib/game/components/Piles3D";
import TextureCache from "@/lib/game/components/TextureCache";
import TokenPile3D from "@/lib/game/components/TokenPile3D";
import {
  MAT_PIXEL_H,
  MAT_PIXEL_W,
  BASE_TILE_SIZE,
  MAT_RATIO,
} from "@/lib/game/constants";
import { useCardHover } from "@/lib/game/hooks/useCardHover";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";
import { LegacySeatVideo3D } from "@/lib/rtc/SeatVideo3D";
import {
  useBoardPingListener,
  useMatchPlayerNames,
  usePlayerIdentity,
  usePlayerNameMap,
  useRemoteCursorTelemetry,
} from "./matchHooks";

export default function OnlineMatchPage() {
  const params = useParams();
  const router = useRouter();
  const { updateScreenType } = useVideoOverlay();

  // Enhanced card preview state using the draft-3d/editor-3d pattern
  const [hoverPreview, setHoverPreview] = useState<CardPreviewData | null>(
    null
  );
  const { showCardPreview, hideCardPreview, clearHoverTimers } = useCardHover({
    onShow: (card: CardPreviewData) => {
      setHoverPreview(card);
    },
    onHide: () => {
      setHoverPreview(null);
    },
  });

  const setActorKey = useGameStore((s) => s.setActorKey);
  const setLocalPlayerId = useGameStore((s) => s.setLocalPlayerId);

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
    leaveLobby,
    resync,
    me,
    resyncing,
    voice,
  } = useOnline();

  const {
    myPlayerId,
    myPlayerNumber,
    myPlayerKey,
    opponentSeat,
    opponentPlayerId,
  } = usePlayerIdentity(match, me);

  // Initialize actor seat and localPlayerId in store for ownership guards
  useEffect(() => {
    setActorKey(myPlayerKey);
    setLocalPlayerId(myPlayerId ?? null);
    return () => {
      setActorKey(null);
      setLocalPlayerId(null);
    };
  }, [setActorKey, setLocalPlayerId, myPlayerKey, myPlayerId]);

  useRemoteCursorTelemetry(transport);
  useBoardPingListener(transport);

  const rtc = voice?.rtc ?? null;
  const matchOverlayTargetId = useMemo(() => {
    return match?.players?.find((p) => p.id && p.id !== myPlayerId)?.id ?? null;
  }, [match?.players, myPlayerId]);
  const voiceRequestConnection = voice?.enabled ? voice.requestConnection : undefined;

  // Do not auto-join WebRTC. Users must click the Join control to request mic access and connect.

  // Remote audio is handled inside SeatMediaControls

  // One-shot guards for rejoin flow per connection
  const lastConnectedRef = useRef<boolean>(false);
  const resyncSentForRef = useRef<string | null>(null);
  const rejoinChatSentForRef = useRef<string | null>(null);
  const prevMatchIdRef = useRef<string | null>(null);
  const prevMatchStatusRef = useRef<
    "waiting" | "deck_construction" | "in_progress" | "ended" | null
  >(null);
  const joinAttemptedForRef = useRef<string | null>(null);
  const sealedSubmissionSentForRef = useRef<string | null>(null);
  const draftSubmissionSentForRef = useRef<string | null>(null);
  const tournamentDeckSubmittedRef = useRef<string | null>(null);
  // Lightweight retry helpers for tournament deck fetch/submission
  const deckFetchAttemptsRef = useRef<number>(0);
  const deckRetryTimerRef = useRef<number | null>(null);
  const [tournamentDeckRetry, setTournamentDeckRetry] = useState(0);
  const lastTournamentIdRef = useRef<string | null>(null);
  // Track if this page initiated a tournament bootstrap for the current route id
  const hasBootstrapRef = useRef<boolean>(false);
  // Guard to ensure we only reset local game state once per match in this page session,
  // even if the socket briefly disconnects/reconnects or status changes.
  const resetDoneForRef = useRef<string | null>(null);
  // Local submission flags to reflect immediate client-side submission before server ack
  const [localSealedSubmitted, setLocalSealedSubmitted] = useState(false);
  const [localDraftSubmitted, setLocalDraftSubmitted] = useState(false);

  // Get player nicknames (constrained to 2 players for game engine compatibility)
  const playerNames = useMatchPlayerNames(match);
  const playerNameById = usePlayerNameMap(match);

  // Set screen type for video overlay - this is a game page so use game-3d
  useEffect(() => {
    updateScreenType("game-3d");
    return undefined;
  }, [updateScreenType]);

  // Ensure we are in the correct match when landing on /online/play/[id]
  useEffect(() => {
    console.log("[joinMatch effect] Checking conditions:", { connected, matchId, matchCurrentId: match?.id, joinAttempted: joinAttemptedForRef.current });

    // If we were navigated from tournament matches, ensure the match exists on the socket server
    if (connected && matchId && transport) {
      try {
        const key = `tournamentMatchBootstrap_${matchId}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const payload = JSON.parse(raw) as {
            players?: string[];
            matchType?: "constructed" | "sealed" | "draft";
            lobbyName?: string;
            sealedConfig?: unknown;
            draftConfig?: unknown;
            tournamentId?: string | null;
          };
          transport.emit("startTournamentMatch", {
            matchId,
            playerIds: Array.isArray(payload?.players) ? payload.players : [],
            matchType: payload?.matchType || "constructed",
            lobbyName: payload?.lobbyName,
            sealedConfig: payload?.sealedConfig || null,
            draftConfig: payload?.draftConfig || null,
            tournamentId: payload?.tournamentId || null,
          });
          hasBootstrapRef.current = true;
          localStorage.removeItem(key);
        }
      } catch {}
    }

    if (!connected || !matchId) {
      console.log("[joinMatch effect] Bailing - not connected or no matchId");
      return;
    }

    // If server reports a different match, force a one-time hard redirect to the server-authoritative id
    try {
      if (match?.id && match?.id !== matchId) {
        const serverMatchId = match.id;
        if (!sessionStorage.getItem(`force_reload_match_${serverMatchId}`)) {
          console.log("[game] Switching to different match - forcing page reload for clean state");
          sessionStorage.setItem(`force_reload_match_${serverMatchId}`, "1");
          sessionStorage.removeItem(`force_reload_match_${matchId}`);
          history.replaceState(null, "", `/online/play/${serverMatchId}`);
          hasBootstrapRef.current = false;
          joinAttemptedForRef.current = null;
          resyncSentForRef.current = null;
          rejoinChatSentForRef.current = null;
          resetDoneForRef.current = null;
          prevMatchIdRef.current = serverMatchId;
          prevMatchStatusRef.current = null;
          useGameStore.getState().resetGameState();
          return;
        } else {
          console.log("[game] After reload still have wrong match - resetting game state");
          useGameStore.getState().resetGameState();
          return;
        }
      }
    } catch {}

    if (match?.id === matchId) {
      console.log("[joinMatch effect] Already in correct match");
      // Arrived or already in: clear join attempt flag
      if (joinAttemptedForRef.current === matchId)
        joinAttemptedForRef.current = null;
      return;
    }
    if (joinAttemptedForRef.current === matchId) {
      console.log("[joinMatch effect] Already attempted join for this match");
      return;
    }

    console.log("[online] joinMatch ->", {
      matchId,
      because: hasBootstrapRef.current ? "bootstrap" : "direct",
    });
    joinAttemptedForRef.current = matchId;
    void joinMatch(matchId);
  }, [connected, match?.id, matchId, joinMatch, leaveMatch, transport]);

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
    // Important: only clear when server reports a concrete different match id.
    // During initial join/resync, match?.id can be undefined; do NOT clear in that transient state.
    if (match?.id && match.id !== matchId) {
      if (resyncSentForRef.current === matchId) resyncSentForRef.current = null;
      if (rejoinChatSentForRef.current === matchId)
        rejoinChatSentForRef.current = null;
      if (resetDoneForRef.current === matchId) resetDoneForRef.current = null;
    }
  }, [match?.id, matchId]);

  // Request full state sync and send rejoin chat exactly once per connection and match
  useEffect(() => {
    if (!connected || match?.id !== matchId) return;

    // Perform local reset/resync only once per match for this page session.
    if (resetDoneForRef.current !== matchId) {
      console.log("[game] Joining match - requesting resync (will reset state when snapshot arrives)");
      // DON'T reset game state here - let the resync snapshot replace it cleanly
      // Resetting here causes a race: if we reset, then a patch arrives, then snapshot arrives,
      // the patch gets lost. Instead, the OnlineProvider will reset when applying the snapshot.
      try {
        console.debug("[online] resync ->", {
          matchId,
          because: "joined or rejoined",
        });
      } catch {}
      resync();
      resetDoneForRef.current = matchId;
      // Also set the per-connection guard so we don't double-send within the same connection.
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

  // Setup state (like offline play)
  // Default CLOSED to avoid flashing overlay on rejoin; we'll open it for new/waiting matches
  const [setupOpen, setSetupOpen] = useState<boolean>(false);

  // Game store selectors needed for setup
  const serverPhase = useGameStore((s) => s.phase);
  const storeSetupWinner = useGameStore((s) => s.setupWinner);
  const storeD20Rolls = useGameStore((s) => s.d20Rolls);
  const storeActorKey = useGameStore((s) => s.actorKey);
  const storeMatchEnded = useGameStore((s) => s.matchEnded);
  const showToolbox =
    match?.status === "in_progress" &&
    serverPhase !== "Setup" &&
    !setupOpen &&
    !storeMatchEnded;
  const [prepared, setPrepared] = useState<boolean>(false);
  const [d20RollingComplete, setD20RollingComplete] = useState<boolean>(false);

  // Track sealed submission flag for this match (used to decide when to load decks)
  const hasSubmittedSealedDeck = useMemo(() => {
    if (!matchId) return false;
    // Prefer server-confirmed deck presence
    const myId = me?.id;
    if (
      myId &&
      match?.playerDecks &&
      (match.playerDecks as Record<string, unknown>)[myId]
    ) {
      return true;
    }
    // Fallback to localStorage flag set by editor
    try {
      return (
        localSealedSubmitted ||
        localStorage.getItem(`sealed_submitted_${matchId}`) === "true"
      );
    } catch {
      return false;
    }
  }, [matchId, match?.playerDecks, me?.id, localSealedSubmitted]);

  // Track draft submission flag similar to sealed
  const hasSubmittedDraftDeck = useMemo(() => {
    if (!matchId) return false;
    const myId = me?.id;
    if (
      myId &&
      match?.playerDecks &&
      (match.playerDecks as Record<string, unknown>)[myId]
    ) {
      return true;
    }
    try {
      return (
        localDraftSubmitted ||
        localStorage.getItem(`draft_submitted_${matchId}`) === "true"
      );
    } catch {
      return false;
    }
  }, [matchId, match?.playerDecks, me?.id, localDraftSubmitted]);

  // Track draft state and completion
  const [draftCompleted, setDraftCompleted] = useState(false);
  const isDraftMatch = match?.matchType === "draft";
  // Draft is active during "waiting" status AND while the draft phase is not "complete"
  // This ensures the draft UI stays visible during pack_selection and picking phases
  const draftPhase = match?.draftState?.phase;
  const isDraftActive =
    isDraftMatch &&
    match?.status === "waiting" &&
    !draftCompleted &&
    (!draftPhase || draftPhase !== "complete");
  const isDraftDeckConstruction =
    isDraftMatch && (match?.status === "deck_construction" || draftCompleted || draftPhase === "complete");

  // Prevent showing draft component again once it's completed or if we already submitted a deck
  const shouldShowDraft = isDraftActive && !hasSubmittedDraftDeck;

  const tournamentId =
    (match as unknown as { tournamentId?: string | null } | undefined)?.tournamentId ||
    null;

  // Auto-load any deck that the match server has already attached to us (sealed/draft/tournament rebuilt decks)
  useEffect(() => {
    if (prepared) return;
    
    // If a resync is underway, wait for it to deliver the authoritative server snapshot
    // before doing any local deck loading.
    if (resyncing) {
      return;
    }

    // If the server reports the match is in progress, do not auto-load a deck; the resync snapshot
    // will restore the correct zones/hands.
    if (match?.status === "in_progress") {
      console.log("[match] Match in progress; skipping deck load (will use server snapshot)", {
        status: match?.status,
      });
      setPrepared(true);
      return;
    }

    // For reconnect edge cases: if we already have a server game snapshot in Setup phase and the match
    // is not in waiting/deck_construction, prefer waiting for the server to advance.
    const gamePhase = (match as unknown as { game?: { phase?: string } })?.game?.phase;
    const hasGameState = !!(match as unknown as { game?: unknown })?.game;
    if (hasGameState && gamePhase === "Setup" &&
        match?.status !== "waiting" && match?.status !== "deck_construction") {
      console.log("[match] Server provided Setup-phase game; waiting for snapshot advance");
      return;
    }
    
    if (!match?.playerDecks || !me?.id) return;
    if (!myPlayerKey || storeActorKey !== myPlayerKey) return;

    const rawDeck = (match.playerDecks as Record<string, unknown>)[me.id];
    if (!rawDeck) return;

    console.log("[match] Auto-loading deck from match.playerDecks:", {
      deckLength: Array.isArray(rawDeck) ? rawDeck.length : 'not an array',
      sampleCards: Array.isArray(rawDeck) ? (rawDeck as Array<Record<string, unknown>>).slice(0, 3) : rawDeck
    });

    let cancelled = false;

    (async () => {
      try {
        let deckToLoad = rawDeck;

        // Check if this is condensed tournament format {cardId, quantity}
        // vs full card objects {cardId, name, type, ...}
        if (Array.isArray(rawDeck) && rawDeck.length > 0) {
          const firstCard = rawDeck[0] as Record<string, unknown>;
          const isCondensedFormat = 'quantity' in firstCard && !('type' in firstCard);

          if (isCondensedFormat) {
            console.log("[match] Detected condensed tournament deck format, expanding to full cards...");

            // Extract unique card IDs
            const cardIds = Array.from(
              new Set(
                (rawDeck as Array<{ cardId: string; quantity: number }>)
                  .map(entry => Number(entry.cardId))
                  .filter(n => Number.isFinite(n) && n > 0)
              )
            );

            if (cardIds.length > 0) {
              // Fetch card metadata
              const resMeta = await fetch(
                `/api/cards/by-id?ids=${encodeURIComponent(cardIds.join(","))}`
              );

              if (resMeta.ok) {
                const metas = (await resMeta.json()) as Array<{
                  cardId: number;
                  name: string;
                  slug: string;
                  setName: string;
                  type?: string | null;
                  cost?: number | null;
                  thresholds?: Record<string, number> | null;
                }>;

                const byId = new Map(
                  metas.map(m => [
                    m.cardId,
                    {
                      name: m.name,
                      slug: m.slug,
                      setName: m.setName,
                      type: m.type || null,
                      cost: m.cost ?? null,
                      thresholds: m.thresholds ?? null,
                    }
                  ])
                );

                // Expand condensed format to full cards
                const expandedDeck: Array<Record<string, unknown>> = [];
                for (const entry of rawDeck as Array<{ cardId: string; quantity: number }>) {
                  const idNum = Number(entry.cardId);
                  const meta = byId.get(idNum);
                  if (!meta) {
                    console.warn(`[match] Missing metadata for card ID ${idNum}`);
                    continue;
                  }
                  const quantity = Math.max(1, Number(entry.quantity) || 0);
                  for (let i = 0; i < quantity; i++) {
                    expandedDeck.push({
                      id: String(idNum),
                      cardId: idNum,
                      name: meta.name,
                      slug: meta.slug,
                      set: meta.setName,
                      type: meta.type || "",
                      thresholds: meta.thresholds || null,
                    });
                  }
                }

                console.log("[match] Expanded deck to", expandedDeck.length, "cards");
                deckToLoad = expandedDeck;
              } else {
                console.error("[match] Failed to fetch card metadata for condensed deck");
              }
            }
          }
        }

        // Ensure the deck includes an Avatar so validation succeeds during setup
        if (Array.isArray(deckToLoad)) {
          const hasAvatar = deckToLoad.some((card) => {
            const type = typeof (card as Record<string, unknown>)?.type === "string"
              ? ((card as Record<string, unknown>).type as string)
              : "";
            return type.toLowerCase().includes("avatar");
          });

          if (!hasAvatar) {
            const avatarCard =
              (match as unknown as {
                game?: {
                  avatars?: Record<string, { card?: Record<string, unknown> | null } | null>;
                };
              })?.game?.avatars?.[myPlayerKey]?.card;

            if (avatarCard && typeof avatarCard === "object") {
              const avatarCardId = Number(
                (avatarCard as { cardId?: number | string; id?: number | string }).cardId ??
                  (avatarCard as { cardId?: number | string; id?: number | string }).id ??
                  0
              );
              if (Number.isFinite(avatarCardId) && avatarCardId > 0) {
                deckToLoad = [
                  ...deckToLoad,
                  {
                    id: String(avatarCardId),
                    cardId: avatarCardId,
                    name:
                      (avatarCard as { name?: string; cardName?: string }).name ||
                      (avatarCard as { name?: string; cardName?: string }).cardName ||
                      "Avatar",
                    slug: (avatarCard as { slug?: string }).slug || "",
                    set:
                      (avatarCard as { set?: string; setName?: string }).set ||
                      (avatarCard as { set?: string; setName?: string }).setName ||
                      "Beta",
                    type:
                      (avatarCard as { type?: string }).type &&
                      String((avatarCard as { type?: string }).type).length > 0
                        ? String((avatarCard as { type?: string }).type)
                        : "Avatar",
                    thresholds: (avatarCard as { thresholds?: Record<string, number> | null }).thresholds || null,
                  },
                ];
                console.log("[match] Injected avatar into deck for auto-load", {
                  cardId: avatarCardId,
                  name:
                    (avatarCard as { name?: string; cardName?: string }).name ||
                    (avatarCard as { name?: string; cardName?: string }).cardName ||
                    "Avatar",
                });
              }
            }
          }
        }

        const { loadSealedDeckFor } = await import("@/lib/game/deckLoader");
        const ok = await loadSealedDeckFor(
          myPlayerKey as "p1" | "p2",
          deckToLoad,
          (error) => console.error("[match] Deck load error:", error)
        );
        if (!ok || cancelled) return;
        useGameStore.getState().setPhase("Setup");
        setPrepared(true);
      } catch (error) {
        console.error("[match] Failed to auto-load deck from match data:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [prepared, match, matchId, match?.playerDecks, me?.id, myPlayerKey, storeActorKey, tournamentId, resyncing]);

  // Submit the tournament deck to the match server so it behaves like other auto-loaded decks
  useEffect(() => {
    if (!tournamentId) return;
    if (!transport?.submitDeck) return;
    if (!matchId || match?.id !== matchId) return;
    if (match?.matchType !== "constructed") return;
    if (match?.status !== "waiting" && match?.status !== "deck_construction") return;
    if (!me?.id || !myPlayerKey) return;

    // Reset attempts if tournament context changed
    if (lastTournamentIdRef.current !== tournamentId) {
      deckFetchAttemptsRef.current = 0;
      lastTournamentIdRef.current = tournamentId;
    }

    const currentDeck =
      (match?.playerDecks as Record<string, unknown> | undefined)?.[me.id];
    if (currentDeck) {
      tournamentDeckSubmittedRef.current = tournamentId;
      return;
    }

    if (tournamentDeckSubmittedRef.current === tournamentId) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/tournaments/${encodeURIComponent(String(tournamentId))}`
        );
        if (!res.ok) throw new Error("Failed to load tournament detail");
        const detail = await res.json();
        const list: Array<{ cardId: string; quantity: number }> | undefined =
          detail?.viewerDeck;
        if (!Array.isArray(list) || list.length === 0) return;

        const ids = Array.from(
          new Set(
            list
              .map((entry) => Number(entry.cardId))
              .filter((n) => Number.isFinite(n) && n > 0)
          )
        );
        if (ids.length === 0) return;

        const resMeta = await fetch(
          `/api/cards/by-id?ids=${encodeURIComponent(ids.join(","))}`
        );
        if (!resMeta.ok) throw new Error("Failed to load card meta");
        const metas = (await resMeta.json()) as Array<{
          cardId: number;
          name: string;
          slug: string;
          setName: string;
          type?: string | null;
        }>;
        console.log("[match] Fetched card metadata for", metas.length, "cards. Sample:", metas.slice(0, 3));
        const byId = new Map<
          number,
          { name: string; slug: string; setName: string; type: string | null; cost: number | null; thresholds: Record<string, number> | null }
        >();
        for (const meta of metas) {
          const cardType = meta.type || null;
          byId.set(Number(meta.cardId), {
            name: meta.name,
            slug: meta.slug,
            setName: meta.setName,
            type: cardType,
            cost: (meta as { cost?: number | null }).cost ?? null,
            thresholds: (meta as { thresholds?: Record<string, number> | null }).thresholds ?? null,
          });
        }

        console.log("[match] Building deck from list with", list.length, "unique cards");
        console.log("[match] Metadata map has", byId.size, "entries");
        console.log("[match] Sample list entry:", list[0]);
        console.log("[match] Sample byId keys:", Array.from(byId.keys()).slice(0, 5));

        const deck: Array<Record<string, unknown>> = [];
        for (const entry of list) {
          const idNum = Number(entry.cardId);
          const meta = byId.get(idNum);
          if (!meta) {
            console.error(`[match] Missing metadata for card ID ${idNum} (type: ${typeof entry.cardId})`, {
              entry,
              hasInMap: byId.has(idNum),
              mapKeys: Array.from(byId.keys())
            });
            continue;
          }
          const quantity = Math.max(1, Number(entry.quantity) || 0);
          for (let i = 0; i < quantity; i++) {
            deck.push({
              id: String(idNum),
              cardId: idNum,
              name: meta.name,
              slug: meta.slug,
              set: meta.setName,
              type: meta.type || "",
              thresholds: meta.thresholds || null,
            });
          }
        }

        console.log("[match] Built deck with", deck.length, "cards");
        if (cancelled) return;
        if (deck.length === 0) {
          // Graceful, bounded retry to handle brief propagation delays
          if (deckFetchAttemptsRef.current < 3) {
            deckFetchAttemptsRef.current += 1;
            try {
              if (deckRetryTimerRef.current != null) {
                clearTimeout(deckRetryTimerRef.current);
                deckRetryTimerRef.current = null;
              }
              deckRetryTimerRef.current = window.setTimeout(() => {
                setTournamentDeckRetry((n) => n + 1);
              }, 600);
            } catch {}
            console.warn(
              `[match] Viewer deck empty (attempt ${deckFetchAttemptsRef.current}/3), retrying shortly...`
            );
            return;
          }
          console.error("[match] Deck is empty after retries, not submitting!");
          return;
        }

        transport.submitDeck(deck);
        tournamentDeckSubmittedRef.current = tournamentId;

        if (storeActorKey === myPlayerKey && !prepared) {
          try {
            const { loadSealedDeckFor } = await import("@/lib/game/deckLoader");
            const ok = await loadSealedDeckFor(
              myPlayerKey as "p1" | "p2",
              deck,
              (error) =>
                console.error("[match] Tournament deck load error:", error)
            );
            if (ok && !cancelled) {
              useGameStore.getState().setPhase("Setup");
              setPrepared(true);
            }
          } catch (error) {
            console.warn("[match] Tournament deck local load failed:", error);
          }
        }
      } catch (error) {
        console.warn("[match] Tournament deck submission failed:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    tournamentId,
    transport,
    matchId,
    match?.id,
    match?.matchType,
    match?.playerDecks,
    match?.status,
    me?.id,
    myPlayerKey,
    storeActorKey,
    prepared,
    tournamentDeckRetry,
  ]);

  // Auto-redirect to sealed editor for sealed matches in deck construction
  // But only if we haven't already submitted a deck (avoid redirect loop)
  useEffect(() => {
    if (!matchId || match?.id !== matchId) return;
    if (!match) return;

    // Auto-redirect to sealed editor when joining sealed match during deck construction
    // But only if we haven't submitted a deck yet (prefer server-confirmed check).
    if (
      match.status === "deck_construction" &&
      match.matchType === "sealed" &&
      !hasSubmittedSealedDeck
    ) {
      // Clear game state before opening sealed editor
      useGameStore.getState().resetGameState();

      // Navigate to 3D editor with sealed mode
      const params = new URLSearchParams({
        sealed: "true",
        matchId: match.id,
        timeLimit: match.sealedConfig?.timeLimit?.toString() || "40",
        packCount: match.sealedConfig?.packCount?.toString() || "6",
        setMix: match.sealedConfig?.setMix?.join(",") || "Beta",
        constructionStartTime:
          match.sealedConfig?.constructionStartTime?.toString() ||
          Date.now().toString(),
      });
      if (match.lobbyName) params.set("matchName", match.lobbyName);
      if (match.sealedConfig?.replaceAvatars) {
        params.set("replaceAvatars", "true");
      }

      // Persist my exact server-generated sealed packs for the editor to consume
      try {
        const myId = me?.id ?? myPlayerId ?? null;
        const packsByPlayer = match.sealedPacks as unknown as
          | Record<string, unknown[]>
          | undefined;
        if (myId && packsByPlayer && Array.isArray(packsByPlayer[myId])) {
          localStorage.setItem(
            `sealedPacks_${match.id}`,
            JSON.stringify(packsByPlayer[myId])
          );
        }
      } catch {}

      // Redirect to editor
      window.location.href = `/decks/editor-3d?${params.toString()}`;
      return; // Don't execute the rest of the setup logic
    }

    // Auto-redirect to deck editor when draft is completed and in deck construction
    if (isDraftDeckConstruction && !hasSubmittedDraftDeck) {
      // Clear game state before opening deck editor
      useGameStore.getState().resetGameState();

      // Navigate to 3D editor with draft mode
      const params = new URLSearchParams({
        draft: "true",
        matchId: match.id,
        timeLimit: "30", // Default draft deck construction time
      });
      if (match.lobbyName) params.set("matchName", match.lobbyName);

      // Ensure drafted picks have been persisted by the draft screen before redirecting.
      // This avoids a race where match.status flips to deck_construction slightly
      // before the 'complete' draftUpdate handler saves localStorage.
      const key = `draftedCards_${match.id}`;
      let hasDraft = false;
      try {
        hasDraft = !!localStorage.getItem(key);
      } catch {}
      if (hasDraft) {
        window.location.href = `/decks/editor-3d?${params.toString()}`;
        return;
      }
      // Fallback: recheck shortly, then proceed regardless so the user isn't stuck
      window.setTimeout(() => {
        try {
          const url = `/decks/editor-3d?${params.toString()}`;
          window.location.href = url;
        } catch {
          window.location.href = `/decks/editor-3d?${params.toString()}`;
        }
      }, 650);
      return;
    }
  }, [
    matchId,
    match,
    hasSubmittedSealedDeck,
    isDraftDeckConstruction,
    hasSubmittedDraftDeck,
    me?.id,
    myPlayerId,
  ]);

  // Listen for sealed deck submissions via postMessage (when editor opened in a new window)
  useEffect(() => {
    if (!matchId || !transport) return;

    const onMessage = (e: MessageEvent) => {
      try {
        if (e.origin !== window.location.origin) return;
      } catch {}
      const dataUnknown = (e as MessageEvent<unknown>).data;
      if (!dataUnknown || typeof dataUnknown !== "object") return;
      const data = dataUnknown as {
        type?: string;
        deck?: unknown;
        matchId?: string;
      };
      if (
        data.type !== "sealedDeckSubmission" &&
        data.type !== "draftDeckSubmission"
      )
        return;
      if (data.matchId && data.matchId !== matchId) return;

      // Check if we've already sent this type of submission for this match
      if (data.type === "sealedDeckSubmission") {
        if (sealedSubmissionSentForRef.current === matchId) return;
        sealedSubmissionSentForRef.current = matchId;
        try {
          localStorage.setItem(`sealed_submitted_${matchId}`, "true");
          localStorage.removeItem(`sealedDeck_${matchId}`);
        } catch {}
        setLocalSealedSubmitted(true);
      } else if (data.type === "draftDeckSubmission") {
        if (draftSubmissionSentForRef.current === matchId) return;
        draftSubmissionSentForRef.current = matchId;
        try {
          localStorage.setItem(`draft_submitted_${matchId}`, "true");
          localStorage.removeItem(`draftDeck_${matchId}`);
        } catch {}
        setLocalDraftSubmitted(true);
      }

      // Forward to server
      transport.submitDeck?.(data.deck);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [matchId, transport]);

  // Fallback: read sealed deck from localStorage after returning from editor and submit to server
  useEffect(() => {
    if (!matchId || match?.id !== matchId) return;
    if (!transport) return;
    if (sealedSubmissionSentForRef.current === matchId) return;
    if (match?.matchType !== "sealed" || match?.status !== "deck_construction")
      return;

    try {
      const raw = localStorage.getItem(`sealedDeck_${matchId}`);
      if (!raw) return;
      const deck = JSON.parse(raw);
      if (!Array.isArray(deck) || deck.length === 0) return;

      transport.submitDeck?.(deck);
      sealedSubmissionSentForRef.current = matchId;
      localStorage.setItem(`sealed_submitted_${matchId}`, "true");
      localStorage.removeItem(`sealedDeck_${matchId}`);
      setLocalSealedSubmitted(true);
    } catch {}
  }, [matchId, match?.id, match?.status, match?.matchType, transport]);

  // Fallback: read draft deck from localStorage after returning from editor and submit to server
  useEffect(() => {
    if (!matchId || match?.id !== matchId) return;
    if (!transport) return;
    if (draftSubmissionSentForRef.current === matchId) return;
    if (match?.matchType !== "draft" || match?.status !== "deck_construction")
      return;

    try {
      const raw = localStorage.getItem(`draftDeck_${matchId}`);
      if (!raw) return;
      const deck = JSON.parse(raw);
      if (!Array.isArray(deck) || deck.length === 0) return;

      transport.submitDeck?.(deck);
      draftSubmissionSentForRef.current = matchId;
      localStorage.setItem(`draft_submitted_${matchId}`, "true");
      localStorage.removeItem(`draftDeck_${matchId}`);
      setLocalDraftSubmitted(true);
    } catch {}
  }, [matchId, match?.id, match?.status, match?.matchType, transport]);

  // Canonical control for setup overlay (prevents ping-pong updates)
  useEffect(() => {
    if (!matchId || match?.id !== matchId) return;
    if (!match) return;

    let desired = setupOpen;
    const ended = match.status === "ended";
    // Check game phase from game store (which gets updated from resync)
    // "Main" phase means game started
    // "Start" phase means D20 rolling complete, in mulligan phase
    // "Setup" phase means D20 rolling OR waiting for players
    const gameActuallyStarted = serverPhase === "Main";
    const d20Complete = serverPhase === "Start" || serverPhase === "Main" || storeSetupWinner != null;

    console.log("[setupOpen logic]", {
      serverPhase,
      storeSetupWinner,
      storeD20Rolls,
      d20Complete,
      d20RollingComplete,
      matchStatus: match.status,
      resyncing
    });

    if (ended) {
      desired = false;
    } else if (resyncing) {
      desired = true;
    } else if (shouldShowDraft) {
      desired = false;
    } else if (gameActuallyStarted) {
      // Match already in Main phase - skip setup overlay entirely
      desired = false;
      // Mark setup steps as complete so we don't get stuck in the setup flow
      if (!prepared) setPrepared(true);
      if (!d20RollingComplete) setD20RollingComplete(true);
    } else if (d20Complete && !d20RollingComplete && serverPhase === "Start") {
      // D20 rolling AND seat selection complete on server (phase moved to Start) - skip the D20 screen
      setD20RollingComplete(true);
    } else if (match.status === "waiting" || match.status === "deck_construction") {
      desired = true;
    } else if (!prepared) {
      desired = true;
    }

    if (desired !== setupOpen) setSetupOpen(desired);
  }, [matchId, match, match?.id, match?.status, resyncing, shouldShowDraft, prepared, serverPhase, setupOpen, setPrepared, d20RollingComplete, setD20RollingComplete, storeSetupWinner, storeD20Rolls]);

  

  // Reset setup wizard when entering a different match (fresh waiting match)
  const lastResetMatchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!matchId) return;

    const serverMatchId = match?.id ?? null;
    const effectiveMatchId = serverMatchId ?? matchId;

    // Avoid repeated resets for the same match context
    if (lastResetMatchRef.current === effectiveMatchId) return;
    lastResetMatchRef.current = effectiveMatchId;

    setPrepared(false);
    setD20RollingComplete(false);

    // Clear submission flag when entering a truly different match
    try {
      const submittedKey = `sealed_submitted_${matchId}`;
      if (serverMatchId && serverMatchId !== matchId) {
        localStorage.removeItem(submittedKey);
      }
    } catch {}

    // Also reset local submission flags for safety when navigating to a different match
    setLocalSealedSubmitted(false);
    setLocalDraftSubmitted(false);
  }, [match?.id, matchId]);

  // Clear submission flag when match ends (avoid lingering state for next sessions)
  useEffect(() => {
    if (!matchId || !match) return;
    if (match.status === "ended") {
      const submittedKey = `sealed_submitted_${matchId}`;
      localStorage.removeItem(submittedKey);
    }
  }, [matchId, match]);

  // NOTE: Game state reset for joining/switching matches is handled by the joinMatch
  // effect (lines 219-236), which calls resetGameState() once per match before requesting
  // a resync. The resync handler in OnlineProvider (line 792) also resets before applying
  // server snapshots to ensure clean state.
  //
  // We explicitly DO NOT reset when match status changes (e.g., waiting → in_progress)
  // because that would wipe active game state (dice rolls, mulligans, etc.) and cause the
  // D20 screen to reappear mid-game. Status transitions are cosmetic; the server sends
  // incremental patches via statePatch events to update the actual game state.

  

  // Chat
  const [chatInput, setChatInput] = useState("");

  // Match info popup
  const [matchInfoOpen, setMatchInfoOpen] = useState<boolean>(false);

  // Match end overlay
  const [matchEndOverlayOpen, setMatchEndOverlayOpen] =
    useState<boolean>(false);
  // Store selectors for match end state and winner must be declared before effects that depend on them
  const matchEnded = useGameStore((s) => s.matchEnded);
  const winner = useGameStore((s) => s.winner);
  const prevEndedRef = useRef(false);

  // Frozen context for the match end overlay so results don't change if roster updates
  const [finalEndContext, setFinalEndContext] = useState<
    | {
        winner: PlayerKey | null;
        playerNames: { p1: string; p2: string };
        myPlayerKey: PlayerKey | null;
      }
    | null
  >(null);

  // Debug: page mount/unmount
  useEffect(() => {
    try {
      console.debug("[page] OnlineMatchPage mount");
    } catch {}
    return () => {
      try {
        console.debug("[page] OnlineMatchPage unmount");
      } catch {}
      // Clean up hover timers on unmount
      clearHoverTimers();
    };
  }, [clearHoverTimers]);

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
        if (process.env.NEXT_PUBLIC_DEBUG_PHYSICS === "1") {
          console.debug("[physics] mount", { matchId: mid });
        }
      } catch {}
      return () => {
        try {
          if (process.env.NEXT_PUBLIC_DEBUG_PHYSICS === "1") {
            console.debug("[physics] unmount", { matchId: mid });
          }
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
  const placementDialog = useGameStore((s) => s.placementDialog);
  const closePlacementDialog = useGameStore((s) => s.closePlacementDialog);
  const searchDialog = useGameStore((s) => s.searchDialog);
  const closeSearchDialog = useGameStore((s) => s.closeSearchDialog);
  const selectedPermanent = useGameStore((s) => s.selectedPermanent);
  const selectedAvatar = useGameStore((s) => s.selectedAvatar);
  const boardSize = useGameStore((s) => s.board.size);
  // Compute playmat extents for camera baselines and clamps
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
// Extract store-derived dependencies for effects to satisfy ESLint
const playersState = useGameStore((s) => s.players);
const currentPlayerState = useGameStore((s) => s.currentPlayer);
const canPanCamera =
  !resyncing &&
  !dragFromHand &&
  !dragFromPile &&
  !selected &&
  !selectedPermanent &&
  !selectedAvatar;

  // Camera controls ref for reset functionality
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const setCameraMode = useGameStore((s) => s.setCameraMode);

  const gotoBaseline = useCallback(
    (mode: "topdown" | "orbit") => {
      const c = controlsRef.current;
      if (!c) return;
      // Always reset target to board center
      c.target.set(0, 0, 0);
      const cam = c.object as THREE.Camera;
      if (mode === "topdown") {
        // Natural 2D view: almost top-down from the player's side, slightly tilted
        // Keep altitude high enough to see the whole mat, but offset slightly in Z
        const dist = Math.max(matW, matH) * 1.1;
        const zOffset = Math.min(6, Math.max(1.5, dist * 0.08));
        const side = myPlayerNumber === 2 ? -1 : 1;
        cam.position.set(0, dist, side * zOffset);
      } else {
        // Reasonable default orbit position based on seat (slightly offset)
        cam.position.set(0, 10, myPlayerNumber === 2 ? -5 : 5);
      }
      c.update();
    },
    [myPlayerNumber, matW, matH]
  );

  function resetCamera() {
    gotoBaseline(cameraMode);
  }

  // When switching camera mode or when board extents change, rebase the camera
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!controlsRef.current) {
        setTimeout(() => gotoBaseline(cameraMode), 0);
      } else {
        gotoBaseline(cameraMode);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [cameraMode, gotoBaseline, matW, matH]);
  // Robust: reset drag flags only on hard-cancel contexts (not every pointerup)
  useEffect(() => {
    const reset = () => {
      setTimeout(() => {
        setDragFromHand(false);
        setDragFromPile(null);
      }, 0);
    };
    const onPointerCancel = () => reset();
    const onBlur = () => reset();
    const onVisibility = () => {
      if (document.visibilityState !== "visible") reset();
    };
    const onPageHide = () => reset();
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pointercancel", onPointerCancel);
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

  // Show match end overlay when match ends (server status or local store), but only if not already dismissed
  const endedByMatchStatus = match?.status === "ended";
  useEffect(() => {
    const ended = endedByMatchStatus || matchEnded;
    if (ended && !matchEndOverlayOpen) {
      setMatchEndOverlayOpen(true);
    }
    prevEndedRef.current = ended;
  }, [endedByMatchStatus, matchEnded, matchEndOverlayOpen]);

  // When the overlay first opens, snapshot the end-of-match context to keep it stable
  useEffect(() => {
    if (matchEndOverlayOpen && !finalEndContext) {
      setFinalEndContext({ winner, playerNames, myPlayerKey });
    }
  }, [matchEndOverlayOpen, finalEndContext, winner, playerNames, myPlayerKey]);

  // Reset match end overlay when joining a new match
  useEffect(() => {
    // Reset the overlay states when the match ID changes (new match)
    setMatchEndOverlayOpen(false);
    prevEndedRef.current = false;
    setFinalEndContext(null);
  }, [matchId]);

  // Check if we're in the correct match
  const inThisMatch = !!matchId && match?.id === matchId;

  // Dynamic page title with comprehensive match info
  useEffect(() => {
    const baseTitle = "Realms.cards";

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

  // Compute natural tilt angle for 2D mode based on extents
  // Constrain polar angle in 2D to a fixed small tilt that matches gotoBaseline('topdown')
  const naturalTiltAngle = useMemo(() => {
    const dist = Math.max(matW, matH) * 1.1;
    const zOffset = Math.min(6, Math.max(1.5, dist * 0.08));
    // Polar angle measured from +Y (straight up) downward
    return Math.atan(zOffset / dist);
  }, [matW, matH]);
  const boardInteractionMode =
    endedByMatchStatus || matchEnded ? "spectator" : "normal";
  const clampControls = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    const halfW = matW / 2;
    const halfH = matH / 2;
    const t = c.target;
    const cam = (c as unknown as { object: THREE.PerspectiveCamera }).object;
    const offset = cam.position.clone().sub(t.clone());
    // Extend bounds by the planar offset so that when tilted/zoomed out,
    // you can reach the opposite baseline by panning the target beyond the board edge.
    const marginX = Math.abs(offset.x);
    const marginZ = Math.abs(offset.z);
    const minX = -halfW - marginX;
    const maxX = halfW + marginX;
    const minZ = -halfH - marginZ;
    const maxZ = halfH + marginZ;
    let changed = false;
    if (t.x < minX) {
      t.x = minX;
      changed = true;
    } else if (t.x > maxX) {
      t.x = maxX;
      changed = true;
    }
    if (t.z < minZ) {
      t.z = minZ;
      changed = true;
    } else if (t.z > maxZ) {
      t.z = maxZ;
      changed = true;
    }
    if (t.y !== 0) {
      t.y = 0;
      changed = true;
    }
    if (changed) {
      cam.position.copy(t.clone().add(offset));
      c.update();
    }
  }, [matW, matH]);

  // Handle draft completion
  const handleDraftComplete = useCallback(
    (draftedCards: unknown[]) => {
      console.log("[Draft] Draft completed with", draftedCards.length, "cards");
      setDraftCompleted(true);

      // Store drafted cards in localStorage for deck editor
      try {
        localStorage.setItem(
          `draftedCards_${matchId}`,
          JSON.stringify(draftedCards)
        );
      } catch (error) {
        console.error("[Draft] Failed to store drafted cards:", error);
      }

      // Clear game state and immediately redirect to deck editor
      useGameStore.getState().resetGameState();

      // Navigate to 3D editor with draft mode
      const params = new URLSearchParams({
        draft: "true",
        matchId: matchId || "",
        timeLimit: "30", // Default draft deck construction time
      });

      // Redirect to editor
      window.location.href = `/decks/editor-3d?${params.toString()}`;
    },
    [matchId]
  );

  // Stabilize Canvas props to prevent renderer teardown/remount between renders
  const glOptions = useMemo(
    () => ({
      antialias: true,
      alpha: false,
      premultipliedAlpha: true,
    }),
    []
  );
  const cameraOptions = useMemo(
    () => ({
      position: (myPlayerNumber === 2 ? [0, 10, -5] : [0, 10, 5]) as [
        number,
        number,
        number
      ],
      fov: 50,
    }),
    [myPlayerNumber]
  );

  // Show draft screen for active draft matches (but only if we haven't submitted a deck)
  if (inThisMatch && shouldShowDraft && myPlayerKey) {
    return (
      <EnhancedOnlineDraft3DScreen
        myPlayerKey={myPlayerKey}
        playerNames={playerNames}
        onDraftComplete={handleDraftComplete}
      />
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen">
      {/* Camera controls - left: reset icon + 2D/3D buttons */}
      <div className="absolute top-2 left-2 z-30">
        <div className="bg-black/50 rounded-lg p-1 ring-1 ring-white/10 flex items-center">
          <button
            onClick={resetCamera}
            aria-label="Reset camera"
            title="Reset camera"
            className="p-2 rounded-full hover:bg-white/10 text-white"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4v5h5" />
              <path d="M20 20v-5h-5" />
              <path d="M19 9a7 7 0 10-3.5 7.8" />
            </svg>
          </button>
          <button
            className={`ml-1 px-2 py-1 text-xs rounded ${
              cameraMode === "topdown"
                ? "bg-white/20"
                : "bg-transparent hover:bg-white/10"
            }`}
            onClick={() => {
              setCameraMode("topdown");
            }}
            title="Top-down 2D camera"
          >
            2D
          </button>
          <button
            className={`ml-1 px-2 py-1 text-xs rounded ${
              cameraMode === "orbit"
                ? "bg-white/20"
                : "bg-transparent hover:bg-white/10"
            }`}
            onClick={() => {
              setCameraMode("orbit");
            }}
            title="3D orbit camera"
          >
            3D
          </button>
        </div>
      </div>
      {!inThisMatch && (
        <div className="absolute inset-0 z-30 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-xl font-semibold mb-2">Joining Match</div>
            <div className="text-sm opacity-60">Match ID: {matchId}</div>
          </div>
        </div>
      )}

      {inThisMatch && myPlayerKey && (
        <InteractionConsentDialog
          myPlayerId={myPlayerId ?? null}
          mySeat={myPlayerKey}
          playerNames={playerNames}
          playerNameById={playerNameById}
        />
      )}

      {inThisMatch && setupOpen && myPlayerKey && (
        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          {!prepared ? (
            // For tournament matches (any mode), never show deck loaders/selectors.
            // Decks come from the tournament submission and are auto-loaded via match.playerDecks.
            tournamentId ? (
              <div className="w-full max-w-xl mx-auto bg-slate-900/95 rounded-xl p-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-white mb-3">Preparing Tournament Deck…</h2>
                  <div className="text-slate-300">
                    Waiting for the server to attach your submitted deck. This may take a moment.
                  </div>
                </div>
              </div>
            ) : match?.matchType === "sealed" ? (
              hasSubmittedSealedDeck ? (
                <OnlineSealedDeckLoader
                  match={match}
                  myPlayerKey={myPlayerKey}
                  playerNames={playerNames}
                  onPrepareComplete={() => setPrepared(true)}
                  autoStart
                />
              ) : (
                <div className="w-full max-w-2xl mx-auto bg-slate-900/95 rounded-xl p-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-4">
                      Sealed Deck Construction
                    </h2>
                    <div className="text-slate-300">
                      Redirecting you to the deck editor to build and submit
                      your sealed deck...
                    </div>
                  </div>
                </div>
              )
            ) : match?.matchType === "draft" ? (
              hasSubmittedDraftDeck ? (
                <OnlineDraftDeckLoader
                  match={match}
                  myPlayerKey={myPlayerKey}
                  playerNames={playerNames}
                  onPrepareComplete={() => setPrepared(true)}
                  autoStart
                />
              ) : (
                <div className="w-full max-w-2xl mx-auto bg-slate-900/95 rounded-xl p-6">
                  <div className="text-center">
                    <h2 className="text-2xl font-bold text-white mb-4">
                      Draft Deck Construction
                    </h2>
                    <div className="text-slate-300">
                      Redirecting you to the deck editor to build and submit
                      your draft deck...
                    </div>
                  </div>
                </div>
              )
            ) : (
              <OnlineDeckSelector
                myPlayerKey={myPlayerKey}
                playerNames={playerNames}
                onPrepareComplete={() => setPrepared(true)}
                matchType={match?.matchType as "constructed" | "sealed" | "draft"}
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
          {/* Enhanced Online Draft 3D Screen: shown full-screen while draft is active (waiting to start/picking) */}
          {shouldShowDraft && myPlayerKey && (
            <EnhancedOnlineDraft3DScreen
              myPlayerKey={myPlayerKey}
              playerNames={playerNames}
              onDraftComplete={handleDraftComplete}
            />
          )}
          {/* Online Status Bar with turn restrictions */}
          {myPlayerNumber && (
            <OnlineStatusBar
              dragFromHand={dragFromHand}
              myPlayerNumber={myPlayerNumber}
              playerNames={playerNames}
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
            onLeaveLobby={leaveLobby}
            connected={connected}
            myPlayerId={myPlayerId}
          />

          {/* Enhanced Hover Preview Overlay - uses new CardPreview component */}
          {hoverPreview && !contextMenu && (
            <CardPreview
              card={hoverPreview}
              anchor="top-right"
              zIndexClass="z-30"
            />
          )}

          {/* Legacy Preview Overlay (for compatibility with existing setPreviewCard calls) */}
          {previewCard?.slug && !hoverPreview && !contextMenu && (
            <CardPreview
              card={{
                slug: previewCard.slug ?? "",
                name: previewCard.name,
                type: previewCard.type ?? null,
              }}
              anchor="top-right"
              zIndexClass="z-30"
            />
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

          {/* Toolbox overlay (draw/peek/inspect/position tools) */}
          {showToolbox && (
            <GameToolbox
              myPlayerId={myPlayerId || null}
              mySeat={myPlayerKey}
              opponentPlayerId={opponentPlayerId}
              opponentSeat={opponentSeat}
              matchId={match?.id || null}
            />
          )}

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
            winner={finalEndContext ? finalEndContext.winner : winner}
            playerNames={finalEndContext ? finalEndContext.playerNames : playerNames}
            myPlayerKey={finalEndContext ? finalEndContext.myPlayerKey : myPlayerKey}
            onClose={() => {
              setMatchEndOverlayOpen(false);
            }}
            onLeave={() => {
              leaveMatch();
            }}
            onLeaveLobby={() => {
              if (tournamentId) {
                router.push(`/tournaments/${tournamentId}`);
              } else {
                leaveLobby();
                router.push("/online/lobby");
              }
            }}
            leaveLabel={tournamentId ? "Return to Tournament" : undefined}
            allowContinue={false}
          />

          {/* 3D Board Canvas - fills entire viewport */}
          {!setupOpen && (
            <div className="absolute inset-0 w-full h-full">
              <Canvas
                camera={cameraOptions}
                shadows
                gl={glOptions}
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
                <Physics key="stable-physics" gravity={[0, -9.81, 0]}>
                  <PhysicsProbe mid={match?.id} />
                  <Board interactionMode={boardInteractionMode} enableBoardPings />
                </Physics>

                {/* Seat Video planes at player positions (fixed orientation toward board) */}
                {rtc?.featureEnabled && myPlayerKey && (
                  <>
                    {/* Local preview at my seat (muted via video texture; audio handled separately) */}
                    <LegacySeatVideo3D
                      who={myPlayerKey}
                      stream={rtc?.localStream ?? null}
                    />
                    {/* Remote video at opponent seat */}
                    <LegacySeatVideo3D
                      who={myPlayerKey === "p1" ? "p2" : "p1"}
                      stream={rtc?.remoteStream ?? null}
                    />
                  </>
                )}

                {/* 3D Piles (sides of the board) */}
                <Piles3D
                  owner="p1"
                  matW={MAT_PIXEL_W}
                  matH={MAT_PIXEL_H}
                  showCardPreview={showCardPreview}
                  hideCardPreview={hideCardPreview}
                />
                <Piles3D
                  owner="p2"
                  matW={MAT_PIXEL_W}
                  matH={MAT_PIXEL_H}
                  showCardPreview={showCardPreview}
                  hideCardPreview={hideCardPreview}
                />
                {/* Token piles (face-up) */}
                <TokenPile3D owner="p1" />
                <TokenPile3D owner="p2" />

                {/* 3D HUD (thresholds, life, mana) */}
                <Hud3D owner="p1" />
                <Hud3D owner="p2" />

                {/* 3D Hands - show both player and opponent hands */}
                {myPlayerKey && (
                  <Hand3D
                    owner={myPlayerKey}
                    matW={MAT_PIXEL_W}
                    matH={MAT_PIXEL_H}
                    showCardPreview={showCardPreview}
                    hideCardPreview={hideCardPreview}
                  />
                )}
                {/* Opponent hand with card backs */}
                {myPlayerKey &&
                  (() => {
                    const opponentKey = myPlayerKey === "p1" ? "p2" : "p1";
                    return (
                      <Hand3D
                        owner={opponentKey}
                        matW={MAT_PIXEL_W}
                        matH={MAT_PIXEL_H}
                        showCardBacks={true}
                        viewerPlayerNumber={myPlayerNumber}
                        showCardPreview={showCardPreview}
                        hideCardPreview={hideCardPreview}
                      />
                    );
                  })()}

                {/* Smart texture cache: own hand + top N of draw piles (background) */}
                <TextureCache mode="smart" topN={5} />

                <OrbitControls
                  ref={controlsRef}
                  makeDefault
                  target={[0, 0, 0]}
                  mouseButtons={{
                    MIDDLE: THREE.MOUSE.DOLLY,
                    RIGHT: THREE.MOUSE.PAN,
                  }}
                  touches={{ TWO: THREE.TOUCH.PAN }}
                  enabled={canPanCamera}
                  enablePan={canPanCamera}
                  enableRotate={false}
                  enableZoom={!resyncing && !dragFromHand && !dragFromPile}
                  enableDamping={false}
                  onChange={clampControls}
                  minDistance={minDist}
                  maxDistance={maxDist}
                  minPolarAngle={
                    cameraMode === "topdown" ? naturalTiltAngle : 0
                  }
                  maxPolarAngle={
                    cameraMode === "topdown" ? naturalTiltAngle : Math.PI / 2.4
                  }
                  // Adjust rotation constraints based on player position
                  // Default to P1 constraints if player number not determined yet
                  minAzimuthAngle={myPlayerNumber === 2 ? Math.PI - 0.5 : -0.5}
                  maxAzimuthAngle={myPlayerNumber === 2 ? Math.PI + 0.5 : 0.5}
                />
                <KeyboardPanControls enabled={canPanCamera} />
                <TrackpadOrbitAdapter />
              </Canvas>
            </div>
          )}
        </>
        )}

        {/* Incoming Voice Request Dialog */}
        {voice?.incomingRequest && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 shadow-2xl max-w-md">
              <h3 className="text-lg font-bold text-white mb-2">
                Incoming Voice Call
              </h3>
              <p className="text-slate-300 mb-4">
                {voice.incomingRequest.from.displayName || 'A player'} wants to connect via voice chat.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium"
                  onClick={() => {
                    if (voice.respondToRequest && voice.incomingRequest) {
                      voice.respondToRequest(
                        voice.incomingRequest.requestId,
                        voice.incomingRequest.from.id,
                        false
                      );
                    }
                  }}
                >
                  Decline
                </button>
                <button
                  className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white font-medium"
                  onClick={() => {
                    if (voice.respondToRequest && voice.incomingRequest) {
                      voice.respondToRequest(
                        voice.incomingRequest.requestId,
                        voice.incomingRequest.from.id,
                        true
                      );
                    }
                  }}
                >
                  Accept
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating user badge (top-right) with presence + volume control */}
        <UserBadge variant="floating" />
        {/* Video overlay (avatar hidden to avoid duplicate badge) */}
        {voice?.enabled && (
          <GlobalVideoOverlay
            position="top-right"
            showUserAvatar={false}
            rtc={rtc}
            onRequestConnection={voiceRequestConnection}
            targetPlayerId={matchOverlayTargetId}
          />
        )}
      </div>
  );
}

function KeyboardPanControls({ enabled = true, step = 0.4 }: { enabled?: boolean; step?: number }) {
  const { controls } = useThree((state) => ({
    controls: state.controls as OrbitControlsImpl | undefined,
  }));
  useOrbitKeyboardPan(controls, { enabled, panStep: step });
  return null;
}
