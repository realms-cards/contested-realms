"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useOnline } from "@/app/online/online-context";
import CardPreview from "@/components/game/CardPreview";
import ContextMenu from "@/components/game/ContextMenu";
import EnhancedOnlineDraft3DScreen from "@/components/game/EnhancedOnlineDraft3DScreen";
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
import PileSearchDialog from "@/components/game/PileSearchDialog";
import PlacementDialog from "@/components/game/PlacementDialog";
import { GlobalVideoOverlay } from "@/components/ui/GlobalVideoOverlay";
import { useVideoOverlay } from "@/lib/contexts/VideoOverlayContext";
import { FEATURE_SEAT_VIDEO, FEATURE_AUDIO_ONLY } from "@/lib/flags";
import Board from "@/lib/game/Board";
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
import { useCardHover, type CardPreviewData } from "@/lib/game/hooks/useCardHover";
import { useGameStore, type PlayerKey } from "@/lib/game/store";
import { LegacySeatVideo3D } from "@/lib/rtc/SeatVideo3D";
import { useMatchWebRTC } from "@/lib/rtc/useMatchWebRTC";

export default function OnlineMatchPage() {
  const params = useParams();
  const router = useRouter();
  const { updateScreenType } = useVideoOverlay();

  // Enhanced card preview state using the draft-3d/editor-3d pattern
  const [hoverPreview, setHoverPreview] = useState<CardPreviewData | null>(null);
  const { showCardPreview, hideCardPreview, clearHoverTimers } = useCardHover({
    onShow: (card: CardPreviewData) => {
      setHoverPreview(card);
    },
    onHide: () => {
      setHoverPreview(null);
    },
  });

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
  } = useOnline();

  // Determine which player this client is (support for 2-8 players)
  const myPlayerId = me?.id;
  const myPlayerIndex = useMemo(() => {
    if (!match?.players || !myPlayerId) return -1;
    return match.players.findIndex((p) => p.id === myPlayerId);
  }, [match?.players, myPlayerId]);
  const myPlayerNumber = myPlayerIndex >= 0 ? myPlayerIndex + 1 : null;
  const myPlayerKey =
    myPlayerIndex >= 0 && myPlayerIndex < 2
      ? ((myPlayerIndex === 0 ? "p1" : "p2") as PlayerKey)
      : null;

  // Seat Video (WebRTC) prototype state (always call hook; gated by enabled flag)
  const rtc = useMatchWebRTC({
    enabled: FEATURE_SEAT_VIDEO || FEATURE_AUDIO_ONLY,
    transport,
    myPlayerId: me?.id ?? null,
    matchId: match?.id ?? null,
  });

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

  // Get player nicknames (constrained to 2 players for game engine compatibility)
  const playerNames = useMemo(() => {
    const names: { p1: string; p2: string } = {
      p1: "Player 1",
      p2: "Player 2",
    };

    if (match?.players) {
      // Only use first 2 players for the game engine
      if (match.players[0]) {
        names.p1 = match.players[0].displayName || "Player 1";
      }
      if (match.players[1]) {
        names.p2 = match.players[1].displayName || "Player 2";
      }
    }

    return names;
  }, [match?.players]);

  // Set screen type for video overlay - this is a game page so use game-3d
  useEffect(() => {
    updateScreenType("game-3d");
    return undefined;
  }, [updateScreenType]);

  // Ensure we are in the correct match when landing on /online/play/[id]
  useEffect(() => {
    // If we were navigated from tournament matches, ensure the match exists on the socket server
    if (connected && matchId && transport) {
      try {
        const key = `tournamentMatchBootstrap_${matchId}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          const payload = JSON.parse(raw) as {
            players?: string[];
            matchType?: 'constructed' | 'sealed' | 'draft';
            lobbyName?: string;
            sealedConfig?: {
              packCount?: number;
              setMix?: string[];
              timeLimit?: number;
              constructionStartTime?: number;
              packCounts?: Record<string, number>;
              replaceAvatars?: boolean;
            } | null;
            draftConfig?: {
              setMix?: string[];
              packCount?: number;
              packSize?: number;
              packCounts?: Record<string, number>;
            } | null;
          };
          // Fire-and-forget: instruct server to create/ensure match exists with the given roster and configs
          transport.emit('startTournamentMatch', {
            matchId,
            playerIds: Array.isArray(payload?.players) ? payload.players : [],
            matchType: payload?.matchType || 'constructed',
            lobbyName: payload?.lobbyName,
            sealedConfig: payload?.sealedConfig || null,
            draftConfig: payload?.draftConfig || null,
          });
          // Clear bootstrap to avoid duplicates on refresh/reconnect
          localStorage.removeItem(key);
        }
      } catch {}
    }

    if (!connected || !matchId) return;

    // If store still holds a different match, force a one-time hard reload to clear stale state
    try {
      if (match?.id && match?.id !== matchId) {
        const key = `force_reload_match_${matchId}`;
        if (!sessionStorage.getItem(key)) {
          console.log(
            "[game] Switching to different match - forcing page reload for clean state"
          );
          sessionStorage.setItem(key, "1");
          // Clear the old match key to prevent stale data
          const oldKey = `force_reload_match_${match.id}`;
          sessionStorage.removeItem(oldKey);
          window.location.replace(`/online/play/${matchId}`);
          return;
        } else {
          // If we've already forced a reload but still have wrong match, reset game state
          console.log(
            "[game] After reload still have wrong match - resetting game state"
          );
          useGameStore.getState().resetGameState();
        }
      }
    } catch {}

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
  }, [connected, match?.id, matchId, joinMatch, transport]);

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
      // Reset game state before resyncing to ensure clean slate
      console.log("[game] Joining match - resetting game state before resync");
      useGameStore.getState().resetGameState();

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
      return localStorage.getItem(`sealed_submitted_${matchId}`) === "true";
    } catch {
      return false;
    }
  }, [matchId, match?.playerDecks, me?.id]);

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
      return localStorage.getItem(`draft_submitted_${matchId}`) === "true";
    } catch {
      return false;
    }
  }, [matchId, match?.playerDecks, me?.id]);

  // Track draft state and completion
  const [draftCompleted, setDraftCompleted] = useState(false);
  const isDraftMatch = match?.matchType === "draft";
  const isDraftActive =
    isDraftMatch && match?.status === "waiting" && !draftCompleted;
  const isDraftDeckConstruction =
    isDraftMatch && (match?.status === "deck_construction" || draftCompleted);

  // Prevent showing draft component again once it's completed or if we already submitted a deck
  const shouldShowDraft = isDraftActive && !hasSubmittedDraftDeck;

  // Auto-redirect to sealed editor for sealed matches in deck construction
  // But only if we haven't already submitted a deck (avoid redirect loop)
  useEffect(() => {
    if (!matchId || match?.id !== matchId) return;
    if (!match) return;

    // Auto-redirect to sealed editor when joining sealed match during deck construction
    // But only if we haven't submitted a deck yet (prefer server-confirmed check)
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

      // Redirect to editor
      window.location.href = `/decks/editor-3d?${params.toString()}`;
      return;
    }
  }, [
    matchId,
    match,
    hasSubmittedSealedDeck,
    isDraftDeckConstruction,
    hasSubmittedDraftDeck,
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
      } else if (data.type === "draftDeckSubmission") {
        if (draftSubmissionSentForRef.current === matchId) return;
        draftSubmissionSentForRef.current = matchId;
        try {
          localStorage.setItem(`draft_submitted_${matchId}`, "true");
          localStorage.removeItem(`draftDeck_${matchId}`);
        } catch {}
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
    } catch {}
  }, [matchId, match?.id, match?.status, match?.matchType, transport]);

  // Control setup overlay based on match status
  useEffect(() => {
    // Only react once we know we're in this specific match
    if (!matchId || match?.id !== matchId) return;
    if (!match) return;

    // For draft matches, don't show setup overlay during active draft or if we've submitted a deck
    if (shouldShowDraft) {
      if (setupOpen) setSetupOpen(false);
      return;
    }

    if (match.status === "waiting" || match.status === "deck_construction") {
      // Keep overlay open during waiting and deck construction
      if (!setupOpen) setSetupOpen(true);
    } else if (match.status === "ended") {
      // Close on end
      if (setupOpen) setSetupOpen(false);
    }
    // Do not auto-close on "in_progress"; we'll close when serverPhase reaches Main
  }, [matchId, match, match?.id, match?.status, setupOpen, shouldShowDraft]);

  // Reset setup wizard when entering a different match (fresh waiting match)
  useEffect(() => {
    // When match id changes, restart the setup steps so we don't skip phases
    setPrepared(false);
    setD20RollingComplete(false);

    // Clear submission flag when entering a different match
    if (matchId) {
      const submittedKey = `sealed_submitted_${matchId}`;
      // Only clear if this is actually a new match (not a status change on same match)
      if (match?.id && match.id !== matchId) {
        localStorage.removeItem(submittedKey);
      }
    }
  }, [match?.id, matchId]);

  // Clear submission flag when match ends (avoid lingering state for next sessions)
  useEffect(() => {
    if (!matchId || !match) return;
    if (match.status === "ended") {
      const submittedKey = `sealed_submitted_${matchId}`;
      localStorage.removeItem(submittedKey);
    }
  }, [matchId, match]);

  // Reset game state only when match transitions to "in_progress" (once per match)
  useEffect(() => {
    if (
      match?.status === "in_progress" &&
      prevMatchStatusRef.current !== "in_progress"
    ) {
      console.log("[game] Match started - resetting game state");
      useGameStore.getState().resetGameState();
    }
  }, [match?.status]);

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
        if (process.env.NEXT_PUBLIC_DEBUG_PHYSICS === '1') {
          console.debug("[physics] mount", { matchId: mid });
        }
      } catch {}
      return () => {
        try {
          if (process.env.NEXT_PUBLIC_DEBUG_PHYSICS === '1') {
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
    return undefined;
  }, [selectedHandCard]);
  const cameraMode = useGameStore((s) => s.cameraMode);
  const setCameraMode = useGameStore((s) => s.setCameraMode);

  const gotoBaseline = useCallback((mode: "topdown" | "orbit") => {
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
  }, [myPlayerNumber, matW, matH]);

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

  // Show match end overlay when match ends (but only if not already dismissed)
  useEffect(() => {
    if (matchEnded && !matchEndOverlayOpen && !matchEndOverlayDismissed) {
      setMatchEndOverlayOpen(true);
    }
  }, [matchEnded, matchEndOverlayOpen, matchEndOverlayDismissed]);

  // Reset match end overlay when joining a new match
  useEffect(() => {
    // Reset the overlay states when the match ID changes (new match)
    setMatchEndOverlayOpen(false);
    setMatchEndOverlayDismissed(false);
  }, [matchId]);

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

  // Compute natural tilt angle for 2D mode based on extents
  // Constrain polar angle in 2D to a fixed small tilt that matches gotoBaseline('topdown')
  const naturalTiltAngle = useMemo(() => {
    const dist = Math.max(matW, matH) * 1.1;
    const zOffset = Math.min(6, Math.max(1.5, dist * 0.08));
    // Polar angle measured from +Y (straight up) downward
    return Math.atan(zOffset / dist);
  }, [matW, matH]);
  const clampControls = useCallback(() => {
    const c = controlsRef.current;
    if (!c) return;
    const halfW = matW / 2;
    const halfH = matH / 2;
    const t = c.target;
    let changed = false;
    if (t.x < -halfW) {
      t.x = -halfW;
      changed = true;
    } else if (t.x > halfW) {
      t.x = halfW;
      changed = true;
    }
    if (t.z < -halfH) {
      t.z = -halfH;
      changed = true;
    } else if (t.z > halfH) {
      t.z = halfH;
      changed = true;
    }
    if (t.y !== 0) {
      t.y = 0;
      changed = true;
    }
    if (changed) c.update();
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
              cameraMode === "topdown" ? "bg-white/20" : "bg-transparent hover:bg-white/10"
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
              cameraMode === "orbit" ? "bg-white/20" : "bg-transparent hover:bg-white/10"
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

      {/* Setup Overlay - only show when in match and setup is open */}
      {inThisMatch && setupOpen && myPlayerKey && (
        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
          {!prepared ? (
            match?.matchType === "sealed" ? (
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
          {hoverPreview && !contextMenu && !selectedHandCard && (
            <CardPreview
              card={hoverPreview}
              anchor="top-right"
              zIndexClass="z-30"
            />
          )}
          
          {/* Legacy Preview Overlay (for compatibility with existing setPreviewCard calls) */}
          {previewCard?.slug && !hoverPreview && !contextMenu && !selectedHandCard && (
            <CardPreview
              card={previewCard}
              anchor="top-right"
              zIndexClass="z-30"
              onClose={() => setPreviewCard(null)}
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

          {/* Hand Card Magnifier (selected hand card) */}
          {selectedHandCard?.slug && !dragFromHand && !contextMenu && magnifierDelay && (
            <CardPreview
              card={selectedHandCard}
              anchor="top-right"
              zIndexClass="z-30"
              onClose={() => clearSelection()}
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
            onLeaveLobby={leaveLobby}
          />

          {/* 3D Board Canvas - fills entire viewport */}
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
                <Board />
              </Physics>

              {/* Seat Video planes at player positions (fixed orientation toward board) */}
              {rtc.featureEnabled && myPlayerKey && (
                <>
                  {/* Local preview at my seat (muted via video texture; audio handled separately) */}
                  <LegacySeatVideo3D
                    who={myPlayerKey}
                    stream={rtc.localStream}
                  />
                  {/* Remote video at opponent seat */}
                  <LegacySeatVideo3D
                    who={myPlayerKey === "p1" ? "p2" : "p1"}
                    stream={rtc.remoteStream}
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

              {/* Invisible texture cache for smooth loading */}
              <TextureCache />

              <OrbitControls
                ref={controlsRef}
                makeDefault
                target={[0, 0, 0]}
                mouseButtons={
                  cameraMode === "topdown"
                    ? {
                        LEFT: THREE.MOUSE.PAN,
                        MIDDLE: THREE.MOUSE.DOLLY,
                        RIGHT: THREE.MOUSE.PAN,
                      }
                    : {
                        LEFT: THREE.MOUSE.PAN,
                        MIDDLE: THREE.MOUSE.DOLLY,
                        RIGHT: THREE.MOUSE.ROTATE,
                      }
                }
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
                  !selectedAvatar &&
                  cameraMode !== "topdown"
                }
                enableZoom={!resyncing && !dragFromHand && !dragFromPile}
                enableDamping={false}
                onChange={clampControls}
                minDistance={minDist}
                maxDistance={maxDist}
                minPolarAngle={cameraMode === "topdown" ? naturalTiltAngle : 0}
                maxPolarAngle={cameraMode === "topdown" ? naturalTiltAngle : Math.PI / 2.4}
                // Adjust rotation constraints based on player position
                // Default to P1 constraints if player number not determined yet
                minAzimuthAngle={myPlayerNumber === 2 ? Math.PI - 0.5 : -0.5}
                maxAzimuthAngle={myPlayerNumber === 2 ? Math.PI + 0.5 : 0.5}
              />
            </Canvas>
          </div>
        </>
      )}

      {/* Video Overlay (uses page-level WebRTC instance) */}
      <GlobalVideoOverlay position="top-right" showUserAvatar={true} rtc={rtc} />
    </div>
  );
}
