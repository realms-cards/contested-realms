"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import FloatingChat from "@/components/chat/FloatingChat";
import CardPreview from "@/components/game/CardPreview";
import type { Digit } from "@/components/game/manacost";
import { NumberBadge } from "@/components/game/manacost";
import TournamentRoster from "@/components/tournament/TournamentRoster";
import { useRealtimeTournaments } from "@/contexts/RealtimeTournamentContext";
import type { CardPreviewData } from "@/lib/game/card-preview.types";

const TournamentInviteModal = dynamic(
  () => import("@/components/tournament/TournamentInviteModal"),
  { ssr: false }
);

interface Tournament {
  id: string;
  name: string;
  format: "sealed" | "draft" | "constructed";
  status: "registering" | "preparing" | "active" | "completed" | "cancelled";
  maxPlayers: number;
  currentPlayers: number;
  creatorId: string;
  isPrivate?: boolean;
  startedAt: string | null;
  createdAt: string;
  completedAt: string | null;
  settings: {
    totalRounds?: number;
    roundDuration?: number;
    allowSpectators?: boolean;
  };
}

// Removed local interfaces; we rely on realtime context shapes

// Statistics are obtained from realtime context; local interface not required here

export default function TournamentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const tournamentId = params?.id as string;
  const {
    tournaments,
    currentTournament,
    setCurrentTournament,
    setCurrentTournamentById,
    joinTournament: rtJoinTournament,
    startTournament: rtStartTournament,
    endTournament: rtEndTournament,
    statistics: rtStatistics,
    loading: rtLoading,
    error: rtError,
    lastUpdated,
    refreshTournaments,
  } = useRealtimeTournaments();
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<CardPreviewData | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "overview" | "standings" | "rounds"
  >("overview");
  // Round/match flow helpers
  const [startingRound, setStartingRound] = useState(false);
  // Only block with a full-screen loading overlay on the very first load
  const [initialLoaded, setInitialLoaded] = useState(false);

  // Local match assignment banner (instant without full refresh)
  const [assigned, setAssigned] = useState<{
    matchId: string;
    opponentName: string | null;
  } | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | {
            tournamentId?: string;
            matchId?: string;
            opponentName?: string | null;
          }
        | undefined;
      if (!d || !d.matchId) return;
      if (String(d.tournamentId) !== String(tournamentId)) return;
      setAssigned({
        matchId: String(d.matchId),
        opponentName: d.opponentName ?? null,
      });
    };
    window.addEventListener(
      "tournament:matchAssigned",
      handler as EventListener
    );
    return () =>
      window.removeEventListener(
        "tournament:matchAssigned",
        handler as EventListener
      );
  }, [tournamentId]);

  // Context-provided assignment (from realtime handlers)
  const { assignedMatchId: rtAssignedMatchId } = useRealtimeTournaments();

  // (Removed) fallback: we derive CTA directly in the banner using rtAssignedMatchId or myAssignedMatchId

  // Tournament completion celebration
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const prevTournamentStatusRef = useRef<string | null>(null);

  // Redirect unauthenticated users to signin
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/auth/signin?callbackUrl=/tournaments/${tournamentId}`);
    }
  }, [status, tournamentId, router]);

  // Lightweight toast listener (used by deck submission + phase changes)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { message?: string }
        | undefined;
      if (detail?.message) {
        setToast(detail.message);
        setTimeout(() => setToast(null), 3500);
      }
    };
    window.addEventListener("app:toast", handler as EventListener);
    // Pick up pending toast from localStorage on mount
    try {
      const pending = localStorage.getItem("app:toast");
      if (pending) {
        setToast(pending);
        localStorage.removeItem("app:toast");
        setTimeout(() => setToast(null), 3500);
      }
    } catch {}
    return () =>
      window.removeEventListener("app:toast", handler as EventListener);
  }, []);

  // Fallback fetch for specific tournament if not in context
  const [fallbackTournament, setFallbackTournament] =
    useState<Tournament | null>(null);
  const [fallbackLoading, setFallbackLoading] = useState(false);

  useEffect(() => {
    // Only fetch if tournament not found in context and not already loading
    const tournamentInContext =
      currentTournament?.id === tournamentId ||
      tournaments.some((t) => t.id === tournamentId);

    if (
      !tournamentInContext &&
      !fallbackLoading &&
      !fallbackTournament &&
      tournamentId
    ) {
      setFallbackLoading(true);
      fetch(`/api/tournaments/${tournamentId}`)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setFallbackTournament(data as Tournament);
            // Add tournament to context so event handlers can update it
            setCurrentTournament(
              data as unknown as Parameters<typeof setCurrentTournament>[0]
            );
          }
        })
        .catch((err) => {
          console.error("Failed to fetch tournament:", err);
        })
        .finally(() => {
          setFallbackLoading(false);
        });
    }
  }, [
    tournamentId,
    currentTournament,
    tournaments,
    fallbackLoading,
    fallbackTournament,
    setCurrentTournamentById,
    setCurrentTournament,
  ]);

  // Derive tournament from realtime context or fallback
  const derivedTournament: Tournament | null =
    currentTournament && currentTournament.id === tournamentId
      ? (currentTournament as unknown as Tournament)
      : (tournaments.find((t) => t.id === tournamentId) as unknown as
          | Tournament
          | undefined) ||
        fallbackTournament ||
        null;

  // Mark as loaded after we have either any derived tournament or the realtime layer has produced an update
  useEffect(() => {
    if (!initialLoaded && (derivedTournament || lastUpdated)) {
      setInitialLoaded(true);
    }
  }, [initialLoaded, derivedTournament, lastUpdated]);

  // Sync context on mount only - avoid repeated calls that trigger forced refreshes
  const didSyncRef = useRef(false);
  useEffect(() => {
    if (didSyncRef.current) return;
    if (tournamentId && !currentTournament) {
      didSyncRef.current = true;
      setCurrentTournamentById(tournamentId);
    }
  }, [tournamentId, currentTournament, setCurrentTournamentById]);

  // Alias realtime statistics for easier usage
  const statistics = rtStatistics;

  // Choose tournament reference for below sections
  const tournament = derivedTournament;
  // Derived helpers: my standing and match id (with rank calculation)
  const myStanding = useMemo(() => {
    const standing = statistics?.standings?.find(
      (s) => s.playerId === session?.user?.id
    );
    if (!standing) return null;
    const rank =
      (statistics?.standings?.findIndex(
        (s) => s.playerId === session?.user?.id
      ) ?? -1) + 1;
    return { ...standing, rank };
  }, [statistics?.standings, session?.user?.id]);
  const myMatchId = useMemo(
    () =>
      myStanding?.currentMatchId ? String(myStanding.currentMatchId) : null,
    [myStanding?.currentMatchId]
  );
  // Round helpers
  const rounds = useMemo(() => statistics?.rounds || [], [statistics?.rounds]);
  const activeRound = rounds.find((r) => r.status === "active") || null;
  const maxRoundNumber = rounds.length
    ? Math.max(
        ...rounds.map((r) =>
          typeof r.roundNumber === "number" ? r.roundNumber : 0
        )
      )
    : 0;
  const lastCompletedRoundNumber = useMemo(() => {
    const list = (rounds || [])
      .map((r) => r as unknown as { roundNumber?: number; status?: string })
      .filter(
        (r) => r.status === "completed" && typeof r.roundNumber === "number"
      )
      .map((r) => r.roundNumber as number);
    return list.length ? Math.max(...list) : 0;
  }, [rounds]);
  const activeRoundNumber = useMemo(() => {
    const rn = (activeRound as { roundNumber?: number } | null)?.roundNumber;
    return typeof rn === "number" ? rn : null;
  }, [activeRound]);
  const myAssignedMatchId = useMemo(() => {
    const direct = myMatchId ? String(myMatchId) : null;
    if (direct) return direct;
    const uid = session?.user?.id || null;
    if (!uid) return null;
    // Prefer embedded matches on the active round
    const matchesInRound =
      (
        activeRound as unknown as {
          matches?: Array<{ id: string; players?: Array<{ id: string }> }>;
        }
      )?.matches || [];
    const viaRound = matchesInRound.find(
      (m) => Array.isArray(m.players) && m.players.some((p) => p.id === uid)
    );
    if (viaRound) return String(viaRound.id);
    // Fallback to global matches filtered by round number
    const globalMatches = statistics?.matches || [];
    if (activeRoundNumber != null) {
      const viaGlobal = globalMatches.find(
        (m) =>
          m.roundNumber === activeRoundNumber &&
          Array.isArray(m.players) &&
          m.players.some((p) => p.id === uid)
      );
      if (viaGlobal) return String(viaGlobal.id);
    }
    return null;
  }, [
    myMatchId,
    session?.user?.id,
    activeRound,
    statistics?.matches,
    activeRoundNumber,
  ]);

  // Fallback: if we have an assignment derived from context or statistics, set local banner state.
  useEffect(() => {
    if (assigned?.matchId) return;
    const mid = rtAssignedMatchId || myAssignedMatchId;
    if (!mid) return;
    const match = (statistics?.matches || []).find(
      (m) => String(m.id) === String(mid)
    );
    const players = Array.isArray(
      (match as { players?: Array<{ id: string; name?: string }> } | null)
        ?.players
    )
      ? ((match as { players?: Array<{ id: string; name?: string }> } | null)
          ?.players as Array<{ id: string; name?: string }>) ?? []
      : [];
    const me = session?.user?.id || null;
    const opp = players.find((p) => p.id !== me)?.name || null;
    setAssigned({ matchId: String(mid), opponentName: opp });
  }, [
    assigned?.matchId,
    rtAssignedMatchId,
    myAssignedMatchId,
    statistics?.matches,
    session?.user?.id,
  ]);

  // Also re-sync when the page becomes visible or gains focus (covers missed socket events)
  useEffect(() => {
    const sync = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return;
      const mid = assigned?.matchId || rtAssignedMatchId || myAssignedMatchId;
      if (!mid) return;
      const match = (statistics?.matches || []).find(
        (m) => String(m.id) === String(mid)
      );
      const players = Array.isArray(
        (match as { players?: Array<{ id: string; name?: string }> } | null)
          ?.players
      )
        ? ((match as { players?: Array<{ id: string; name?: string }> } | null)
            ?.players as Array<{ id: string; name?: string }>) ?? []
        : [];
      const me = session?.user?.id || null;
      const opp = players.find((p) => p.id !== me)?.name || null;
      setAssigned({ matchId: String(mid), opponentName: opp });
    };
    if (typeof window !== "undefined") {
      document.addEventListener("visibilitychange", sync);
      window.addEventListener("focus", sync);
    }
    return () => {
      if (typeof window !== "undefined") {
        document.removeEventListener("visibilitychange", sync);
        window.removeEventListener("focus", sync);
      }
    };
  }, [
    assigned?.matchId,
    rtAssignedMatchId,
    myAssignedMatchId,
    statistics?.matches,
    session?.user?.id,
  ]);

  const [viewerDeckCards, setViewerDeckCards] = useState<
    Array<{
      cardId: number;
      name: string;
      slug: string;
      setName: string;
      quantity: number;
      type?: string | null;
      cost?: number | null;
      thresholds?: Record<string, number> | null;
    }>
  >([]);
  const [viewerDeckLoaded, setViewerDeckLoaded] = useState(false);
  const viewerDeckHashRef = useRef<string | null>(null);
  const [showDeckDetails, setShowDeckDetails] = useState(false);
  // Constructed preparation state
  const [constructedLoading, setConstructedLoading] = useState(false);
  const [constructedError, setConstructedError] = useState<string | null>(null);
  const [constructedDecks, setConstructedDecks] = useState<
    Array<{ id: string; name: string; format?: string }>
  >([]);
  const [constructedPublicDecks, setConstructedPublicDecks] = useState<
    Array<{ id: string; name: string; format?: string }>
  >([]);
  const [constructedSelectedDeckId, setConstructedSelectedDeckId] = useState<
    string | null
  >(null);
  const [constructedAllowedFormats, setConstructedAllowedFormats] = useState<
    string[]
  >([]);
  const constructedPanelRef = useRef<HTMLDivElement | null>(null);
  const [constructedModalOpen, setConstructedModalOpen] = useState(false);
  const [includePublicDecks, setIncludePublicDecks] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("sorcery:includePublicDecks");
    return stored === null ? true : stored === "1";
  });

  const tId = tournament?.id ?? null;
  const tStatus = tournament?.status ?? null;
  const tFormat = tournament?.format ?? null;

  // Removed duplicate fallback effect - the one at lines 158-197 handles this

  // Helpers: safe currentPlayers count
  function getCurrentPlayersCount(t: Tournament | null): number {
    if (!t) return 0;
    const cp = (t as Partial<Tournament>).currentPlayers;
    if (typeof cp === "number") return cp;
    const rp = (t as unknown as { registeredPlayers?: Array<unknown> })
      .registeredPlayers;
    return Array.isArray(rp) ? rp.length : 0;
  }

  // Check if current user is registered (prefer explicit registrations over standings)
  const isRegistered = useMemo(() => {
    const userId = session?.user?.id;
    if (!tournament || !userId) return false;
    const rp =
      (tournament as unknown as { registeredPlayers?: Array<{ id: string }> })
        .registeredPlayers || [];
    if (Array.isArray(rp) && rp.some((p) => p.id === userId)) return true;
    // Fallback for active phase when registrations may not be present
    return Boolean(
      statistics?.standings?.some(
        (s) => s.playerId === userId && !s.isEliminated
      )
    );
  }, [tournament, statistics?.standings, session?.user?.id]);

  // Check if current user is the creator
  const isCreator = tournament && session?.user?.id === tournament.creatorId;

  // Refresh tournament data when returning to page (covers missed phase_changed events)
  const lastVisibilityRefreshRef = useRef<number>(0);
  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState !== "visible") return;
      if (!tournament || !isRegistered) return;
      // Only refresh if tournament is active (might have completed while away)
      if (tournament.status !== "active") return;
      // Throttle: at most once every 5 seconds
      const now = Date.now();
      if (now - lastVisibilityRefreshRef.current < 5000) return;
      lastVisibilityRefreshRef.current = now;
      // Fetch tournament detail to get updated status (may have completed)
      try {
        const res = await fetch(`/api/tournaments/${tournament.id}`);
        if (res.ok) {
          const detail = await res.json();
          setCurrentTournament(detail);
        }
      } catch {}
      // Also refresh statistics to get latest standings/rounds
      try {
        statistics?.actions?.refreshAll?.();
      } catch {}
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [
    tournament,
    tournament?.id,
    tournament?.status,
    isRegistered,
    statistics?.actions,
    setCurrentTournament,
  ]);

  // On mount: check if we're returning from a match and tournament might have completed
  // This handles navigation (not visibility change) back to the tournament page
  const didMountRefreshRef = useRef(false);
  useEffect(() => {
    // Wait until we have the necessary data
    if (!tournament?.id || !isRegistered) return;
    // Skip if already did mount refresh for this tournament
    if (didMountRefreshRef.current) return;
    // Only refresh if tournament is active (could have completed while user was on match page)
    if (tournament.status !== "active") return;

    didMountRefreshRef.current = true;

    // Immediate refresh on mount to catch completed tournaments
    (async () => {
      try {
        const res = await fetch(`/api/tournaments/${tournament.id}`);
        if (res.ok) {
          const detail = await res.json();
          setCurrentTournament(detail);
        }
      } catch {}
      // Also refresh statistics to get final standings
      try {
        statistics?.actions?.refreshAll?.();
      } catch {}
    })();
  }, [
    tournament?.id,
    tournament?.status,
    isRegistered,
    setCurrentTournament,
    statistics?.actions,
  ]);

  // Load viewer deck card metadata when available (from context detail only)
  useEffect(() => {
    (async () => {
      try {
        const fromContext =
          (
            tournament as unknown as {
              viewerDeck?: Array<{ cardId: string; quantity: number }>;
            }
          )?.viewerDeck || null;

        // If no deck in context, mark as loaded once to avoid repeated fetch attempts from context churn
        if (!fromContext || fromContext.length === 0) {
          setViewerDeckCards([]);
          if (!viewerDeckLoaded) setViewerDeckLoaded(true);
          return;
        }

        // Build a stable hash of the deck composition to avoid reprocessing unchanged lists
        const deck = fromContext.map((it) => ({
          cardId: String(it.cardId),
          quantity: Math.max(0, Number(it.quantity) || 0),
        }));
        const hash = JSON.stringify(
          [...deck].sort((a, b) => a.cardId.localeCompare(b.cardId))
        );
        if (viewerDeckHashRef.current === hash) {
          if (!viewerDeckLoaded) setViewerDeckLoaded(true);
          return;
        }
        viewerDeckHashRef.current = hash;

        const ids = Array.from(
          new Set(
            deck
              .map((it) => Number(it.cardId))
              .filter((n) => Number.isFinite(n) && n > 0)
          )
        );
        if (!ids.length) {
          setViewerDeckCards([]);
          if (!viewerDeckLoaded) setViewerDeckLoaded(true);
          return;
        }
        const res = await fetch(
          `/api/cards/by-id?ids=${encodeURIComponent(ids.join(","))}`
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error || "Failed to load deck cards");
        const byId = new Map<
          number,
          {
            name: string;
            slug: string;
            setName: string;
            type?: string | null;
            cost?: number | null;
            thresholds?: Record<string, number> | null;
          }
        >();
        for (const c of data as Array<{
          cardId: number;
          name: string;
          slug: string;
          setName: string;
          type?: string | null;
          cost?: number | null;
          thresholds?: Record<string, number> | null;
        }>) {
          byId.set(c.cardId, {
            name: c.name,
            slug: c.slug,
            setName: c.setName,
            type: c.type,
            cost: c.cost,
            thresholds: c.thresholds,
          });
        }
        const merged = deck
          .map((it) => {
            const id = Number(it.cardId);
            const meta = byId.get(id);
            return {
              cardId: id,
              name: meta?.name || `Card ${id}`,
              slug: meta?.slug || "",
              setName: meta?.setName || "",
              quantity: Number(it.quantity) || 0,
              type: meta?.type,
              cost: meta?.cost,
              thresholds: meta?.thresholds,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        setViewerDeckCards(merged);
        if (!viewerDeckLoaded) setViewerDeckLoaded(true);
      } catch {
        setViewerDeckCards([]);
        if (!viewerDeckLoaded) setViewerDeckLoaded(true);
      }
    })();
  }, [tournament, tournament?.id, viewerDeckLoaded]);

  // Detect tournament completion and show celebration modal
  useEffect(() => {
    if (!tournament || !isRegistered) return;
    const currentStatus = tournament.status;
    // Only celebrate if at least one round has occurred
    const hasAnyRound = Array.isArray(rounds) && rounds.length > 0;

    // Show celebration modal when tournament is completed (either via transition or on first visit)
    if (currentStatus === "completed" && hasAnyRound) {
      try {
        const key = `tournament_completion_seen_${tournament.id}`;
        const alreadySeen =
          typeof window !== "undefined" &&
          sessionStorage.getItem(key) === "true";
        if (!alreadySeen) {
          setShowCompletionModal(true);
          sessionStorage.setItem(key, "true");
        }
      } catch {}
    }

    prevTournamentStatusRef.current = currentStatus;
  }, [tournament, tournament?.status, isRegistered, rounds]);

  // Load constructed deck choices when in preparing + constructed
  useEffect(() => {
    (async () => {
      try {
        setConstructedError(null);
        if (!tId || tStatus !== "preparing" || tFormat !== "constructed")
          return;
        if (!isRegistered) return;
        setConstructedLoading(true);
        // Ensure preparation has started (ignore errors if already started)
        try {
          await fetch(
            `/api/tournaments/${encodeURIComponent(tId)}/preparation/start`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            }
          );
        } catch {}
        const res = await fetch(
          `/api/tournaments/${encodeURIComponent(
            tId
          )}/preparation/constructed/decks?includePublic=${
            includePublicDecks ? "true" : "false"
          }`
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error || "Failed to load constructed decks");
        const decks = Array.isArray(data?.myDecks)
          ? (data.myDecks as Array<{
              id: string;
              name: string;
              format?: string;
            }>)
          : Array.isArray(data?.availableDecks)
          ? (data.availableDecks as Array<{
              id: string;
              name: string;
              format?: string;
            }>)
          : [];
        const pubDecks = Array.isArray(data?.publicDecks)
          ? (data.publicDecks as Array<{
              id: string;
              name: string;
              format?: string;
            }>)
          : [];
        const selected = data?.selectedDeckId
          ? String(data.selectedDeckId)
          : null;
        const allowed = Array.isArray(data?.allowedFormats)
          ? (data.allowedFormats as string[])
          : [];
        setConstructedDecks(decks);
        setConstructedPublicDecks(pubDecks);
        setConstructedSelectedDeckId(selected);
        setConstructedAllowedFormats(allowed);
      } catch (e) {
        setConstructedError(
          e instanceof Error ? e.message : "Failed to load constructed decks"
        );
        setConstructedDecks([]);
        setConstructedPublicDecks([]);
      } finally {
        setConstructedLoading(false);
      }
    })();
  }, [tId, tStatus, tFormat, isRegistered, includePublicDecks]);

  const handleSubmitConstructedDeck = async (
    deckId: string,
    isPublic: boolean = false
  ) => {
    if (!tournament) return;
    setConstructedError(null);
    setConstructedLoading(true);
    try {
      // Ensure prep is started (ignore if already)
      try {
        await fetch(
          `/api/tournaments/${encodeURIComponent(
            tournament.id
          )}/preparation/start`,
          { method: "POST", headers: { "Content-Type": "application/json" } }
        );
      } catch {}
      let finalDeckId = deckId;
      if (isPublic) {
        // Clone and select via constructed/decks POST (handles cloning and updating preparation data)
        const selectRes = await fetch(
          `/api/tournaments/${encodeURIComponent(
            tournament.id
          )}/preparation/constructed/decks`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deckId }),
          }
        );
        const selData = await selectRes.json();
        if (!selectRes.ok)
          throw new Error(selData?.error || "Failed to select public deck");
        finalDeckId = (selData?.selectedDeck?.id as string) || finalDeckId;
        // Optionally broadcast readiness via submit route for consistent events
        try {
          await fetch(
            `/api/tournaments/${encodeURIComponent(
              tournament.id
            )}/preparation/submit`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                preparationData: {
                  constructed: {
                    deckSelected: true,
                    deckValidated: true,
                    deckId: finalDeckId,
                  },
                },
              }),
            }
          );
        } catch {}
      } else {
        // Owned deck: submit constructed selection so server can transition when all submitted
        const submitRes = await fetch(
          `/api/tournaments/${encodeURIComponent(
            tournament.id
          )}/preparation/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              preparationData: {
                constructed: {
                  deckSelected: true,
                  deckValidated: true,
                  deckId,
                },
              },
            }),
          }
        );
        const submitData = await submitRes.json();
        if (!submitRes.ok)
          throw new Error(submitData?.error || "Failed to submit deck");
      }
      setConstructedSelectedDeckId(finalDeckId);
      try {
        localStorage.setItem(
          `constructed_submitted_tournament_${tournament.id}`,
          "true"
        );
        window.dispatchEvent(
          new CustomEvent("app:toast", {
            detail: { message: "Constructed deck submitted!" },
          })
        );
      } catch {}
      // Ask stats to refresh
      try {
        statistics?.actions?.refreshAll?.();
      } catch {}
    } catch (e) {
      setConstructedError(
        e instanceof Error ? e.message : "Failed to submit deck"
      );
    } finally {
      setConstructedLoading(false);
    }
  };

  // Helper: start/join a specific match id (bootstrap online match with tournament context)
  const startJoinMatch = async (matchId: string) => {
    if (!tournament) return;
    try {
      // Load matches to find roster for this match
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(tournament.id)}/matches`
      );
      if (res.ok) {
        const data = await res.json();
        const match = Array.isArray(data?.matches)
          ? data.matches.find((m: { id: string }) => m.id === matchId)
          : null;
        if (match && Array.isArray(match.players)) {
          // Determine match type from tournament settings/format
          const tSettings =
            (tournament as unknown as { settings?: Record<string, unknown> })
              .settings || {};
          const tournamentFormat =
            (tournament.format as "constructed" | "sealed" | "draft") ||
            "constructed";
          const matchType =
            tournamentFormat === "sealed" ? "sealed" : "constructed";
          // Try to include sealed/draft configs
          let sealedConfig =
            (tSettings as { sealedConfig?: unknown }).sealedConfig || null;
          let draftConfig = null;
          if (!sealedConfig && !draftConfig) {
            try {
              const detailRes = await fetch(
                `/api/tournaments/${encodeURIComponent(tournament.id)}`
              );
              if (detailRes.ok) {
                const detail = await detailRes.json();
                sealedConfig = detail?.settings?.sealedConfig || null;
                draftConfig = detail?.settings?.draftConfig || null;
              }
            } catch {}
          }
          if (tournamentFormat === "sealed" && !sealedConfig) {
            sealedConfig = {
              packCounts: { Beta: 6 },
              timeLimit: 40,
              replaceAvatars: false,
            };
          }
          const payload = {
            players: match.players.map((p: { id: string }) => p.id),
            matchType,
            lobbyName: tournament.name,
            sealedConfig,
            draftConfig,
            tournamentId: String(tournament.id),
          };
          try {
            localStorage.setItem(
              `tournamentMatchBootstrap_${matchId}`,
              JSON.stringify(payload)
            );
          } catch {}
        }
      }
    } catch {}
    try {
      window.location.href = `/online/play/${encodeURIComponent(matchId)}`;
    } catch {}
  };

  // Creator-only: start next round and pair players
  const handleStartNextRound = async () => {
    if (!tournament || !isCreator) return;
    setStartingRound(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(tournament.id)}/next-round`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to start next round");
      try {
        const msg = `Round ${data?.roundNumber ?? ""} started`;
        localStorage.setItem("app:toast", msg);
        window.dispatchEvent(
          new CustomEvent("app:toast", { detail: { message: msg } })
        );
      } catch {}
      try {
        statistics?.actions?.refreshAll?.();
      } catch {}
    } catch (err) {
      console.error("Failed to start next round:", err);
      setError(
        err instanceof Error ? err.message : "Failed to start next round"
      );
    } finally {
      setStartingRound(false);
    }
  };

  const handleJoinTournament = async () => {
    if (!session || !tournament) return;

    setJoining(true);
    setError(null);

    try {
      await rtJoinTournament(tournamentId);
    } catch (err) {
      console.error("Failed to join tournament:", err);
      setError(
        err instanceof Error ? err.message : "Failed to join tournament"
      );
    } finally {
      setJoining(false);
    }
  };

  const handleStartTournament = async () => {
    if (!session || !tournament || !isCreator) return;

    setStarting(true);
    setError(null);
    try {
      await rtStartTournament(tournamentId);
      try {
        localStorage.setItem("app:toast", "Tournament started");
        window.dispatchEvent(
          new CustomEvent("app:toast", {
            detail: { message: "Tournament started" },
          })
        );
      } catch {}
    } catch (err) {
      console.error("Failed to start tournament:", err);
      setError(
        err instanceof Error ? err.message : "Failed to start tournament"
      );
    } finally {
      setStarting(false);
    }
  };

  const handleEndTournament = async () => {
    if (!session || !tournament || !isCreator) return;

    const ok = window.confirm(
      "End this tournament now? This cannot be undone."
    );
    if (!ok) return;

    setError(null);
    try {
      await rtEndTournament(tournamentId);
      try {
        localStorage.setItem("app:toast", "Tournament ended");
        window.dispatchEvent(
          new CustomEvent("app:toast", {
            detail: { message: "Tournament ended" },
          })
        );
      } catch {}
      // Redirect actor to tournaments list after ending
      try {
        router.push("/tournaments");
      } catch {}
    } catch (err) {
      console.error("Failed to end tournament:", err);
      setError(err instanceof Error ? err.message : "Failed to end tournament");
    }
  };

  const getStatusBadgeColor = (status: Tournament["status"]) => {
    switch (status) {
      case "registering":
        return "bg-green-100 text-green-800 border-green-200";
      case "preparing":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "active":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "completed":
        return "bg-gray-100 text-gray-800 border-gray-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getFormatIcon = (format: Tournament["format"]) => {
    switch (format) {
      case "sealed":
        return "📦";
      case "draft":
        return "🎯";
      case "constructed":
        return "⚔️";
      default:
        return "🏆";
    }
  };

  if (status === "loading" || (rtLoading && !initialLoaded)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading tournament...</div>
      </div>
    );
  }

  if (!session) {
    return null; // Redirecting to signin
  }

  if (error || rtError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error || rtError}</div>
          <Link
            href="/tournaments"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Back to Tournaments
          </Link>
        </div>
      </div>
    );
  }

  // Avoid flashing "not found" before the realtime context hydrates
  if (
    !derivedTournament &&
    (!lastUpdated || fallbackLoading) &&
    !initialLoaded
  ) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading tournament...</div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Tournament not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white relative">
      {/* Floating tournament dock (Chat/Events/Players) */}
      <FloatingChat tournamentId={tournamentId} />
      {/* Toast overlay */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded bg-black/70 border border-white/20 text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Completion/Victory modal */}
      {showCompletionModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="w-full max-w-3xl bg-slate-900/95 rounded-2xl ring-1 ring-white/15 shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">🏆</div>
                  <div>
                    <div className="text-lg font-semibold">
                      Tournament Completed
                    </div>
                    <div className="text-sm text-white/70">
                      {tournament.name}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowCompletionModal(false)}
                  className="px-3 py-1.5 text-sm rounded bg-white/10 hover:bg-white/20"
                >
                  Close
                </button>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                {(() => {
                  const standings = (statistics?.standings || []) as Array<{
                    playerId: string;
                    playerName: string;
                    points?: number;
                    omw?: number;
                  }>;
                  const top = standings.slice(0, 3);
                  const meId = session?.user?.id || "";
                  const myIdx = meId
                    ? standings.findIndex((s) => s.playerId === meId)
                    : -1;
                  const myRank = myIdx >= 0 ? myIdx + 1 : null;
                  const total =
                    standings.length || getCurrentPlayersCount(tournament);
                  const champion = standings[0]?.playerName || "Champion";
                  return (
                    <>
                      <div className="md:col-span-2">
                        <div className="text-xl font-bold mb-2">Champion</div>
                        <div className="text-3xl font-fantaisie text-emerald-400">
                          {champion}
                        </div>
                        <div className="mt-4 text-sm text-white/80">
                          {myRank ? (
                            <span>
                              Your result:{" "}
                              <span className="font-semibold text-white">
                                #{myRank}
                              </span>{" "}
                              of {total}
                            </span>
                          ) : (
                            <span>Final standings are available below.</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-2">
                          Top Standings
                        </div>
                        <div className="space-y-2">
                          {top.map((s, i) => (
                            <div
                              key={s.playerId}
                              className="flex items-center justify-between rounded bg-white/5 px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-white/10 grid place-items-center text-sm font-bold">
                                  {i + 1}
                                </div>
                                <div className="truncate max-w-[12rem]">
                                  {s.playerName}
                                </div>
                              </div>
                              <div className="text-xs text-white/70">
                                {typeof s.points === "number"
                                  ? `${s.points} pts`
                                  : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="p-4 border-t border-white/10 flex items-center justify-end">
                <button
                  onClick={() => setShowCompletionModal(false)}
                  className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-black font-semibold"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Instant Join CTA when match is assigned */}
        {null}

        {/* Creator Controls: Start next round banner at top */}
        {tournament.status === "active" &&
          isCreator &&
          !activeRound &&
          maxRoundNumber < (tournament.settings.totalRounds || 3) && (
            <div className="mb-6 rounded-lg border border-indigo-600 bg-indigo-900/90 backdrop-blur flex items-center justify-between px-4 py-3 shadow-lg">
              <div className="text-indigo-100 text-sm">
                {rounds.length > 0 ? (
                  <span>
                    Round {lastCompletedRoundNumber} completed. Start next round
                    when ready.
                  </span>
                ) : (
                  <span>
                    Tournament is active. Start Round 1 when you&apos;re ready.
                  </span>
                )}
              </div>
              <button
                onClick={handleStartNextRound}
                disabled={startingRound}
                className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {startingRound
                  ? "Starting…"
                  : `Start Round ${Math.max(1, maxRoundNumber + 1)}`}
              </button>
            </div>
          )}
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <Link
              href="/tournaments"
              className="text-slate-400 hover:text-white mb-2 inline-flex items-center"
            >
              ← Back to Tournaments
            </Link>
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-3xl">
                {getFormatIcon(tournament.format)}
              </span>
              <div>
                <h1 className="text-3xl font-fantaisie text-white">
                  {tournament.name}
                </h1>
                <div className="flex items-center space-x-4 mt-1">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium border capitalize ${getStatusBadgeColor(
                      tournament.status
                    )}`}
                  >
                    {tournament.status}
                  </span>
                  <span className="text-slate-400 capitalize">
                    {tournament.format} Tournament
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex space-x-3">
              {/* Invite Players button (creator only, during registration while capacity remains) */}
              {isCreator &&
                tournament.status === "registering" &&
                getCurrentPlayersCount(tournament) < tournament.maxPlayers && (
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    <span>👥</span>
                    <span>Invite Players</span>
                  </button>
                )}

              {tournament.status === "registering" &&
                !isRegistered &&
                getCurrentPlayersCount(tournament) < tournament.maxPlayers && (
                  <button
                    onClick={handleJoinTournament}
                    disabled={joining}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {joining ? "Joining..." : "Join Tournament"}
                  </button>
                )}

              {/* End/Forfeit controls moved to bottom of page */}
            </div>
          </div>
        </div>

        {/* Prominent Submitted Deck (collapsed by default) */}
        {isRegistered &&
          (() => {
            // Determine if the player has a submitted deck (server + optimistic flags)
            const meId = session?.user?.id;
            const rp =
              (
                tournament as unknown as {
                  registeredPlayers?: Array<{
                    id: string;
                    deckSubmitted?: boolean;
                  }>;
                }
              ).registeredPlayers || [];
            const mine = rp.find((p) => p.id === meId);
            const serverSubmitted = Boolean(
              (mine as { deckSubmitted?: boolean })?.deckSubmitted
            );
            let optimistic = false;
            try {
              optimistic =
                localStorage.getItem(
                  `sealed_submitted_tournament_${tournament.id}`
                ) === "true" ||
                localStorage.getItem(
                  `draft_submitted_tournament_${tournament.id}`
                ) === "true";
            } catch {}
            const hasDeck = viewerDeckCards.length > 0;
            const submittedDeck = serverSubmitted || optimistic || hasDeck;
            if (!submittedDeck) return null;

            const totalCards = viewerDeckCards.reduce(
              (sum, c) => sum + (Number(c.quantity) || 0),
              0
            );

            return (
              <div className="mb-6 rounded-lg border border-emerald-700 bg-emerald-900/20">
                <div className="p-4 flex items-center justify-between">
                  <div className="text-emerald-200">
                    <div className="font-semibold">Your Submitted Deck</div>
                    <div className="text-sm opacity-80">
                      {viewerDeckCards.length > 0
                        ? `${totalCards} cards`
                        : "Deck submitted — syncing list…"}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDeckDetails((v) => !v)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                  >
                    {showDeckDetails ? "Hide" : "Show"}
                  </button>
                </div>
                {showDeckDetails && (
                  <div className="px-4 pb-4">
                    {viewerDeckCards.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {viewerDeckCards.map((c) => {
                          const isSite = (c.type || "")
                            .toLowerCase()
                            .includes("site");
                          const order = [
                            "air",
                            "water",
                            "earth",
                            "fire",
                          ] as const;
                          const thresholds: Record<string, number> = {};
                          if (c.thresholds) {
                            for (const [k, v] of Object.entries(
                              c.thresholds as Record<string, number>
                            )) {
                              const key = k.toLowerCase();
                              if (
                                v &&
                                ["air", "water", "earth", "fire"].includes(key)
                              ) {
                                thresholds[key] = v;
                              }
                            }
                          }

                          return (
                            <div
                              key={`${c.cardId}`}
                              className="rounded p-2 bg-black/70 ring-1 ring-emerald-700/40 text-white hover:bg-black/50 cursor-pointer transition-colors"
                              onMouseEnter={() => {
                                if (c.slug) {
                                  setHoveredCard({
                                    slug: c.slug,
                                    name: c.name,
                                    type: c.type || null,
                                  });
                                }
                              }}
                              onMouseLeave={() => setHoveredCard(null)}
                            >
                              <div className="flex items-start gap-2">
                                {c.slug && (
                                  <div
                                    className={`relative flex-none ${
                                      isSite
                                        ? "aspect-[4/3] w-16"
                                        : "aspect-[3/4] w-12"
                                    } rounded overflow-hidden ring-1 ring-white/10 bg-black/40`}
                                  >
                                    <Image
                                      src={`/api/images/${c.slug}`}
                                      alt={c.name}
                                      fill
                                      className={`${
                                        isSite
                                          ? "object-contain rotate-90"
                                          : "object-cover"
                                      }`}
                                      sizes="(max-width:640px) 20vw, (max-width:1024px) 15vw, 10vw"
                                      unoptimized
                                    />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between">
                                    <div className="min-w-0">
                                      <div
                                        className="font-semibold truncate text-sm"
                                        title={c.name}
                                      >
                                        {c.name}
                                      </div>
                                      <div className="text-[11px] text-slate-400 mt-0.5">
                                        {c.setName}
                                      </div>
                                    </div>
                                    <div className="text-right font-semibold text-sm">
                                      x{c.quantity}
                                    </div>
                                  </div>
                                  <div className="mt-1 flex items-center flex-wrap gap-1 opacity-90">
                                    <div className="flex items-center gap-0.5">
                                      {order.map((k) =>
                                        thresholds[k] ? (
                                          <span
                                            key={k}
                                            className="inline-flex items-center gap-0.5"
                                          >
                                            {Array.from({
                                              length: thresholds[k],
                                            }).map((_, i) => (
                                              <Image
                                                key={i}
                                                src={`/api/assets/${k}.png`}
                                                alt={k}
                                                width={12}
                                                height={12}
                                              />
                                            ))}
                                          </span>
                                        ) : null
                                      )}
                                    </div>
                                    {c.cost != null && !isSite && (
                                      <div className="ml-auto flex items-center gap-1">
                                        {c.cost >= 0 && c.cost <= 9 ? (
                                          <NumberBadge
                                            value={c.cost as Digit}
                                            size={16}
                                            strokeWidth={8}
                                          />
                                        ) : (
                                          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-white text-black text-[10px] font-bold">
                                            {c.cost}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-emerald-200/80">
                        Loading deck list…
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

        {/* Phase Actions */}
        {tournament.status === "preparing" && (
          <div className="mb-6 rounded-lg border border-blue-700 bg-blue-900/20 p-4 flex items-center justify-between">
            <div className="text-slate-200">
              {tournament.format === "draft" &&
                "Draft phase in progress. Join the draft to begin selecting cards."}
              {tournament.format === "sealed" &&
                "Sealed preparation in progress. Open packs and build your deck."}
              {tournament.format === "constructed" &&
                "Constructed preparation. Select and validate your deck."}
            </div>
            {isRegistered && (
              <div className="flex items-center gap-2">
                {tournament.format === "draft" &&
                  (() => {
                    const meId = session?.user?.id;
                    const rp =
                      (
                        tournament as unknown as {
                          registeredPlayers?: Array<{
                            id: string;
                            deckSubmitted?: boolean;
                          }>;
                        }
                      ).registeredPlayers || [];
                    const mine = rp.find((p) => p.id === meId);
                    // Consider server flag and optimistic client flag to reduce flicker
                    let optimisticSubmitted = false;
                    try {
                      optimisticSubmitted =
                        localStorage.getItem(
                          `draft_submitted_tournament_${tournament.id}`
                        ) === "true";
                    } catch {}
                    const submitted =
                      Boolean(
                        (mine as { deckSubmitted?: boolean })?.deckSubmitted
                      ) ||
                      optimisticSubmitted ||
                      viewerDeckCards.length > 0;
                    if (submitted) {
                      return (
                        <div className="flex items-center gap-3">
                          <span
                            className="bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-500/30 px-4 py-2 rounded-md text-sm"
                            title="Deck submitted"
                          >
                            Draft Deck submitted!
                          </span>
                        </div>
                      );
                    }
                    return (
                      <button
                        onClick={() => {
                          try {
                            window.location.href = `/tournaments/${tournament.id}/draft`;
                          } catch {}
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm"
                      >
                        Enter Draft
                      </button>
                    );
                  })()}
                {tournament.format === "sealed" &&
                  (() => {
                    const meId = session?.user?.id;
                    const rp =
                      (
                        tournament as unknown as {
                          registeredPlayers?: Array<{
                            id: string;
                            ready?: boolean;
                            deckSubmitted?: boolean;
                          }>;
                        }
                      ).registeredPlayers || [];
                    const mine = rp.find((p) => p.id === meId);
                    // Only treat a deck as submitted when the server marks deckSubmitted.
                    // Also allow an optimistic local flag to avoid flicker on redirect.
                    let optimisticSubmitted = false;
                    try {
                      optimisticSubmitted =
                        localStorage.getItem(
                          `sealed_submitted_tournament_${tournament.id}`
                        ) === "true";
                    } catch {}
                    const submitted =
                      Boolean(
                        (mine as { deckSubmitted?: boolean })?.deckSubmitted
                      ) ||
                      optimisticSubmitted ||
                      viewerDeckCards.length > 0;
                    if (submitted) {
                      return (
                        <div className="flex items-center gap-3">
                          <span
                            className="bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-500/30 px-4 py-2 rounded-md text-sm"
                            title="Deck submitted"
                          >
                            Sealed Deck submitted!
                          </span>
                        </div>
                      );
                    }
                    return (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(
                              `/api/tournaments/${encodeURIComponent(
                                tournament.id
                              )}/preparation/start`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                              }
                            );
                            const data = await res.json();
                            if (!res.ok)
                              throw new Error(
                                data?.error || "Failed to start preparation"
                              );
                            const sealedData = data?.preparationData?.sealed as
                              | {
                                  generatedPacks?: Array<{
                                    packId: string;
                                    setId: string;
                                    cards: unknown[];
                                  }>;
                                  cubeName?: string | null;
                                  cubeId?: string | null;
                                  includeCubeSideboardInStandard?: boolean;
                                }
                              | undefined;
                            const packs = sealedData?.generatedPacks;
                            if (Array.isArray(packs)) {
                              const storePacks = packs.map((p) => ({
                                id: p.packId,
                                set: p.setId,
                                cards: Array.isArray(p.cards) ? p.cards : [],
                                opened: false,
                              }));
                              try {
                                localStorage.setItem(
                                  `sealedPacks_tournament_${tournament.id}`,
                                  JSON.stringify(storePacks)
                                );
                                // Store cube name for display if available
                                if (sealedData?.cubeName) {
                                  localStorage.setItem(
                                    `sealedCubeName_tournament_${tournament.id}`,
                                    sealedData.cubeName
                                  );
                                }
                                // Store cube sideboard setting if available
                                if (
                                  sealedData?.cubeId &&
                                  sealedData.includeCubeSideboardInStandard
                                ) {
                                  localStorage.setItem(
                                    `sealedCubeSideboard_tournament_${tournament.id}`,
                                    JSON.stringify({
                                      cubeId: sealedData.cubeId,
                                      includeSideboard:
                                        sealedData.includeCubeSideboardInStandard,
                                    })
                                  );
                                }
                              } catch {}
                            }
                          } catch (e) {
                            console.warn("Failed to start preparation:", e);
                          }
                          try {
                            const cfg =
                              (
                                tournament as unknown as {
                                  settings?: {
                                    sealedConfig?: {
                                      packCounts?: Record<string, number>;
                                      timeLimit?: number;
                                      replaceAvatars?: boolean;
                                    };
                                  };
                                }
                              ).settings?.sealedConfig || {};
                            const packCount =
                              Object.values(
                                cfg.packCounts || { Beta: 6 }
                              ).reduce((a, b) => a + (b || 0), 0) || 6;
                            const setMix = Object.entries(
                              cfg.packCounts || { Beta: 6 }
                            )
                              .filter(([, c]) => (c || 0) > 0)
                              .map(([s]) => s);
                            const timeLimit = cfg.timeLimit ?? 40;
                            const replaceAvatars = cfg.replaceAvatars ?? false;
                            const params = new URLSearchParams({
                              sealed: "true",
                              tournament: tournament.id,
                              packCount: String(packCount),
                              setMix: setMix.join(","),
                              timeLimit: String(timeLimit),
                              constructionStartTime: String(Date.now()),
                              replaceAvatars: String(replaceAvatars),
                              matchName: tournament.name,
                            });
                            window.location.href = `/decks/editor-3d?${params.toString()}`;
                          } catch {}
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm"
                      >
                        Build Deck
                      </button>
                    );
                  })()}
              </div>
            )}
          </div>
        )}

        {/* Constructed deck loader (only when preparing + constructed) */}
        {tournament.status === "preparing" &&
          tournament.format === "constructed" &&
          isRegistered && (
            <div
              ref={constructedPanelRef}
              className="mb-6 rounded-lg border border-emerald-700 bg-emerald-900/20"
            >
              <div className="p-4 flex items-center justify-between">
                <div className="text-emerald-200">
                  <div className="font-semibold">
                    Select Your Constructed Deck
                  </div>
                  <div className="text-sm opacity-80">
                    This deck will be used for all matches in this tournament.
                  </div>
                </div>
                {constructedSelectedDeckId ? (
                  <span
                    className="bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-500/30 px-4 py-2 rounded-md text-sm"
                    title="Deck submitted"
                  >
                    Deck submitted
                  </span>
                ) : null}
              </div>
              <div className="px-4 pb-4">
                {constructedError && (
                  <div className="mb-3 text-sm text-red-300">
                    {constructedError}
                  </div>
                )}
                <div className="text-xs text-emerald-200/80 mb-2">
                  Allowed formats:{" "}
                  {constructedAllowedFormats.length
                    ? constructedAllowedFormats.join(", ")
                    : "standard"}
                </div>
                <label className="flex items-center gap-2 text-xs text-emerald-200/80 mb-3">
                  <input
                    type="checkbox"
                    className="accent-emerald-600"
                    checked={includePublicDecks}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIncludePublicDecks(next);
                      try {
                        localStorage.setItem(
                          "sorcery:includePublicDecks",
                          next ? "1" : "0"
                        );
                      } catch {}
                    }}
                  />
                  Include public decks
                </label>
                {constructedLoading ? (
                  <div className="text-emerald-200/80 text-sm">
                    Loading your decks…
                  </div>
                ) : constructedDecks.length || constructedPublicDecks.length ? (
                  <div className="space-y-4">
                    {constructedDecks.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">
                          My Decks
                        </div>
                        <div className="space-y-2">
                          {constructedDecks.map((d) => (
                            <div
                              key={`my-${d.id}`}
                              className={`flex items-center justify-between px-3 py-2 rounded ${
                                constructedSelectedDeckId === d.id
                                  ? "bg-emerald-600/20 ring-1 ring-emerald-500/30"
                                  : "bg-slate-800/40"
                              }`}
                            >
                              <div className="text-sm text-slate-200">
                                <div className="font-medium">{d.name}</div>
                                <div className="text-xs text-slate-400">
                                  {d.format || "constructed"}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {constructedSelectedDeckId === d.id ? (
                                  <span className="text-emerald-300 text-xs">
                                    Selected
                                  </span>
                                ) : (
                                  <button
                                    onClick={() =>
                                      handleSubmitConstructedDeck(d.id, false)
                                    }
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                                    disabled={constructedLoading}
                                  >
                                    Select
                                  </button>
                                )}
                                <Link
                                  href={`/decks/editor-3d?id=${encodeURIComponent(
                                    d.id
                                  )}&tournament=${encodeURIComponent(
                                    tournament.id
                                  )}`}
                                  className="text-xs text-emerald-200 underline"
                                >
                                  Edit
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {includePublicDecks &&
                      constructedPublicDecks.length > 0 && (
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">
                            Public Decks
                          </div>
                          <div className="space-y-2">
                            {constructedPublicDecks.map((d) => (
                              <div
                                key={`pub-${d.id}`}
                                className={`flex items-center justify-between px-3 py-2 rounded ${
                                  constructedSelectedDeckId === d.id
                                    ? "bg-emerald-600/20 ring-1 ring-emerald-500/30"
                                    : "bg-slate-800/40"
                                }`}
                              >
                                <div className="text-sm text-slate-200">
                                  <div className="font-medium">{d.name}</div>
                                  <div className="text-xs text-slate-400">
                                    {d.format || "constructed"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {constructedSelectedDeckId === d.id ? (
                                    <span className="text-emerald-300 text-xs">
                                      Selected
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        handleSubmitConstructedDeck(d.id, true)
                                      }
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                                      disabled={constructedLoading}
                                    >
                                      Select
                                    </button>
                                  )}
                                  <Link
                                    href={`/decks/editor-3d?id=${encodeURIComponent(
                                      d.id
                                    )}&tournament=${encodeURIComponent(
                                      tournament.id
                                    )}`}
                                    className="text-xs text-emerald-200 underline"
                                  >
                                    Edit
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="text-emerald-200/80 text-sm space-y-2">
                    <div>
                      No valid decks found. Constructed decks must have:
                    </div>
                    <ul className="list-disc list-inside text-xs opacity-80">
                      <li>Exactly 1 Avatar</li>
                      <li>At least 60 cards in Spellbook</li>
                      <li>At least 30 sites in Atlas</li>
                      <li>0-10 cards in Collection</li>
                      <li>Dragonlord decks require a champion</li>
                    </ul>
                    <div>
                      <Link href="/decks" className="underline">
                        Edit your decks
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        {tournament.status === "active" &&
          isRegistered &&
          (() => {
            const mid = myAssignedMatchId ?? myMatchId;
            if (!mid) return null;
            // Check if this match is completed
            const globalMatches = statistics?.matches || [];
            const myMatch = globalMatches.find(
              (m) => String(m.id) === String(mid)
            );
            const isCompleted =
              myMatch &&
              (myMatch.status === "completed" || myMatch.completedAt);
            if (isCompleted) {
              const pendingInRound = globalMatches.filter((m) => {
                if (String(m.id) === String(mid)) return false;
                if (
                  activeRoundNumber != null &&
                  m.roundNumber !== activeRoundNumber
                )
                  return false;
                return m.status !== "completed" && !m.completedAt;
              });
              if (pendingInRound.length > 0) {
                return (
                  <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-slate-200">
                    Your match is finished. Waiting for other matches in this
                    round to complete.
                  </div>
                );
              }
              return null;
            }
            return null;
          })()}

        {/* Current Round Matches */}
        {tournament.status === "active" && activeRound && (
          <div className="mb-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Round {activeRound.roundNumber} Matches
              </h3>
              {(() => {
                const embedded =
                  (
                    activeRound as unknown as {
                      matches?: Array<{
                        id: string;
                        players?: Array<{ id: string; name: string }>;
                      }>;
                    }
                  ).matches || [];
                const fallback = (statistics?.matches || []).filter(
                  (m) =>
                    m.roundNumber ===
                    (activeRound as { roundNumber?: number }).roundNumber
                );
                const list = embedded.length > 0 ? embedded : fallback;
                if (!Array.isArray(list) || list.length === 0) {
                  return (
                    <div className="text-slate-400">
                      No matches in this round.
                    </div>
                  );
                }
                return (
                  <div className="space-y-2">
                    {list.map(
                      (m: {
                        id: string;
                        status?: string;
                        completedAt?: string | null;
                        players?: Array<{ id: string; name: string }>;
                      }) => {
                        const players = Array.isArray(m.players)
                          ? m.players
                          : [];
                        const names = players.map((p) => p.name).join(" vs ");
                        const isMine =
                          (myAssignedMatchId
                            ? String(m.id) === String(myAssignedMatchId)
                            : false) ||
                          players.some((p) => p.id === session?.user?.id);
                        const isCompleted =
                          m.status === "completed" || m.completedAt;
                        return (
                          <div
                            key={m.id}
                            className={`flex items-center justify-between px-3 py-2 rounded ${
                              isMine
                                ? "bg-emerald-600/20 ring-1 ring-emerald-500/30"
                                : "bg-slate-800/40"
                            }`}
                          >
                            <div className="text-sm text-slate-200">
                              {names || m.id}
                              {isMine && !isCompleted && (
                                <span className="text-emerald-400 text-xs ml-2">
                                  (Your match)
                                </span>
                              )}
                              {isCompleted && (
                                <span className="text-slate-400 text-xs ml-2">
                                  (Completed)
                                </span>
                              )}
                            </div>
                            {isMine && !isCompleted && (
                              <button
                                onClick={() => startJoinMatch(String(m.id))}
                                className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold px-3 py-1 rounded-md text-sm"
                              >
                                Join
                              </button>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
            <div className="flex items-center">
              <svg
                className="w-5 h-5 mr-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Spectacular Start Tournament Button */}
        {tournament.status === "registering" &&
          isCreator &&
          getCurrentPlayersCount(tournament) === tournament.maxPlayers && (
            <div className="mb-8">
              <button
                onClick={handleStartTournament}
                disabled={starting}
                className="w-full relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-1 transition-all hover:shadow-2xl hover:shadow-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="relative bg-slate-900 rounded-lg px-8 py-6 flex items-center justify-center gap-3 transition-all group-hover:bg-slate-900/50">
                  <div className="text-3xl">🏆</div>
                  <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
                    {starting ? "Starting Tournament..." : "Start Tournament"}
                  </div>
                  <div className="text-3xl">🏆</div>
                </div>
                {/* Animated border effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity blur-xl -z-10" />
              </button>
              <div className="text-center text-slate-400 text-sm mt-2">
                All players joined ({getCurrentPlayersCount(tournament)}/
                {tournament.maxPlayers}) • Click to begin
              </div>
            </div>
          )}

        {/* Tournament Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm">Players</div>
            <div className="text-2xl font-bold text-white">
              {getCurrentPlayersCount(tournament)}/{tournament.maxPlayers}
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min(
                    (getCurrentPlayersCount(tournament) /
                      tournament.maxPlayers) *
                      100,
                    100
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm">Rounds</div>
            <div className="text-2xl font-bold text-white">
              {statistics?.rounds?.filter((r) => r.status === "completed")
                .length ?? 0}
              /{tournament.settings.totalRounds || 3}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm">Matches</div>
            <div className="text-2xl font-bold text-white">
              {statistics?.overview.completedMatches || 0}/
              {statistics?.overview.totalMatches || 0}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm">Created</div>
            <div className="text-lg font-semibold text-white">
              {new Date(tournament.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Prominent Players roster for hosts/moderation (below stats) */}
        <div className="mb-6">
          <TournamentRoster tournamentId={tournamentId} />
        </div>
        {/* Tabs */}
        <div className="border-b border-slate-700 mb-8">
          <nav className="flex space-x-8">
            {(["overview", "standings", "rounds"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm capitalize transition-colors ${
                  activeTab === tab
                    ? "border-blue-500 text-blue-400"
                    : "border-transparent text-slate-400 hover:text-white hover:border-slate-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Tournament Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">Format:</span>
                  <span className="text-white ml-2 capitalize">
                    {tournament.format}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Max Players:</span>
                  <span className="text-white ml-2">
                    {tournament.maxPlayers}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Total Rounds:</span>
                  <span className="text-white ml-2">
                    {tournament.settings.totalRounds || 3}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Round Duration:</span>
                  <span className="text-white ml-2">
                    {tournament.settings.roundDuration || 60} minutes
                  </span>
                </div>
                {tournament.startedAt && (
                  <div>
                    <span className="text-slate-400">Started:</span>
                    <span className="text-white ml-2">
                      {new Date(tournament.startedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {tournament.completedAt && (
                  <div>
                    <span className="text-slate-400">Completed:</span>
                    <span className="text-white ml-2">
                      {new Date(tournament.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Completed Tournament Summary */}
            {tournament.status === "completed" && (
              <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-emerald-200 mb-4">
                  Tournament Completed
                </h3>
                {statistics &&
                statistics.standings &&
                statistics.standings.length > 0 ? (
                  <div className="space-y-4">
                    {/* Winner */}
                    <div className="flex items-center justify-between bg-emerald-800/30 rounded-md p-4 border border-emerald-700/50">
                      <div className="text-emerald-200 text-base">Winner</div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-emerald-300">
                          {statistics.standings[0]?.playerName}
                        </div>
                        <div className="text-sm text-emerald-200/80">
                          {statistics.standings[0]?.matchPoints} pts ·{" "}
                          {statistics.standings[0]?.wins}-
                          {statistics.standings[0]?.losses}-
                          {statistics.standings[0]?.draws}
                        </div>
                      </div>
                    </div>
                    {/* Placements (Top 3) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {statistics.standings.slice(0, 3).map((s, idx) => (
                        <div
                          key={s.playerId}
                          className="bg-slate-900/40 rounded-md p-4 border border-slate-700/60"
                        >
                          <div className="text-slate-400 text-sm">
                            #{idx + 1}
                          </div>
                          <div className="text-white font-semibold">
                            {s.playerName}
                          </div>
                          <div className="text-slate-300 text-sm">
                            {s.matchPoints} pts · {s.wins}-{s.losses}-{s.draws}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Key statistics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-slate-900/40 rounded-md p-4 border border-slate-700/60">
                        <div className="text-slate-400 text-sm">Players</div>
                        <div className="text-white text-lg font-semibold">
                          {statistics.overview.totalPlayers}
                        </div>
                      </div>
                      <div className="bg-slate-900/40 rounded-md p-4 border border-slate-700/60">
                        <div className="text-slate-400 text-sm">Rounds</div>
                        <div className="text-white text-lg font-semibold">
                          {statistics.overview.totalRounds}
                        </div>
                      </div>
                      <div className="bg-slate-900/40 rounded-md p-4 border border-slate-700/60">
                        <div className="text-slate-400 text-sm">Matches</div>
                        <div className="text-white text-lg font-semibold">
                          {statistics.overview.completedMatches}/
                          {statistics.overview.totalMatches}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-emerald-200/80">
                    Final standings will appear here.
                  </div>
                )}
              </div>
            )}

            {/* Active Tournament Standings Preview */}
            {(tournament.status === "active" ||
              tournament.status === "preparing") &&
              statistics &&
              statistics.standings &&
              statistics.standings.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    Current Standings (Top 5)
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-600">
                          <th className="text-left py-2 text-slate-300">
                            Rank
                          </th>
                          <th className="text-left py-2 text-slate-300">
                            Player
                          </th>
                          <th className="text-center py-2 text-slate-300">
                            Record
                          </th>
                          <th className="text-center py-2 text-slate-300">
                            Points
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {statistics.standings
                          .slice(0, 5)
                          .map((standing, index) => {
                            const isMe =
                              standing.playerId === session?.user?.id;
                            return (
                              <tr
                                key={standing.playerId}
                                className={`border-b border-slate-700 ${
                                  isMe ? "bg-emerald-900/20" : ""
                                }`}
                              >
                                <td className="py-2 font-semibold">
                                  #{index + 1}
                                </td>
                                <td className="py-2">
                                  {standing.playerName}{" "}
                                  {isMe && (
                                    <span className="text-emerald-400 text-xs">
                                      (You)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 text-center">
                                  {standing.wins}-{standing.losses}-
                                  {standing.draws}
                                </td>
                                <td className="py-2 text-center font-semibold">
                                  {standing.matchPoints}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={() => setActiveTab("standings")}
                    className="mt-4 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    View Full Standings →
                  </button>
                </div>
              )}

            {tournament.status === "registering" && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-300 mb-2">
                  Registration Open
                </h3>
                <p className="text-blue-200">
                  Tournament is accepting new players.{" "}
                  {Math.max(
                    0,
                    tournament.maxPlayers - getCurrentPlayersCount(tournament)
                  )}{" "}
                  spots remaining.
                </p>
                {isCreator && (
                  <p className="text-blue-200 mt-2">
                    <strong>Creator:</strong> You can start the tournament once
                    at least 2 players have joined.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "standings" && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Player Standings
            </h3>
            {statistics &&
            statistics.standings &&
            statistics.standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2 text-slate-300">Rank</th>
                      <th className="text-left py-2 text-slate-300">Player</th>
                      <th className="text-center py-2 text-slate-300">Wins</th>
                      <th className="text-center py-2 text-slate-300">
                        Losses
                      </th>
                      <th className="text-center py-2 text-slate-300">Draws</th>
                      <th className="text-center py-2 text-slate-300">
                        Points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {statistics?.standings?.map((standing, index) => (
                      <tr
                        key={standing.playerId}
                        className="border-b border-slate-700"
                      >
                        <td className="py-2 font-semibold">#{index + 1}</td>
                        <td className="py-2">
                          <span
                            className={
                              standing.playerId === session?.user?.id
                                ? "text-blue-400 font-semibold"
                                : "text-white"
                            }
                          >
                            {standing.playerName}
                          </span>
                        </td>
                        <td className="py-2 text-center text-green-400">
                          {standing.wins}
                        </td>
                        <td className="py-2 text-center text-red-400">
                          {standing.losses}
                        </td>
                        <td className="py-2 text-center text-yellow-400">
                          {standing.draws}
                        </td>
                        <td className="py-2 text-center font-semibold">
                          {standing.matchPoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                No standings available yet.
              </div>
            )}
          </div>
        )}

        {activeTab === "rounds" && (
          <div className="space-y-6">
            {statistics && statistics.rounds && statistics.rounds.length > 0 ? (
              statistics.rounds.map((round) => (
                <div
                  key={round.id}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      Round {round.roundNumber}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium border capitalize ${
                        round.status === "completed"
                          ? "bg-gray-100 text-gray-800 border-gray-200"
                          : round.status === "active"
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : "bg-yellow-100 text-yellow-800 border-yellow-200"
                      }`}
                    >
                      {round.status}
                    </span>
                  </div>

                  <div className="text-sm text-slate-400">
                    {round.startedAt && (
                      <div>
                        Started: {new Date(round.startedAt).toLocaleString()}
                      </div>
                    )}
                    {round.completedAt && (
                      <div>
                        Completed:{" "}
                        {new Date(round.completedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="text-center py-8 text-slate-400">
                  No rounds started yet.
                </div>
              </div>
            )}
          </div>
        )}
        {/* Bottom actions: Forfeit/End */}
        <div className="container mx-auto px-4 pb-10">
          <div className="mt-10 border-t border-slate-800 pt-6 flex items-center justify-between">
            <div className="text-xs text-slate-400">Tournament actions</div>
            <div className="flex gap-3">
              {isRegistered &&
                tournament.status !== "completed" &&
                !isCreator && (
                  <button
                    onClick={async () => {
                      const ok = window.confirm("Forfeit this tournament now?");
                      if (!ok) return;
                      try {
                        const res = await fetch(
                          `/api/tournaments/${encodeURIComponent(
                            tournament.id
                          )}/forfeit`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                          }
                        );
                        const data = await res.json();
                        if (!res.ok)
                          throw new Error(data?.error || "Failed to forfeit");
                        try {
                          localStorage.setItem(
                            "app:toast",
                            "You forfeited the tournament"
                          );
                          window.dispatchEvent(
                            new CustomEvent("app:toast", {
                              detail: {
                                message: "You forfeited the tournament",
                              },
                            })
                          );
                          try {
                            await refreshTournaments?.();
                          } catch {}
                          try {
                            statistics?.actions?.refreshAll?.();
                          } catch {}
                          try {
                            setCurrentTournamentById(tournament.id);
                          } catch {}
                        } catch {}
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Failed to forfeit"
                        );
                      }
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-md text-sm"
                    title="Forfeit this tournament"
                  >
                    Forfeit Tournament
                  </button>
                )}

              {isCreator && tournament.status !== "completed" && (
                <button
                  onClick={handleEndTournament}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-md text-sm"
                  title="End this tournament now"
                >
                  End Tournament
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Join Prompt Overlay */}
        {/* Constructed Decks Modal */}
        {constructedModalOpen &&
          tournament.status === "preparing" &&
          tournament.format === "constructed" &&
          isRegistered && (
            <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 w-full max-w-lg shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-white text-lg font-semibold">
                    Select Your Constructed Deck
                  </div>
                  <button
                    onClick={() => setConstructedModalOpen(false)}
                    className="text-slate-300 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                {constructedError && (
                  <div className="mb-3 text-sm text-red-300">
                    {constructedError}
                  </div>
                )}
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-emerald-200/80">
                    Allowed formats:{" "}
                    {constructedAllowedFormats.length
                      ? constructedAllowedFormats.join(", ")
                      : "standard"}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-emerald-200/80">
                    <input
                      type="checkbox"
                      className="accent-emerald-600"
                      checked={includePublicDecks}
                      onChange={async (e) => {
                        const next = e.target.checked;
                        setIncludePublicDecks(next);
                        try {
                          localStorage.setItem(
                            "sorcery:includePublicDecks",
                            next ? "1" : "0"
                          );
                        } catch {}
                        try {
                          setConstructedLoading(true);
                          const res = await fetch(
                            `/api/tournaments/${encodeURIComponent(
                              tournament.id
                            )}/preparation/constructed/decks?includePublic=${
                              e.target.checked ? "true" : "false"
                            }`
                          );
                          const data = await res.json();
                          if (res.ok) {
                            const decks = Array.isArray(data?.myDecks)
                              ? (data.myDecks as Array<{
                                  id: string;
                                  name: string;
                                  format?: string;
                                }>)
                              : Array.isArray(data?.availableDecks)
                              ? (data.availableDecks as Array<{
                                  id: string;
                                  name: string;
                                  format?: string;
                                }>)
                              : [];
                            const pubDecks = Array.isArray(data?.publicDecks)
                              ? (data.publicDecks as Array<{
                                  id: string;
                                  name: string;
                                  format?: string;
                                }>)
                              : [];
                            setConstructedDecks(decks);
                            setConstructedPublicDecks(pubDecks);
                          }
                        } catch {
                        } finally {
                          setConstructedLoading(false);
                        }
                      }}
                    />
                    Include public decks
                  </label>
                </div>
                {constructedLoading ? (
                  <div className="text-emerald-200/80 text-sm">
                    Loading your decks…
                  </div>
                ) : constructedDecks.length || constructedPublicDecks.length ? (
                  <div className="space-y-4 max-h-80 overflow-auto pr-1">
                    {constructedDecks.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">
                          My Decks
                        </div>
                        <div className="space-y-2">
                          {constructedDecks.map((d) => (
                            <div
                              key={`my-modal-${d.id}`}
                              className={`flex items-center justify-between px-3 py-2 rounded ${
                                constructedSelectedDeckId === d.id
                                  ? "bg-emerald-600/20 ring-1 ring-emerald-500/30"
                                  : "bg-slate-800/40"
                              }`}
                            >
                              <div className="text-sm text-slate-200">
                                <div className="font-medium">{d.name}</div>
                                <div className="text-xs text-slate-400">
                                  {d.format || "constructed"}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {constructedSelectedDeckId === d.id ? (
                                  <span className="text-emerald-300 text-xs">
                                    Selected
                                  </span>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      await handleSubmitConstructedDeck(
                                        d.id,
                                        false
                                      );
                                      setConstructedModalOpen(false);
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                                    disabled={constructedLoading}
                                  >
                                    Select
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {includePublicDecks &&
                      constructedPublicDecks.length > 0 && (
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">
                            Public Decks
                          </div>
                          <div className="space-y-2">
                            {constructedPublicDecks.map((d) => (
                              <div
                                key={`pub-modal-${d.id}`}
                                className={`flex items-center justify-between px-3 py-2 rounded ${
                                  constructedSelectedDeckId === d.id
                                    ? "bg-emerald-600/20 ring-1 ring-emerald-500/30"
                                    : "bg-slate-800/40"
                                }`}
                              >
                                <div className="text-sm text-slate-200">
                                  <div className="font-medium">{d.name}</div>
                                  <div className="text-xs text-slate-400">
                                    {d.format || "constructed"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {constructedSelectedDeckId === d.id ? (
                                    <span className="text-emerald-300 text-xs">
                                      Selected
                                    </span>
                                  ) : (
                                    <button
                                      onClick={async () => {
                                        await handleSubmitConstructedDeck(
                                          d.id,
                                          true
                                        );
                                        setConstructedModalOpen(false);
                                      }}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                                      disabled={constructedLoading}
                                    >
                                      Select
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                ) : (
                  <div className="text-emerald-200/80 text-sm space-y-2">
                    <div>
                      No valid decks found. Constructed decks must have:
                    </div>
                    <ul className="list-disc list-inside text-xs opacity-80">
                      <li>Exactly 1 Avatar</li>
                      <li>At least 60 cards in Spellbook</li>
                      <li>At least 30 sites in Atlas</li>
                      <li>0-10 cards in Collection</li>
                      <li>Dragonlord decks require a champion</li>
                    </ul>
                    <div>
                      <a className="underline" href="/decks">
                        Edit your decks
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* Tournament Completion Celebration Modal */}
        {showCompletionModal &&
          tournament.status === "completed" &&
          statistics?.standings &&
          myStanding && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl border-2 border-emerald-500/50 p-8 w-full max-w-2xl shadow-2xl">
                {/* Celebration Header */}
                <div className="text-center mb-6">
                  <div className="text-6xl mb-4">
                    {myStanding.rank === 1
                      ? "🏆"
                      : myStanding.rank === 2
                      ? "🥈"
                      : myStanding.rank === 3
                      ? "🥉"
                      : "🎯"}
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    {myStanding.rank === 1
                      ? "Victory!"
                      : "Tournament Complete!"}
                  </h2>
                  <p className="text-slate-300">{tournament.name}</p>
                </div>

                {/* Player Stats */}
                <div className="bg-slate-800/50 rounded-lg p-6 mb-6">
                  <div className="text-center mb-4">
                    <div className="text-5xl font-bold text-emerald-400 mb-2">
                      #{myStanding.rank}
                    </div>
                    <div className="text-xl text-slate-300">
                      {myStanding.rank === 1
                        ? "1st Place"
                        : myStanding.rank === 2
                        ? "2nd Place"
                        : myStanding.rank === 3
                        ? "3rd Place"
                        : `${myStanding.rank}th Place`}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {myStanding.matchPoints}
                      </div>
                      <div className="text-sm text-slate-400">Match Points</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {myStanding.wins}-{myStanding.losses}-{myStanding.draws}
                      </div>
                      <div className="text-sm text-slate-400">Record</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white">
                        {myStanding.gameWinPercentage
                          ? `${(myStanding.gameWinPercentage * 100).toFixed(
                              0
                            )}%`
                          : "0%"}
                      </div>
                      <div className="text-sm text-slate-400">Game Win %</div>
                    </div>
                  </div>
                </div>

                {/* Top 3 Standings */}
                {statistics.standings.length > 1 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-white mb-3">
                      Final Standings
                    </h3>
                    <div className="space-y-2">
                      {statistics.standings.slice(0, 3).map((standing, idx) => {
                        const isMe = standing.playerId === session?.user?.id;
                        return (
                          <div
                            key={standing.playerId}
                            className={`flex items-center justify-between p-3 rounded-lg ${
                              isMe
                                ? "bg-emerald-900/30 border border-emerald-500/50"
                                : "bg-slate-800/30"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="text-2xl">
                                {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                              </div>
                              <div>
                                <div className="text-white font-semibold">
                                  {standing.playerName}{" "}
                                  {isMe && (
                                    <span className="text-emerald-400 text-sm">
                                      (You)
                                    </span>
                                  )}
                                </div>
                                <div className="text-sm text-slate-400">
                                  {standing.wins}-{standing.losses}-
                                  {standing.draws}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-lg font-bold text-white">
                                {standing.matchPoints} pts
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setActiveTab("standings");
                      setShowCompletionModal(false);
                    }}
                    className="flex-1 px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
                  >
                    View Full Standings
                  </button>
                  <button
                    onClick={() => setShowCompletionModal(false)}
                    className="flex-1 px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition-colors"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* Card Preview Overlay */}
        <CardPreview card={hoveredCard} />

        {/* Tournament Invite Modal */}
        <TournamentInviteModal
          tournamentId={tournamentId}
          tournamentName={tournament.name}
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          onInvitesSent={() => {
            setToast("Invitations sent successfully");
            setTimeout(() => setToast(null), 3000);
          }}
        />
      </div>
    </div>
  );
}
