"use client";

import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
  useRef,
} from "react";
import type { Socket } from "socket.io-client";
import { useTournamentPhases } from "@/hooks/useTournamentPhases";
import { useTournamentPreparation } from "@/hooks/useTournamentPreparation";
import { useTournamentSocket } from "@/hooks/useTournamentSocket";
import { useTournamentStatistics } from "@/hooks/useTournamentStatistics";

interface RegisteredTournamentPlayer {
  id: string;
  displayName: string;
  ready?: boolean;
  deckSubmitted?: boolean;
  avatarUrl?: string | null;
  avatar?: string | null;
  image?: string | null;
  name?: string | null;
  seatStatus?: string | null;
}

interface TournamentStanding {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  draws: number;
  matchPoints: number;
  gameWinPercentage: number;
  opponentMatchWinPercentage: number;
  currentMatchId?: string | null;
  isEliminated: boolean;
}

interface TournamentRoundSummary {
  roundNumber: number;
  matches: string[];
  status: "pending" | "in_progress" | "completed";
}

interface TournamentInfo {
  id: string;
  name: string;
  format: "sealed" | "draft" | "constructed";
  status: "registering" | "preparing" | "active" | "completed" | "cancelled";
  maxPlayers: number;
  currentPlayers: number;
  creatorId: string;
  creatorName?: string;
  settings: Record<string, unknown>;
  featureFlags?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  userRegistered?: boolean;
  userReady?: boolean;
  canJoin?: boolean;
  canStart?: boolean;
  registeredPlayers?: RegisteredTournamentPlayer[];
  standings?: TournamentStanding[];
  currentRound?: number;
  totalRounds?: number;
  rounds?: TournamentRoundSummary[];
  draftSessionId?: string;
}

const SHOULD_LOG_TOURNAMENT_DEBUG = process.env.NODE_ENV !== "production";

function logTournamentDebug(message: string, payload?: unknown): void {
  if (!SHOULD_LOG_TOURNAMENT_DEBUG) return;
  if (payload === undefined) {
    console.log(message);
    return;
  }
  console.log(message, payload);
}

function upsertRegisteredPlayer(
  players: RegisteredTournamentPlayer[] | undefined,
  player: RegisteredTournamentPlayer,
): RegisteredTournamentPlayer[] {
  const existing = players ?? [];
  const without = existing.filter((entry) => entry.id !== player.id);
  return [...without, player];
}

interface RealtimeTournamentContextValue {
  // Tournament list and management
  tournaments: TournamentInfo[];
  currentTournament: TournamentInfo | null;
  setCurrentTournament: (tournament: TournamentInfo | null) => void;
  setCurrentTournamentById: (id: string | null) => void;

  // Real-time connection status
  isSocketConnected: boolean;
  connectionError: string | null;
  socket: Socket | null;

  // Tournament actions
  createTournament: (config: {
    name: string;
    format: "sealed" | "draft" | "constructed";
    maxPlayers: number;
    isPrivate?: boolean;
    settings?: Record<string, unknown>;
    registrationMode?: "fixed" | "open";
    registrationLocked?: boolean;
  }) => Promise<TournamentInfo>;
  joinTournament: (tournamentId: string) => Promise<void>;
  leaveTournament: (tournamentId: string) => Promise<void>;
  startTournament: (tournamentId: string) => Promise<void>;
  endTournament: (tournamentId: string) => Promise<void>;
  updateTournamentSettings: (
    tournamentId: string,
    settings: Record<string, unknown>,
  ) => Promise<void>;
  toggleTournamentRegistrationLock: (
    tournamentId: string,
    locked: boolean,
  ) => Promise<void>;
  toggleTournamentReady: (
    tournamentId: string,
    ready: boolean,
  ) => Promise<void>;
  sendTournamentChat: (tournamentId: string, content: string) => void;

  // Enhanced state management
  refreshTournaments: () => Promise<void>;

  // Real-time preparation management
  preparation: ReturnType<typeof useTournamentPreparation> | null;

  // Real-time statistics management
  statistics: ReturnType<typeof useTournamentStatistics> | null;

  // Phase management
  phases: ReturnType<typeof useTournamentPhases> | null;

  // Real-time events
  realtimeEvents: {
    playerJoinedCount: number;
    playerLeftCount: number;
    phaseChangeCount: number;
    lastEventTime: string | null;
  };
  // Presence for current tournament (umbrella presence)
  tournamentPresence: Array<{
    playerId: string;
    playerName: string;
    isConnected: boolean;
    lastActivity: number;
  }>;
  // Presence selector for arbitrary tournament id
  getPresenceFor: (tournamentId: string | null) => Array<{
    playerId: string;
    playerName: string;
    isConnected: boolean;
    lastActivity: number;
  }>;
  // Current user's assignment for quick CTA
  assignedMatchId: string | null;
  assignedOpponentName: string | null;

  // Global state
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const RealtimeTournamentContext =
  createContext<RealtimeTournamentContextValue | null>(null);

export function RealtimeTournamentProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: sessionData } = useSession();

  // Only actively fetch tournaments when on actual tournament pages
  // Exclude /online/lobby and /online/play to reduce unnecessary polling
  const isOnTournamentPage =
    pathname === "/tournaments" ||
    pathname?.startsWith("/tournaments/") ||
    false;
  const currentUserId = sessionData?.user?.id ?? null;
  const [tournaments, setTournaments] = useState<TournamentInfo[]>([]);
  const [currentTournament, setCurrentTournamentState] =
    useState<TournamentInfo | null>(null);
  const [requestedTournamentId, setRequestedTournamentId] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [realtimeEvents, setRealtimeEvents] = useState({
    playerJoinedCount: 0,
    playerLeftCount: 0,
    phaseChangeCount: 0,
    preparationUpdateCount: 0,
    lastEventTime: null as string | null,
  });
  const [presenceByTournament, setPresenceByTournament] = useState<
    Record<
      string,
      Array<{
        playerId: string;
        playerName: string;
        isConnected: boolean;
        lastActivity: number;
      }>
    >
  >({});
  const [assignedMatch, setAssignedMatch] = useState<{
    matchId: string;
    opponentName: string | null;
  } | null>(null);
  // Track which tournament we've already joined on this connection to avoid spam re-joins
  const joinedTournamentIdRef = useRef<string | null>(null);

  const setCurrentTournament = useCallback(
    (tournament: TournamentInfo | null) => {
      setRequestedTournamentId(tournament?.id ?? null);
      setCurrentTournamentState(tournament);
      // If setting a tournament that's not in the list, add it
      if (tournament) {
        setTournaments((prev) => {
          if (prev.some((t) => t.id === tournament.id)) return prev;
          return [...prev, tournament];
        });
      }
    },
    [],
  );

  const activeTournamentId =
    currentTournament?.id ?? requestedTournamentId ?? null;
  // Initialize state management hooks for current tournament
  // Use null as safe fallback - hooks will handle this gracefully
  const preparationId = activeTournamentId;
  // Stable refs for avoiding re-fetch loops
  const currentTournamentIdRef = useRef<string | null>(null);
  useEffect(() => {
    currentTournamentIdRef.current = currentTournament?.id ?? null;
  }, [currentTournament?.id]);
  const isRefreshingRef = useRef(false);
  // Refs to latest hook instances so handlers can call without re-declaring
  const prepHookRef = useRef<ReturnType<
    typeof useTournamentPreparation
  > | null>(null);
  const statsHookRef = useRef<ReturnType<
    typeof useTournamentStatistics
  > | null>(null);
  const phasesHookRef = useRef<ReturnType<typeof useTournamentPhases> | null>(
    null,
  );
  const statsRefreshQueueRef = useRef<{
    standings: boolean;
    matches: boolean;
    rounds: boolean;
    overview: boolean;
    timer: number | null;
  }>({
    standings: false,
    matches: false,
    rounds: false,
    overview: false,
    timer: null,
  });
  const detailRefreshTimersRef = useRef<Record<string, number>>({});
  const lastDetailFetchAtRef = useRef<Record<string, number>>({});

  const queueStatisticsRefresh = useCallback(
    (options: {
      standings?: boolean;
      matches?: boolean;
      rounds?: boolean;
      overview?: boolean;
    }) => {
      const queue = statsRefreshQueueRef.current;
      if (options.standings) queue.standings = true;
      if (options.matches) queue.matches = true;
      if (options.rounds) queue.rounds = true;
      if (options.overview) queue.overview = true;

      const run = () => {
        const actions = statsHookRef.current?.actions;
        queue.timer = null;
        const flags = { ...queue };
        queue.standings = queue.matches = queue.rounds = queue.overview = false;
        if (!actions) return;
        const tasks: Promise<unknown>[] = [];
        if (flags.standings) tasks.push(actions.refreshStandings());
        if (flags.matches) tasks.push(actions.refreshMatches());
        if (flags.rounds) tasks.push(actions.refreshRounds());
        if (flags.overview) tasks.push(actions.refreshStatistics());
        if (tasks.length > 0) {
          void Promise.allSettled(tasks);
        }
      };

      if (typeof window === "undefined") {
        run();
        return;
      }

      if (queue.timer != null) return;
      queue.timer = window.setTimeout(run, 250);
    },
    [],
  );

  useEffect(() => {
    const ref = statsRefreshQueueRef;
    return () => {
      const queue = ref.current;
      if (queue.timer != null) {
        clearTimeout(queue.timer);
        queue.timer = null;
      }
    };
  }, []);

  const refreshTournamentDetail = useCallback(
    (
      id: string | null | undefined,
      delay = 200,
      opts?: { force?: boolean },
    ) => {
      if (!id) return;
      if (typeof window === "undefined") {
        void fetch(`/api/tournaments/${id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((detail) => {
            if (!detail) return;
            setTournaments((prev) => {
              let found = false;
              const next = prev.map((t) => {
                if (t.id === detail.id) {
                  found = true;
                  return detail as TournamentInfo;
                }
                return t;
              });
              if (!found) {
                return [...next, detail as TournamentInfo];
              }
              return next;
            });
            setCurrentTournamentState((prev) =>
              prev && prev.id === (detail as TournamentInfo).id
                ? (detail as TournamentInfo)
                : prev,
            );
          })
          .catch((err) => {
            console.warn(
              "[RealtimeTournamentContext] Failed to refresh tournament detail",
              err,
            );
          });
        return;
      }

      // Throttle: enforce a minimum interval per tournament id unless forced
      const now = Date.now();
      const last = lastDetailFetchAtRef.current[id] || 0;
      const minInterval = 3000; // 3 seconds to reduce request spam
      if (!(opts && opts.force) && now - last < minInterval) {
        return;
      }
      lastDetailFetchAtRef.current[id] = now;

      const timers = detailRefreshTimersRef.current;
      const existing = timers[id];
      if (existing != null) {
        window.clearTimeout(existing);
      }

      const handle = window.setTimeout(async () => {
        delete timers[id];
        try {
          const res = await fetch(`/api/tournaments/${id}`);
          if (!res.ok) return;
          const detail = (await res.json()) as TournamentInfo;
          setTournaments((prev) => {
            let found = false;
            const next = prev.map((t) => {
              if (t.id === detail.id) {
                found = true;
                return detail;
              }
              return t;
            });
            if (!found) return [...next, detail];
            return next;
          });
          setCurrentTournamentState((prev) => {
            if (!prev || prev.id !== detail.id) return prev;
            return detail;
          });
        } catch (err) {
          console.warn(
            "[RealtimeTournamentContext] Failed to refresh tournament detail",
            err,
          );
        }
      }, delay);
      timers[id] = handle;
    },
    [],
  );

  useEffect(() => {
    const timersRef = detailRefreshTimersRef;
    return () => {
      const timers = timersRef.current;
      for (const key of Object.keys(timers)) {
        const handle = timers[key];
        if (handle != null) {
          window.clearTimeout(handle);
        }
        delete timers[key];
      }
    };
  }, []);

  // Hooks below need socket connectivity; we'll initialize them after setting up handlers and socket

  // Helper: set current tournament by id (uses the loaded list)
  const setCurrentTournamentById = useCallback(
    (id: string | null) => {
      setRequestedTournamentId(id);
      if (!id) {
        setCurrentTournamentState(null);
        return;
      }
      const found = tournaments.find((t) => t.id === id) || null;
      setCurrentTournamentState((prev) => {
        if (prev?.id === id) return prev;
        return found ?? prev ?? null;
      });
      // Only fetch if we don't have the tournament in the list yet
      if (!found) {
        refreshTournamentDetail(id, 100, { force: true });
      }
    },
    [tournaments, refreshTournamentDetail],
  );

  const handleDraftReady = useCallback(
    (data: {
      tournamentId: string;
      draftSessionId: string;
      totalPlayers?: number;
    }) => {
      // If we've already submitted our draft deck for this tournament, never auto-redirect back into the draft/editor
      try {
        const submitted =
          localStorage.getItem(
            `draft_submitted_tournament_${data.tournamentId}`,
          ) === "true" ||
          localStorage.getItem(
            `sealed_submitted_tournament_${data.tournamentId}`,
          ) === "true";
        if (submitted) {
          return;
        }
      } catch {}
      setCurrentTournamentState((prev) => {
        if (!prev || prev.id !== data.tournamentId) return prev;
        return {
          ...prev,
          draftSessionId: data.draftSessionId,
        };
      });
      // Trust socket data - no HTTP refresh needed
      setLastUpdated(new Date().toISOString());

      // Notify players that the draft is starting
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: { message: "Draft is starting! Join now." },
            }),
          );
        }
      } catch {}

      if (!currentUserId) return;

      const activeId = activeTournamentId;
      if (!activeId || activeId !== data.tournamentId) return;

      const registered = currentTournament?.registeredPlayers;
      if (
        Array.isArray(registered) &&
        !registered.some((p) => p.id === currentUserId)
      ) {
        return;
      }

      const targetPath = `/online/draft/${data.draftSessionId}`;
      if (pathname?.startsWith(targetPath)) return;

      router.replace(`${targetPath}?tournament=${data.tournamentId}`);
    },
    [activeTournamentId, currentTournament, currentUserId, pathname, router],
  );

  useEffect(() => {
    if (!requestedTournamentId) return;
    const found = tournaments.find((t) => t.id === requestedTournamentId);
    if (!found) return;
    setCurrentTournamentState((prev) => {
      if (prev && prev.id === found.id) return prev;
      return found;
    });
    // No longer force refresh here - we already have data from the list
    // Detail fetch happens only when needed (e.g., status changes to active)
  }, [requestedTournamentId, tournaments]);

  // Socket event handlers
  const refreshTournaments = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      // Only fetch active tournaments (registering, preparing, active)
      // Limit to recent 6 tournaments to avoid loading all history
      const response = await fetch(
        "/api/tournaments?status=registering,preparing,active&limit=6",
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to fetch tournaments");
      }
      const tournamentsData = (await response.json()) as TournamentInfo[];
      setTournaments(tournamentsData);
      setLastUpdated(new Date().toISOString());
      const ctId = currentTournamentIdRef.current;
      if (ctId) {
        const updatedCurrent = tournamentsData.find((t) => t.id === ctId);
        if (updatedCurrent) {
          // Merge shallow list data into existing detail without dropping fields like creatorId
          setCurrentTournamentState((prev) => {
            if (!prev || prev.id !== ctId)
              return updatedCurrent as TournamentInfo;
            return { ...prev, ...updatedCurrent } as TournamentInfo;
          });
        }
        // Only force a heavy detail refresh when list shows major phases
        if (
          updatedCurrent &&
          (updatedCurrent.status === "active" ||
            updatedCurrent.status === "completed")
        ) {
          refreshTournamentDetail(ctId, 150, { force: true });
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch tournaments";
      setError(message);
    } finally {
      isRefreshingRef.current = false;
      setLoading(false);
    }
  }, [refreshTournamentDetail]);

  // Debounced refresher to coalesce bursts
  const refreshTimeoutRef = useRef<number | null>(null);
  const refreshTournamentsDebounced = useCallback(
    (delay = 300) => {
      if (refreshTimeoutRef.current != null) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        void refreshTournaments();
      }, delay);
    },
    [refreshTournaments],
  );

  const handleTournamentUpdated = useCallback(
    (data: {
      id: string;
      name?: string;
      status?: string;
      [key: string]: unknown;
    }) => {
      setTournaments((prev) =>
        prev.map((t) => {
          if (t.id !== data.id) return t;
          const next = { ...t } as TournamentInfo & Record<string, unknown>;
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
              next[key] = value as unknown;
            }
          }
          if (data.status !== undefined) {
            next.status = data.status as TournamentInfo["status"];
          }
          return next as TournamentInfo;
        }),
      );
      // Trust socket data - no HTTP refresh needed

      setCurrentTournamentState((prev) => {
        if (!prev || prev.id !== data.id) return prev;
        const next = { ...prev } as typeof prev & Record<string, unknown>;
        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            next[key] = value as unknown;
          }
        }
        if (data.status !== undefined) {
          (next as { status: TournamentInfo["status"] }).status =
            data.status as TournamentInfo["status"];
        }
        return next as typeof prev;
      });
      // Trust socket data - no HTTP refresh needed
      setLastUpdated(new Date().toISOString());
    },
    [],
  );

  const handlePresenceUpdated = useCallback(
    (data: {
      tournamentId: string;
      players: Array<{
        playerId: string;
        playerName: string;
        isConnected: boolean;
        lastActivity: number;
      }>;
    }) => {
      setPresenceByTournament((prev) => ({
        ...prev,
        [data.tournamentId]: data.players,
      }));
      setLastUpdated(new Date().toISOString());
    },
    [],
  );

  const handlePhaseChanged = useCallback(
    (data: {
      tournamentId: string;
      newPhase: string;
      newStatus: string;
      timestamp: string;
    }) => {
      logTournamentDebug("Tournament phase changed:", data);

      // Update tournament status
      setTournaments((prev) =>
        prev.map((t) =>
          t.id === data.tournamentId
            ? { ...t, status: data.newStatus as TournamentInfo["status"] }
            : t,
        ),
      );

      // Update current tournament & phase state
      setCurrentTournamentState((prev) => {
        if (!prev || prev.id !== data.tournamentId) return prev;
        return {
          ...prev,
          status: data.newStatus as TournamentInfo["status"],
        };
      });

      // Toast hint for phase changes
      try {
        // Generate user-friendly messages based on status transitions
        let msg = "";
        if (data.newStatus === "preparing") {
          msg = "Tournament is preparing - waiting for players to ready up";
        } else if (data.newStatus === "active") {
          msg = "Tournament has started!";
        } else if (data.newStatus === "completed") {
          msg = "Tournament has ended";
        } else if (data.newStatus === "cancelled") {
          msg = "Tournament was cancelled";
        }

        if (msg) {
          localStorage.setItem("app:toast", msg);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", { detail: { message: msg } }),
            );
          }
        }
      } catch {}

      // Update phase hook
      if (phasesHookRef.current && data.tournamentId === preparationId) {
        phasesHookRef.current.actions.updatePhase(
          data.newStatus as TournamentInfo["status"],
        );
      }

      // Refresh standings for victory screen on completion, or matches on active
      if (data.newStatus === "completed") {
        queueStatisticsRefresh({
          standings: true,
          overview: true,
          rounds: true,
        });
      } else if (data.newStatus === "active") {
        queueStatisticsRefresh({ matches: true, rounds: true });
      }

      setLastUpdated(new Date().toISOString());
      setRealtimeEvents((prev) => ({
        ...prev,
        phaseChangeCount: prev.phaseChangeCount + 1,
        lastEventTime: data.timestamp,
      }));
    },
    [preparationId, queueStatisticsRefresh],
  );

  const handlePlayerJoined = useCallback(
    (data: {
      tournamentId: string;
      playerId: string;
      playerName: string;
      currentPlayerCount: number;
    }) => {
      logTournamentDebug("Player joined tournament:", data);
      setTournaments((prev) =>
        prev.map((t) => {
          if (t.id !== data.tournamentId) return t;
          return {
            ...t,
            currentPlayers: data.currentPlayerCount,
            registeredPlayers: upsertRegisteredPlayer(t.registeredPlayers, {
              id: data.playerId,
              displayName: data.playerName,
              ready: false,
            }),
          };
        }),
      );
      // Trust socket data - no HTTP refresh needed
      // Update current tournament if it matches
      setCurrentTournamentState((prev) => {
        if (!prev || prev.id !== data.tournamentId) return prev;
        return {
          ...prev,
          currentPlayers: data.currentPlayerCount,
          registeredPlayers: upsertRegisteredPlayer(prev.registeredPlayers, {
            id: data.playerId,
            displayName: data.playerName,
            ready: false,
          }),
        };
      });
      setLastUpdated(new Date().toISOString());
      setRealtimeEvents((prev) => ({
        ...prev,
        playerJoinedCount: prev.playerJoinedCount + 1,
        lastEventTime: new Date().toISOString(),
      }));
      // Trust socket data - no HTTP refresh needed
    },
    [],
  );

  const handlePlayerLeft = useCallback(
    (data: {
      tournamentId: string;
      playerId: string;
      playerName: string;
      currentPlayerCount: number;
    }) => {
      logTournamentDebug("Player left tournament:", data);
      setTournaments((prev) =>
        prev.map((t) => {
          if (t.id !== data.tournamentId) return t;
          return {
            ...t,
            currentPlayers: data.currentPlayerCount,
            registeredPlayers: (t.registeredPlayers ?? []).filter(
              (player) => player.id !== data.playerId,
            ),
          };
        }),
      );
      // Trust socket data - no HTTP refresh needed
      setCurrentTournamentState((prev) => {
        if (!prev || prev.id !== data.tournamentId) return prev;
        return {
          ...prev,
          currentPlayers: data.currentPlayerCount,
          registeredPlayers: (prev.registeredPlayers ?? []).filter(
            (player) => player.id !== data.playerId,
          ),
        };
      });
      try {
        const hostId = currentTournament?.creatorId || null;
        if (
          hostId &&
          hostId === currentUserId &&
          currentTournament?.id === data.tournamentId
        ) {
          const msg = `${data.playerName} forfeited and left the tournament.`;
          localStorage.setItem("app:toast", msg);
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("app:toast", { detail: { message: msg } }),
            );
          }
        }
      } catch {}
      setLastUpdated(new Date().toISOString());
      setRealtimeEvents((prev) => ({
        ...prev,
        playerLeftCount: prev.playerLeftCount + 1,
        lastEventTime: new Date().toISOString(),
      }));
    },
    [currentTournament?.creatorId, currentTournament?.id, currentUserId],
  );

  const handlePreparationUpdate = useCallback(
    (data: {
      tournamentId: string;
      playerId: string;
      preparationStatus: string;
      deckSubmitted: boolean;
      readyPlayerCount: number;
      totalPlayerCount: number;
    }) => {
      logTournamentDebug("Preparation update:", data);
      const isReady =
        data.preparationStatus === "ready" || data.deckSubmitted === true;
      setTournaments((prev) =>
        prev.map((t) => {
          if (t.id !== data.tournamentId) return t;
          if (!Array.isArray(t.registeredPlayers)) return t;
          const updated = t.registeredPlayers.map((p) =>
            p.id === data.playerId
              ? {
                  ...p,
                  ready: isReady,
                  deckSubmitted: Boolean(data.deckSubmitted),
                }
              : p,
          );
          return {
            ...t,
            registeredPlayers: updated,
          };
        }),
      );
      // Trust socket data - no HTTP refresh needed
      // Update current tournament mirror if present
      if (currentTournament?.id === data.tournamentId) {
        const reg = currentTournament.registeredPlayers;
        if (Array.isArray(reg)) {
          const updated = reg.map((p) =>
            p.id === data.playerId
              ? {
                  ...p,
                  ready: isReady,
                  deckSubmitted: Boolean(data.deckSubmitted),
                }
              : p,
          );
          setCurrentTournamentState({
            ...currentTournament,
            registeredPlayers: updated,
          });
        }
      }
      // Refresh preparation status only on significant milestones
      if (currentTournament?.id === data.tournamentId && prepHookRef.current) {
        if (data.deckSubmitted || data.preparationStatus === "completed") {
          prepHookRef.current.actions.refreshStatus();
        }
      }

      setLastUpdated(new Date().toISOString());
      setRealtimeEvents((prev) => ({
        ...prev,
        preparationUpdateCount: prev.preparationUpdateCount + 1,
        lastEventTime: new Date().toISOString(),
      }));
      // Trust socket data - no HTTP refresh needed
    },
    [currentTournament],
  );

  const handleStatisticsUpdated = useCallback(
    (data: {
      tournamentId: string;
      standings?: unknown;
      matches?: unknown;
      rounds?: unknown;
      [key: string]: unknown;
    }) => {
      logTournamentDebug("Statistics updated:", data);
      if (currentTournament?.id === data.tournamentId) {
        queueStatisticsRefresh({
          standings: true,
          matches: true,
          rounds: true,
          overview: true,
        });
      }
      setLastUpdated(new Date().toISOString());
    },
    [currentTournament?.id, queueStatisticsRefresh],
  );

  const handleRoundStarted = useCallback(
    (data: {
      tournamentId: string;
      roundNumber: number;
      matches: Array<{
        id: string;
        player1Id: string;
        player1Name: string;
        player2Id: string | null;
        player2Name: string | null;
      }>;
    }) => {
      logTournamentDebug("Round started:", data);

      if (currentTournament?.id === data.tournamentId) {
        // Refresh matches/rounds so Join button appears
        queueStatisticsRefresh({ matches: true, rounds: true });
        setLastUpdated(new Date().toISOString());
        // Derive my assignment immediately from payload
        if (currentUserId) {
          const mine = data.matches.find(
            (m) =>
              m.player1Id === currentUserId || m.player2Id === currentUserId,
          );
          if (mine) {
            const opp =
              mine.player1Id === currentUserId
                ? mine.player2Name
                : mine.player1Name;
            setAssignedMatch({
              matchId: String(mine.id),
              opponentName: opp ?? null,
            });
          }
        }
      }
    },
    [currentTournament, currentUserId, queueStatisticsRefresh],
  );

  const handleMatchAssigned = useCallback(
    (data: {
      tournamentId: string;
      matchId: string;
      opponentId: string | null;
      opponentName: string | null;
      lobbyName: string;
    }) => {
      logTournamentDebug("Match assigned:", data);
      if (currentTournament?.id === data.tournamentId) {
        // Refresh matches so Join button appears
        queueStatisticsRefresh({ matches: true });
        setLastUpdated(new Date().toISOString());
        // Treat this as an assignment for the current user
        setAssignedMatch({
          matchId: String(data.matchId),
          opponentName: data.opponentName ?? null,
        });
      }
      // Broadcast a browser event for UI surfaces (e.g., Join CTA on details page)
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("tournament:matchAssigned", {
              detail: {
                tournamentId: data.tournamentId,
                matchId: data.matchId,
                opponentName: data.opponentName ?? null,
              },
            }),
          );
        }
      } catch {}
    },
    [currentTournament, queueStatisticsRefresh],
  );

  const handleSocketError = useCallback(
    (error: { code: string; message: string; details?: string }) => {
      console.error("Tournament socket error:", error);
      setConnectionError(error.message);
      setError(error.message);
    },
    [],
  );

  // Initialize socket and socket-aware hooks
  const {
    socket,
    isConnected,
    joinTournament: socketJoinTournament,
    leaveTournament: socketLeaveTournament,
  } = useTournamentSocket({
    onTournamentUpdated: handleTournamentUpdated,
    onPhaseChanged: handlePhaseChanged,
    onPlayerJoined: handlePlayerJoined,
    onPlayerLeft: handlePlayerLeft,
    onPreparationUpdate: handlePreparationUpdate,
    onStatisticsUpdated: handleStatisticsUpdated,
    onRoundStarted: handleRoundStarted,
    onMatchAssigned: handleMatchAssigned,
    onPresenceUpdated: handlePresenceUpdated,
    onDraftReady: handleDraftReady,
    onError: handleSocketError,
  });
  // NOTE: hello message is already sent by OnlineProvider via SocketTransport.connect()
  // No need to send it again here - that was causing duplicate hello messages

  // Listen for tournament list changes (event-driven updates)
  // Server broadcasts these events when tournaments are created/updated/completed
  useEffect(() => {
    if (!socket) return;

    const handleTournamentListChanged = (data: {
      action: string;
      tournamentId?: string;
    }) => {
      logTournamentDebug(
        "[RealtimeTournamentContext] Tournament list changed:",
        data,
      );
      // Refresh tournament list when server announces changes
      refreshTournamentsDebounced(500);
    };

    const handleTournamentCreated = (data: {
      id: string;
      name: string;
      format: string;
    }) => {
      logTournamentDebug(
        "[RealtimeTournamentContext] New tournament created:",
        data,
      );
      // Immediately refresh to show new tournament
      refreshTournamentsDebounced(200);
    };

    socket.on("tournament:list-changed", handleTournamentListChanged);
    socket.on("tournament:created", handleTournamentCreated);

    return () => {
      socket.off("tournament:list-changed", handleTournamentListChanged);
      socket.off("tournament:created", handleTournamentCreated);
    };
  }, [socket, refreshTournamentsDebounced]);

  const preparation = useTournamentPreparation(preparationId, { isConnected });
  const statistics = useTournamentStatistics(preparationId, { isConnected });
  const phases = useTournamentPhases(preparationId, currentTournament?.status, {
    isConnected,
  });
  // Only return hook results if we have a current tournament
  const activePreparation = currentTournament ? preparation : null;
  const activeStatistics = currentTournament ? statistics : null;
  const activePhases = currentTournament ? phases : null;
  // Keep refs in sync with latest instances
  useEffect(() => {
    prepHookRef.current = activePreparation;
  }, [activePreparation]);
  useEffect(() => {
    statsHookRef.current = activeStatistics;
  }, [activeStatistics]);
  useEffect(() => {
    phasesHookRef.current = activePhases;
  }, [activePhases]);

  const sendTournamentChat = useCallback(
    (tournamentId: string, content: string) => {
      if (!socket) return;
      const trimmed = content.trim();
      if (!trimmed) return;
      socket.emit("TOURNAMENT_CHAT", {
        tournamentId,
        content: trimmed,
        timestamp: Date.now(),
      });
    },
    [socket],
  );

  // Fallback polling: keep list fresh even if socket events are missed
  // Only poll when the realtime socket is disconnected AND user is on a tournament page
  // Increased to 45s since WebSocket provides real-time updates when connected
  useEffect(() => {
    if (isConnected) return;
    if (!isOnTournamentPage) return;
    const id = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      )
        return;
      void refreshTournaments();
    }, 45000); // 45s for cost savings - WebSocket is primary mechanism
    return () => clearInterval(id);
  }, [isConnected, isOnTournamentPage, refreshTournaments]);

  // Refresh tournament list when entering the /tournaments route
  // This fixes the issue where players have to reload the window to see currently open tournaments
  const prevIsOnTournamentPageRef = useRef(isOnTournamentPage);
  useEffect(() => {
    const wasOnPage = prevIsOnTournamentPageRef.current;
    prevIsOnTournamentPageRef.current = isOnTournamentPage;

    // If we just navigated TO a tournament page, refresh the list
    if (isOnTournamentPage && !wasOnPage) {
      logTournamentDebug(
        "[RealtimeTournamentContext] Entered tournament page, refreshing list",
      );
      void refreshTournaments();
    }
  }, [isOnTournamentPage, refreshTournaments]);

  // Auto-join current tournament when socket connects or when the id changes
  useEffect(() => {
    if (!isConnected) return;
    const id = activeTournamentId;
    if (!id) return;
    if (joinedTournamentIdRef.current === id) {
      logTournamentDebug(
        "[RealtimeTournamentContext] Already joined tournament:",
        id,
      );
      return;
    }
    logTournamentDebug("[RealtimeTournamentContext] Auto-joining tournament:", id);
    joinedTournamentIdRef.current = id;
    socketJoinTournament(id);
  }, [isConnected, activeTournamentId, socketJoinTournament]);

  // Clear connection error when socket connects
  useEffect(() => {
    if (isConnected) {
      setConnectionError(null);
    }
  }, [isConnected]);

  // Tournament management functions
  const createTournament = useCallback(
    async (config: {
      name: string;
      format: "sealed" | "draft" | "constructed";
      maxPlayers: number;
      isPrivate?: boolean;
      settings?: Record<string, unknown>;
      registrationMode?: "fixed" | "open";
      registrationLocked?: boolean;
    }) => {
      setLoading(true);
      setError(null);

      try {
        logTournamentDebug("Creating tournament:", config);

        const response = await fetch("/api/tournaments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create tournament");
        }

        const tournament = await response.json();
        logTournamentDebug("Tournament created:", tournament);
        // Join this tournament room to receive real-time updates immediately
        try {
          socketJoinTournament(tournament.id);
        } catch {}
        // Also refresh list only if socket is not connected (socket will broadcast otherwise)
        if (!isConnected) {
          refreshTournamentsDebounced();
        }
        // Fetch full details and set as current tournament for downstream hooks
        let fullDetail = tournament;
        try {
          const detailRes = await fetch(`/api/tournaments/${tournament.id}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            fullDetail = detail;
            setCurrentTournament(detail as unknown as TournamentInfo);
          }
        } catch {}
        return fullDetail;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create tournament";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [
      socketJoinTournament,
      isConnected,
      refreshTournamentsDebounced,
      setCurrentTournament,
    ],
  );

  const joinTournament = useCallback(
    async (tournamentId: string) => {
      setLoading(true);
      setError(null);

      try {
        logTournamentDebug("Joining tournament:", tournamentId);

        const response = await fetch(`/api/tournaments/${tournamentId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to join tournament");
        }

        logTournamentDebug("Joined tournament successfully");
        // Join the tournament room immediately for real-time updates
        try {
          socketJoinTournament(tournamentId);
        } catch {}
        // Refresh list only if socket is not connected
        if (!isConnected) {
          refreshTournamentsDebounced();
        }
        // Fetch full details and set as current tournament for downstream hooks
        try {
          const detailRes = await fetch(`/api/tournaments/${tournamentId}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            setCurrentTournament(detail as unknown as TournamentInfo);
          }
        } catch {}
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to join tournament";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [
      socketJoinTournament,
      isConnected,
      refreshTournamentsDebounced,
      setCurrentTournament,
    ],
  );

  const leaveTournament = useCallback(
    async (tournamentId: string) => {
      setLoading(true);
      setError(null);

      try {
        logTournamentDebug("Leaving tournament:", tournamentId);

        const response = await fetch(`/api/tournaments/${tournamentId}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to leave tournament");
        }

        logTournamentDebug("Left tournament successfully");

        // Leave socket room
        socketLeaveTournament(tournamentId);

        // Clear current tournament if leaving it
        if (currentTournament?.id === tournamentId) {
          setCurrentTournament(null);
        }

        // Rely on server events to update list
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to leave tournament";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [currentTournament, socketLeaveTournament, setCurrentTournament],
  );

  const startTournament = useCallback(
    async (tournamentId: string) => {
      setLoading(true);
      setError(null);

      try {
        logTournamentDebug("Starting tournament:", tournamentId);

        const response = await fetch(`/api/tournaments/${tournamentId}/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to start tournament");
        }

        logTournamentDebug("Tournament started successfully");
        // Join the room to receive tournament-scoped updates immediately
        try {
          socketJoinTournament(tournamentId);
        } catch {}
        // Real-time events will propagate updates; fetch details only
        try {
          const detailRes = await fetch(`/api/tournaments/${tournamentId}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            setCurrentTournament(detail as unknown as TournamentInfo);
          }
        } catch {}
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to start tournament";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [socketJoinTournament, setCurrentTournament],
  );

  const endTournament = useCallback(
    async (tournamentId: string) => {
      setLoading(true);
      setError(null);

      try {
        logTournamentDebug("Ending tournament:", tournamentId);

        const response = await fetch(`/api/tournaments/${tournamentId}/end`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to end tournament");
        }

        logTournamentDebug("Tournament ended successfully");
        if (!isConnected) {
          refreshTournamentsDebounced();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to end tournament";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [isConnected, refreshTournamentsDebounced],
  );

  const updateTournamentSettings = useCallback(
    async (tournamentId: string, settings: Record<string, unknown>) => {
      setLoading(true);
      setError(null);

      try {
        logTournamentDebug("Updating tournament settings:", {
          tournamentId,
          settings,
        });

        const response = await fetch(
          `/api/tournaments/${tournamentId}/settings`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(settings),
          },
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(
            error.error || "Failed to update tournament settings",
          );
        }

        logTournamentDebug("Tournament settings updated successfully");
        if (!isConnected) {
          refreshTournamentsDebounced();
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to update tournament settings";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [isConnected, refreshTournamentsDebounced],
  );

  const toggleTournamentRegistrationLock = useCallback(
    async (tournamentId: string, locked: boolean) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/registration`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locked }),
          },
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to update registration lock");
        }

        if (!isConnected) {
          refreshTournamentsDebounced();
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to update registration lock";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [isConnected, refreshTournamentsDebounced],
  );

  const toggleTournamentReady = useCallback(
    async (tournamentId: string, ready: boolean) => {
      setLoading(true);
      setError(null);

      try {
        logTournamentDebug("Toggling tournament ready status:", {
          tournamentId,
          ready,
        });

        const response = await fetch(`/api/tournaments/${tournamentId}/ready`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ready }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to update ready status");
        }

        // Only refresh if socket is not connected
        if (!isConnected) {
          refreshTournamentsDebounced();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update ready status";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [isConnected, refreshTournamentsDebounced],
  );

  // Auto-fetch tournaments on mount and when socket connects
  // Only fetch when user is on a tournament-related page to avoid unnecessary API calls
  useEffect(() => {
    if (!isOnTournamentPage) return;
    // Initial load only once; subsequent updates come from socket events
    void refreshTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, isOnTournamentPage]); // Only re-fetch when socket connection status changes or page changes

  const contextValue: RealtimeTournamentContextValue = {
    tournaments,
    currentTournament,
    setCurrentTournament,
    setCurrentTournamentById,
    isSocketConnected: isConnected,
    connectionError,
    socket,
    createTournament,
    joinTournament,
    leaveTournament,
    startTournament,
    endTournament,
    updateTournamentSettings,
    toggleTournamentRegistrationLock,
    toggleTournamentReady,
    sendTournamentChat,
    refreshTournaments,
    preparation: activePreparation,
    statistics: activeStatistics,
    phases: activePhases,
    realtimeEvents,
    tournamentPresence: activeTournamentId
      ? presenceByTournament[activeTournamentId] || []
      : [],
    getPresenceFor: (tournamentId: string | null) =>
      tournamentId ? presenceByTournament[tournamentId] || [] : [],
    assignedMatchId: assignedMatch?.matchId ?? null,
    assignedOpponentName: assignedMatch?.opponentName ?? null,
    loading,
    error,
    lastUpdated,
  };

  return (
    <RealtimeTournamentContext.Provider value={contextValue}>
      {children}
    </RealtimeTournamentContext.Provider>
  );
}

export function useRealtimeTournaments() {
  const context = useContext(RealtimeTournamentContext);
  if (!context) {
    throw new Error(
      "useRealtimeTournaments must be used within a RealtimeTournamentProvider",
    );
  }
  return context;
}

// Optional hook: returns null if not inside the provider.
// Useful for layouts/pages that may render outside tournaments/ trees.
export function useRealtimeTournamentsOptional() {
  try {
    const context = useContext(RealtimeTournamentContext);
    return context;
  } catch {
    return null;
  }
}
