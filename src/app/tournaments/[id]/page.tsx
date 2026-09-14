"use client";

import { Icon } from "@iconify/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
  useParams,
  useRouter,
  usePathname,
  useSearchParams,
} from "next/navigation";
import { useState, useEffect, useRef, useMemo } from "react";
import GuestGate from "@/components/auth/GuestGate";
import FloatingChat from "@/components/chat/FloatingChat";
import CardPreview from "@/components/game/CardPreview";
import type { Digit } from "@/components/game/manacost";
import { NumberBadge } from "@/components/game/manacost";
import TournamentBracket from "@/components/tournament/TournamentBracket";
import TournamentFlowchart from "@/components/tournament/TournamentFlowchart";
import TournamentInviteLinkButton from "@/components/tournament/TournamentInviteLinkButton";
import TournamentRoster from "@/components/tournament/TournamentRoster";
import AppShell from "@/components/ui/AppShell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";
import { RcEmpty } from "@/components/ui/rc-empty";
import { useRealtimeTournaments } from "@/contexts/RealtimeTournamentContext";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import { useViewer } from "@/lib/guest/useViewer";
import { getTournamentInviteToken } from "@/lib/tournament/invite-links";
import { prepareTournamentMatchBootstrap } from "@/lib/tournament/matchBootstrap";

const TournamentInviteModal = dynamic(
  () => import("@/components/tournament/TournamentInviteModal"),
  { ssr: false },
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
  const viewer = useViewer();
  const searchParams = useSearchParams();
  const inviteToken = getTournamentInviteToken(searchParams);
  const pathnameForReturn = usePathname();
  const currentHref = `${pathnameForReturn ?? "/"}${
    searchParams?.toString() ? `?${searchParams.toString()}` : ""
  }`;
  const tournamentId = params?.id as string;
  const {
    tournaments,
    currentTournament,
    setCurrentTournament,
    setCurrentTournamentById,
    joinTournament: rtJoinTournament,
    setInviteToken,
    startTournament: rtStartTournament,
    endTournament: rtEndTournament,
    toggleTournamentRegistrationLock,
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
  const [showDraftConfirmModal, setShowDraftConfirmModal] = useState(false);

  const [roundsView, setRoundsView] = useState<"grid" | "flowchart">("grid");
  const [joiningMatch, setJoiningMatch] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "standings" | "rounds"
  >("overview");
  // Round/match flow helpers
  const [startingRound, setStartingRound] = useState(false);
  const [endingRound, setEndingRound] = useState(false);
  const [_invalidatingMatchId, setInvalidatingMatchId] = useState<
    string | null
  >(null);
  const [lockingRegistration, setLockingRegistration] = useState(false);
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
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        "tournament:matchAssigned",
        handler as EventListener,
      );
  }, [tournamentId]);

  // Context-provided assignment (from realtime handlers)
  const { assignedMatchId: rtAssignedMatchId } = useRealtimeTournaments();

  // (Removed) fallback: we derive CTA directly in the banner using rtAssignedMatchId or myAssignedMatchId

  // Tournament completion celebration
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const prevTournamentStatusRef = useRef<string | null>(null);

  // Invite links: the token unlocks private tournaments for detail fetches and joins
  useEffect(() => {
    setInviteToken(inviteToken);
    return () => setInviteToken(null);
  }, [inviteToken, setInviteToken]);

  // Lightweight toast listener (used by deck submission + phase changes)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        { message?: string } | undefined;
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
              data as unknown as Parameters<typeof setCurrentTournament>[0],
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
          Tournament | undefined) ||
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
      (s) => s.playerId === viewer.id,
    );
    if (!standing) return null;
    const rank =
      (statistics?.standings?.findIndex((s) => s.playerId === viewer.id) ??
        -1) + 1;
    return { ...standing, rank };
  }, [statistics?.standings, viewer.id]);
  const myMatchId = useMemo(
    () =>
      myStanding?.currentMatchId ? String(myStanding.currentMatchId) : null,
    [myStanding?.currentMatchId],
  );
  // Two completion dialogs exist: a generic one (champion + top standings) and
  // a celebration one that also reports the viewer's own result. The
  // celebration needs the viewer's final standing, so it only renders once the
  // standings have loaded - and when it does, the generic one must stand down
  // or both open on top of each other.
  const showCompletionCelebration =
    tournament?.status === "completed" &&
    Boolean(statistics?.standings) &&
    Boolean(myStanding);
  // Round helpers
  const rounds = useMemo(() => statistics?.rounds || [], [statistics?.rounds]);
  const activeRound = rounds.find((r) => r.status === "active") || null;
  const pendingRound = rounds.find((r) => r.status === "pending") || null;
  const maxRoundNumber = rounds.length
    ? Math.max(
        ...rounds.map((r) =>
          typeof r.roundNumber === "number" ? r.roundNumber : 0,
        ),
      )
    : 0;
  const lastCompletedRoundNumber = useMemo(() => {
    const list = (rounds || [])
      .map((r) => r as unknown as { roundNumber?: number; status?: string })
      .filter(
        (r) => r.status === "completed" && typeof r.roundNumber === "number",
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
    const uid = viewer.id || null;
    if (!uid) return null;
    // Prefer embedded matches on the active round
    const matchesInRound =
      (
        activeRound as unknown as {
          matches?: Array<{ id: string; players?: Array<{ id: string }> }>;
        }
      )?.matches || [];
    const viaRound = matchesInRound.find(
      (m) => Array.isArray(m.players) && m.players.some((p) => p.id === uid),
    );
    if (viaRound) return String(viaRound.id);
    // Fallback to global matches filtered by round number
    const globalMatches = statistics?.matches || [];
    if (activeRoundNumber != null) {
      const viaGlobal = globalMatches.find(
        (m) =>
          m.roundNumber === activeRoundNumber &&
          Array.isArray(m.players) &&
          m.players.some((p) => p.id === uid),
      );
      if (viaGlobal) return String(viaGlobal.id);
    }
    return null;
  }, [
    myMatchId,
    viewer.id,
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
      (m) => String(m.id) === String(mid),
    );
    const players = Array.isArray(
      (match as { players?: Array<{ id: string; name?: string }> } | null)
        ?.players,
    )
      ? (((match as { players?: Array<{ id: string; name?: string }> } | null)
          ?.players as Array<{ id: string; name?: string }>) ?? [])
      : [];
    const me = viewer.id || null;
    const opp = players.find((p) => p.id !== me)?.name || null;
    setAssigned({ matchId: String(mid), opponentName: opp });
  }, [
    assigned?.matchId,
    rtAssignedMatchId,
    myAssignedMatchId,
    statistics?.matches,
    viewer.id,
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
        (m) => String(m.id) === String(mid),
      );
      const players = Array.isArray(
        (match as { players?: Array<{ id: string; name?: string }> } | null)
          ?.players,
      )
        ? (((match as { players?: Array<{ id: string; name?: string }> } | null)
            ?.players as Array<{ id: string; name?: string }>) ?? [])
        : [];
      const me = viewer.id || null;
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
    viewer.id,
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
  const [constructedRefreshKey, setConstructedRefreshKey] = useState(0);
  const [constructedModalOpen, setConstructedModalOpen] = useState(false);
  const [includePublicDecks, setIncludePublicDecks] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("sorcery:includePublicDecks");
    return stored === null ? true : stored === "1";
  });
  // Curiosa import state
  const [curiosaUrl, setCuriosaUrl] = useState("");
  const [curiosaImporting, setCuriosaImporting] = useState(false);
  const [curiosaError, setCuriosaError] = useState<string | null>(null);
  const [showCuriosaImport, setShowCuriosaImport] = useState(false);

  const tId = tournament?.id ?? null;
  const tStatus = tournament?.status ?? null;
  const tFormat = tournament?.format ?? null;
  const registeredPlayers = useMemo(
    () =>
      (
        tournament as unknown as {
          registeredPlayers?: Array<{ id: string; seatStatus?: string | null }>;
        }
      )?.registeredPlayers || [],
    [tournament],
  );
  const registrationSettings = (
    tournament?.settings as Record<string, unknown> | undefined
  )?.registration as Record<string, unknown> | undefined;
  const isOpenSeat = registrationSettings?.mode === "open";
  const isRegistrationLocked = registrationSettings?.locked === true;

  // Removed duplicate fallback effect - the one at lines 158-197 handles this

  // Helpers: safe currentPlayers count
  function getCurrentPlayersCount(t: Tournament | null): number {
    if (!t) return 0;
    const cp = (t as Partial<Tournament>).currentPlayers;
    if (typeof cp === "number") return cp;
    const rp = (t as unknown as { registeredPlayers?: Array<unknown> })
      .registeredPlayers;
    if (!Array.isArray(rp)) return 0;
    return rp.filter(
      (p) => (p as { seatStatus?: string }).seatStatus !== "vacant",
    ).length;
  }

  // Check if current user is registered (prefer explicit registrations over standings)
  const isRegistered = useMemo(() => {
    const userId = viewer.id;
    if (!tournament || !userId) return false;
    if (Array.isArray(registeredPlayers)) {
      const seat = registeredPlayers.find((p) => p.id === userId);
      if (seat) {
        return seat.seatStatus !== "vacant";
      }
    }
    // Fallback for active phase when registrations may not be present
    return Boolean(
      statistics?.standings?.some(
        (s) => s.playerId === userId && !s.isEliminated,
      ),
    );
  }, [tournament, statistics?.standings, viewer.id, registeredPlayers]);

  const isSeatVacant = useMemo(() => {
    const userId = viewer.id;
    if (!userId) return false;
    const seat = registeredPlayers.find((p) => p.id === userId);
    return seat?.seatStatus === "vacant";
  }, [registeredPlayers, viewer.id]);

  const vacantCount = useMemo(() => {
    return registeredPlayers.filter((p) => p.seatStatus === "vacant").length;
  }, [registeredPlayers]);

  const activeCount = tournament ? getCurrentPlayersCount(tournament) : 0;

  // Check if current user is the creator
  const isCreator = tournament && viewer.id === tournament.creatorId;

  // Set rounds tab as default for host when tournament is active
  const hasSetDefaultTabRef = useRef(false);
  useEffect(() => {
    if (hasSetDefaultTabRef.current) return;
    if (!tournament || !isCreator) return;
    // Set rounds tab as default for host in active tournaments
    if (tournament.status === "active" || tournament.status === "preparing") {
      setActiveTab("rounds");
      hasSetDefaultTabRef.current = true;
    }
  }, [tournament, isCreator]);

  const canJoinTournament = useMemo(() => {
    if (!tournament || isRegistered) return false;
    if (isOpenSeat) {
      if (isSeatVacant || vacantCount > 0) return true;
      if (isRegistrationLocked) return false;
      return (
        tournament.status === "registering" || tournament.status === "preparing"
      );
    }
    return (
      tournament.status === "registering" && activeCount < tournament.maxPlayers
    );
  }, [
    tournament,
    isRegistered,
    isOpenSeat,
    isSeatVacant,
    isRegistrationLocked,
    vacantCount,
    activeCount,
  ]);

  const canInvitePlayers = useMemo(() => {
    if (!tournament || !isCreator) return false;
    if (isOpenSeat) {
      if (vacantCount > 0) return true;
      if (isRegistrationLocked) return false;
      return (
        tournament.status === "registering" || tournament.status === "preparing"
      );
    }
    return (
      tournament.status === "registering" && activeCount < tournament.maxPlayers
    );
  }, [
    tournament,
    isCreator,
    isOpenSeat,
    isRegistrationLocked,
    vacantCount,
    activeCount,
  ]);

  const canStartTournament = useMemo(() => {
    if (!tournament || !isCreator || tournament.status !== "registering") {
      return false;
    }
    return isOpenSeat
      ? activeCount >= 2
      : activeCount === tournament.maxPlayers;
  }, [tournament, isCreator, isOpenSeat, activeCount]);

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
          [...deck].sort((a, b) => a.cardId.localeCompare(b.cardId)),
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
              .filter((n) => Number.isFinite(n) && n > 0),
          ),
        );
        if (!ids.length) {
          setViewerDeckCards([]);
          if (!viewerDeckLoaded) setViewerDeckLoaded(true);
          return;
        }
        const res = await fetch(
          `/api/cards/by-id?ids=${encodeURIComponent(ids.join(","))}`,
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
            },
          );
        } catch {}
        const res = await fetch(
          `/api/tournaments/${encodeURIComponent(
            tId,
          )}/preparation/constructed/decks?includePublic=${
            includePublicDecks ? "true" : "false"
          }`,
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
          e instanceof Error ? e.message : "Failed to load constructed decks",
        );
        setConstructedDecks([]);
        setConstructedPublicDecks([]);
      } finally {
        setConstructedLoading(false);
      }
    })();
  }, [
    tId,
    tStatus,
    tFormat,
    isRegistered,
    includePublicDecks,
    constructedRefreshKey,
  ]);

  const handleSubmitConstructedDeck = async (
    deckId: string,
    isPublic: boolean = false,
  ) => {
    if (!tournament) return;
    setConstructedError(null);
    setConstructedLoading(true);
    try {
      // Ensure prep is started (ignore if already)
      try {
        await fetch(
          `/api/tournaments/${encodeURIComponent(
            tournament.id,
          )}/preparation/start`,
          { method: "POST", headers: { "Content-Type": "application/json" } },
        );
      } catch {}
      let finalDeckId = deckId;
      if (isPublic) {
        // Clone and select via constructed/decks POST (handles cloning and updating preparation data)
        const selectRes = await fetch(
          `/api/tournaments/${encodeURIComponent(
            tournament.id,
          )}/preparation/constructed/decks`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deckId }),
          },
        );
        const selData = await selectRes.json();
        if (!selectRes.ok)
          throw new Error(selData?.error || "Failed to select public deck");
        finalDeckId = (selData?.selectedDeck?.id as string) || finalDeckId;
        // Optionally broadcast readiness via submit route for consistent events
        try {
          await fetch(
            `/api/tournaments/${encodeURIComponent(
              tournament.id,
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
            },
          );
        } catch {}
      } else {
        // Owned deck: submit constructed selection so server can transition when all submitted
        const submitRes = await fetch(
          `/api/tournaments/${encodeURIComponent(
            tournament.id,
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
          },
        );
        const submitData = await submitRes.json();
        if (!submitRes.ok)
          throw new Error(submitData?.error || "Failed to submit deck");
      }
      setConstructedSelectedDeckId(finalDeckId);
      try {
        localStorage.setItem(
          `constructed_submitted_tournament_${tournament.id}`,
          "true",
        );
        window.dispatchEvent(
          new CustomEvent("app:toast", {
            detail: { message: "Constructed deck submitted!" },
          }),
        );
      } catch {}
      // Ask stats to refresh
      try {
        statistics?.actions?.refreshAll?.();
      } catch {}
    } catch (e) {
      setConstructedError(
        e instanceof Error ? e.message : "Failed to submit deck",
      );
    } finally {
      setConstructedLoading(false);
    }
  };

  // Helper: start/join a specific match id (bootstrap online match with tournament context)
  const startJoinMatch = async (matchId: string) => {
    if (!tournament || joiningMatch) return;
    setJoiningMatch(true);
    setError(null);
    const result = await prepareTournamentMatchBootstrap(
      tournament.id,
      matchId,
    );
    if (!result.ok) {
      setError(result.reason);
      setJoiningMatch(false);
      return;
    }
    // Keep the joining state on while navigating so the button stays disabled
    window.location.href = `/online/play/${encodeURIComponent(matchId)}`;
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
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to start next round");
      try {
        const msg = `Round ${data?.roundNumber ?? ""} started`;
        localStorage.setItem("app:toast", msg);
        window.dispatchEvent(
          new CustomEvent("app:toast", { detail: { message: msg } }),
        );
      } catch {}
      try {
        statistics?.actions?.refreshAll?.();
      } catch {}
    } catch (err) {
      console.error("Failed to start next round:", err);
      setError(
        err instanceof Error ? err.message : "Failed to start next round",
      );
    } finally {
      setStartingRound(false);
    }
  };

  const handleToggleRegistrationLock = async (locked: boolean) => {
    if (!tournament || !isCreator) return;
    setLockingRegistration(true);
    setError(null);
    try {
      await toggleTournamentRegistrationLock?.(tournament.id, locked);
      const msg = locked ? "Registration locked" : "Registration unlocked";
      try {
        localStorage.setItem("app:toast", msg);
        window.dispatchEvent(
          new CustomEvent("app:toast", { detail: { message: msg } }),
        );
      } catch {}
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update registration",
      );
    } finally {
      setLockingRegistration(false);
    }
  };

  const handleEndRound = async (roundId: string) => {
    if (!tournament || !isCreator) return;
    const ok = window.confirm("End this round now?");
    if (!ok) return;
    setEndingRound(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(tournament.id)}/rounds/end`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roundId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to end round");
      try {
        const msg = data?.tournamentCompleted
          ? "Tournament completed"
          : `Round ${data?.roundNumber ?? ""} ended`;
        localStorage.setItem("app:toast", msg);
        window.dispatchEvent(
          new CustomEvent("app:toast", { detail: { message: msg } }),
        );
      } catch {}
      try {
        statistics?.actions?.refreshAll?.();
      } catch {}
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end round");
    } finally {
      setEndingRound(false);
    }
  };

  const handleInvalidateMatch = async (
    matchId: string,
    mode: "invalid" | "bye",
    winnerId?: string,
  ) => {
    if (!tournament || !isCreator) return;
    const confirmMessage =
      mode === "bye"
        ? "Award a bye for this match?"
        : "Mark this match as invalid?";
    if (!window.confirm(confirmMessage)) return;
    setInvalidatingMatchId(matchId);
    setError(null);
    try {
      const res = await fetch(
        `/api/tournaments/matches/${encodeURIComponent(matchId)}/invalidate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode,
            winnerId,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to invalidate match");
      try {
        const msg =
          mode === "bye" ? "Bye awarded for match" : "Match marked invalid";
        localStorage.setItem("app:toast", msg);
        window.dispatchEvent(
          new CustomEvent("app:toast", { detail: { message: msg } }),
        );
      } catch {}
      try {
        statistics?.actions?.refreshAll?.();
      } catch {}
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to invalidate match",
      );
    } finally {
      setInvalidatingMatchId(null);
    }
  };

  const handleJoinTournament = async () => {
    if (!viewer.id || !tournament) return;

    setJoining(true);
    setError(null);

    try {
      await rtJoinTournament(tournamentId, { inviteToken });
    } catch (err) {
      console.error("Failed to join tournament:", err);
      setError(
        err instanceof Error ? err.message : "Failed to join tournament",
      );
    } finally {
      setJoining(false);
    }
  };

  const handleStartTournament = async () => {
    if (!viewer.id || !tournament || !isCreator) return;

    // For draft tournaments, show roster confirmation modal first
    if (tournament.format === "draft") {
      setShowDraftConfirmModal(true);
      return;
    }

    await executeStartTournament();
  };

  const executeStartTournament = async () => {
    if (!viewer.id || !tournament || !isCreator) return;

    setStarting(true);
    setError(null);
    setShowDraftConfirmModal(false);
    try {
      await rtStartTournament(tournamentId);
      try {
        localStorage.setItem("app:toast", "Tournament started");
        window.dispatchEvent(
          new CustomEvent("app:toast", {
            detail: { message: "Tournament started" },
          }),
        );
      } catch {}
    } catch (err) {
      console.error("Failed to start tournament:", err);
      setError(
        err instanceof Error ? err.message : "Failed to start tournament",
      );
    } finally {
      setStarting(false);
    }
  };

  const handleEndTournament = async () => {
    if (!viewer.id || !tournament || !isCreator) return;

    const ok = window.confirm(
      "End this tournament now? This cannot be undone.",
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
          }),
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

  const getStatusTone = (status: Tournament["status"]): BadgeTone => {
    switch (status) {
      case "registering":
        return "ok";
      case "preparing":
        return "warn";
      case "active":
        return "info";
      case "completed":
        return "default";
      case "cancelled":
        return "default";
      default:
        return "default";
    }
  };

  const getFormatIcon = (format: Tournament["format"]) => {
    switch (format) {
      case "sealed":
        return "game-icons:cardboard-box-closed";
      case "draft":
        return "game-icons:card-pick";
      case "constructed":
        return "game-icons:crossed-swords";
      default:
        return "game-icons:laurels-trophy";
    }
  };

  if (
    viewer.status === "loading" ||
    (rtLoading && !initialLoaded && !viewer.isAnonymous)
  ) {
    return (
      <AppShell width="wide">
        <div className="rc-hint py-6 text-center">loading tournament…</div>
      </AppShell>
    );
  }

  if (viewer.isAnonymous) {
    return (
      <AppShell width="narrow">
        <GuestGate
          title="You\u2019ve been invited to a tournament"
          description="Sign in to play with your saved decks, or continue as a guest and bring a deck from sorcerytcg.com or a precon."
          returnTo={currentHref}
        />
      </AppShell>
    );
  }

  if (error || rtError) {
    return (
      <AppShell width="narrow">
        <div className="rc-alert" data-tone="danger">
          {error || rtError}
        </div>
        <div>
          <RcLinkButton href="/tournaments" variant="outline">
            Back to Tournaments
          </RcLinkButton>
        </div>
      </AppShell>
    );
  }

  // Avoid flashing "not found" before the realtime context hydrates
  if (
    !derivedTournament &&
    (!lastUpdated || fallbackLoading) &&
    !initialLoaded
  ) {
    return (
      <AppShell width="wide">
        <div className="rc-hint py-6 text-center">loading tournament…</div>
      </AppShell>
    );
  }

  if (!tournament) {
    return (
      <AppShell width="wide">
        <RcEmpty
          title="Tournament not found."
          action={
            <RcLinkButton href="/tournaments" variant="outline">
              Back to Tournaments
            </RcLinkButton>
          }
        >
          it may have been ended or removed
        </RcEmpty>
      </AppShell>
    );
  }

  return (
    <AppShell width="wide">
      {/* Floating tournament dock (Chat/Events/Players) */}
      <FloatingChat tournamentId={tournamentId} />
      {/* Toast overlay */}
      {toast && (
        <div className="rc-toast fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4 py-2 font-rc-mono text-xs tracking-[0.08em]">
          {toast}
        </div>
      )}

      {/* Completion summary, for viewers without a standing of their own */}
      {showCompletionModal &&
        !showCompletionCelebration &&
        typeof document !== "undefined" && (
        <RcDialog
          eyebrow="tournament completed"
          title={tournament.name}
          size="lg"
          onClose={() => setShowCompletionModal(false)}
          actions={
            <RcButton onClick={() => setShowCompletionModal(false)}>
              Continue
            </RcButton>
          }
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {(() => {
              const standings = (statistics?.standings || []) as Array<{
                playerId: string;
                playerName: string;
                points?: number;
                omw?: number;
              }>;
              const top = standings.slice(0, 3);
              const meId = viewer.id || "";
              const myIdx = meId
                ? standings.findIndex((s) => s.playerId === meId)
                : -1;
              const myRank = myIdx >= 0 ? myIdx + 1 : null;
              const total = standings.length || activeCount;
              const champion = standings[0]?.playerName || "Champion";
              return (
                <>
                  <div className="md:col-span-2">
                    <div className="rc-eyebrow mb-1.5">champion</div>
                    <div className="font-rc-display text-[32px] leading-none text-rc-accent-link">
                      {champion}
                    </div>
                    <div className="mt-4 font-rc-mono text-xs tracking-[0.08em] text-rc-fg-muted">
                      {myRank ? (
                        <span>
                          Your result:{" "}
                          <span className="rc-stat font-semibold text-rc-fg-strong">
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
                    <div className="rc-eyebrow mb-2">top standings</div>
                    <div className="flex flex-col gap-2">
                      {top.map((s, i) => (
                        <div
                          key={s.playerId}
                          className="flex items-center justify-between rounded-rc-md bg-black/30 px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-rc-md border border-rc-line/14 bg-rc-line/8 font-rc-mono text-xs text-rc-fg-strong">
                              {i + 1}
                            </div>
                            <div className="max-w-[12rem] truncate font-rc-display text-[17px] leading-tight text-rc-fg-strong">
                              {s.playerName}
                            </div>
                          </div>
                          <div className="rc-stat text-xs text-rc-fg-muted">
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
        </RcDialog>
      )}

      {/* Draft Roster Confirmation Modal */}
      {showDraftConfirmModal && tournament && (
        <RcDialog
          title="Confirm Draft Start"
          onClose={() => setShowDraftConfirmModal(false)}
          actions={
            <>
              <RcButton
                variant="outline"
                onClick={() => setShowDraftConfirmModal(false)}
                disabled={starting}
              >
                Cancel
              </RcButton>
              <RcButton onClick={executeStartTournament} disabled={starting}>
                {starting ? "Starting Draft..." : "Confirm & Start Draft"}
              </RcButton>
            </>
          }
        >
          <p className="m-0 text-rc-fg-muted">
            Review the player roster before starting the draft. All players will
            be notified.
          </p>
          <div className="mt-4 max-h-[50vh] overflow-y-auto">
            <TournamentRoster tournamentId={tournament.id} />
          </div>
        </RcDialog>
      )}

      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <Link
            href="/tournaments"
            className="rc-link w-fit font-rc-mono text-xs uppercase tracking-[0.16em]"
          >
            ← Back to Tournaments
          </Link>
          <PageHeader
            eyebrow={`${tournament.format} tournament`}
            title={tournament.name}
            description={
              isOpenSeat
                ? `Open seat event · ${activeCount} active player${
                    activeCount === 1 ? "" : "s"
                  }`
                : `${activeCount} of ${tournament.maxPlayers} players · ${
                    tournament.settings.totalRounds || 3
                  } rounds`
            }
            actions={
              <>
                {isCreator &&
                  tournament.status !== "completed" &&
                  tournament.status !== "cancelled" && (
                    <TournamentInviteLinkButton
                      tournamentId={tournament.id}
                      kind="tournament"
                      inviteToken={
                        (tournament as { inviteToken?: string | null })
                          .inviteToken ?? null
                      }
                    />
                  )}
                {/* Invite Players button (creator only, during registration while capacity remains) */}
                {canInvitePlayers && (
                  <RcButton
                    variant="outline"
                    onClick={() => setShowInviteModal(true)}
                  >
                    Invite Players
                  </RcButton>
                )}

                {canJoinTournament && (
                  <RcButton onClick={handleJoinTournament} disabled={joining}>
                    {joining
                      ? "Joining..."
                      : isSeatVacant
                        ? "Rejoin Tournament"
                        : "Join Tournament"}
                  </RcButton>
                )}

                {/* End/Forfeit controls moved to bottom of page */}
              </>
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <Icon
              icon={getFormatIcon(tournament.format)}
              className="shrink-0 text-rc-fg-muted"
              width={22}
              height={22}
              aria-hidden="true"
            />
            <Badge tone={getStatusTone(tournament.status)}>
              {tournament.status}
            </Badge>
            {activeRoundNumber != null && (
              <Badge tone="info">Round {activeRoundNumber}</Badge>
            )}
            {isOpenSeat && (
              <Badge tone={isRegistrationLocked ? "warn" : "default"}>
                {isRegistrationLocked ? "registration locked" : "open seat"}
              </Badge>
            )}
          </div>
        </div>

        {/* Instant Join CTA when match is assigned */}
        {(() => {
          const matchId = assigned?.matchId || myAssignedMatchId || null;
          const opponentName = assigned?.opponentName || null;
          if (!matchId || tournament.status !== "active") return null;
          return (
            <div className="rc-panel flex flex-col gap-3 border-rc-success/45 px-[18px] py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="rc-eyebrow mb-1 text-rc-success">
                  match ready
                </div>
                <div className="font-rc-display text-[22px] leading-none text-rc-fg-strong">
                  Your match is ready
                </div>
                <div className="mt-1.5 font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-fg-subtle">
                  {opponentName
                    ? `vs ${opponentName}`
                    : `Round ${activeRoundNumber ?? ""} · match assigned`}
                </div>
              </div>
              <RcButton
                size="lg"
                onClick={() => startJoinMatch(matchId)}
                disabled={joiningMatch}
              >
                {joiningMatch ? "Joining…" : "Join Match"}
              </RcButton>
            </div>
          );
        })()}

        {isCreator &&
          isOpenSeat &&
          (tournament.status === "registering" ||
            tournament.status === "preparing") && (
            <div className="rc-panel flex flex-wrap items-center justify-between gap-3 px-[18px] py-3.5">
              <div className="text-sm text-rc-fg">
                Registration is{" "}
                <span className="font-semibold text-rc-fg-strong">
                  {isRegistrationLocked ? "locked" : "open"}
                </span>
                .{" "}
                {isRegistrationLocked
                  ? "Unlock to allow more players to join."
                  : "Lock seats to stop new joins and prepare Round 1."}
              </div>
              <RcButton
                variant="outline"
                onClick={() =>
                  handleToggleRegistrationLock(!isRegistrationLocked)
                }
                disabled={lockingRegistration}
              >
                {lockingRegistration
                  ? "Updating…"
                  : isRegistrationLocked
                    ? "Unlock Seats"
                    : "Lock Seats"}
              </RcButton>
            </div>
          )}

        {/* Creator Controls: Start next round banner at top */}
        {tournament.status === "active" &&
          isCreator &&
          !activeRound &&
          (pendingRound ||
            maxRoundNumber < (tournament.settings.totalRounds || 3)) && (
            <div className="rc-panel flex flex-wrap items-center justify-between gap-3 px-[18px] py-3.5">
              <div className="text-sm text-rc-fg">
                {pendingRound ? (
                  <span>
                    Round {pendingRound.roundNumber} is ready. Start when
                    you&apos;re ready.
                  </span>
                ) : rounds.length > 0 ? (
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
              <RcButton onClick={handleStartNextRound} disabled={startingRound}>
                {startingRound
                  ? "Starting…"
                  : `Start Round ${
                      pendingRound?.roundNumber ??
                      Math.max(1, maxRoundNumber + 1)
                    }`}
              </RcButton>
            </div>
          )}
        {/* Prominent Submitted Deck (collapsed by default) */}
        {isRegistered &&
          (() => {
            // Determine if the player has a submitted deck (server + optimistic flags)
            const meId = viewer.id;
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
              (mine as { deckSubmitted?: boolean })?.deckSubmitted,
            );
            let optimistic = false;
            try {
              optimistic =
                localStorage.getItem(
                  `sealed_submitted_tournament_${tournament.id}`,
                ) === "true" ||
                localStorage.getItem(
                  `draft_submitted_tournament_${tournament.id}`,
                ) === "true";
            } catch {}
            const hasDeck = viewerDeckCards.length > 0;
            const submittedDeck = serverSubmitted || optimistic || hasDeck;
            if (!submittedDeck) return null;

            const totalCards = viewerDeckCards.reduce(
              (sum, c) => sum + (Number(c.quantity) || 0),
              0,
            );

            return (
              <section className="rc-panel">
                <PanelHeader
                  title="Your Submitted Deck"
                  meta={
                    viewerDeckCards.length > 0
                      ? `${totalCards} cards`
                      : "deck submitted · syncing list…"
                  }
                >
                  <RcButton
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeckDetails((v) => !v)}
                  >
                    {showDeckDetails ? "Hide" : "Show"}
                  </RcButton>
                </PanelHeader>
                {showDeckDetails && (
                  <div className="px-[18px] py-3.5">
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
                              c.thresholds as Record<string, number>,
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
                              className="cursor-pointer rounded-rc-md border border-rc-line/14 bg-black/35 p-2 text-rc-fg transition-colors hover:border-rc-accent/35 hover:bg-rc-accent/6"
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
                                    } overflow-hidden rounded-rc-md border border-rc-line/14 bg-black/40`}
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
                                        className="truncate font-rc-display text-[17px] leading-tight text-rc-fg-strong"
                                        title={c.name}
                                      >
                                        {c.name}
                                      </div>
                                      <div className="mt-0.5 font-rc-mono text-[11px] tracking-[0.08em] text-rc-fg-subtle">
                                        {c.setName}
                                      </div>
                                    </div>
                                    <div className="rc-stat text-right text-sm font-semibold">
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
                                        ) : null,
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
                                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rc-accent font-rc-mono text-[10px] font-bold text-rc-accent-fg">
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
                      <div className="rc-hint py-6 text-center">
                        loading deck list…
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })()}

        {/* Phase Actions */}
        {tournament.status === "preparing" && (
          <div className="rc-panel flex flex-col gap-3 px-[18px] py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-rc-fg">
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
                    const meId = viewer.id;
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
                          `draft_submitted_tournament_${tournament.id}`,
                        ) === "true";
                    } catch {}
                    const submitted =
                      Boolean(
                        (mine as { deckSubmitted?: boolean })?.deckSubmitted,
                      ) ||
                      optimisticSubmitted ||
                      viewerDeckCards.length > 0;
                    if (submitted) {
                      return (
                        <div className="flex items-center gap-3">
                          <span
                            className="font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-success"
                            title="Deck submitted"
                          >
                            Draft deck submitted
                          </span>
                        </div>
                      );
                    }
                    // Check if draft session is ready before allowing navigation
                    const draftSessionId = (
                      tournament as unknown as { draftSessionId?: string }
                    ).draftSessionId;
                    const isDraftReady = Boolean(draftSessionId);
                    return (
                      <RcButton
                        onClick={async () => {
                          if (!isDraftReady) {
                            // Wait a moment and retry - draft engine might still be initializing
                            await new Promise((resolve) =>
                              setTimeout(resolve, 1000),
                            );
                          }
                          try {
                            window.location.href = `/tournaments/${tournament.id}/draft`;
                          } catch {}
                        }}
                        disabled={!isDraftReady}
                        variant={isDraftReady ? "default" : "secondary"}
                        className={isDraftReady ? "" : "cursor-wait"}
                      >
                        {isDraftReady ? "Enter Draft" : "Preparing Draft..."}
                      </RcButton>
                    );
                  })()}
                {tournament.format === "sealed" &&
                  (() => {
                    const meId = viewer.id;
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
                          `sealed_submitted_tournament_${tournament.id}`,
                        ) === "true";
                    } catch {}
                    const submitted =
                      Boolean(
                        (mine as { deckSubmitted?: boolean })?.deckSubmitted,
                      ) ||
                      optimisticSubmitted ||
                      viewerDeckCards.length > 0;
                    if (submitted) {
                      return (
                        <div className="flex items-center gap-3">
                          <span
                            className="font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-success"
                            title="Deck submitted"
                          >
                            Sealed deck submitted
                          </span>
                        </div>
                      );
                    }
                    return (
                      <RcButton
                        onClick={async () => {
                          try {
                            const res = await fetch(
                              `/api/tournaments/${encodeURIComponent(
                                tournament.id,
                              )}/preparation/start`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                              },
                            );
                            const data = await res.json();
                            if (!res.ok)
                              throw new Error(
                                data?.error || "Failed to start preparation",
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
                                  JSON.stringify(storePacks),
                                );
                                // Store cube name for display if available
                                if (sealedData?.cubeName) {
                                  localStorage.setItem(
                                    `sealedCubeName_tournament_${tournament.id}`,
                                    sealedData.cubeName,
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
                                    }),
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
                                      freeAvatars?: boolean;
                                    };
                                  };
                                }
                              ).settings?.sealedConfig || {};
                            const packCount =
                              Object.values(
                                cfg.packCounts || { Beta: 6 },
                              ).reduce((a, b) => a + (b || 0), 0) || 6;
                            const setMix = Object.entries(
                              cfg.packCounts || { Beta: 6 },
                            )
                              .filter(([, c]) => (c || 0) > 0)
                              .map(([s]) => s);
                            const timeLimit = cfg.timeLimit ?? 40;
                            const replaceAvatars = cfg.replaceAvatars ?? false;
                            const freeAvatars = cfg.freeAvatars ?? false;
                            const params = new URLSearchParams({
                              sealed: "true",
                              tournament: tournament.id,
                              packCount: String(packCount),
                              setMix: setMix.join(","),
                              timeLimit: String(timeLimit),
                              constructionStartTime: String(Date.now()),
                              replaceAvatars: String(replaceAvatars),
                              freeAvatars: String(freeAvatars),
                              matchName: tournament.name,
                            });
                            window.location.href = `/decks/editor-3d?${params.toString()}`;
                          } catch {}
                        }}
                      >
                        Build Deck
                      </RcButton>
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
            <section ref={constructedPanelRef} className="rc-panel">
              <PanelHeader
                title="Select Your Constructed Deck"
                meta="used for every match in this tournament"
              >
                {constructedSelectedDeckId ? (
                  <span
                    className="font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-success"
                    title="Deck submitted"
                  >
                    Deck submitted
                  </span>
                ) : null}
              </PanelHeader>
              <div className="px-[18px] py-3.5">
                {constructedError && (
                  <div className="rc-alert mb-3" data-tone="danger">
                    {constructedError}
                  </div>
                )}
                <div className="rc-hint mb-2">
                  Allowed formats:{" "}
                  {constructedAllowedFormats.length
                    ? constructedAllowedFormats.join(", ")
                    : "standard"}
                </div>
                <label className="rc-check mb-3">
                  <input
                    type="checkbox"
                    checked={includePublicDecks}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIncludePublicDecks(next);
                      try {
                        localStorage.setItem(
                          "sorcery:includePublicDecks",
                          next ? "1" : "0",
                        );
                      } catch {}
                    }}
                  />
                  Include public decks
                </label>
                {/* Curiosa Import Section */}
                <div className="mb-3">
                  <RcButton
                    variant="link"
                    size="sm"
                    className="px-0"
                    onClick={() => setShowCuriosaImport((prev) => !prev)}
                  >
                    {showCuriosaImport ? "Hide" : "Import from Sorcerytcg link"}
                  </RcButton>
                  {showCuriosaImport && (
                    <div className="mt-2 rounded-rc-md border border-rc-line/14 bg-black/30 p-3">
                      <div className="rc-hint mb-2">
                        Paste a public Sorcerytcg deck URL to import it
                        directly.
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={curiosaUrl}
                          onChange={(e) => setCuriosaUrl(e.target.value)}
                          placeholder="https://sorcerytcg.com/decks/..."
                          className="rc-input h-9 min-w-0 flex-1"
                          disabled={curiosaImporting}
                        />
                        <RcButton
                          variant="outline"
                          size="sm"
                          disabled={curiosaImporting || !curiosaUrl.trim()}
                          onClick={async () => {
                            if (!curiosaUrl.trim()) return;
                            setCuriosaImporting(true);
                            setCuriosaError(null);
                            try {
                              const res = await fetch(
                                "/api/decks/import/curiosa",
                                {
                                  method: "POST",
                                  headers: {
                                    "content-type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    url: curiosaUrl.trim(),
                                  }),
                                },
                              );
                              const data = await res.json().catch(() => ({}));
                              if (!res.ok) {
                                throw new Error(
                                  (data && data.error) || "Import failed",
                                );
                              }
                              // Success - clear input and refresh deck list
                              setCuriosaUrl("");
                              setShowCuriosaImport(false);
                              // Refresh constructed decks
                              try {
                                const refreshRes = await fetch(
                                  `/api/tournaments/${encodeURIComponent(
                                    tournament?.id || "",
                                  )}/preparation/constructed/decks?includePublic=${
                                    includePublicDecks ? "true" : "false"
                                  }`,
                                );
                                const refreshData = await refreshRes.json();
                                if (refreshRes.ok) {
                                  const decks = Array.isArray(
                                    refreshData?.myDecks,
                                  )
                                    ? refreshData.myDecks
                                    : [];
                                  const pubDecks = Array.isArray(
                                    refreshData?.publicDecks,
                                  )
                                    ? refreshData.publicDecks
                                    : [];
                                  setConstructedDecks(decks);
                                  setConstructedPublicDecks(pubDecks);
                                }
                              } catch {}
                              window.dispatchEvent(
                                new CustomEvent("app:toast", {
                                  detail: {
                                    message: "Deck imported successfully!",
                                  },
                                }),
                              );
                            } catch (e) {
                              setCuriosaError(
                                e instanceof Error
                                  ? e.message
                                  : "Import failed",
                              );
                            } finally {
                              setCuriosaImporting(false);
                            }
                          }}
                        >
                          {curiosaImporting && (
                            <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                          )}
                          {curiosaImporting ? "Importing..." : "Import"}
                        </RcButton>
                      </div>
                      {curiosaError && (
                        <div className="rc-alert mt-2" data-tone="danger">
                          {curiosaError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Link
                    href="/decks"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rc-link font-rc-mono text-xs tracking-[0.08em]"
                  >
                    Manage Decks
                  </Link>
                  <RcButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setConstructedRefreshKey((k) => k + 1)}
                    disabled={constructedLoading}
                  >
                    {constructedLoading ? "Refreshing…" : "Refresh"}
                  </RcButton>
                </div>
                {constructedLoading ? (
                  <div className="rc-hint py-6 text-center">
                    loading your decks…
                  </div>
                ) : constructedDecks.length || constructedPublicDecks.length ? (
                  <div className="flex flex-col gap-4">
                    {constructedDecks.length > 0 && (
                      <div>
                        <div className="rc-eyebrow mb-1">My Decks</div>
                        <div className="flex flex-col gap-2">
                          {constructedDecks.map((d) => (
                            <div
                              key={`my-${d.id}`}
                              className={`flex items-center justify-between gap-3 rounded-rc-md px-3 py-2 ${
                                constructedSelectedDeckId === d.id
                                  ? "bg-rc-accent/6 shadow-[inset_2px_0_0_#d4a94a]"
                                  : "bg-black/30"
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                                  {d.name}
                                </div>
                                <div className="rc-hint mt-0.5">
                                  {d.format || "constructed"}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {constructedSelectedDeckId === d.id ? (
                                  <span className="font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-success">
                                    Selected
                                  </span>
                                ) : (
                                  <RcButton
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleSubmitConstructedDeck(d.id, false)
                                    }
                                    disabled={constructedLoading}
                                  >
                                    Select
                                  </RcButton>
                                )}
                                <Link
                                  href={`/decks/editor-3d?id=${encodeURIComponent(
                                    d.id,
                                  )}&tournament=${encodeURIComponent(
                                    tournament.id,
                                  )}`}
                                  className="rc-link font-rc-mono text-xs tracking-[0.08em]"
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
                          <div className="rc-eyebrow mb-1">Public Decks</div>
                          <div className="flex flex-col gap-2">
                            {constructedPublicDecks.map((d) => (
                              <div
                                key={`pub-${d.id}`}
                                className={`flex items-center justify-between gap-3 rounded-rc-md px-3 py-2 ${
                                  constructedSelectedDeckId === d.id
                                    ? "bg-rc-accent/6 shadow-[inset_2px_0_0_#d4a94a]"
                                    : "bg-black/30"
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                                    {d.name}
                                  </div>
                                  <div className="rc-hint mt-0.5">
                                    {d.format || "constructed"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {constructedSelectedDeckId === d.id ? (
                                    <span className="font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-success">
                                      Selected
                                    </span>
                                  ) : (
                                    <RcButton
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        handleSubmitConstructedDeck(d.id, true)
                                      }
                                      disabled={constructedLoading}
                                    >
                                      Select
                                    </RcButton>
                                  )}
                                  <Link
                                    href={`/decks/editor-3d?id=${encodeURIComponent(
                                      d.id,
                                    )}&tournament=${encodeURIComponent(
                                      tournament.id,
                                    )}`}
                                    className="rc-link font-rc-mono text-xs tracking-[0.08em]"
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
                  <RcEmpty
                    title="No valid decks found."
                    action={
                      <RcLinkButton href="/decks" variant="outline" size="sm">
                        Edit your decks
                      </RcLinkButton>
                    }
                  >
                    <div>Constructed decks must have:</div>
                    <ul className="mt-1.5 list-inside list-disc text-rc-fg-subtle">
                      <li>Exactly 1 Avatar</li>
                      <li>At least 60 cards in Spellbook</li>
                      <li>At least 30 sites in Atlas</li>
                      <li>0-10 cards in Collection</li>
                      <li>Dragonlord decks require a champion</li>
                    </ul>
                  </RcEmpty>
                )}
              </div>
            </section>
          )}

        {tournament.status === "active" &&
          isRegistered &&
          (() => {
            const mid = myAssignedMatchId ?? myMatchId;
            if (!mid) return null;
            // Check if this match is completed
            const globalMatches = statistics?.matches || [];
            const myMatch = globalMatches.find(
              (m) => String(m.id) === String(mid),
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
                  <div className="rc-alert" data-tone="info">
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
          <section className="rc-panel">
            <PanelHeader title={`Round ${activeRound.roundNumber} Matches`} />
            <div className="px-[18px] py-3.5">
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
                    (activeRound as { roundNumber?: number }).roundNumber,
                );
                const list = embedded.length > 0 ? embedded : fallback;
                if (!Array.isArray(list) || list.length === 0) {
                  return (
                    <RcEmpty title="No matches in this round.">
                      pairings appear once the round starts
                    </RcEmpty>
                  );
                }
                return (
                  <div className="flex flex-col gap-2">
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
                            : false) || players.some((p) => p.id === viewer.id);
                        const isCompleted =
                          m.status === "completed" || m.completedAt;
                        return (
                          <div
                            key={m.id}
                            className={`flex items-center justify-between gap-3 rounded-rc-md px-3 py-2 ${
                              isMine
                                ? "bg-rc-accent/6 shadow-[inset_2px_0_0_#d4a94a]"
                                : "bg-black/30"
                            }`}
                          >
                            <div className="min-w-0 text-sm text-rc-fg">
                              {names || m.id}
                              {isMine && !isCompleted && (
                                <span className="ml-2 font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-success">
                                  your match
                                </span>
                              )}
                              {isCompleted && (
                                <span className="ml-2 font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-fg-dim">
                                  completed
                                </span>
                              )}
                            </div>
                            {isMine && !isCompleted && (
                              <RcButton
                                variant="outline"
                                size="sm"
                                onClick={() => startJoinMatch(String(m.id))}
                              >
                                Join
                              </RcButton>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* Error Display */}
        {error && (
          <div className="rc-alert" data-tone="danger">
            {error}
          </div>
        )}

        {/* Draft Pod Size Configuration for large tournaments */}
        {canStartTournament &&
          tournament.format === "draft" &&
          activeCount > 8 && (
            <section className="rc-panel">
              <PanelHeader
                title="Draft Pod Configuration"
                meta={`${activeCount} players split into pods`}
              />
              <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-3.5">
                <div className="flex items-center gap-3">
                  <label htmlFor="draft-pod-size" className="rc-field-label">
                    Pod size
                  </label>
                  <select
                    id="draft-pod-size"
                    className="rc-select h-9"
                    defaultValue={
                      ((
                        (tournament.settings as Record<string, unknown>)
                          ?.draftConfig as Record<string, unknown>
                      )?.podSize as number) || 8
                    }
                    onChange={async (e) => {
                      const newPodSize = parseInt(e.target.value);
                      try {
                        await fetch(`/api/tournaments/${tournament.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            settings: {
                              ...tournament.settings,
                              draftConfig: {
                                ...((
                                  tournament.settings as Record<string, unknown>
                                )?.draftConfig || {}),
                                podSize: newPodSize,
                              },
                            },
                          }),
                        });
                      } catch (err) {
                        console.error("Failed to update pod size:", err);
                      }
                    }}
                  >
                    <option value="4">4 players</option>
                    <option value="5">5 players</option>
                    <option value="6">6 players</option>
                    <option value="7">7 players</option>
                    <option value="8">8 players</option>
                  </select>
                </div>
                <div className="rc-hint">
                  Pods: ~
                  {Math.ceil(
                    activeCount /
                      (((
                        (tournament.settings as Record<string, unknown>)
                          ?.draftConfig as Record<string, unknown>
                      )?.podSize as number) || 8),
                  )}{" "}
                  (
                  {((
                    (tournament.settings as Record<string, unknown>)
                      ?.draftConfig as Record<string, unknown>
                  )?.podSize as number) || 8}{" "}
                  players each)
                </div>
              </div>
            </section>
          )}

        {/* Spectacular Start Tournament Button */}
        {canStartTournament && (
          <div className="flex flex-col items-center gap-2">
            <RcButton
              size="lg"
              className="w-full"
              onClick={handleStartTournament}
              disabled={starting}
            >
              {starting ? "Starting Tournament..." : "Start Tournament"}
            </RcButton>
            <div className="rc-hint text-center">
              {isOpenSeat
                ? `Open seat ready (${activeCount} active)`
                : `All players joined (${activeCount}/${tournament.maxPlayers}) · click to begin`}
            </div>
          </div>
        )}

        {/* Tournament Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="rc-panel px-[18px] py-3.5">
            <div className="rc-eyebrow">players</div>
            <div className="rc-stat mt-1.5 text-2xl font-semibold">
              {activeCount}
              {isOpenSeat ? (
                <span className="ml-2 font-rc-mono text-xs uppercase tracking-[0.16em] text-rc-fg-subtle">
                  active
                </span>
              ) : (
                `/${tournament.maxPlayers}`
              )}
            </div>
            {isOpenSeat ? (
              <div className="rc-hint mt-2">
                {vacantCount} vacant seat{vacantCount === 1 ? "" : "s"} ·{" "}
                {isRegistrationLocked ? "locked" : "open"}
              </div>
            ) : (
              <div className="rc-progress mt-2">
                <span
                  style={{
                    width: `${Math.min(
                      (activeCount / tournament.maxPlayers) * 100,
                      100,
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>

          <div className="rc-panel px-[18px] py-3.5">
            <div className="rc-eyebrow">rounds</div>
            <div className="rc-stat mt-1.5 text-2xl font-semibold">
              {statistics?.rounds?.filter((r) => r.status === "completed")
                .length ?? 0}
              /{tournament.settings.totalRounds || 3}
            </div>
          </div>

          <div className="rc-panel px-[18px] py-3.5">
            <div className="rc-eyebrow">matches</div>
            <div className="rc-stat mt-1.5 text-2xl font-semibold">
              {statistics?.overview.completedMatches || 0}/
              {statistics?.overview.totalMatches || 0}
            </div>
          </div>

          <div className="rc-panel px-[18px] py-3.5">
            <div className="rc-eyebrow">created</div>
            <div className="rc-stat mt-1.5 text-lg font-semibold">
              {new Date(tournament.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Prominent Players roster for hosts/moderation (below stats) */}
        <div>
          <TournamentRoster tournamentId={tournamentId} />
        </div>
        {/* Tabs */}
        <nav className="rc-tabs">
          {(["overview", "standings", "rounds"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              data-active={activeTab === tab ? "true" : undefined}
              className="rc-tab"
            >
              {tab}
            </button>
          ))}
        </nav>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <div className="flex flex-col gap-6">
            <section className="rc-panel">
              <PanelHeader title="Tournament Information" />
              <dl className="grid grid-cols-1 gap-4 px-[18px] py-3.5 font-rc-mono text-[13px] md:grid-cols-2">
                <div>
                  <dt className="rc-hint">Format</dt>
                  <dd className="m-0 capitalize text-rc-fg-strong">
                    {tournament.format}
                  </dd>
                </div>
                <div>
                  <dt className="rc-hint">Registration</dt>
                  <dd className="m-0 text-rc-fg-strong">
                    {isOpenSeat
                      ? `Open seat (${
                          isRegistrationLocked ? "locked" : "open"
                        })`
                      : "Fixed"}
                  </dd>
                </div>
                <div>
                  <dt className="rc-hint">
                    {isOpenSeat ? "Seat Target" : "Max Players"}
                  </dt>
                  <dd className="rc-stat m-0">{tournament.maxPlayers}</dd>
                </div>
                <div>
                  <dt className="rc-hint">Total Rounds</dt>
                  <dd className="rc-stat m-0">
                    {tournament.settings.totalRounds || 3}
                  </dd>
                </div>
                <div>
                  <dt className="rc-hint">Round Duration</dt>
                  <dd className="rc-stat m-0">
                    {tournament.settings.roundDuration || 60} minutes
                  </dd>
                </div>
                {tournament.startedAt && (
                  <div>
                    <dt className="rc-hint">Started</dt>
                    <dd className="rc-stat m-0">
                      {new Date(tournament.startedAt).toLocaleString()}
                    </dd>
                  </div>
                )}
                {tournament.completedAt && (
                  <div>
                    <dt className="rc-hint">Completed</dt>
                    <dd className="rc-stat m-0">
                      {new Date(tournament.completedAt).toLocaleString()}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Completed Tournament Summary */}
            {tournament.status === "completed" && (
              <section className="rc-panel">
                <PanelHeader title="Tournament Completed" />
                <div className="px-[18px] py-3.5">
                  {statistics &&
                  statistics.standings &&
                  statistics.standings.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {/* Winner */}
                      <div className="flex items-center justify-between gap-3 rounded-rc-md bg-rc-accent/6 px-4 py-3 shadow-[inset_2px_0_0_#d4a94a]">
                        <div className="rc-eyebrow">winner</div>
                        <div className="text-right">
                          <div className="font-rc-display text-[22px] leading-none text-rc-fg-strong">
                            {statistics.standings[0]?.playerName}
                          </div>
                          <div className="rc-stat mt-1 text-xs text-rc-fg-muted">
                            {statistics.standings[0]?.matchPoints} pts ·{" "}
                            {statistics.standings[0]?.wins}-
                            {statistics.standings[0]?.losses}-
                            {statistics.standings[0]?.draws}
                          </div>
                        </div>
                      </div>
                      {/* Placements (Top 3) */}
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {statistics.standings.slice(0, 3).map((s, idx) => (
                          <div
                            key={s.playerId}
                            className="rounded-rc-md border border-rc-line/14 bg-black/30 px-4 py-3"
                          >
                            <div className="rc-eyebrow">#{idx + 1}</div>
                            <div className="mt-1 font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                              {s.playerName}
                            </div>
                            <div className="rc-stat mt-1 text-xs text-rc-fg-muted">
                              {s.matchPoints} pts · {s.wins}-{s.losses}-
                              {s.draws}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Key statistics */}
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-rc-md border border-rc-line/14 bg-black/30 px-4 py-3">
                          <div className="rc-eyebrow">players</div>
                          <div className="rc-stat mt-1 text-lg font-semibold">
                            {statistics.overview.totalPlayers}
                          </div>
                        </div>
                        <div className="rounded-rc-md border border-rc-line/14 bg-black/30 px-4 py-3">
                          <div className="rc-eyebrow">rounds</div>
                          <div className="rc-stat mt-1 text-lg font-semibold">
                            {statistics.overview.totalRounds}
                          </div>
                        </div>
                        <div className="rounded-rc-md border border-rc-line/14 bg-black/30 px-4 py-3">
                          <div className="rc-eyebrow">matches</div>
                          <div className="rc-stat mt-1 text-lg font-semibold">
                            {statistics.overview.completedMatches}/
                            {statistics.overview.totalMatches}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rc-hint py-6 text-center">
                      final standings will appear here
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Active Tournament Standings Preview */}
            {(tournament.status === "active" ||
              tournament.status === "preparing") &&
              statistics &&
              statistics.standings &&
              statistics.standings.length > 0 && (
                <section className="rc-panel">
                  <PanelHeader title="Current Standings" meta="top 5">
                    <RcButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTab("standings")}
                    >
                      View Full Standings →
                    </RcButton>
                  </PanelHeader>
                  <div className="overflow-x-auto">
                    <table className="rc-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Player</th>
                          <th className="text-center">Record</th>
                          <th className="text-center">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statistics.standings
                          .slice(0, 5)
                          .map((standing, index) => {
                            const isMe = standing.playerId === viewer.id;
                            return (
                              <tr
                                key={standing.playerId}
                                className={
                                  isMe
                                    ? "bg-rc-accent/6 shadow-[inset_2px_0_0_#d4a94a]"
                                    : undefined
                                }
                              >
                                <td className="font-semibold text-rc-fg-strong">
                                  #{index + 1}
                                </td>
                                <td>
                                  <span className="font-rc-display text-[17px] text-rc-fg-strong">
                                    {standing.playerName}
                                  </span>{" "}
                                  {isMe && (
                                    <span className="text-[11px] uppercase tracking-[0.16em] text-rc-success">
                                      you
                                    </span>
                                  )}
                                </td>
                                <td className="text-center">
                                  {standing.wins}-{standing.losses}-
                                  {standing.draws}
                                </td>
                                <td className="text-center font-semibold text-rc-fg-strong">
                                  {standing.matchPoints}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

            {tournament.status === "registering" && (
              <section className="rc-panel">
                <PanelHeader title="Registration Open" />
                <div className="px-[18px] py-3.5 text-sm text-rc-fg">
                  <p className="m-0">
                    {isOpenSeat
                      ? `Open seat tournament (${activeCount} active${
                          vacantCount > 0 ? `, ${vacantCount} vacant` : ""
                        }). ${
                          isRegistrationLocked
                            ? "Registration locked (replacements only)."
                            : "Registration open."
                        }`
                      : `Tournament is accepting new players. ${Math.max(
                          0,
                          tournament.maxPlayers - activeCount,
                        )} spots remaining.`}
                  </p>
                  {isCreator && (
                    <p className="mt-2">
                      <strong className="text-rc-fg-strong">Creator:</strong>{" "}
                      {isOpenSeat
                        ? "You can start the tournament once at least 2 players have joined."
                        : "You can start the tournament once all players have joined."}
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === "standings" && (
          <section className="rc-panel">
            <PanelHeader
              title="Player Standings"
              meta={`${statistics?.standings?.length ?? 0} players`}
            />
            {statistics &&
            statistics.standings &&
            statistics.standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="rc-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Player</th>
                      <th className="text-center">Wins</th>
                      <th className="text-center">Losses</th>
                      <th className="text-center">Draws</th>
                      <th className="text-center">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statistics?.standings?.map((standing, index) => (
                      <tr
                        key={standing.playerId}
                        className={
                          standing.playerId === viewer.id
                            ? "bg-rc-accent/6 shadow-[inset_2px_0_0_#d4a94a]"
                            : undefined
                        }
                      >
                        <td className="font-semibold text-rc-fg-strong">
                          #{index + 1}
                        </td>
                        <td>
                          <span
                            className={
                              standing.playerId === viewer.id
                                ? "font-rc-display text-[17px] text-rc-accent-link"
                                : "font-rc-display text-[17px] text-rc-fg-strong"
                            }
                          >
                            {standing.playerName}
                          </span>
                        </td>
                        <td className="text-center text-rc-success">
                          {standing.wins}
                        </td>
                        <td className="text-center text-rc-danger">
                          {standing.losses}
                        </td>
                        <td className="text-center text-rc-warning">
                          {standing.draws}
                        </td>
                        <td className="text-center font-semibold text-rc-fg-strong">
                          {standing.matchPoints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-[18px] py-3.5">
                <RcEmpty title="No standings available yet.">
                  they appear after the first round
                </RcEmpty>
              </div>
            )}
          </section>
        )}

        {activeTab === "rounds" && (
          <div className="flex flex-col gap-6">
            {/* Round Controls for Creator */}
            {isCreator &&
              statistics?.rounds &&
              statistics.rounds.length > 0 && (
                <section className="rc-panel">
                  <PanelHeader title="Round Management">
                    {statistics.rounds.some((r) => r.status === "pending") && (
                      <RcButton
                        variant="outline"
                        size="sm"
                        onClick={handleStartNextRound}
                        disabled={startingRound}
                      >
                        {startingRound ? "Starting…" : "Start Next Round"}
                      </RcButton>
                    )}
                    {statistics.rounds.some(
                      (r) => r.status === "active" && r.readyToEnd,
                    ) && (
                      <RcButton
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const activeRound = statistics.rounds.find(
                            (r) => r.status === "active" && r.readyToEnd,
                          );
                          if (activeRound) handleEndRound(activeRound.id);
                        }}
                        disabled={endingRound}
                      >
                        {endingRound ? "Ending…" : "End Current Round"}
                      </RcButton>
                    )}
                  </PanelHeader>
                </section>
              )}

            {/* Bracket / Flowchart View */}
            {statistics && statistics.rounds && statistics.rounds.length > 0 ? (
              (() => {
                const bracketRounds = statistics.rounds.map((round) => ({
                  ...round,
                  status: round.status as "pending" | "active" | "completed",
                  matches: (round.matches || []).map((match) => ({
                    ...match,
                    status: match.status as
                      "pending" | "active" | "completed" | "cancelled",
                    players: Array.isArray(match.players) ? match.players : [],
                  })),
                }));
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-end">
                      <div className="rc-segment">
                        {(
                          [
                            ["grid", "Grid"],
                            ["flowchart", "Flowchart"],
                          ] as const
                        ).map(([view, label]) => (
                          <button
                            key={view}
                            type="button"
                            aria-pressed={roundsView === view}
                            onClick={() => setRoundsView(view)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {roundsView === "flowchart" ? (
                      <TournamentFlowchart
                        rounds={bracketRounds}
                        currentUserId={viewer.id}
                      />
                    ) : (
                      <TournamentBracket
                        rounds={bracketRounds}
                        currentUserId={viewer.id}
                        isCreator={isCreator ?? false}
                        onInvalidateMatch={handleInvalidateMatch}
                      />
                    )}
                  </div>
                );
              })()
            ) : (
              <RcEmpty title="No rounds started yet.">
                the host starts round 1 when everyone is ready
              </RcEmpty>
            )}

            {/* Round Details */}
            {statistics?.rounds?.map((round) => (
              <section key={round.id} className="rc-panel">
                <PanelHeader title={`Round ${round.roundNumber} Details`}>
                  {round.readyToEnd && round.status === "active" && (
                    <Badge tone="ok">Ready to end</Badge>
                  )}
                </PanelHeader>
                <div className="flex flex-col gap-1 px-[18px] py-3.5 font-rc-mono text-[11px] tracking-[0.08em] text-rc-fg-subtle">
                  {round.startedAt && (
                    <div>
                      Started: {new Date(round.startedAt).toLocaleString()}
                    </div>
                  )}
                  {round.completedAt && (
                    <div>
                      Completed: {new Date(round.completedAt).toLocaleString()}
                    </div>
                  )}
                  {round.statistics && (
                    <div>
                      Matches: {round.statistics.resolvedMatches ?? 0}/
                      {round.statistics.totalMatches ?? 0} resolved
                      {(round.statistics.activeMatches ?? 0) > 0 &&
                        ` • ${round.statistics.activeMatches} active`}
                      {(round.statistics.pendingMatches ?? 0) > 0 &&
                        ` • ${round.statistics.pendingMatches} pending`}
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
        {/* Bottom actions: Forfeit/End */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rc-line/12 pt-6">
          <div className="rc-eyebrow">tournament actions</div>
          <div className="flex flex-wrap gap-3">
            {isRegistered &&
              tournament.status !== "completed" &&
              !isCreator && (
                <RcButton
                  variant="danger-soft"
                  onClick={async () => {
                    const ok = window.confirm("Forfeit this tournament now?");
                    if (!ok) return;
                    try {
                      const res = await fetch(
                        `/api/tournaments/${encodeURIComponent(
                          tournament.id,
                        )}/forfeit`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                        },
                      );
                      const data = await res.json();
                      if (!res.ok)
                        throw new Error(data?.error || "Failed to forfeit");
                      try {
                        localStorage.setItem(
                          "app:toast",
                          "You forfeited the tournament",
                        );
                        window.dispatchEvent(
                          new CustomEvent("app:toast", {
                            detail: {
                              message: "You forfeited the tournament",
                            },
                          }),
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
                          : "Failed to forfeit",
                      );
                    }
                  }}
                  title="Forfeit this tournament"
                >
                  Forfeit Tournament
                </RcButton>
              )}

            {isCreator && tournament.status !== "completed" && (
              <RcButton
                variant="danger-soft"
                onClick={handleEndTournament}
                title="End this tournament now"
              >
                End Tournament
              </RcButton>
            )}
          </div>
        </div>
        {/* Join Prompt Overlay */}
        {/* Constructed Decks Modal */}
        {constructedModalOpen &&
          tournament.status === "preparing" &&
          tournament.format === "constructed" &&
          isRegistered && (
            <RcDialog
              title="Select Your Constructed Deck"
              onClose={() => setConstructedModalOpen(false)}
            >
              {constructedError && (
                <div className="rc-alert mb-3" data-tone="danger">
                  {constructedError}
                </div>
              )}
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="rc-hint">
                  Allowed formats:{" "}
                  {constructedAllowedFormats.length
                    ? constructedAllowedFormats.join(", ")
                    : "standard"}
                </div>
                <label className="rc-check">
                  <input
                    type="checkbox"
                    checked={includePublicDecks}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      setIncludePublicDecks(next);
                      try {
                        localStorage.setItem(
                          "sorcery:includePublicDecks",
                          next ? "1" : "0",
                        );
                      } catch {}
                      try {
                        setConstructedLoading(true);
                        const res = await fetch(
                          `/api/tournaments/${encodeURIComponent(
                            tournament.id,
                          )}/preparation/constructed/decks?includePublic=${
                            e.target.checked ? "true" : "false"
                          }`,
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
                <div className="rc-hint py-6 text-center">
                  loading your decks…
                </div>
              ) : constructedDecks.length || constructedPublicDecks.length ? (
                <div className="thin-scrollbar flex max-h-80 flex-col gap-4 overflow-auto pr-1">
                  {constructedDecks.length > 0 && (
                    <div>
                      <div className="rc-eyebrow mb-1">My Decks</div>
                      <div className="flex flex-col gap-2">
                        {constructedDecks.map((d) => (
                          <div
                            key={`my-modal-${d.id}`}
                            className={`flex items-center justify-between gap-3 rounded-rc-md px-3 py-2 ${
                              constructedSelectedDeckId === d.id
                                ? "bg-rc-accent/6 shadow-[inset_2px_0_0_#d4a94a]"
                                : "bg-black/30"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                                {d.name}
                              </div>
                              <div className="rc-hint mt-0.5">
                                {d.format || "constructed"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {constructedSelectedDeckId === d.id ? (
                                <span className="font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-success">
                                  Selected
                                </span>
                              ) : (
                                <RcButton
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    await handleSubmitConstructedDeck(
                                      d.id,
                                      false,
                                    );
                                    setConstructedModalOpen(false);
                                  }}
                                  disabled={constructedLoading}
                                >
                                  Select
                                </RcButton>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {includePublicDecks && constructedPublicDecks.length > 0 && (
                    <div>
                      <div className="rc-eyebrow mb-1">Public Decks</div>
                      <div className="flex flex-col gap-2">
                        {constructedPublicDecks.map((d) => (
                          <div
                            key={`pub-modal-${d.id}`}
                            className={`flex items-center justify-between gap-3 rounded-rc-md px-3 py-2 ${
                              constructedSelectedDeckId === d.id
                                ? "bg-rc-accent/6 shadow-[inset_2px_0_0_#d4a94a]"
                                : "bg-black/30"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                                {d.name}
                              </div>
                              <div className="rc-hint mt-0.5">
                                {d.format || "constructed"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {constructedSelectedDeckId === d.id ? (
                                <span className="font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-success">
                                  Selected
                                </span>
                              ) : (
                                <RcButton
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    await handleSubmitConstructedDeck(
                                      d.id,
                                      true,
                                    );
                                    setConstructedModalOpen(false);
                                  }}
                                  disabled={constructedLoading}
                                >
                                  Select
                                </RcButton>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <RcEmpty
                  title="No valid decks found."
                  action={
                    <RcLinkButton href="/decks" variant="outline" size="sm">
                      Edit your decks
                    </RcLinkButton>
                  }
                >
                  <div>Constructed decks must have:</div>
                  <ul className="mt-1.5 list-inside list-disc text-rc-fg-subtle">
                    <li>Exactly 1 Avatar</li>
                    <li>At least 60 cards in Spellbook</li>
                    <li>At least 30 sites in Atlas</li>
                    <li>0-10 cards in Collection</li>
                    <li>Dragonlord decks require a champion</li>
                  </ul>
                </RcEmpty>
              )}
            </RcDialog>
          )}

        {/* Tournament Completion Celebration Modal */}
        {showCompletionModal &&
          showCompletionCelebration &&
          statistics?.standings &&
          myStanding && (
            <RcDialog
              eyebrow={
                myStanding.rank === 1 ? "victory" : "tournament complete"
              }
              title={tournament.name}
              size="lg"
              onClose={() => setShowCompletionModal(false)}
              actions={
                <>
                  <RcButton
                    variant="outline"
                    onClick={() => {
                      setActiveTab("standings");
                      setShowCompletionModal(false);
                    }}
                  >
                    View Full Standings
                  </RcButton>
                  <RcButton onClick={() => setShowCompletionModal(false)}>
                    Continue
                  </RcButton>
                </>
              }
            >
              {/* Player Stats */}
              <div className="rounded-rc-md border border-rc-line/14 bg-black/30 px-6 py-5">
                <div className="mb-4 text-center">
                  <div className="rc-stat mb-1 text-5xl font-bold text-rc-accent">
                    #{myStanding.rank}
                  </div>
                  <div className="font-rc-display text-[22px] leading-none text-rc-fg-strong">
                    {myStanding.rank === 1
                      ? "1st Place"
                      : myStanding.rank === 2
                        ? "2nd Place"
                        : myStanding.rank === 3
                          ? "3rd Place"
                          : `${myStanding.rank}th Place`}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="rc-stat text-2xl font-bold">
                      {myStanding.matchPoints}
                    </div>
                    <div className="rc-hint mt-1">Match Points</div>
                  </div>
                  <div className="text-center">
                    <div className="rc-stat text-2xl font-bold">
                      {myStanding.wins}-{myStanding.losses}-{myStanding.draws}
                    </div>
                    <div className="rc-hint mt-1">Record</div>
                  </div>
                  <div className="text-center">
                    <div className="rc-stat text-2xl font-bold">
                      {myStanding.gameWinPercentage
                        ? `${(myStanding.gameWinPercentage * 100).toFixed(0)}%`
                        : "0%"}
                    </div>
                    <div className="rc-hint mt-1">Game Win %</div>
                  </div>
                </div>
              </div>

              {/* Top 3 Standings */}
              {statistics.standings.length > 1 && (
                <div className="mt-6">
                  <div className="rc-eyebrow mb-2">final standings</div>
                  <div className="flex flex-col gap-2">
                    {statistics.standings.slice(0, 3).map((standing, idx) => {
                      const isMe = standing.playerId === viewer.id;
                      return (
                        <div
                          key={standing.playerId}
                          className={`flex items-center justify-between gap-3 rounded-rc-md p-3 ${
                            isMe
                              ? "bg-rc-accent/6 shadow-[inset_2px_0_0_#d4a94a]"
                              : "bg-black/30"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-rc-md border border-rc-line/14 bg-rc-line/8 font-rc-mono text-xs text-rc-fg-strong">
                              {idx + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                                {standing.playerName}{" "}
                                {isMe && (
                                  <span className="font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-success">
                                    you
                                  </span>
                                )}
                              </div>
                              <div className="rc-stat mt-0.5 text-xs text-rc-fg-muted">
                                {standing.wins}-{standing.losses}-
                                {standing.draws}
                              </div>
                            </div>
                          </div>
                          <div className="rc-stat text-right text-lg font-bold text-rc-fg-strong">
                            {standing.matchPoints} pts
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </RcDialog>
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
    </AppShell>
  );
}
