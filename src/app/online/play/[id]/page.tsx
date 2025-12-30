"use client";

import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useOnline } from "@/app/online/online-context";
import UserBadge from "@/components/auth/UserBadge";
import BrowseOverlay from "@/components/game/BrowseOverlay";
import CardPreview from "@/components/game/CardPreview";
import ChaosTwisterOverlay from "@/components/game/ChaosTwisterOverlay";
import { ClientCanvas } from "@/components/game/ClientCanvas";
import CollectionButton from "@/components/game/CollectionButton";
import CombatHudOverlay from "@/components/game/CombatHudOverlay";
import CommonSenseOverlay from "@/components/game/CommonSenseOverlay";
import EarthquakeOverlay from "@/components/game/EarthquakeOverlay";
import ContextMenu from "@/components/game/ContextMenu";
import { ElementChoiceOverlay } from "@/components/game/ElementChoiceOverlay";
import EnhancedOnlineDraft3DScreen from "@/components/game/EnhancedOnlineDraft3DScreen";
import GameToolbox from "@/components/game/GameToolbox";
import HarbingerPortalScreen from "@/components/game/HarbingerPortalScreen";
import { InteractionConsentDialog } from "@/components/game/InteractionConsentDialog";
import MagicHudOverlay from "@/components/game/MagicHudOverlay";
import MatchEndOverlay from "@/components/game/MatchEndOverlay";
import MatchInfoPopup from "@/components/game/MatchInfoPopup";
import MobileHandHint from "@/components/game/MobileHandHint";
import UnitHandsOverlay from "@/components/game/UnitHandsOverlay";
import OnlineConsole from "@/components/game/OnlineConsole";
import OnlineD20Screen from "@/components/game/OnlineD20Screen";
import OnlineDeckSelector from "@/components/game/OnlineDeckSelector";
import OnlineDraftDeckLoader from "@/components/game/OnlineDraftDeckLoader";
import OnlineLifeCounters from "@/components/game/OnlineLifeCounters";
import OnlineMulliganScreen from "@/components/game/OnlineMulliganScreen";
import OnlineSealedDeckLoader from "@/components/game/OnlineSealedDeckLoader";
import OnlineStatusBar from "@/components/game/OnlineStatusBar";
import PileSearchDialog from "@/components/game/PileSearchDialog";
import PithImpOverlay from "@/components/game/PithImpOverlay";
import PlacementDialog from "@/components/game/PlacementDialog";
import PlayerResourcePanels from "@/components/game/PlayerResourcePanel";
import PrivateHandTargetingOverlay from "@/components/game/PrivateHandTargetingOverlay";
// SeerScreen is now integrated into OnlineMulliganScreen
import SwitchSiteHudOverlay from "@/components/game/SwitchSiteHudOverlay";
import {
  DynamicBoard as Board,
  DynamicHand3D as Hand3D,
  DynamicHud3D as Hud3D,
  DynamicPiles3D as Piles3D,
  DynamicTokenPile3D as TokenPile3D,
} from "@/components/game/dynamic-3d";
import { GlobalVideoOverlay } from "@/components/ui/GlobalVideoOverlay";
import KeyboardShortcutsHelp, {
  useHelpShortcut,
} from "@/components/ui/KeyboardShortcutsHelp";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import TrackpadOrbitAdapter from "@/lib/controls/TrackpadOrbitAdapter";
import {
  detectHarbingerSeats,
  hasAnyHarbinger,
} from "@/lib/game/avatarAbilities";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import TextureCache from "@/lib/game/components/TextureCache";
import {
  MAT_PIXEL_H,
  MAT_PIXEL_W,
  BASE_TILE_SIZE,
  MAT_RATIO,
} from "@/lib/game/constants";
import { useCardHover } from "@/lib/game/hooks/useCardHover";
import { Physics } from "@/lib/game/physics";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import {
  arePortalsFullyAssigned,
  needsPortalPhaseForHarbinger,
} from "@/lib/game/store/portalState";
import { useOrbitKeyboardPan } from "@/lib/hooks/useOrbitKeyboardPan";
import { useSoatcPlayers } from "@/lib/hooks/useSoatcStatus";
import { useZoomKeyboardShortcuts } from "@/lib/hooks/useZoomKeyboardShortcuts";
import { LegacySeatVideo3D } from "@/lib/rtc/SeatVideo3D";
import { generateClientLeagueMatchResult } from "@/lib/soatc/clientResult";
import type { LeagueMatchResult } from "@/lib/soatc/types";
import {
  useBoardPingListener,
  useChaosTwisterListener,
  useMatchPlayerNames,
  usePlayerIdentity,
  usePlayerNameMap,
  useRemoteCursorTelemetry,
} from "./matchHooks";

export default function OnlineMatchPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSpectatorView = useMemo(() => {
    try {
      if (!searchParams) return false;
      const v = searchParams.get("watch");
      return v === "1" || v === "true";
    } catch {
      return false;
    }
  }, [searchParams]);
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
  const setOpponentPlayerId = useGameStore((s) => s.setOpponentPlayerId);

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
    orderedPlayerIds,
    myPlayerNumber,
    myPlayerKey,
    opponentSeat,
    opponentPlayerId,
  } = usePlayerIdentity(match, me);

  const resolvedSeat = useMemo<PlayerKey | null>(() => {
    if (myPlayerKey === "p1" || myPlayerKey === "p2") {
      return myPlayerKey;
    }
    if (myPlayerId) {
      const order = Array.isArray(orderedPlayerIds)
        ? orderedPlayerIds
        : Array.isArray(match?.playerIds)
        ? (match?.playerIds as string[])
        : [];
      const idx = order.indexOf(myPlayerId);
      if (idx === 0) return "p1";
      if (idx === 1) return "p2";
    }
    const players = Array.isArray(match?.players) ? match?.players : [];
    const idx = players.findIndex((p) => p?.id === myPlayerId);
    if (idx === 0) return "p1";
    if (idx === 1) return "p2";
    return null;
  }, [
    myPlayerKey,
    myPlayerId,
    orderedPlayerIds,
    match?.playerIds,
    match?.players,
  ]);

  const [spectatorSeat, setSpectatorSeat] = useState<PlayerKey>("p1");
  useEffect(() => {
    if (!isSpectatorView) return;
    if (!matchId) return;
    try {
      const v = sessionStorage.getItem(`spectator_seat_${matchId}`);
      if (v === "p1" || v === "p2") setSpectatorSeat(v as PlayerKey);
    } catch {}
  }, [isSpectatorView, matchId]);
  useEffect(() => {
    if (!isSpectatorView) return;
    if (!matchId) return;
    try {
      sessionStorage.setItem(`spectator_seat_${matchId}`, spectatorSeat);
    } catch {}
  }, [isSpectatorView, matchId, spectatorSeat]);

  const viewPlayerKey = useMemo(
    () => (isSpectatorView ? spectatorSeat : myPlayerKey),
    [isSpectatorView, spectatorSeat, myPlayerKey]
  );
  const viewPlayerNumber = useMemo(
    () => (isSpectatorView ? (spectatorSeat === "p2" ? 2 : 1) : myPlayerNumber),
    [isSpectatorView, spectatorSeat, myPlayerNumber]
  );

  // Initialize actor seat and player IDs in store for ownership guards and consent
  useEffect(() => {
    setActorKey(resolvedSeat);
    setLocalPlayerId(myPlayerId ?? null);
    setOpponentPlayerId(opponentPlayerId ?? null);
    return () => {
      setActorKey(null);
      setLocalPlayerId(null);
      setOpponentPlayerId(null);
    };
  }, [
    setActorKey,
    setLocalPlayerId,
    setOpponentPlayerId,
    resolvedSeat,
    myPlayerId,
    opponentPlayerId,
  ]);

  // Fetch cardback URLs for both players
  const setCardbackUrls = useGameStore((s) => s.setCardbackUrls);
  useEffect(() => {
    const controller = new AbortController();

    // Helper to parse sleeve refs into URLs and preset
    const parseSleeveRefs = (
      data: { selectedSpellbookRef?: string; selectedAtlasRef?: string },
      baseUrl: string
    ) => {
      let spellbookUrl: string | null = null;
      let preset: string | null = null;
      const sbRef = data.selectedSpellbookRef;
      if (sbRef?.startsWith("custom:")) {
        const id = sbRef.slice("custom:".length);
        if (id) spellbookUrl = `${baseUrl}/${id}/spellbook`;
      } else if (sbRef?.startsWith("preset:")) {
        // Use spellbook preset as the unified preset
        preset = sbRef;
      }

      let atlasUrl: string | null = null;
      const atRef = data.selectedAtlasRef;
      if (atRef?.startsWith("custom:")) {
        const id = atRef.slice("custom:".length);
        if (id) atlasUrl = `${baseUrl}/${id}/atlas`;
      } else if (atRef?.startsWith("preset:") && !preset) {
        // Fall back to atlas preset if no spellbook preset
        preset = atRef;
      }

      return { spellbookUrl, atlasUrl, preset };
    };

    const fetchCardbacks = async () => {
      // Fetch my cardbacks (for my seat)
      if (resolvedSeat && myPlayerId) {
        try {
          const res = await fetch("/api/users/me/cardbacks/selected", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (res.ok) {
            const data = (await res.json()) as {
              selectedSpellbookRef?: string;
              selectedAtlasRef?: string;
            };
            const { spellbookUrl, atlasUrl, preset } = parseSleeveRefs(
              data,
              "/api/users/me/cardbacks"
            );
            setCardbackUrls(resolvedSeat, spellbookUrl, atlasUrl, preset);
          }
        } catch {
          // Ignore fetch errors
        }
      }

      // Fetch opponent's cardbacks (for opponent seat)
      if (opponentSeat && opponentPlayerId) {
        try {
          const res = await fetch(`/api/users/${opponentPlayerId}/cardbacks`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (res.ok) {
            const data = (await res.json()) as {
              selectedSpellbookRef?: string;
              selectedAtlasRef?: string;
            };
            const { spellbookUrl, atlasUrl, preset } = parseSleeveRefs(
              data,
              `/api/users/${opponentPlayerId}/cardbacks`
            );
            setCardbackUrls(opponentSeat, spellbookUrl, atlasUrl, preset);
          }
        } catch {
          // Ignore fetch errors
        }
      }
    };

    void fetchCardbacks();
    return () => controller.abort();
  }, [
    resolvedSeat,
    opponentSeat,
    myPlayerId,
    opponentPlayerId,
    setCardbackUrls,
  ]);

  // Fetch playmat URLs for both players (my playmat + opponent's if allowed)
  const setPlaymatUrl = useGameStore((s) => s.setPlaymatUrl);
  const setPlaymatUrlFor = useGameStore((s) => s.setPlaymatUrlFor);
  const setActivePlaymatOwner = useGameStore((s) => s.setActivePlaymatOwner);
  useEffect(() => {
    const controller = new AbortController();

    const fetchPlaymats = async () => {
      // First, check if user wants to see opponent's playmat
      let showOpponentPlaymat = true; // Default to true
      try {
        const prefRes = await fetch("/api/users/me/playmats/preferences", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (prefRes.ok) {
          const prefData = (await prefRes.json()) as {
            showOpponentPlaymat?: boolean;
          };
          showOpponentPlaymat = prefData.showOpponentPlaymat !== false;
        }
      } catch {
        // Ignore - use default
      }

      // Fetch my playmat
      if (resolvedSeat && myPlayerId) {
        try {
          const res = await fetch("/api/users/me/playmats/selected", {
            cache: "no-store",
            signal: controller.signal,
          });
          if (res.ok) {
            const data = (await res.json()) as { selectedPlaymatRef?: string };
            const ref = data.selectedPlaymatRef;
            if (ref?.startsWith("custom:")) {
              const id = ref.slice("custom:".length);
              if (id) {
                setPlaymatUrlFor(
                  resolvedSeat,
                  `/api/users/me/playmats/${id}/image`
                );
              }
            } else {
              setPlaymatUrlFor(resolvedSeat, null);
            }
          }
        } catch {
          // Ignore fetch errors
        }
      }

      // Fetch opponent's playmat (if allowed and opponent exists)
      if (showOpponentPlaymat && opponentSeat && opponentPlayerId) {
        try {
          const res = await fetch(`/api/users/${opponentPlayerId}/playmats`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (res.ok) {
            const data = (await res.json()) as { selectedPlaymatRef?: string };
            const ref = data.selectedPlaymatRef;
            if (ref?.startsWith("custom:")) {
              const id = ref.slice("custom:".length);
              if (id) {
                setPlaymatUrlFor(
                  opponentSeat,
                  `/api/users/${opponentPlayerId}/playmats/${id}/image`
                );
                // Show opponent's playmat by default when they have a custom one
                setActivePlaymatOwner(opponentSeat);
              }
            }
          }
        } catch {
          // Ignore fetch errors
        }
      }

      // Also set the legacy playmatUrl for own playmat (fallback)
      try {
        const res = await fetch("/api/users/me/playmats/selected", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { selectedPlaymatRef?: string };
          const ref = data.selectedPlaymatRef;
          if (ref?.startsWith("custom:")) {
            const id = ref.slice("custom:".length);
            if (id) {
              setPlaymatUrl(`/api/users/me/playmats/${id}/image`);
              return;
            }
          }
        }
        setPlaymatUrl("/playmat.jpg");
      } catch {
        setPlaymatUrl("/playmat.jpg");
      }
    };

    void fetchPlaymats();
    return () => controller.abort();
  }, [
    resolvedSeat,
    opponentSeat,
    myPlayerId,
    opponentPlayerId,
    setPlaymatUrl,
    setPlaymatUrlFor,
    setActivePlaymatOwner,
  ]);

  useRemoteCursorTelemetry(transport);
  useBoardPingListener(transport);
  useChaosTwisterListener(transport);

  // Spectator presence
  const [spectatorCount, setSpectatorCount] = useState<number | null>(null);
  // Commentator mode: only users in COMMENTATOR_IDS can view hands face-up
  const [spectatorCanViewHands, setSpectatorCanViewHands] =
    useState<boolean>(false);
  useEffect(() => {
    if (!transport?.on) return;
    const off = transport.on("message", (m) => {
      const type =
        m && typeof m === "object" && (m as Record<string, unknown>).type;
      if (type === "spectatorsUpdated") {
        const mid = (m as unknown as { matchId?: string }).matchId;
        const count = (m as unknown as { count?: unknown }).count as
          | number
          | undefined;
        if (
          mid === matchId &&
          typeof count === "number" &&
          Number.isFinite(count)
        ) {
          setSpectatorCount(count);
        }
        return;
      }
      if (type === "spectatorPermits") {
        const mid = (m as unknown as { matchId?: string }).matchId;
        const viewHands = !!(m as unknown as { viewHands?: boolean }).viewHands;
        if (mid === matchId) setSpectatorCanViewHands(viewHands);
        return;
      }
    });
    return () => {
      try {
        off?.();
      } catch {}
    };
  }, [transport, matchId]);

  // Spectator keyboard rotation: Left/Right toggles seat
  useEffect(() => {
    if (!isSpectatorView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        setSpectatorSeat((s) => (s === "p1" ? "p2" : "p1"));
        // Reset any accumulated spectator yaw so the baseline seat view is neutral
        try {
          spectatorYawTargetRef.current = 0;
        } catch {}
      } else if (e.key === "ArrowLeft") {
        spectatorYawTargetRef.current -= 0.15;
      } else if (e.key === "ArrowRight") {
        spectatorYawTargetRef.current += 0.15;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSpectatorView]);

  // Keyboard shortcuts help overlay
  const [helpOpen, setHelpOpen] = useHelpShortcut();

  const rtc = voice?.rtc ?? null;
  const matchOverlayTargetId = useMemo(() => {
    return match?.players?.find((p) => p.id && p.id !== myPlayerId)?.id ?? null;
  }, [match?.players, myPlayerId]);
  const voiceRequestConnection = voice?.enabled
    ? voice.requestConnection
    : undefined;

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
  // Track whether we've loaded a deck for this specific match (prevents skipping deck load on fresh joins)
  const deckLoadedForMatchRef = useRef<string | null>(null);
  // Local submission flags to reflect immediate client-side submission before server ack
  const [localSealedSubmitted, setLocalSealedSubmitted] = useState(false);
  const [localDraftSubmitted, setLocalDraftSubmitted] = useState(false);
  const waitingResetDoneRef = useRef<string | null>(null);

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
    console.log("[joinMatch effect] Checking conditions:", {
      connected,
      matchId,
      matchCurrentId: match?.id,
      joinAttempted: joinAttemptedForRef.current,
    });

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
          console.log(
            "[game] Switching to different match - forcing page reload for clean state"
          );
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
          console.log(
            "[game] After reload still have wrong match - resetting game state"
          );
          useGameStore.getState().resetGameState();
          return;
        }
      }
    } catch {}

    if (match?.id === matchId) {
      console.log("[joinMatch effect] Already in correct match");
      if (joinAttemptedForRef.current !== matchId) {
        console.log("[joinMatch effect] Ensuring server-side room join");
        joinAttemptedForRef.current = matchId;
        void (isSpectatorView && transport?.watchMatch
          ? transport.watchMatch(matchId)
          : joinMatch(matchId));
      }
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
    void (isSpectatorView && transport?.watchMatch
      ? transport.watchMatch(matchId)
      : joinMatch(matchId));
  }, [
    connected,
    match?.id,
    matchId,
    joinMatch,
    leaveMatch,
    transport,
    isSpectatorView,
  ]);

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
      console.log(
        "[game] Joining match - requesting resync (will reset state when snapshot arrives)"
      );
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
      !isSpectatorView &&
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
    isSpectatorView,
  ]);

  // Setup state (like offline play)
  // Default CLOSED to avoid flashing overlay on rejoin; we'll open it for new/waiting matches
  const [setupOpen, setSetupOpen] = useState<boolean>(false);

  // Game store selectors needed for setup
  const serverPhase = useGameStore((s) => s.phase);
  const serverTurn = useGameStore((s) => s.turn);
  const storeSetupWinner = useGameStore((s) => s.setupWinner);
  const storeD20Rolls = useGameStore((s) => s.d20Rolls);
  const storeActorKey = useGameStore((s) => s.actorKey);
  const storeMatchEnded = useGameStore((s) => s.matchEnded);
  const storePermanents = useGameStore((s) => s.permanents);
  const showToolbox =
    !isSpectatorView &&
    match?.status === "in_progress" &&
    serverPhase !== "Setup" &&
    !setupOpen &&
    !storeMatchEnded;
  const [prepared, setPrepared] = useState<boolean>(false);
  const [d20RollingComplete, setD20RollingComplete] = useState<boolean>(false);
  const [portalSetupComplete, setPortalSetupComplete] =
    useState<boolean>(false);

  // Portal state from game store
  const portalState = useGameStore((s) => s.portalState);
  const initPortalState = useGameStore((s) => s.initPortalState);
  const avatars = useGameStore((s) => s.avatars);

  // Track when THIS player confirms mulligan (before portal phase)
  const [mulliganReady, setMulliganReady] = useState<boolean>(false);
  // Note: Seer phase is now handled within OnlineMulliganScreen
  const [portalPhaseInitialized, setPortalPhaseInitialized] =
    useState<boolean>(false);

  // Both players ready when match is in_progress (server confirmed both done with mulligan)
  const bothPlayersReady = match?.status === "in_progress";

  // Detect Harbinger seats for portal phase logic
  const harbingerSeats = useMemo(
    () => detectHarbingerSeats(avatars),
    [avatars]
  );

  // Detect if Harbinger portal phase is needed (after BOTH players finish mulligan, before game starts)
  // Portal phase should show for BOTH players when:
  // 1. Portal state exists (initialized by harbinger player) and is not complete, OR
  // 2. Both players ready and any player has Harbinger avatar, OR
  // 3. Harbinger detected but portals not fully assigned (catch edge cases)
  const needsPortalPhase = useMemo(() => {
    // If portal setup already done locally AND portals are fully assigned, skip
    if (portalSetupComplete && arePortalsFullyAssigned(portalState)) {
      return false;
    }

    // If portal state exists and is truly complete with all tiles assigned, skip
    if (arePortalsFullyAssigned(portalState)) {
      return false;
    }

    // If portal state exists but not complete, show portal phase for BOTH players
    // This handles the case where one player receives portal state via patch
    if (portalState && !portalState.setupComplete) {
      return true;
    }

    // Check if Harbinger avatars exist but portals aren't assigned
    // This catches the case where game progressed without portal phase
    if (
      harbingerSeats.length > 0 &&
      needsPortalPhaseForHarbinger(portalState, harbingerSeats)
    ) {
      return true;
    }

    // Only check for new Harbinger detection after BOTH players are mulligan-ready
    if (!bothPlayersReady) return false;

    // Final check: any Harbinger avatar present
    return hasAnyHarbinger(avatars);
  }, [
    bothPlayersReady,
    portalSetupComplete,
    portalState,
    avatars,
    harbingerSeats,
  ]);

  // Initialize portal state when BOTH players ready and Harbinger is detected
  // Also handle case where portal state already exists from server (reload/resync)
  useEffect(() => {
    // Skip if match status is not in_progress yet (still waiting for both players)
    // This prevents stale portal state from previous matches from being used
    if (match?.status !== "in_progress" && match?.status !== "ended") {
      return;
    }

    // If portal state already exists from server (e.g., after reload) AND is fully complete,
    // mark as initialized and complete. Otherwise, let the normal flow handle it.
    if (portalState && !portalPhaseInitialized) {
      const portalsAssigned = arePortalsFullyAssigned(portalState);
      console.log("[Portal] Found existing portal state from server", {
        setupComplete: portalState.setupComplete,
        harbingerSeats: portalState.harbingerSeats,
        currentRoller: portalState.currentRoller,
        portalsAssigned,
      });
      // Only mark as initialized AND complete if portals are actually assigned
      // Otherwise, let the normal flow below handle initialization
      if (portalState.setupComplete && portalsAssigned) {
        setPortalPhaseInitialized(true);
        setPortalSetupComplete(true);
        return;
      }
      // If portal state exists but isn't complete, don't set portalPhaseInitialized
      // so the normal flow below can run initPortalState() or show the portal UI
    }

    if (!bothPlayersReady) return;
    if (portalPhaseInitialized) return;

    // Wait until both avatars have their card data populated before checking for Harbinger.
    // Avatar cards are set asynchronously when decks are loaded, so we need to wait.
    const p1HasCard = avatars.p1?.card?.name;
    const p2HasCard = avatars.p2?.card?.name;
    if (!p1HasCard || !p2HasCard) {
      console.log("[Portal] Waiting for avatar cards to be populated...", {
        p1: p1HasCard ?? "(none)",
        p2: p2HasCard ?? "(none)",
      });
      return;
    }

    setPortalPhaseInitialized(true);

    const harbingerSeats = detectHarbingerSeats(avatars);
    if (harbingerSeats.length > 0) {
      console.log("[Portal] Detected Harbinger avatars:", harbingerSeats);
      initPortalState(harbingerSeats);
    } else {
      // No Harbinger, mark portal phase as complete and proceed
      setPortalSetupComplete(true);
    }
  }, [
    match?.status,
    bothPlayersReady,
    portalPhaseInitialized,
    portalState,
    avatars,
    initPortalState,
  ]);

  // Watch for portal setup completion - only mark complete if portals are actually assigned
  useEffect(() => {
    if (portalState?.setupComplete && !portalSetupComplete) {
      // Verify portals are actually assigned before marking complete
      if (arePortalsFullyAssigned(portalState)) {
        setPortalSetupComplete(true);
      } else {
        console.warn(
          "[Portal] setupComplete flag set but portals not fully assigned",
          portalState
        );
      }
    }
  }, [portalState, portalSetupComplete]);

  // Determine if seer phase is needed for this match type
  // Seer is always enabled for constructed and precon matches
  // For sealed/draft, it's enabled only if enableSeer is set in the config
  const needsSeerPhase =
    match?.matchType === "constructed" ||
    match?.matchType === "precon" ||
    !match?.matchType ||
    (match?.matchType === "sealed" && match?.sealedConfig?.enableSeer) ||
    (match?.matchType === "draft" && match?.draftConfig?.enableSeer);

  // Debug logging for seer phase
  useEffect(() => {
    console.log("[Seer] Online play page:", {
      matchType: match?.matchType,
      needsSeerPhase,
      mulliganReady,
      sealedEnableSeer: match?.sealedConfig?.enableSeer,
      draftEnableSeer: match?.draftConfig?.enableSeer,
    });
  }, [
    match?.matchType,
    needsSeerPhase,
    mulliganReady,
    match?.sealedConfig?.enableSeer,
    match?.draftConfig?.enableSeer,
  ]);

  // After portal phase completes, call finishSetup to finalize game start
  // Note: Seer phase is now handled within OnlineMulliganScreen (before mulliganReady is set)
  // IMPORTANT: Only proceed if no Harbinger OR if portals are fully assigned
  useEffect(() => {
    if (!bothPlayersReady) return;
    if (!portalSetupComplete) return;

    // If Harbinger is present, verify portals are actually assigned
    if (harbingerSeats.length > 0) {
      if (!arePortalsFullyAssigned(portalState)) {
        console.warn(
          "[Portal] Blocking game start - Harbinger detected but portals not assigned",
          { harbingerSeats, portalState }
        );
        return;
      }
    }

    finishSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothPlayersReady, portalSetupComplete, harbingerSeats, portalState]); // finishSetup intentionally excluded - not memoized

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
    isDraftMatch &&
    (match?.status === "deck_construction" ||
      draftCompleted ||
      draftPhase === "complete");

  // Prevent showing draft component again once it's completed or if we already submitted a deck
  const shouldShowDraft = isDraftActive && !hasSubmittedDraftDeck;

  const tournamentId =
    (match as unknown as { tournamentId?: string | null } | undefined)
      ?.tournamentId || null;

  // Persist draft configuration so the deck editor can recover cube flags (e.g., includeCubeSideboardInStandard)
  useEffect(() => {
    if (!isDraftMatch) return;
    if (!matchId) return;
    const cfg = match?.draftConfig || null;
    if (!cfg) return;
    try {
      const slim = {
        cubeId: (cfg as { cubeId?: string | null }).cubeId ?? null,
        cubeName: (cfg as { cubeName?: string | null }).cubeName ?? null,
        includeCubeSideboardInStandard: (
          cfg as {
            includeCubeSideboardInStandard?: boolean;
          }
        ).includeCubeSideboardInStandard,
      };
      localStorage.setItem(`draftConfig_${matchId}`, JSON.stringify(slim));
    } catch {}
  }, [isDraftMatch, matchId, match?.draftConfig]);

  // Auto-load any deck that the match server has already attached to us (sealed/draft/tournament rebuilt decks)
  useEffect(() => {
    if (prepared) return;

    // If a resync is underway, wait for it to deliver the authoritative server snapshot
    // before doing any local deck loading.
    if (resyncing) {
      return;
    }

    // Simple flag-based approach: Skip deck loading only if we've already loaded a deck for this match.
    // This prevents skipping deck load when joining a fresh match after finishing a previous one.
    if (deckLoadedForMatchRef.current === matchId) {
      console.log(
        "[match] Deck already loaded for this match; skipping deck load",
        {
          matchId,
          status: match?.status,
        }
      );
      setPrepared(true);
      return;
    }

    // If the server has provided any meaningful game snapshot, treat it as authoritative and
    // do NOT regenerate local decks/hands. This avoids hand re-rolls and deck switches on reload.
    // Empty game object {} should not be treated as meaningful state.
    const hasMeaningfulGameState = (() => {
      const game = (match as unknown as { game?: unknown })?.game;
      if (!game || typeof game !== "object") return false;
      const keys = Object.keys(game);
      // Empty object {} is not meaningful
      if (keys.length === 0) return false;
      // Check for actual game state properties (not just Setup phase data)
      // d20Rolls with null values is NOT meaningful - it's initial state
      const hasActualRolls = (() => {
        try {
          const rolls = (game as Record<string, unknown>)?.d20Rolls;
          if (!rolls || typeof rolls !== "object") return false;
          const r = rolls as Record<string, unknown>;
          return (
            (r.p1 != null && r.p1 !== null) || (r.p2 != null && r.p2 !== null)
          );
        } catch {
          return false;
        }
      })();
      return (
        keys.some(
          (k) =>
            k === "zones" ||
            k === "board" ||
            k === "permanents" ||
            k === "libraries" ||
            k === "currentPlayer" ||
            k === "avatars" ||
            k === "mulligans"
        ) || hasActualRolls
      );
    })();
    if (hasMeaningfulGameState) {
      console.log(
        "[match] Server game snapshot present; skipping local deck autoload"
      );
      setPrepared(true);
      return;
    }

    // Only auto-load local deck during waiting/deck_construction phases.
    // If the match is beyond setup, wait for server state instead.
    if (match?.status !== "waiting" && match?.status !== "deck_construction") {
      setPrepared(true);
      return;
    }

    if (!match?.playerDecks || !me?.id) return;
    if (!myPlayerKey || storeActorKey !== myPlayerKey) return;

    const rawDeck = (match.playerDecks as Record<string, unknown>)[me.id];
    if (!rawDeck) return;

    console.log("[match] Auto-loading deck from match.playerDecks:", {
      deckLength: Array.isArray(rawDeck) ? rawDeck.length : "not an array",
      sampleCards: Array.isArray(rawDeck)
        ? (rawDeck as Array<Record<string, unknown>>).slice(0, 3)
        : rawDeck,
    });

    let cancelled = false;

    (async () => {
      try {
        let deckToLoad = rawDeck;

        // Check if this is condensed tournament format {cardId, quantity}
        // vs full card objects {cardId, name, type, ...}
        if (Array.isArray(rawDeck) && rawDeck.length > 0) {
          const firstCard = rawDeck[0] as Record<string, unknown>;
          const isCondensedFormat =
            "quantity" in firstCard && !("type" in firstCard);

          if (isCondensedFormat) {
            console.log(
              "[match] Detected condensed tournament deck format, expanding to full cards..."
            );

            // Extract unique card IDs
            const cardIds = Array.from(
              new Set(
                (rawDeck as Array<{ cardId: string; quantity: number }>)
                  .map((entry) => Number(entry.cardId))
                  .filter((n) => Number.isFinite(n) && n > 0)
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
                  subTypes?: string | null;
                  cost?: number | null;
                  thresholds?: Record<string, number> | null;
                }>;

                const byId = new Map(
                  metas.map((m) => [
                    m.cardId,
                    {
                      name: m.name,
                      slug: m.slug,
                      setName: m.setName,
                      type: m.type || null,
                      subTypes: m.subTypes || null,
                      cost: m.cost ?? null,
                      thresholds: m.thresholds ?? null,
                    },
                  ])
                );

                // Expand condensed format to full cards
                const expandedDeck: Array<Record<string, unknown>> = [];
                for (const entry of rawDeck as Array<{
                  cardId: string;
                  quantity: number;
                }>) {
                  const idNum = Number(entry.cardId);
                  const meta = byId.get(idNum);
                  if (!meta) {
                    console.warn(
                      `[match] Missing metadata for card ID ${idNum}`
                    );
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
                      subTypes: meta.subTypes || null,
                      thresholds: meta.thresholds || null,
                    });
                  }
                }

                console.log(
                  "[match] Expanded deck to",
                  expandedDeck.length,
                  "cards"
                );
                deckToLoad = expandedDeck;
              } else {
                console.error(
                  "[match] Failed to fetch card metadata for condensed deck"
                );
              }
            }
          }
        }

        // Ensure the deck includes an Avatar so validation succeeds during setup
        if (Array.isArray(deckToLoad)) {
          const hasAvatar = deckToLoad.some((card) => {
            const type =
              typeof (card as Record<string, unknown>)?.type === "string"
                ? ((card as Record<string, unknown>).type as string)
                : "";
            return type.toLowerCase().includes("avatar");
          });

          if (!hasAvatar) {
            const avatarCard = (
              match as unknown as {
                game?: {
                  avatars?: Record<
                    string,
                    { card?: Record<string, unknown> | null } | null
                  >;
                };
              }
            )?.game?.avatars?.[myPlayerKey]?.card;

            if (avatarCard && typeof avatarCard === "object") {
              const avatarCardId = Number(
                (
                  avatarCard as {
                    cardId?: number | string;
                    id?: number | string;
                  }
                ).cardId ??
                  (
                    avatarCard as {
                      cardId?: number | string;
                      id?: number | string;
                    }
                  ).id ??
                  0
              );
              if (Number.isFinite(avatarCardId) && avatarCardId > 0) {
                deckToLoad = [
                  ...deckToLoad,
                  {
                    id: String(avatarCardId),
                    cardId: avatarCardId,
                    name:
                      (avatarCard as { name?: string; cardName?: string })
                        .name ||
                      (avatarCard as { name?: string; cardName?: string })
                        .cardName ||
                      "Avatar",
                    slug: (avatarCard as { slug?: string }).slug || "",
                    set:
                      (avatarCard as { set?: string; setName?: string }).set ||
                      (avatarCard as { set?: string; setName?: string })
                        .setName ||
                      "Beta",
                    type:
                      (avatarCard as { type?: string }).type &&
                      String((avatarCard as { type?: string }).type).length > 0
                        ? String((avatarCard as { type?: string }).type)
                        : "Avatar",
                    thresholds:
                      (
                        avatarCard as {
                          thresholds?: Record<string, number> | null;
                        }
                      ).thresholds || null,
                  },
                ];
                console.log("[match] Injected avatar into deck for auto-load", {
                  cardId: avatarCardId,
                  name:
                    (avatarCard as { name?: string; cardName?: string }).name ||
                    (avatarCard as { name?: string; cardName?: string })
                      .cardName ||
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

        // Mark that we've successfully loaded a deck for this match
        deckLoadedForMatchRef.current = matchId;

        useGameStore.getState().setPhase("Setup");
        setPrepared(true);
      } catch (error) {
        console.error(
          "[match] Failed to auto-load deck from match data:",
          error
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    prepared,
    match,
    matchId,
    match?.playerDecks,
    me?.id,
    myPlayerKey,
    storeActorKey,
    tournamentId,
    resyncing,
  ]);

  // Submit the tournament deck to the match server so it behaves like other auto-loaded decks
  useEffect(() => {
    if (!tournamentId) return;
    if (!transport?.submitDeck) return;
    if (!matchId || match?.id !== matchId) return;
    if (match?.matchType !== "constructed") return;
    if (match?.status !== "waiting" && match?.status !== "deck_construction")
      return;
    if (!me?.id || !myPlayerKey) return;

    // Reset attempts if tournament context changed
    if (lastTournamentIdRef.current !== tournamentId) {
      deckFetchAttemptsRef.current = 0;
      lastTournamentIdRef.current = tournamentId;
    }

    const currentDeck = (
      match?.playerDecks as Record<string, unknown> | undefined
    )?.[me.id];
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
          subTypes?: string | null;
        }>;
        console.log(
          "[match] Fetched card metadata for",
          metas.length,
          "cards. Sample:",
          metas.slice(0, 3)
        );
        const byId = new Map<
          number,
          {
            name: string;
            slug: string;
            setName: string;
            type: string | null;
            subTypes: string | null;
            cost: number | null;
            thresholds: Record<string, number> | null;
          }
        >();
        for (const meta of metas) {
          const cardType = meta.type || null;
          const cardSubTypes = meta.subTypes || null;
          byId.set(Number(meta.cardId), {
            name: meta.name,
            slug: meta.slug,
            setName: meta.setName,
            type: cardType,
            subTypes: cardSubTypes,
            cost: (meta as { cost?: number | null }).cost ?? null,
            thresholds:
              (meta as { thresholds?: Record<string, number> | null })
                .thresholds ?? null,
          });
        }

        console.log(
          "[match] Building deck from list with",
          list.length,
          "unique cards"
        );
        console.log("[match] Metadata map has", byId.size, "entries");
        console.log("[match] Sample list entry:", list[0]);
        console.log(
          "[match] Sample byId keys:",
          Array.from(byId.keys()).slice(0, 5)
        );

        const deck: Array<Record<string, unknown>> = [];
        for (const entry of list) {
          const idNum = Number(entry.cardId);
          const meta = byId.get(idNum);
          if (!meta) {
            console.error(
              `[match] Missing metadata for card ID ${idNum} (type: ${typeof entry.cardId})`,
              {
                entry,
                hasInMap: byId.has(idNum),
                mapKeys: Array.from(byId.keys()),
              }
            );
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
              subTypes: meta.subTypes || null,
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

  useEffect(() => {
    if (!matchId || match?.id !== matchId) return;
    if (resyncing) return;
    // Check for meaningful server game state (not just empty {} or Setup phase data)
    const hasMeaningfulServerGameState = (() => {
      const game = (match as unknown as { game?: unknown })?.game;
      if (!game || typeof game !== "object") return false;
      const keys = Object.keys(game);
      if (keys.length === 0) return false;
      // d20Rolls with null values is NOT meaningful - it's initial state
      const hasActualRolls = (() => {
        try {
          const rolls = (game as Record<string, unknown>)?.d20Rolls;
          if (!rolls || typeof rolls !== "object") return false;
          const r = rolls as Record<string, unknown>;
          return (
            (r.p1 != null && r.p1 !== null) || (r.p2 != null && r.p2 !== null)
          );
        } catch {
          return false;
        }
      })();
      return (
        keys.some(
          (k) =>
            k === "zones" ||
            k === "board" ||
            k === "permanents" ||
            k === "libraries" ||
            k === "currentPlayer" ||
            k === "avatars" ||
            k === "mulligans"
        ) || hasActualRolls
      );
    })();
    // Reset game state for waiting matches to ensure D20 flow always shows
    // For deck_construction, only reset if there's no meaningful server state (to preserve sealed/draft data)
    const shouldReset =
      match?.status === "waiting" ||
      (match?.status === "deck_construction" && !hasMeaningfulServerGameState);
    if (shouldReset) {
      // Allow repeated resets even if matchId is the same, by keying on status/snapshot presence
      const resetKey = `${matchId}:${match?.status}:${
        hasMeaningfulServerGameState ? 1 : 0
      }`;
      if (waitingResetDoneRef.current !== resetKey) {
        try {
          useGameStore.getState().resetGameState();
        } catch {}
        // Also reset local setup wizard flags so we show the deck loader again
        setPrepared(false);
        setD20RollingComplete(false);
        waitingResetDoneRef.current = resetKey;
      }
    }
  }, [matchId, match, match?.id, match?.status, resyncing, setPrepared]);

  useEffect(() => {
    if (!matchId || match?.id !== matchId) return;
    if (resyncing) return;
    if (serverPhase !== "Setup") return;

    const hasBoardState = (() => {
      try {
        const perms = storePermanents as unknown;
        if (perms && typeof perms === "object") {
          const keys = Object.keys(perms as Record<string, unknown>);
          if (keys.length > 0) return true;
        }
      } catch {}
      return false;
    })();

    if (!hasBoardState) return;

    try {
      useGameStore.getState().resetGameState();
    } catch {}
    setPrepared(false);
    setD20RollingComplete(false);
  }, [
    matchId,
    match?.id,
    serverPhase,
    resyncing,
    storePermanents,
    setPrepared,
    setD20RollingComplete,
  ]);

  // Auto-redirect to sealed editor for sealed matches in deck construction
  // But only if we haven't already submitted a deck (avoid redirect loop)
  useEffect(() => {
    if (!matchId || match?.id !== matchId) return;
    if (!match) return;

    // Auto-redirect to sealed editor when joining sealed match during deck construction
    // But only if we haven't submitted a deck yet (prefer server-confirmed check) AND not a tournament match.
    if (
      match.status === "deck_construction" &&
      match.matchType === "sealed" &&
      !hasSubmittedSealedDeck
    ) {
      // For tournament matches, do NOT redirect; wait for deck attachment and show preparation panel
      if (tournamentId) {
        return;
      }
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
      if (
        (match.sealedConfig as { freeAvatars?: boolean } | null)?.freeAvatars
      ) {
        params.set("freeAvatars", "true");
      }

      // Persist my exact server-generated sealed packs for the editor to consume
      try {
        const myId = me?.id ?? myPlayerId ?? null;
        const packsByPlayer = match.sealedPacks as unknown as
          | Record<string, unknown[]>
          | undefined;
        console.log("[Sealed Redirect] Checking sealedPacks:", {
          myId,
          hasSealedPacks: !!packsByPlayer,
          playerIds: packsByPlayer ? Object.keys(packsByPlayer) : [],
          myPackCount: myId && packsByPlayer ? packsByPlayer[myId]?.length : 0,
        });
        if (myId && packsByPlayer && Array.isArray(packsByPlayer[myId])) {
          console.log(
            "[Sealed Redirect] Saving packs to localStorage:",
            packsByPlayer[myId].length
          );
          localStorage.setItem(
            `sealedPacks_${match.id}`,
            JSON.stringify(packsByPlayer[myId])
          );
        } else {
          console.warn(
            "[Sealed Redirect] No sealedPacks found for player",
            myId
          );
        }
      } catch (e) {
        console.error("[Sealed Redirect] Error saving packs:", e);
      }

      // Also pass packCounts in URL as backup
      if (match.sealedConfig?.packCounts) {
        params.set("packCounts", JSON.stringify(match.sealedConfig.packCounts));
      }

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
      if (
        (match.draftConfig as { freeAvatars?: boolean } | null)?.freeAvatars
      ) {
        params.set("freeAvatars", "true");
      }

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
    tournamentId,
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
    // Spectators never see the setup overlay
    if (isSpectatorView) {
      if (setupOpen) setSetupOpen(false);
      return;
    }
    if (!matchId || match?.id !== matchId) return;
    if (!match) return;

    let desired = setupOpen;
    const ended = match.status === "ended";
    // Check game phase from game store (which gets updated from resync)
    // "Main" phase means game started and player has drawn
    // "Start" phase on turn 1 means mulligan phase, on turn > 1 means waiting for draw
    // "Setup" phase means D20 rolling OR waiting for players
    // Game has started if we're in Main phase OR if we're past turn 1
    const gameActuallyStarted =
      serverPhase === "Main" ||
      serverTurn > 1 ||
      (serverPhase === "Start" && serverTurn === 1 && bothPlayersReady);
    const d20Complete = (() => {
      const r = storeD20Rolls;
      const p1 = r?.p1;
      const p2 = r?.p2;
      const bothRolled = p1 != null && p2 != null;
      const notTie = bothRolled && Number(p1) !== Number(p2);
      return Boolean(storeSetupWinner) || notTie;
    })();

    console.log("[setupOpen logic]", {
      serverPhase,
      storeSetupWinner,
      storeD20Rolls,
      d20Complete,
      d20RollingComplete,
      matchStatus: match.status,
      resyncing,
    });

    if (ended) {
      desired = false;
    } else if (resyncing) {
      desired = true;
    } else if (shouldShowDraft) {
      desired = false;
    } else if (gameActuallyStarted) {
      // Keep overlay open during Harbinger portal phase (between mulligan and game start)
      // Note: Seer phase is now handled within OnlineMulliganScreen
      if (needsPortalPhase && !portalSetupComplete) {
        desired = true;
      } else {
        desired = false;
      }
      // Only mark as prepared if we've actually loaded a deck for this match
      // Otherwise we'll skip the deck loading step on constructed matches
      if (!prepared && deckLoadedForMatchRef.current === matchId) {
        setPrepared(true);
      }
      // D20 is complete when phase advances past Setup (to Start or Main)
      // This ensures both players sync when server advances phase
      if (!d20RollingComplete) setD20RollingComplete(true);
    } else if (
      match.status === "waiting" ||
      match.status === "deck_construction"
    ) {
      desired = true;
      if (!gameActuallyStarted && serverPhase !== "Setup" && !d20Complete) {
        try {
          useGameStore.getState().setPhase("Setup");
        } catch {}
      }
    } else if (serverPhase === "Setup") {
      // Always show setup overlay during Setup phase, regardless of local d20RollingComplete
      // This ensures both players see D20 screen when in Setup phase
      desired = true;
      // Reset d20RollingComplete if we're back in Setup phase (e.g., after reload)
      if (d20RollingComplete && !prepared) {
        setD20RollingComplete(false);
      }
    } else if (!prepared) {
      desired = true;
    }

    if (desired !== setupOpen) setSetupOpen(desired);
  }, [
    isSpectatorView,
    matchId,
    match,
    match?.id,
    match?.status,
    resyncing,
    shouldShowDraft,
    prepared,
    serverPhase,
    serverTurn,
    bothPlayersReady,
    setupOpen,
    setPrepared,
    d20RollingComplete,
    setD20RollingComplete,
    storeSetupWinner,
    storeD20Rolls,
    needsPortalPhase,
    portalSetupComplete,
  ]);

  useEffect(() => {
    if (isSpectatorView) {
      setSetupOpen(false);
    }
  }, [isSpectatorView]);

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
    setMulliganReady(false);
    // seerComplete is derived from synced seerState, no need to reset locally
    setPortalSetupComplete(false);
    setPortalPhaseInitialized(false);

    // Clear deck loaded flag when entering a new match
    deckLoadedForMatchRef.current = null;

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
  const [finalEndContext, setFinalEndContext] = useState<{
    winner: PlayerKey | null;
    playerNames: { p1: string; p2: string };
    myPlayerKey: PlayerKey | null;
  } | null>(null);

  // SOATC League result for match end overlay
  const [soatcLeagueResult, setSoatcLeagueResult] =
    useState<LeagueMatchResult | null>(null);

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
  const cardPreviewsEnabled = useGameStore((s) => s.cardPreviewsEnabled);
  const toggleCardPreviews = useGameStore((s) => s.toggleCardPreviews);
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

  // Restore camera mode from localStorage after hydration to avoid mismatch
  const cameraModeRestoredRef = useRef(false);
  useEffect(() => {
    if (cameraModeRestoredRef.current) return;
    cameraModeRestoredRef.current = true;
    // Defer to next tick to ensure hydration is complete
    requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem("sorcery:cameraMode");
        if (stored === "orbit" && cameraMode !== "orbit") {
          setCameraMode("orbit");
        }
      } catch {}
    });
  }, [cameraMode, setCameraMode]);

  // Compute natural tilt angle for 2D mode and reuse across handlers
  // Use a tiny epsilon (not exactly 0) to avoid gimbal lock in Chrome's OrbitControls
  const naturalTiltAngle = useMemo(() => 0.001, []);
  const safeMinOrbitTilt = 0.06;

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
        const tilt = naturalTiltAngle;
        const sign = viewPlayerNumber === 2 ? -1 : 1;
        cam.position.set(
          0,
          Math.cos(tilt) * dist,
          sign * Math.sin(tilt) * dist
        );
        cam.up.set(0, 1, 0);
      } else {
        // Reasonable default orbit position based on seat (slightly offset)
        const orbitZ = viewPlayerNumber === 2 ? -5 : 5;
        cam.position.set(0, 10, orbitZ);
        cam.up.set(0, 1, 0);
      }
      cam.lookAt(0, 0, 0);
      c.update();
    },
    [viewPlayerNumber, matW, matH, naturalTiltAngle]
  );

  const resetCamera = useCallback(() => {
    gotoBaseline(cameraMode);
    if (isSpectatorView) {
      try {
        spectatorYawTargetRef.current = 0;
      } catch {}
    }
  }, [gotoBaseline, cameraMode, isSpectatorView]);

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
  }, [cameraMode, gotoBaseline, matW, matH, viewPlayerNumber]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.tagName === "BUTTON")
      ) {
        return;
      }
      e.preventDefault();
      resetCamera();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetCamera]);

  // Keyboard shortcut: P to toggle card previews
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "p" && e.key !== "P") return;
      // Ignore if typing in input fields
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.isContentEditable ||
          t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT")
      ) {
        return;
      }
      e.preventDefault();
      toggleCardPreviews();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCardPreviews]);

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
    try {
      const phase = useGameStore.getState().phase;
      if (phase === "Main") return;
    } catch {}

    try {
      window.setTimeout(() => {
        try {
          const phaseNow = useGameStore.getState().phase;
          const inProgress = match?.status === "in_progress";
          if (phaseNow !== "Main" && !inProgress) {
            try {
              const tr = useGameStore.getState().transport as unknown as {
                mulliganDone?: () => void;
              } | null;
              if (tr && typeof tr.mulliganDone === "function")
                tr.mulliganDone();
            } catch {}
            try {
              if (matchId) {
                void joinMatch(matchId);
              }
            } catch {}
            try {
              if (resyncSentForRef.current !== matchId) {
                resync();
                resyncSentForRef.current = matchId;
              }
            } catch {}
          }
        } catch {}
      }, 1500);
    } catch {}
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

  // When the overlay opens, freeze the context only once the authoritative result is known.
  // If we initially saw a null winner (transient) and later receive a concrete winner, upgrade once.
  useEffect(() => {
    if (!matchEndOverlayOpen) return;

    setFinalEndContext((prev) => {
      if (prev) {
        if (prev.winner == null && (winner === "p1" || winner === "p2")) {
          return { ...prev, winner };
        }
        return prev;
      }
      if (
        matchEnded &&
        (winner === "p1" || winner === "p2" || winner === null)
      ) {
        return { winner, playerNames, myPlayerKey };
      }
      return prev ?? null;
    });
  }, [matchEndOverlayOpen, matchEnded, winner, playerNames, myPlayerKey]);

  // Reset match end overlay when joining a new match
  useEffect(() => {
    // Reset the overlay states when the match ID changes (new match)
    setMatchEndOverlayOpen(false);
    prevEndedRef.current = false;
    setFinalEndContext(null);
    setSoatcLeagueResult(null);
  }, [matchId]);

  // Get player IDs for SOATC lookup
  const matchPlayerIds = useMemo(() => {
    const players = match?.players || [];
    return players.map((p) => p.id).filter(Boolean);
  }, [match?.players]);

  // Fetch SOATC player info (UUIDs) for the match players
  const { players: soatcPlayerInfo } = useSoatcPlayers(matchPlayerIds);

  // Generate SOATC league result when match ends (if it's a league match)
  useEffect(() => {
    console.log("[SOATC] Match end result generation check:", {
      matchEndOverlayOpen,
      matchEnded,
      hasResult: !!soatcLeagueResult,
      matchHasSoatcFlag: !!(match as { soatcLeagueMatch?: unknown })
        ?.soatcLeagueMatch,
    });

    if (!matchEndOverlayOpen || !matchEnded || soatcLeagueResult) return;

    // Check if this is a SOATC league match
    const soatcMatch = (
      match as {
        soatcLeagueMatch?: {
          isLeagueMatch: boolean;
          tournamentId: string;
          tournamentName: string;
        } | null;
      }
    )?.soatcLeagueMatch;

    console.log("[SOATC] Match soatcLeagueMatch data:", soatcMatch);
    if (!soatcMatch?.isLeagueMatch) return;

    // Get player info from match
    const players = match?.players || [];
    const p1 = players[0];
    const p2 = players[1];

    if (!p1 || !p2 || !matchId) return;

    // Get SOATC UUIDs from the fetched player info
    const p1SoatcInfo = soatcPlayerInfo[p1.id];
    const p2SoatcInfo = soatcPlayerInfo[p2.id];

    try {
      const result = generateClientLeagueMatchResult({
        matchId,
        tournamentId: soatcMatch.tournamentId,
        tournamentName: soatcMatch.tournamentName,
        player1: {
          realmsUserId: p1.id,
          displayName: p1.displayName || "Player 1",
          soatcUuid: p1SoatcInfo?.soatcUuid || "",
        },
        player2: {
          realmsUserId: p2.id,
          displayName: p2.displayName || "Player 2",
          soatcUuid: p2SoatcInfo?.soatcUuid || "",
        },
        winnerPlayerKey: winner,
        isDraw: winner === null,
        format:
          (match?.matchType as "constructed" | "sealed" | "draft") ||
          "constructed",
        startedAt: new Date(
          (match as { startedAt?: number })?.startedAt || Date.now()
        ),
        completedAt: new Date(),
        replayId: matchId,
      });
      setSoatcLeagueResult(result);

      // Save to database for match history
      fetch("/api/soatc/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          tournamentId: soatcMatch.tournamentId,
          tournamentName: soatcMatch.tournamentName,
          player1Id: p1.id,
          player1SoatcId: p1SoatcInfo?.soatcUuid || "",
          player2Id: p2.id,
          player2SoatcId: p2SoatcInfo?.soatcUuid || "",
          winnerId: result.winnerId,
          winnerSoatcId: result.winnerId
            ? (result.winnerId === p1.id
                ? p1SoatcInfo?.soatcUuid
                : p2SoatcInfo?.soatcUuid) || null
            : null,
          isDraw: winner === null,
          format:
            (match?.matchType as "constructed" | "sealed" | "draft") ||
            "constructed",
          resultJson: result,
          startedAt: (match as { startedAt?: number })?.startedAt || Date.now(),
        }),
      }).catch((err) => {
        console.error("Failed to save SOATC match result to database:", err);
      });
    } catch (err) {
      console.error("Failed to generate SOATC league result:", err);
    }
  }, [
    matchEndOverlayOpen,
    matchEnded,
    match,
    matchId,
    winner,
    soatcLeagueResult,
    soatcPlayerInfo,
  ]);

  // Check if we're in the correct match
  const inThisMatch = !!matchId && (match?.id === matchId || isSpectatorView);

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

  const boardInteractionMode =
    isSpectatorView || endedByMatchStatus || matchEnded
      ? "spectator"
      : "normal";
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

    // Prevent camera from getting into extreme positions that cause rotation flips.
    // Clamp the camera's absolute XZ position to prevent gimbal-lock-like behavior
    // when panning far from the board while zoomed out.
    const camBoundX = halfW + maxDist * 1.5;
    const camBoundZ = halfH + maxDist * 1.5;
    if (cam.position.x < -camBoundX) {
      cam.position.x = -camBoundX;
      t.x = cam.position.x - offset.x;
      changed = true;
    } else if (cam.position.x > camBoundX) {
      cam.position.x = camBoundX;
      t.x = cam.position.x - offset.x;
      changed = true;
    }
    if (cam.position.z < -camBoundZ) {
      cam.position.z = -camBoundZ;
      t.z = cam.position.z - offset.z;
      changed = true;
    } else if (cam.position.z > camBoundZ) {
      cam.position.z = camBoundZ;
      t.z = cam.position.z - offset.z;
      changed = true;
    }
    // Ensure camera Y stays positive (above the board) to prevent flip
    if (cam.position.y < 0.5) {
      cam.position.y = 0.5;
      changed = true;
    }

    if (changed) {
      cam.position.copy(t.clone().add(offset));
      c.update();
    }
  }, [matW, matH, maxDist]);

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
  // Smooth spectator rotation helpers
  const spectatorYawTargetRef = useRef<number>(0);
  const cameraOptions = useMemo(
    () => ({
      position: (viewPlayerNumber === 2 ? [0, 10, -5] : [0, 10, 5]) as [
        number,
        number,
        number
      ],
      fov: 50,
    }),
    [viewPlayerNumber]
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
    <div className="fixed inset-0 w-screen h-screen select-none">
      {/* Camera controls - left: reset icon + 2D/3D buttons */}
      <div className="absolute top-2 left-2 z-30">
        <div className="bg-black/50 rounded-lg p-1 ring-1 ring-white/10 flex items-center">
          <button
            onClick={resetCamera}
            aria-label="Reset camera"
            title="Reset camera (Tab)"
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
              {/* Compass icon */}
              <circle cx="12" cy="12" r="10" />
              <polygon
                points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
                fill="currentColor"
              />
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

      {inThisMatch && isSpectatorView && (
        <div className="absolute top-2 right-2 z-30">
          <div className="flex items-center gap-2">
            <div className="px-2 py-1 rounded bg-purple-600/80 text-white text-xs font-semibold shadow">
              Spectating
              {typeof spectatorCount === "number" ? ` (${spectatorCount})` : ""}
            </div>
            <div className="bg-black/40 rounded-md p-0.5">
              <button
                className={`px-2 py-1 text-xs rounded ${
                  spectatorSeat === "p1" ? "bg-white/20" : "hover:bg-white/10"
                }`}
                onClick={() => setSpectatorSeat("p1")}
              >
                P1
              </button>
              <button
                className={`ml-1 px-2 py-1 text-xs rounded ${
                  spectatorSeat === "p2" ? "bg-white/20" : "hover:bg-white/10"
                }`}
                onClick={() => setSpectatorSeat("p2")}
              >
                P2
              </button>
            </div>
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
                  <h2 className="text-2xl font-bold text-white mb-3">
                    Preparing Tournament Deck…
                  </h2>
                  <div className="text-slate-300">
                    Waiting for the server to attach your submitted deck. This
                    may take a moment.
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
                matchType={
                  match?.matchType as
                    | "constructed"
                    | "sealed"
                    | "draft"
                    | "precon"
                }
              />
            )
          ) : serverPhase === "Setup" ? (
            <OnlineD20Screen
              myPlayerKey={myPlayerKey}
              playerNames={playerNames}
              onRollingComplete={() => setD20RollingComplete(true)}
            />
          ) : !mulliganReady ? (
            <OnlineMulliganScreen
              myPlayerKey={myPlayerKey}
              playerNames={playerNames}
              onStartGame={() => setMulliganReady(true)}
              showSeerPhase={needsSeerPhase}
            />
          ) : mulliganReady && !bothPlayersReady ? (
            /* Waiting for opponent to finish mulligan */
            <div className="w-full max-w-md bg-zinc-900/80 text-white rounded-2xl ring-1 ring-white/10 p-6 text-center">
              <div className="text-lg font-semibold mb-2">
                Mulligan Complete
              </div>
              <div className="text-sm opacity-80 mb-4">
                Waiting for opponent to finish mulligan...
              </div>
              <div className="animate-pulse text-green-400">Ready!</div>
            </div>
          ) : needsPortalPhase && !portalSetupComplete ? (
            <HarbingerPortalScreen
              myPlayerKey={myPlayerKey}
              playerNames={playerNames}
              onSetupComplete={() => setPortalSetupComplete(true)}
            />
          ) : (
            <div className="text-center text-white">
              <div className="animate-pulse">Starting game...</div>
            </div>
          )}

          {/* Chat console available during setup phase */}
          <OnlineConsole
            dragFromHand={false}
            chatLog={chatLog}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendChat={sendChat}
            onLeaveMatch={leaveMatch}
            onLeaveLobby={leaveLobby}
            connected={connected}
            myPlayerId={myPlayerId}
            playerNames={playerNames}
          />
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
          {viewPlayerNumber && (
            <OnlineStatusBar
              dragFromHand={dragFromHand}
              myPlayerNumber={viewPlayerNumber}
              playerNames={playerNames}
              onOpenMatchInfo={() => setMatchInfoOpen(true)}
              inDraftMode={shouldShowDraft}
              readOnly={isSpectatorView}
              spectatorCount={spectatorCount}
              myPlayerKey={viewPlayerKey}
            />
          )}
          <OnlineLifeCounters
            dragFromHand={dragFromHand}
            myPlayerKey={viewPlayerKey}
            playerNames={playerNames}
            showYouLabels={!isSpectatorView}
            readOnly={isSpectatorView}
            spectatorMode={isSpectatorView}
          />

          {/* Mana and Thresholds panel on the right */}
          <PlayerResourcePanels
            myPlayerKey={viewPlayerKey}
            playerNames={playerNames}
            showYouLabels={!isSpectatorView}
            readOnly={isSpectatorView}
            dragFromHand={dragFromHand}
          />

          {/* Online Console with Events and Chat tabs - only show when setup overlay is not visible */}
          {!setupOpen && (
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
              hideChat={isSpectatorView}
              playerNames={playerNames}
            />
          )}

          {/* Enhanced Hover Preview Overlay - uses new CardPreview component */}
          {cardPreviewsEnabled && hoverPreview && !contextMenu && (
            <CardPreview
              card={hoverPreview}
              anchor="top-right"
              zIndexClass="z-30"
            />
          )}

          {/* Legacy Preview Overlay (for compatibility with existing setPreviewCard calls) */}
          {cardPreviewsEnabled &&
            previewCard?.slug &&
            !hoverPreview &&
            !contextMenu && (
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
              onBanishCard={
                searchDialog.onBanishCard
                  ? (card) => {
                      searchDialog.onBanishCard?.(card);
                      closeSearchDialog();
                    }
                  : undefined
              }
              banishRequiresConsent={searchDialog.banishRequiresConsent}
            />
          )}

          {/* Toolbox and Collection buttons (bottom-right) */}
          {showToolbox && (
            <div className="absolute bottom-3 right-3 z-20 flex items-end gap-2">
              <CollectionButton mySeat={myPlayerKey} />
              <GameToolbox
                myPlayerId={myPlayerId || null}
                mySeat={myPlayerKey}
                opponentPlayerId={opponentPlayerId}
                opponentSeat={opponentSeat}
                matchId={match?.id || null}
              />
            </div>
          )}

          {/* Match Info Popup */}
          <MatchInfoPopup
            isOpen={matchInfoOpen}
            onClose={() => setMatchInfoOpen(false)}
            matchId={matchId || ""}
            playerNames={playerNames}
            myPlayerNumber={myPlayerNumber}
            connected={connected}
            spectatorMode={isSpectatorView}
          />

          {/* Match End Overlay */}
          <MatchEndOverlay
            isVisible={matchEndOverlayOpen}
            winner={finalEndContext ? finalEndContext.winner : winner}
            playerNames={
              finalEndContext ? finalEndContext.playerNames : playerNames
            }
            myPlayerKey={
              finalEndContext ? finalEndContext.myPlayerKey : myPlayerKey
            }
            reason={
              (match as unknown as { endReason?: string | null })?.endReason ||
              undefined
            }
            winnerId={
              (match as unknown as { winnerId?: string | null })?.winnerId ||
              undefined
            }
            myPlayerId={myPlayerId || undefined}
            soatcLeagueResult={soatcLeagueResult}
            viewerSoatcUuid={
              myPlayerId
                ? soatcPlayerInfo[myPlayerId]?.soatcUuid ?? undefined
                : undefined
            }
            rated={
              (match as unknown as { rated?: boolean | null })?.rated ??
              undefined
            }
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

          {/* Combat HUD Overlay (layout-level, not inside Canvas) */}
          <CombatHudOverlay />
          {/* Magic HUD Overlay (layout-level, not inside Canvas) */}
          <MagicHudOverlay />
          {/* Chaos Twister Overlay (dexterity minigame) */}
          <ChaosTwisterOverlay transport={transport} />
          {/* Earthquake Overlay (site rearrangement) */}
          <EarthquakeOverlay transport={transport} />
          {/* Element Choice Overlay (Valley of Delight, etc.) */}
          <ElementChoiceOverlay />
          {/* Browse Overlay (spell selection) */}
          <BrowseOverlay />
          {/* Common Sense Overlay (search for Ordinary card) */}
          <CommonSenseOverlay />
          {/* Unit hands overlay (Morgana, Omphalos) */}
          <UnitHandsOverlay />
          {/* Pith Imp stolen card notification */}
          <PithImpOverlay />
          {/* Private hand targeting overlay (Morgana/Omphalos) */}
          <PrivateHandTargetingOverlay />
          {/* Switch Site HUD Overlay (layout-level, not inside Canvas) */}
          <SwitchSiteHudOverlay />

          {/* 3D Board Canvas - fills entire viewport */}
          {!setupOpen && (
            <div className="absolute inset-0 w-full h-full">
              <ClientCanvas
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
                <ambientLight intensity={0.5} />
                <directionalLight
                  position={[5, 10, 5]}
                  intensity={1.2}
                  castShadow
                  shadow-mapSize-width={2048}
                  shadow-mapSize-height={2048}
                  shadow-camera-far={50}
                  shadow-camera-left={-15}
                  shadow-camera-right={15}
                  shadow-camera-top={15}
                  shadow-camera-bottom={-15}
                  shadow-bias={-0.0001}
                />

                {/* Interactive board (physics-enabled) */}
                <Physics key="stable-physics" gravity={[0, -9.81, 0]}>
                  <PhysicsProbe mid={match?.id} />
                  <Board
                    interactionMode={boardInteractionMode}
                    enableBoardPings
                  />
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
                  noRaycast={isSpectatorView}
                />
                <Piles3D
                  owner="p2"
                  matW={MAT_PIXEL_W}
                  matH={MAT_PIXEL_H}
                  showCardPreview={showCardPreview}
                  hideCardPreview={hideCardPreview}
                  noRaycast={isSpectatorView}
                />
                {/* Token piles (face-up) */}
                <TokenPile3D owner="p1" noRaycast={isSpectatorView} />
                <TokenPile3D owner="p2" noRaycast={isSpectatorView} />

                {/* 3D HUD (thresholds, life, mana) */}
                <Hud3D owner="p1" />
                <Hud3D owner="p2" />

                {/* 3D Hands - show both player and opponent hands */}
                {viewPlayerKey && (
                  <Hand3D
                    owner={viewPlayerKey}
                    matW={MAT_PIXEL_W}
                    matH={MAT_PIXEL_H}
                    viewerPlayerNumber={viewPlayerNumber}
                    // Players see their own hand face-up; spectators only see face-up if they have commentator permissions
                    showCardBacks={
                      isSpectatorView ? !spectatorCanViewHands : false
                    }
                    // Commentator: bottom edge for oriented seat; Spectator (non-commentator): also use bottom edge for oriented seat
                    placement={isSpectatorView ? "edgeBottom" : undefined}
                    flatCards={isSpectatorView}
                    showCardPreview={showCardPreview}
                    hideCardPreview={hideCardPreview}
                  />
                )}
                {/* Opponent hand with card backs (players) or face-up (commentator spectators only) */}
                {viewPlayerKey &&
                  (() => {
                    const opponentKey = viewPlayerKey === "p1" ? "p2" : "p1";
                    return (
                      <Hand3D
                        owner={opponentKey}
                        matW={MAT_PIXEL_W}
                        matH={MAT_PIXEL_H}
                        // Players see opponent backs; spectators only see face-up if they have commentator permissions
                        showCardBacks={
                          isSpectatorView ? !spectatorCanViewHands : true
                        }
                        viewerPlayerNumber={viewPlayerNumber}
                        // Commentator and non-commentator spectators: top edge for the opponent seat
                        placement={isSpectatorView ? "edgeTop" : undefined}
                        flatCards={isSpectatorView}
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
                  mouseButtons={
                    isSpectatorView
                      ? {
                          LEFT: THREE.MOUSE.ROTATE,
                          MIDDLE: THREE.MOUSE.DOLLY,
                          RIGHT: THREE.MOUSE.PAN,
                        }
                      : {
                          MIDDLE: THREE.MOUSE.DOLLY,
                          RIGHT: THREE.MOUSE.PAN,
                        }
                  }
                  touches={{ TWO: THREE.TOUCH.PAN }}
                  enabled={canPanCamera}
                  enablePan={canPanCamera}
                  enableRotate={isSpectatorView ? true : false}
                  enableZoom={!resyncing && !dragFromHand && !dragFromPile}
                  enableDamping={isSpectatorView}
                  dampingFactor={isSpectatorView ? 0.08 : 0}
                  screenSpacePanning={isSpectatorView}
                  panSpeed={isSpectatorView ? 1.2 : 1}
                  onChange={clampControls}
                  minDistance={minDist}
                  maxDistance={maxDist}
                  minPolarAngle={
                    cameraMode === "topdown"
                      ? naturalTiltAngle
                      : safeMinOrbitTilt
                  }
                  maxPolarAngle={
                    cameraMode === "topdown" ? naturalTiltAngle : Math.PI / 2.4
                  }
                  // Adjust rotation constraints based on player position
                  // Default to P1 constraints if player number not determined yet
                  minAzimuthAngle={
                    isSpectatorView
                      ? -Infinity
                      : viewPlayerNumber === 2
                      ? Math.PI - 0.5
                      : -0.5
                  }
                  maxAzimuthAngle={
                    isSpectatorView
                      ? Infinity
                      : viewPlayerNumber === 2
                      ? Math.PI + 0.5
                      : 0.5
                  }
                />
                {/* Smooth spectator rotation around board center */}
                {isSpectatorView && (
                  <SpectatorRotateControls
                    enabled={true}
                    controlsRef={controlsRef}
                    yawTargetRef={spectatorYawTargetRef}
                    resetKey={viewPlayerNumber}
                  />
                )}
                <KeyboardPanControls enabled={canPanCamera} />
                <TrackpadOrbitAdapter />
              </ClientCanvas>
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
              {voice.incomingRequest.from.displayName || "A player"} wants to
              connect via voice chat.
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
      {/* Mobile hand interaction hint */}
      <MobileHandHint />
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

      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcutsHelp
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        context="game"
      />
    </div>
  );
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
  useZoomKeyboardShortcuts(controls, { enabled });
  return null;
}

function SpectatorRotateControls({
  enabled,
  controlsRef,
  yawTargetRef,
  resetKey,
}: {
  enabled: boolean;
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  yawTargetRef: React.MutableRefObject<number>;
  resetKey?: number | string | null;
}) {
  const { camera } = useThree();
  const yawAppliedRef = useRef(0);
  useEffect(() => {
    yawAppliedRef.current = 0;
    yawTargetRef.current = 0;
  }, [yawTargetRef, resetKey]);
  useFrame(() => {
    if (!enabled) return;
    const c = controlsRef.current;
    if (!c) return;
    const targetYaw = yawTargetRef.current;
    const currentYaw = yawAppliedRef.current;
    const delta = targetYaw - currentYaw;
    if (Math.abs(delta) < 1e-3) return;
    // Smooth step toward target yaw
    const step = Math.max(-0.08, Math.min(0.08, delta * 0.15));
    yawAppliedRef.current = currentYaw + step;
    // Rotate camera position around Y axis about the origin (board center)
    const x = camera.position.x;
    const z = camera.position.z;
    const r = Math.sqrt(x * x + z * z) || 10;
    const theta = Math.atan2(z, x) + step;
    const y = camera.position.y;
    camera.position.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
    camera.lookAt(0, 0, 0);
    c.update();
  });
  return null;
}
