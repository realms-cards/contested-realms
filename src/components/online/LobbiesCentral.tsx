/*
  (moved) Tournament Matches Modal lives inside the component now.
*/
"use client";

import { RefreshCw, Eye, EyeOff, Phone, Loader2, Check, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { VoiceOutgoingRequest } from "@/app/online/online-context";
import type { TournamentInfo, LobbyInfo } from "@/lib/net/protocol";
import { generateLobbyName } from "@/lib/random-name-generator";

// Check if CPU bots are enabled via environment variable
function isCpuBotsEnabled(): boolean {
  const enabled = process.env.NEXT_PUBLIC_CPU_BOTS_ENABLED;
  return enabled === "1" || enabled === "true";
}

export type CreateLobbyConfig = {
  name: string;
  visibility: "open" | "private";
  maxPlayers: number;
};

type TournamentMatchesResponse = {
  tournament: {
    id: string;
    name: string;
    format: string;
    status: string;
    maxPlayers: number;
  };
  summary: {
    totalMatches: number;
    completedMatches: number;
    pendingMatches: number;
    averageGameCount: number;
    averageDuration: number | null;
  };
  matches: Array<{
    id: string;
    tournamentId: string;
    tournamentName?: string;
    roundNumber: number | null;
    status: string;
    players: Array<{ id: string; name: string; seat: number | null }>;
    winnerId: string | null;
    gameCount: number;
    duration: number | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
};

function TournamentMatchesModal({
  open,
  onClose,
  loading,
  error,
  data,
  myId,
}: {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  data: TournamentMatchesResponse | null;
  myId?: string | null;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-3xl p-5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-base font-semibold">
            {data?.tournament?.name
              ? `Matches – ${data.tournament.name}`
              : "Tournament Matches"}
          </div>
          <button
            className="text-slate-300 hover:text-white text-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {loading && (
          <div className="py-10 text-center text-sm opacity-80">
            Loading matches…
          </div>
        )}
        {!loading && error && (
          <div className="py-6 text-center text-sm text-rose-300">{error}</div>
        )}
        {!loading && !error && data && (
          <div className="space-y-4">
            <div className="text-xs text-slate-300">
              <span className="mr-3">Total: {data.summary.totalMatches}</span>
              <span className="mr-3">
                Completed: {data.summary.completedMatches}
              </span>
              <span className="mr-3">
                Pending: {data.summary.pendingMatches}
              </span>
              <span className="mr-3">
                Avg games: {data.summary.averageGameCount}
              </span>
              {data.summary.averageDuration != null && (
                <span>Avg duration: {data.summary.averageDuration}s</span>
              )}
            </div>
            <div className="max-h-[60vh] overflow-auto pr-1">
              {(() => {
                const groups: Map<
                  number | "Unassigned",
                  TournamentMatchesResponse["matches"]
                > = new Map();
                for (const m of data.matches) {
                  const key = (m.roundNumber ?? "Unassigned") as
                    | number
                    | "Unassigned";
                  const arr = groups.get(key) ?? [];
                  arr.push(m);
                  groups.set(key, arr);
                }
                const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
                  if (a === "Unassigned") return 1;
                  if (b === "Unassigned") return -1;
                  return (a as number) - (b as number);
                });
                return (
                  <div className="space-y-3">
                    {sortedKeys.map((key) => {
                      const group = groups.get(key) ?? [];
                      return (
                        <div
                          key={String(key)}
                          className="border border-slate-700 rounded"
                        >
                          <div className="px-3 py-2 text-xs font-medium bg-slate-800/70">
                            Round {key === "Unassigned" ? "—" : key}
                          </div>
                          <div className="divide-y divide-slate-800">
                            {group.map(
                              (
                                m: TournamentMatchesResponse["matches"][number]
                              ) => (
                                <div
                                  key={m.id}
                                  className="px-3 py-2 text-sm flex items-center justify-between gap-3"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">
                                        {m.players
                                          .map(
                                            (
                                              p: TournamentMatchesResponse["matches"][number]["players"][number]
                                            ) => p.name
                                          )
                                          .join(" vs ")}
                                      </span>
                                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/10 text-white/70 ring-1 ring-white/20">
                                        {m.status}
                                      </span>
                                    </div>
                                    <div className="text-xs opacity-70">
                                      Games: {m.gameCount}{" "}
                                      {m.winnerId
                                        ? `• Winner: ${
                                            m.players.find(
                                              (
                                                p: TournamentMatchesResponse["matches"][number]["players"][number]
                                              ) => p.id === m.winnerId
                                            )?.name ?? "—"
                                          }`
                                        : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-xs text-slate-300 whitespace-nowrap">
                                      {m.startedAt
                                        ? new Date(m.startedAt).toLocaleString()
                                        : ""}
                                    </div>
                                    {/* Offer Join for current player's assignment */}
                                    {myId &&
                                      m.players.some((p) => p.id === myId) && (
                                        <button
                                          className="rounded bg-blue-600/80 hover:bg-blue-600 px-3 py-1 text-xs text-blue-100"
                                          onClick={async () => {
                                            try {
                                              // Compute match type from tournament info without using 'any'
                                              const tRaw =
                                                data?.tournament as unknown;
                                              const tObj =
                                                tRaw && typeof tRaw === "object"
                                                  ? (tRaw as Record<
                                                      string,
                                                      unknown
                                                    >)
                                                  : null;
                                              const tMatchType =
                                                (tObj?.matchType as
                                                  | string
                                                  | undefined) ??
                                                (tObj?.format as
                                                  | string
                                                  | undefined) ??
                                                "constructed";

                                              // Try to get sealed/draft configs from matches payload; fallback to tournament details API
                                              let sealedConfig: unknown =
                                                (
                                                  tObj?.settings as
                                                    | Record<string, unknown>
                                                    | undefined
                                                )?.sealedConfig || null;
                                              let draftConfig: unknown =
                                                (
                                                  tObj?.settings as
                                                    | Record<string, unknown>
                                                    | undefined
                                                )?.draftConfig || null;
                                              if (
                                                !sealedConfig &&
                                                !draftConfig &&
                                                (tObj?.id as string | undefined)
                                              ) {
                                                try {
                                                  const detailRes = await fetch(
                                                    `/api/tournaments/${
                                                      tObj?.id as string
                                                    }`
                                                  );
                                                  if (detailRes.ok) {
                                                    const detail =
                                                      await detailRes.json();
                                                    sealedConfig =
                                                      detail?.settings
                                                        ?.sealedConfig || null;
                                                    draftConfig =
                                                      detail?.settings
                                                        ?.draftConfig || null;
                                                  }
                                                } catch {}
                                              }

                                              // Sensible defaults if server settings absent
                                              if (
                                                tMatchType === "sealed" &&
                                                !sealedConfig
                                              ) {
                                                sealedConfig = {
                                                  packCounts: { Beta: 6 },
                                                  timeLimit: 40,
                                                  replaceAvatars: false,
                                                };
                                              }
                                              if (
                                                tMatchType === "draft" &&
                                                !draftConfig
                                              ) {
                                                draftConfig = {
                                                  setMix: ["Beta"],
                                                  packCount: 3,
                                                  packSize: 15,
                                                  packCounts: { Beta: 3 },
                                                };
                                              }

                                              // Persist bootstrap payload so the play page can initialize the match room
                                              const payload = {
                                                players: m.players.map(
                                                  (p) => p.id
                                                ),
                                                matchType: tMatchType as
                                                  | "constructed"
                                                  | "sealed"
                                                  | "draft",
                                                lobbyName:
                                                  (tObj?.name as
                                                    | string
                                                    | undefined) || undefined,
                                                sealedConfig,
                                                draftConfig,
                                                tournamentId: String(
                                                  tObj?.id || ""
                                                ),
                                              };
                                              localStorage.setItem(
                                                `tournamentMatchBootstrap_${m.id}`,
                                                JSON.stringify(payload)
                                              );
                                              window.location.href = `/online/play/${encodeURIComponent(
                                                m.id
                                              )}`;
                                            } catch {}
                                          }}
                                          title="Join your match"
                                        >
                                          Join Match
                                        </button>
                                      )}
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export type CreateTournamentConfig = {
  name: string;
  format: "swiss" | "elimination" | "round_robin";
  matchType: "constructed" | "sealed" | "draft";
  maxPlayers: number;
  isPrivate?: boolean;
  sealedConfig?: {
    packCounts: Record<string, number>;
    packCount?: number;
    cubeId?: string;
    timeLimit: number;
    replaceAvatars: boolean;
    allowDragonlordChampion?: boolean;
    includeCubeSideboardInStandard?: boolean;
  };
  draftConfig?: {
    setMix: string[];
    packCount: number;
    packSize: number;
    packCounts: Record<string, number>;
    cubeId?: string;
    pickTimeLimit?: number;
    constructionTimeLimit?: number;
    includeCubeSideboardInStandard?: boolean;
    allowDragonlordChampion?: boolean;
  };
};

export default function LobbiesCentral({
  lobbies,
  tournaments,
  myId,
  joinedLobbyId,
  onJoin,
  onCreate,
  // optional lobby actions
  onLeaveLobby,
  onSetLobbyVisibility,
  onResync,
  onAddCpuBot,
  onRemoveCpuBot,
  onCreateTournament,
  onJoinTournament,
  onLeaveTournament,
  onUpdateTournamentSettings,
  onStartTournament,
  onEndTournament,
  onRefresh,
  tournamentsEnabled = true,
  voiceSupport,
}: {
  lobbies: LobbyInfo[];
  tournaments: TournamentInfo[];
  myId: string | null;
  joinedLobbyId: string | null;
  onJoin: (lobbyId: string) => void;
  onCreate: (config: CreateLobbyConfig) => void;
  onLeaveLobby?: () => void;
  onSetLobbyVisibility?: (visibility: "open" | "private") => void;
  onResync?: () => void;
  onAddCpuBot?: (displayName?: string) => void;
  onRemoveCpuBot?: (playerId?: string) => void;
  onCreateTournament?: (config: CreateTournamentConfig) => void;
  onJoinTournament?: (tournamentId: string) => void;
  onLeaveTournament?: (tournamentId: string) => void;
  onUpdateTournamentSettings?: (
    tournamentId: string,
    settings: {
      name?: string;
      format?: "swiss" | "elimination" | "round_robin";
      matchType?: "constructed" | "sealed" | "draft";
      maxPlayers?: number;
    }
  ) => void;
  onToggleTournamentReady?: (tournamentId: string, ready: boolean) => void;
  onStartTournament?: (tournamentId: string) => void;
  onEndTournament?: (tournamentId: string) => void;
  onRefresh: () => void;
  tournamentsEnabled?: boolean;
  voiceSupport?: {
    enabled: boolean;
    outgoingRequest: VoiceOutgoingRequest | null;
    incomingFrom: string | null;
    onRequest: (playerId: string) => void;
    connectedPeerIds?: string[];
  } | null;
}) {
  const [query, setQuery] = useState("");
  const [hideFull, setHideFull] = useState(false);
  const [hideStarted, setHideStarted] = useState(false);
  const [sortKey, setSortKey] = useState<
    "invited" | "playersAsc" | "playersDesc" | "status"
  >("status");
  const [showTournaments, setShowTournaments] = useState(tournamentsEnabled);
  const [showLobbies, setShowLobbies] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingTournament, setEditingTournament] =
    useState<TournamentInfo | null>(null);
  const [endTournamentConfirm, setEndTournamentConfirm] = useState<
    string | null
  >(null);
  const [tournamentOverlayOpen, setTournamentOverlayOpen] = useState(false);
  const [matchesModalOpen, setMatchesModalOpen] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matchesData, setMatchesData] =
    useState<TournamentMatchesResponse | null>(null);

  // Pending states for tournament actions to prevent double clicks and show small loaders
  const [pendingJoinT, setPendingJoinT] = useState<Record<string, boolean>>({});
  const [pendingLeaveT, setPendingLeaveT] = useState<Record<string, boolean>>(
    {}
  );
  const [pendingStartT, setPendingStartT] = useState<Record<string, boolean>>(
    {}
  );

  // Check if user is already engaged in a lobby or tournament
  // IMPORTANT: Use joinedLobbyId as the single source of truth for membership.
  // The global lobbies list can be stale (e.g., leader on another instance) and
  // may incorrectly show this player as present even when they already left.
  const joinedLobby = useMemo(() => {
    return joinedLobbyId
      ? lobbies.find((l) => l.id === joinedLobbyId) || null
      : null;
  }, [lobbies, joinedLobbyId]);
  const isInLobby = joinedLobbyId !== null;
  const joinedTournament = tournaments.find(
    (t) =>
      t.registeredPlayers.some((p) => p.id === myId) && t.status !== "completed"
  );
  const isInTournament = joinedTournament !== undefined;
  const isEngaged = isInLobby || isInTournament;
  const activeVoiceSupport =
    voiceSupport && voiceSupport.enabled ? voiceSupport : null;
  const hasPendingVoiceRequest = activeVoiceSupport?.outgoingRequest
    ? ["sending", "pending"].includes(activeVoiceSupport.outgoingRequest.status)
    : false;
  const [cfgName, setCfgName] = useState<string>("");
  const [cfgVisibility, setCfgVisibility] = useState<"open" | "private">(
    "open"
  );

  // Tournament creation state
  const [tournamentName, setTournamentName] = useState<string>("");
  // Tournament pairing format is always Swiss
  const tournamentFormat = "swiss";
  const [tournamentMatchType, setTournamentMatchType] = useState<
    "constructed" | "sealed" | "draft"
  >("sealed");
  const [tournamentMaxPlayers, setTournamentMaxPlayers] = useState<number>(2);
  const [tournamentIsPrivate, setTournamentIsPrivate] =
    useState<boolean>(false);
  // Tournament pack settings
  // New format: array of set names, one per booster
  const [sealedBoosterCount, setSealedBoosterCount] = useState<number>(6);
  const [sealedBoosters, setSealedBoosters] = useState<string[]>([
    "Beta",
    "Beta",
    "Beta",
    "Beta",
    "Beta",
    "Beta",
  ]);
  const [sealedTimeLimit, setSealedTimeLimit] = useState<number>(40);
  const [sealedReplaceAvatars, setSealedReplaceAvatars] =
    useState<boolean>(false);
  const [sealedAllowDragonlordChampion, setSealedAllowDragonlordChampion] =
    useState<boolean>(true);
  const [sealedUseCube, setSealedUseCube] = useState<boolean>(false);
  const [sealedCubeId, setSealedCubeId] = useState<string>("");
  const [sealedIncludeCubeSideboard, setSealedIncludeCubeSideboard] =
    useState<boolean>(false);
  const [draftBoosterCount, setDraftBoosterCount] = useState<number>(3);
  const [draftBoosters, setDraftBoosters] = useState<string[]>([
    "Beta",
    "Arthurian Legends",
    "Arthurian Legends",
  ]);
  const [draftUseCube, setDraftUseCube] = useState<boolean>(false);
  const [draftCubeId, setDraftCubeId] = useState<string>("");
  const [draftIncludeCubeSideboard, setDraftIncludeCubeSideboard] =
    useState<boolean>(false);
  const [draftAllowDragonlordChampion, setDraftAllowDragonlordChampion] =
    useState<boolean>(true);
  const [draftPickTimeLimit, setDraftPickTimeLimit] = useState<number>(60);
  const [draftConstructionTimeLimit, setDraftConstructionTimeLimit] =
    useState<number>(20);
  const [userCubes, setUserCubes] = useState<
    Array<{ id: string; name: string; cardCount: number }>
  >([]);
  const [loadingCubes, setLoadingCubes] = useState(false);

  // Generate a random name when overlay opens
  const handleOverlayOpen = () => {
    setCfgName(generateLobbyName());
    setOverlayOpen(true);
  };

  const handleTournamentOverlayOpen = () => {
    setTournamentName(generateLobbyName());
    setTournamentOverlayOpen(true);
    // Fetch user's cubes when opening tournament modal
    fetchUserCubes();
  };

  const fetchUserCubes = async () => {
    setLoadingCubes(true);
    try {
      const res = await fetch("/api/cubes");
      if (!res.ok) return;

      const data = await res.json().catch(() => null);

      type CubeSummary = { id: string; name: string; cardCount?: number };

      const raw = data as
        | { myCubes?: CubeSummary[]; publicCubes?: CubeSummary[] }
        | CubeSummary[]
        | null;

      let list: CubeSummary[] = [];
      if (raw && !Array.isArray(raw)) {
        const my = Array.isArray(raw.myCubes) ? raw.myCubes : [];
        const pub = Array.isArray(raw.publicCubes) ? raw.publicCubes : [];
        list = [...my, ...pub];
      } else if (Array.isArray(raw)) {
        list = raw;
      }

      const cubes = list.map((cube) => ({
        id: cube.id,
        name: cube.name,
        cardCount: cube.cardCount ?? 0,
      }));

      setUserCubes(cubes);
    } catch (error) {
      console.error("Failed to fetch cubes:", error);
    } finally {
      setLoadingCubes(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusWeight = (s: string) =>
      s === "open" ? 0 : s === "started" ? 1 : 2;
    const list = lobbies.filter((l) => {
      // Pin the currently joined lobby regardless of filters
      const pinned = joinedLobbyId === l.id;
      // Don't hide the joined lobby even if it's full or started; otherwise apply filters
      if (hideFull && l.players.length >= l.maxPlayers && !pinned) return false;
      if (hideStarted && l.status !== "open" && !pinned) return false;
      if (!q) return true;
      const hostName =
        l.players.find((p) => p.id === l.hostId)?.displayName?.toLowerCase() ||
        "";
      const players = l.players
        .map((p) => p.displayName.toLowerCase())
        .join(" ");
      const lobbyName = l.name?.toLowerCase() || "";
      return (
        l.id.toLowerCase().includes(q) ||
        hostName.includes(q) ||
        players.includes(q) ||
        lobbyName.includes(q)
      );
    });

    list.sort((a, b) => {
      if (a.id === joinedLobbyId) return -1;
      if (b.id === joinedLobbyId) return 1;
      switch (sortKey) {
        case "playersAsc":
          return a.players.length - b.players.length;
        case "playersDesc":
          return b.players.length - a.players.length;
        case "status":
          return statusWeight(a.status) - statusWeight(b.status);
        case "invited":
        default:
          return 0;
      }
    });
    return list;
  }, [lobbies, query, hideFull, hideStarted, sortKey, joinedLobbyId]);

  // Filter tournaments
  const filteredTournaments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tournaments
      .filter((tournament) => {
        // Always exclude completed tournaments from Active Games view
        if (tournament.status === "completed") return false;
        const isJoined = tournament.registeredPlayers.some(
          (p) => p.id === myId
        );
        if (q && !tournament.name.toLowerCase().includes(q)) return false;
        // Don't hide joined tournaments even if they're full or started
        if (
          hideFull &&
          tournament.registeredPlayers.length >= tournament.maxPlayers &&
          !isJoined
        )
          return false;
        if (hideStarted && tournament.status !== "registering" && !isJoined)
          return false;
        return true;
      })
      .sort((a, b) => {
        // Sort by status first (registering before others)
        const statusOrder = {
          registering: 0,
          draft_phase: 1,
          sealed_phase: 1,
          playing: 2,
          completed: 3,
        };
        const aStatus = statusOrder[a.status as keyof typeof statusOrder] ?? 4;
        const bStatus = statusOrder[b.status as keyof typeof statusOrder] ?? 4;
        if (aStatus !== bStatus) return aStatus - bStatus;

        // Then by player count
        return b.registeredPlayers.length - a.registeredPlayers.length;
      });
  }, [tournaments, query, hideFull, hideStarted, myId]);

  async function openMatchesModal(tournamentId: string) {
    setMatchesModalOpen(true);
    setMatchesLoading(true);
    setMatchesError(null);
    setMatchesData(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/matches`);
      if (!res.ok) {
        let errMsg = `Failed to load matches (${res.status})`;
        try {
          const err = await res.json();
          if (typeof err?.error === "string") errMsg = err.error;
        } catch {}
        throw new Error(errMsg);
      }
      const data = (await res.json()) as TournamentMatchesResponse;
      setMatchesData(data);
    } catch (e) {
      setMatchesError(
        e instanceof Error ? e.message : "Failed to load matches"
      );
    } finally {
      setMatchesLoading(false);
    }
  }

  return (
    <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-white">Active Games</div>
          <button
            className="rounded bg-slate-700/80 hover:bg-slate-600 p-1.5 text-[10px]"
            onClick={() => {
              if (onResync) onResync();
              onRefresh();
            }}
            title="Sync"
            aria-label="Sync"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`rounded px-3 py-1 text-xs ${
              isEngaged
                ? "bg-slate-600/50 text-slate-400 cursor-not-allowed"
                : "bg-green-600/80 hover:bg-green-600"
            }`}
            onClick={isEngaged ? undefined : handleOverlayOpen}
            disabled={isEngaged}
            title={
              isEngaged
                ? `Already in ${isInLobby ? "lobby" : "tournament"}`
                : "Create a new match"
            }
          >
            Create Match
          </button>
          {onLeaveLobby && !!joinedLobbyId && (
            <button
              className="rounded px-3 py-1 text-xs bg-red-600/80 hover:bg-red-600 text-white"
              onClick={() => onLeaveLobby()}
              title={`Leave ${
                joinedLobby?.name || joinedLobby?.id || "current lobby"
              }`}
            >
              Leave Lobby
            </button>
          )}
          {onCreateTournament && (
            <button
              className={`rounded px-3 py-1 text-xs font-semibold ${
                isEngaged
                  ? "bg-slate-600/50 text-slate-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              }`}
              onClick={isEngaged ? undefined : handleTournamentOverlayOpen}
              disabled={isEngaged}
              title={
                isEngaged
                  ? `Already in ${isInLobby ? "lobby" : "tournament"}`
                  : "Create a new tournament"
              }
            >
              Create Tournament
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          name="q"
          autoComplete="off"
          role="searchbox"
          inputMode="search"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore="true"
          data-dashlane-ignore="true"
          data-np-ignore="true"
          data-keeper-lock="true"
          className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
          placeholder="Search by name, lobby ID, host, or player"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          title="Sort lobbies"
        >
          <option value="status">Status</option>
          <option value="playersAsc">Players ↑</option>
          <option value="playersDesc">Players ↓</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <button
            className={`text-[11px] px-2 py-0.5 rounded ${
              showLobbies
                ? "bg-blue-600/80 text-white"
                : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
            }`}
            onClick={() => setShowLobbies(!showLobbies)}
            title="Toggle lobbies"
          >
            Lobbies ({filtered.length})
          </button>
          {tournamentsEnabled && (
            <>
              <button
                className={`text-[11px] px-2 py-0.5 rounded ${
                  showTournaments
                    ? "bg-purple-600/80 text-white"
                    : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
                }`}
                onClick={() => setShowTournaments(!showTournaments)}
                title="Toggle tournaments"
              >
                Tournaments ({filteredTournaments.length})
              </button>
              <Link
                href="/tournaments"
                className="text-[11px] px-2 py-0.5 rounded bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 transition-colors"
                title="View all tournaments"
              >
                View All →
              </Link>
            </>
          )}
        </div>
        <label className="text-xs flex items-center gap-1 opacity-80">
          <input
            type="checkbox"
            checked={hideFull}
            onChange={(e) => setHideFull(e.target.checked)}
          />
          Hide full
        </label>
        <label className="text-xs flex items-center gap-1 opacity-80">
          <input
            type="checkbox"
            checked={hideStarted}
            onChange={(e) => setHideStarted(e.target.checked)}
          />
          Hide started/closed
        </label>
      </div>

      <div className="divide-y divide-white/5 rounded-lg overflow-hidden ring-1 ring-white/10">
        {showLobbies &&
          filtered.map((l) => {
            const isMine = joinedLobbyId === l.id; // Source of truth: joinedLobbyId
            const host =
              l.players.find((p) => p.id === l.hostId)?.displayName || "Host";
            const open = l.status === "open";
            const full = l.players.length >= l.maxPlayers;
            return (
              <div
                key={`lobby-${l.id}`}
                className={`flex items-center gap-3 px-3 py-2 bg-black/20 border-l-4 border-blue-500/50 ${
                  isMine ? "ring-1 ring-emerald-500/40 bg-emerald-500/5" : ""
                }`}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600/20 text-blue-300">
                  <span className="text-xs font-bold">L</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-white mb-1 truncate flex items-center gap-2">
                    <span className="truncate">
                      {l.name || "Unnamed Lobby"}
                    </span>
                    {l.plannedMatchType && (
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ring-1 ${
                          l.plannedMatchType === "constructed"
                            ? "bg-slate-600/30 text-slate-200 ring-slate-500/40"
                            : l.plannedMatchType === "sealed"
                            ? "bg-purple-600/15 text-purple-200 ring-purple-500/30"
                            : "bg-indigo-600/15 text-indigo-200 ring-indigo-500/30"
                        }`}
                        title={`Planned: ${l.plannedMatchType}`}
                      >
                        {l.plannedMatchType}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono opacity-50 text-xs truncate">
                      {l.id}
                    </span>
                    {l.status !== "open" && (
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          l.status === "started"
                            ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30"
                            : "bg-white/10 text-white/70 ring-1 ring-white/20"
                        }`}
                      >
                        {l.status}
                      </span>
                    )}
                    {l.visibility && (
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded ring-1 ${
                          l.visibility === "open"
                            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                            : "bg-amber-500/10 text-amber-300 ring-amber-500/30"
                        }`}
                        title={
                          l.visibility === "open"
                            ? "Open lobby"
                            : "Private lobby"
                        }
                      >
                        {l.visibility === "open" ? (
                          <Eye className="w-3 h-3" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                      </span>
                    )}
                    <span className="opacity-70">•</span>
                    <span className="opacity-90">Host: {host}</span>
                    <span className="opacity-70">•</span>
                    <span className="opacity-90">
                      Players: {l.players.length}/{l.maxPlayers}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {l.players.length === 0 && (
                      <span className="text-xs opacity-70">No players yet</span>
                    )}
                    {l.players.map((p) => {
                      const isReady = (l.readyPlayerIds || []).includes(p.id);
                      const isHostP = p.id === l.hostId;
                      const isYou = !!myId && p.id === myId;
                      const voiceActive = !!activeVoiceSupport && isMine;
                      const outgoingForPlayer =
                        voiceActive &&
                        activeVoiceSupport?.outgoingRequest?.targetId === p.id
                          ? activeVoiceSupport.outgoingRequest
                          : null;
                      const incomingFromThisPlayer =
                        voiceActive &&
                        activeVoiceSupport?.incomingFrom === p.id;
                      const isAlreadyConnected =
                        voiceActive &&
                        (activeVoiceSupport?.connectedPeerIds ?? []).includes(
                          p.id
                        );
                      const buttonDisabled =
                        !voiceActive ||
                        isYou ||
                        isAlreadyConnected ||
                        (outgoingForPlayer
                          ? ["sending", "pending"].includes(
                              outgoingForPlayer.status
                            )
                          : hasPendingVoiceRequest);

                      let statusLabel: ReactNode = null;
                      if (isAlreadyConnected) {
                        statusLabel = (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                            <Phone className="h-3 w-3" />
                            Connected
                          </span>
                        );
                      } else if (outgoingForPlayer) {
                        switch (outgoingForPlayer.status) {
                          case "sending":
                            statusLabel = (
                              <span className="inline-flex items-center gap-1 text-[10px] text-sky-300">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Sending
                              </span>
                            );
                            break;
                          case "pending":
                            statusLabel = (
                              <span className="inline-flex items-center gap-1 text-[10px] text-sky-300">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Pending
                              </span>
                            );
                            break;
                          case "accepted":
                            statusLabel = (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                                <Check className="h-3 w-3" />
                                Accepted
                              </span>
                            );
                            break;
                          case "declined":
                            statusLabel = (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-300">
                                <X className="h-3 w-3" />
                                Declined
                              </span>
                            );
                            break;
                          case "cancelled":
                            statusLabel = (
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                <X className="h-3 w-3" />
                                Cancelled
                              </span>
                            );
                            break;
                          default:
                            break;
                        }
                      } else if (incomingFromThisPlayer) {
                        statusLabel = (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-200">
                            <Phone className="h-3 w-3" />
                            Incoming
                          </span>
                        );
                      }

                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-2 text-[11px] px-1.5 py-0.5 rounded ring-1 ${
                            isReady
                              ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                              : "bg-slate-800/60 text-slate-300 ring-slate-700/60"
                          }`}
                          title={`${p.displayName}${isYou ? " • You" : ""}${
                            isHostP ? " • Host" : ""
                          }${isReady ? " • Ready" : " • Not ready"}`}
                        >
                          <span>{p.displayName}</span>
                          {isYou && (
                            <span className="text-[10px] uppercase tracking-wide text-slate-300">
                              You
                            </span>
                          )}
                          {isHostP && (
                            <span className="text-[10px] uppercase tracking-wide text-indigo-300">
                              Host
                            </span>
                          )}
                          {voiceActive && !isYou && (
                            <button
                              type="button"
                              className={`inline-flex items-center justify-center rounded bg-blue-600/70 px-1.5 py-0.5 text-[10px] text-white transition ${
                                buttonDisabled
                                  ? "opacity-40 cursor-not-allowed"
                                  : "hover:bg-blue-600"
                              }`}
                              onClick={() =>
                                activeVoiceSupport?.onRequest(p.id)
                              }
                              disabled={buttonDisabled}
                              title={
                                buttonDisabled
                                  ? outgoingForPlayer
                                    ? "Voice request pending"
                                    : isAlreadyConnected
                                    ? `${p.displayName} is already connected`
                                    : "Complete or cancel your current voice request first"
                                  : `Request voice chat with ${p.displayName}`
                              }
                            >
                              <Phone className="h-3 w-3" />
                            </button>
                          )}
                          {statusLabel}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isMine ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="rounded px-3 py-1 text-xs bg-green-600/70 text-green-100">
                          Ready!
                        </span>
                        {myId && l.hostId !== myId && l.status === "open" && (
                          <span className="rounded-full px-3 py-1 text-[10px] bg-slate-700/80 text-slate-100">
                            Waiting for host to start match
                          </span>
                        )}
                      </div>
                      {onSetLobbyVisibility && myId && l.hostId === myId && (
                        <button
                          className="ml-1 rounded bg-slate-700 hover:bg-slate-600 p-1.5 text-xs"
                          onClick={() =>
                            onSetLobbyVisibility(
                              l.visibility === "open" ? "private" : "open"
                            )
                          }
                          title={
                            l.visibility === "open"
                              ? "Set lobby to private"
                              : "Set lobby to open"
                          }
                          aria-label="Toggle lobby visibility"
                        >
                          {l.visibility === "open" ? (
                            <Eye className="w-3 h-3" />
                          ) : (
                            <EyeOff className="w-3 h-3" />
                          )}
                        </button>
                      )}
                      {onAddCpuBot &&
                        myId &&
                        l.hostId === myId &&
                        isCpuBotsEnabled() && (
                          <button
                            className="ml-1 rounded bg-indigo-600/80 hover:bg-indigo-600 px-3 py-1 text-xs disabled:opacity-40"
                            onClick={() => onAddCpuBot("CPU Easy")}
                            disabled={
                              !(l.status === "open") ||
                              l.players.length >= l.maxPlayers
                            }
                            title={
                              l.players.length >= l.maxPlayers
                                ? "Lobby is full"
                                : "Add a CPU bot to this lobby"
                            }
                          >
                            Add CPU Bot
                          </button>
                        )}

                      {onRemoveCpuBot &&
                        myId &&
                        l.hostId === myId &&
                        isCpuBotsEnabled() && (
                          <button
                            className="ml-1 rounded bg-rose-600/80 hover:bg-rose-600 px-3 py-1 text-xs disabled:opacity-40"
                            onClick={() => onRemoveCpuBot()}
                            disabled={
                              !l.players.some((p) => p.id.startsWith("cpu_"))
                            }
                            title="Remove a CPU bot from this lobby"
                          >
                            Remove CPU Bot
                          </button>
                        )}

                      <button
                        className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs"
                        onClick={() => {
                          try {
                            if (navigator.clipboard)
                              void navigator.clipboard.writeText(l.id);
                          } catch {}
                        }}
                        title="Copy lobby ID"
                      >
                        Copy ID
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      {l.status === "started" &&
                        l.matchId &&
                        l.visibility === "open" && (
                          <Link
                            href={`/online/play/${encodeURIComponent(
                              l.matchId
                            )}?watch=true`}
                            className="rounded bg-blue-600/80 hover:bg-blue-600 px-3 py-1 text-xs text-blue-100"
                            title="Watch this match as a spectator"
                          >
                            Spectate
                          </Link>
                        )}
                      <button
                        className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-xs disabled:opacity-40"
                        onClick={() => onJoin(l.id)}
                        disabled={
                          !open || full || (isEngaged && l.id !== joinedLobbyId)
                        }
                        title={
                          !open
                            ? "Lobby not open"
                            : full
                            ? "Lobby is full"
                            : isEngaged
                            ? `Already in ${
                                isInLobby ? "another lobby" : "tournament"
                              }`
                            : "Join lobby"
                        }
                      >
                        {full ? "Full" : "Join"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {tournamentsEnabled &&
          showTournaments &&
          filteredTournaments.map((tournament) => {
            const isRegistered = tournament.registeredPlayers.some(
              (p) => p.id === myId
            );
            const myRegistration = tournament.registeredPlayers.find(
              (p) => p.id === myId
            );
            const isReady = myRegistration?.ready || false;
            // Consider a deck submitted when the API marks deckSubmitted (preferred) or when the player is ready
            const hasSubmitted = (() => {
              if (!myRegistration) return false;
              const maybe = myRegistration as typeof myRegistration & {
                deckSubmitted?: boolean;
              };
              return Boolean(maybe.deckSubmitted || isReady);
            })();
            const canJoin =
              tournament.status === "registering" &&
              !isRegistered &&
              tournament.registeredPlayers.length < tournament.maxPlayers &&
              !isEngaged;
            const allPlayersReady =
              tournament.registeredPlayers.length >= 2 &&
              tournament.registeredPlayers.every((p) => p.ready);
            const canStart =
              tournament.creatorId === myId &&
              tournament.status === "registering" &&
              allPlayersReady;
            const statusColors = {
              registering: "text-green-400",
              draft_phase: "text-blue-400",
              sealed_phase: "text-blue-400",
              playing: "text-yellow-400",
              completed: "text-slate-400",
            };
            const statusColor =
              statusColors[tournament.status as keyof typeof statusColors] ||
              "text-slate-400";

            return (
              <div
                key={`tournament-${tournament.id}`}
                className={`flex items-center gap-3 px-3 py-2 bg-black/20 border-l-4 border-purple-500/50 ${
                  isRegistered
                    ? "ring-1 ring-purple-500/40 bg-purple-500/5"
                    : ""
                }`}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-600/20 text-purple-300">
                  <span className="text-xs font-bold">T</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-bold text-white mb-1 truncate">
                    {tournament.name}
                  </div>
                  <div className="text-xs text-slate-300 space-y-1">
                    <div>
                      Format: {tournament.format} • Type: {tournament.matchType}
                    </div>
                    <div>
                      Players: {tournament.registeredPlayers.length}/
                      {tournament.maxPlayers} • Round: {tournament.currentRound}
                      /{tournament.totalRounds}
                    </div>
                    <div className={statusColor}>
                      Status: {tournament.status.replace("_", " ")}
                    </div>
                    {isRegistered && tournament.status === "registering" && (
                      <div
                        className={
                          isReady ? "text-green-400" : "text-yellow-400"
                        }
                      >
                        You: {isReady ? "Ready" : "Not Ready"}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canJoin && onJoinTournament && (
                    <button
                      className={`rounded px-3 py-1 text-xs ${
                        pendingJoinT[tournament.id]
                          ? "bg-slate-600/60 cursor-not-allowed"
                          : "bg-purple-600/80 hover:bg-purple-600"
                      } text-white`}
                      onClick={async () => {
                        if (pendingJoinT[tournament.id]) return;
                        setPendingJoinT((m) => ({
                          ...m,
                          [tournament.id]: true,
                        }));
                        try {
                          await Promise.resolve(
                            onJoinTournament(tournament.id)
                          );
                          if (onRefresh) onRefresh();
                        } finally {
                          setPendingJoinT((m) => ({
                            ...m,
                            [tournament.id]: false,
                          }));
                        }
                      }}
                      disabled={pendingJoinT[tournament.id]}
                    >
                      {pendingJoinT[tournament.id] ? "Joining…" : "Join"}
                    </button>
                  )}
                  {isRegistered &&
                    tournament.status === "registering" &&
                    onLeaveTournament && (
                      <button
                        className={`rounded px-3 py-1 text-xs ${
                          pendingLeaveT[tournament.id]
                            ? "bg-slate-600/60 cursor-not-allowed"
                            : "bg-red-600/80 hover:bg-red-600"
                        } text-white`}
                        onClick={async () => {
                          if (pendingLeaveT[tournament.id]) return;
                          setPendingLeaveT((m) => ({
                            ...m,
                            [tournament.id]: true,
                          }));
                          try {
                            await Promise.resolve(
                              onLeaveTournament(tournament.id)
                            );
                            if (onRefresh) onRefresh();
                          } finally {
                            setPendingLeaveT((m) => ({
                              ...m,
                              [tournament.id]: false,
                            }));
                          }
                        }}
                        disabled={pendingLeaveT[tournament.id]}
                      >
                        {pendingLeaveT[tournament.id] ? "Leaving…" : "Leave"}
                      </button>
                    )}
                  {tournament.creatorId === myId &&
                    tournament.status === "registering" &&
                    onUpdateTournamentSettings && (
                      <button
                        className="rounded bg-blue-600/80 hover:bg-blue-600 px-3 py-1 text-xs"
                        onClick={() => {
                          setEditingTournament(tournament);
                          setSettingsModalOpen(true);
                        }}
                      >
                        Settings
                      </button>
                    )}
                  {isRegistered && tournament.status === "registering" && (
                    <Link
                      href={`/tournaments/${tournament.id}`}
                      className="rounded px-3 py-1 text-xs bg-blue-600/80 hover:bg-blue-600 text-white font-medium transition-colors"
                      title="Go to tournament page to see details and participate in drafts"
                    >
                      View Tournament →
                    </Link>
                  )}
                  {canStart && onStartTournament && (
                    <button
                      className={`rounded px-3 py-1 text-xs text-white font-medium ${
                        pendingStartT[tournament.id]
                          ? "bg-slate-600/60 cursor-not-allowed"
                          : "bg-blue-600/80 hover:bg-blue-600"
                      }`}
                      onClick={async () => {
                        if (pendingStartT[tournament.id]) return;
                        setPendingStartT((m) => ({
                          ...m,
                          [tournament.id]: true,
                        }));
                        try {
                          await Promise.resolve(
                            onStartTournament(tournament.id)
                          );
                          if (onRefresh) onRefresh();
                        } finally {
                          setPendingStartT((m) => ({
                            ...m,
                            [tournament.id]: false,
                          }));
                        }
                      }}
                      disabled={pendingStartT[tournament.id]}
                    >
                      {pendingStartT[tournament.id]
                        ? "Starting…"
                        : "Start Tournament"}
                    </button>
                  )}
                  {tournament.creatorId === myId &&
                    tournament.status !== "completed" &&
                    onEndTournament && (
                      <button
                        className="rounded bg-red-600/80 hover:bg-red-600 px-3 py-1 text-xs"
                        onClick={() => setEndTournamentConfirm(tournament.id)}
                      >
                        End Tournament
                      </button>
                    )}
                  {isRegistered && tournament.status === "draft_phase" && (
                    <button
                      className="rounded bg-blue-600/80 hover:bg-blue-600 px-3 py-1 text-xs text-blue-100"
                      onClick={() =>
                        (window.location.href = `/tournaments/${tournament.id}/draft`)
                      }
                    >
                      Enter Draft
                    </button>
                  )}
                  {isRegistered &&
                    tournament.status === "sealed_phase" &&
                    (hasSubmitted ? (
                      <span
                        className="rounded px-3 py-1 text-xs bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-500/30 cursor-not-allowed"
                        title="Deck submitted to tournament"
                      >
                        Deck Submitted ✓
                      </span>
                    ) : (
                      <button
                        className="rounded bg-green-600/80 hover:bg-green-600 px-3 py-1 text-xs text-green-100"
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
                            // Persist generated packs for the editor (if provided)
                            const packs = data?.preparationData?.sealed
                              ?.generatedPacks as
                              | Array<{
                                  packId: string;
                                  setId: string;
                                  cards: unknown[];
                                }>
                              | undefined;
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
                              } catch {}
                            }
                          } catch (e) {
                            console.warn("Failed to start preparation:", e);
                          }
                          const cfg =
                            (
                              tournament as unknown as {
                                settings?: {
                                  sealedConfig?: {
                                    packCounts?: Record<string, number>;
                                    timeLimit?: number;
                                    replaceAvatars?: boolean;
                                    allowDragonlordChampion?: boolean;
                                  };
                                };
                              }
                            ).settings?.sealedConfig || {};
                          const packCount =
                            Object.values(cfg.packCounts || { Beta: 6 }).reduce(
                              (a, b) => a + (b || 0),
                              0
                            ) || 6;
                          const setMix = Object.entries(
                            cfg.packCounts || { Beta: 6 }
                          )
                            .filter(([, c]) => (c || 0) > 0)
                            .map(([s]) => s);
                          const timeLimit = cfg.timeLimit ?? 40;
                          const replaceAvatars = cfg.replaceAvatars ?? false;
                          const allowDragonlordChampion =
                            cfg.allowDragonlordChampion ?? true;
                          const params = new URLSearchParams({
                            sealed: "true",
                            tournament: tournament.id,
                            packCount: String(packCount),
                            setMix: setMix.join(","),
                            timeLimit: String(timeLimit),
                            constructionStartTime: String(Date.now()),
                            replaceAvatars: String(replaceAvatars),
                            allowDragonlordChampion: String(
                              allowDragonlordChampion
                            ),
                            matchName: tournament.name,
                          });
                          window.location.href = `/decks/editor-3d?${params.toString()}`;
                        }}
                      >
                        Build Deck
                      </button>
                    ))}
                  {isRegistered && tournament.status === "playing" && (
                    <button
                      className="rounded bg-orange-600/80 hover:bg-orange-600 px-3 py-1 text-xs text-orange-100"
                      onClick={() => openMatchesModal(tournament.id)}
                    >
                      View Matches
                    </button>
                  )}
                  {isRegistered && tournament.status === "completed" && (
                    <div className="rounded bg-slate-600/20 px-3 py-1 text-xs text-slate-400">
                      Completed
                    </div>
                  )}
                  {tournament.status === "registering" &&
                    !isRegistered &&
                    tournament.registeredPlayers.length >=
                      tournament.maxPlayers && (
                      <div className="rounded bg-slate-600/20 px-3 py-1 text-xs text-slate-400">
                        Full
                      </div>
                    )}
                  {tournament.status === "registering" &&
                    !isRegistered &&
                    tournament.registeredPlayers.length <
                      tournament.maxPlayers &&
                    isEngaged && (
                      <div className="rounded bg-slate-600/20 px-3 py-1 text-xs text-slate-400">
                        In {isInLobby ? "Lobby" : "Tournament"}
                      </div>
                    )}
                  {tournament.status !== "registering" && !isRegistered && (
                    <div className="rounded bg-slate-600/20 px-3 py-1 text-xs text-slate-400">
                      Started
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {showLobbies &&
          showTournaments &&
          filtered.length === 0 &&
          filteredTournaments.length === 0 && (
            <div className="px-3 py-8 text-center text-sm opacity-60">
              No games match your filters.
            </div>
          )}
        {showLobbies && !showTournaments && filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-sm opacity-60">
            No lobbies match your filters.
          </div>
        )}
        {tournamentsEnabled &&
          !showLobbies &&
          showTournaments &&
          filteredTournaments.length === 0 && (
            <div className="px-3 py-8 text-center text-sm opacity-60">
              No tournaments match your filters.
            </div>
          )}
        {!showLobbies && !(tournamentsEnabled && showTournaments) && (
          <div className="px-3 py-8 text-center text-sm opacity-60">
            Select lobby or tournament filters to view games.
          </div>
        )}
      </div>

      {overlayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOverlayOpen(false)}
          />
          <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Create Match</div>
              <button
                className="text-slate-300 hover:text-white text-sm"
                onClick={() => setOverlayOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2">
                  Match Name *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cfgName}
                    onChange={(e) => setCfgName(e.target.value)}
                    className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                    placeholder="Enter match name"
                    maxLength={50}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setCfgName(generateLobbyName())}
                    className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-xs transition-colors"
                    title="Generate random name"
                  >
                    🎲
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-2">
                  Visibility
                </label>
                <div className="flex gap-2">
                  <button
                    className={`px-3 py-2 text-sm rounded transition-colors ${
                      cfgVisibility === "open"
                        ? "bg-emerald-600/80 text-white"
                        : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                    }`}
                    onClick={() => setCfgVisibility("open")}
                  >
                    Open
                  </button>
                  <button
                    className={`px-3 py-2 text-sm rounded transition-colors ${
                      cfgVisibility === "private"
                        ? "bg-amber-600/80 text-white"
                        : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                    }`}
                    onClick={() => setCfgVisibility("private")}
                  >
                    Private
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-2">
                  Max Players
                </label>
                <input
                  type="number"
                  value={2}
                  disabled
                  aria-disabled
                  title="Currently limited to two players"
                  className="w-24 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm opacity-60 cursor-not-allowed"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm"
                  onClick={() => setOverlayOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 px-4 py-1.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!cfgName.trim()}
                  onClick={() => {
                    const trimmedName = cfgName.trim();
                    if (trimmedName) {
                      onCreate({
                        name: trimmedName,
                        visibility: cfgVisibility,
                        maxPlayers: 2,
                      });
                      setOverlayOpen(false);
                    }
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tournament Creation Overlay */}
      {tournamentsEnabled && tournamentOverlayOpen && onCreateTournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setTournamentOverlayOpen(false)}
          />
          <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Create Tournament</div>
              <button
                className="text-slate-300 hover:text-white text-sm"
                onClick={() => setTournamentOverlayOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2">
                  Tournament Name *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tournamentName}
                    onChange={(e) => setTournamentName(e.target.value)}
                    className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                    placeholder="Enter tournament name"
                    maxLength={50}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setTournamentName(generateLobbyName())}
                    className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-xs transition-colors"
                    title="Generate random name"
                  >
                    🎲
                  </button>
                </div>
              </div>
              {/* Private Tournament Toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tournamentIsPrivate}
                    onChange={(e) => setTournamentIsPrivate(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600"
                  />
                  <span className="text-xs">
                    Private tournament (invite-only)
                  </span>
                </label>
                {tournamentIsPrivate && (
                  <p className="text-slate-400 text-xs mt-1 ml-6">
                    Only invited players can see and join
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium mb-2">
                  Match Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["constructed", "sealed", "draft"].map((type) => (
                    <button
                      key={type}
                      className={`px-3 py-2 text-xs rounded transition-colors ${
                        tournamentMatchType === type
                          ? "bg-purple-600/80 text-white"
                          : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                      }`}
                      onClick={() =>
                        setTournamentMatchType(
                          type as "constructed" | "sealed" | "draft"
                        )
                      }
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {tournamentMatchType === "sealed" && (
                <div className="space-y-3 mt-2">
                  {/* Cube sealed toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sealedUseCube}
                      onChange={(e) => setSealedUseCube(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600"
                    />
                    <span className="text-xs">Use Cube for sealed</span>
                  </label>

                  {!sealedUseCube && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-medium">Booster Count</div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const newCount = Math.max(
                                1,
                                sealedBoosterCount - 1
                              );
                              setSealedBoosterCount(newCount);
                              setSealedBoosters((prev) =>
                                prev.slice(0, newCount)
                              );
                            }}
                            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-semibold">
                            {sealedBoosterCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const newCount = Math.min(
                                10,
                                sealedBoosterCount + 1
                              );
                              setSealedBoosterCount(newCount);
                              setSealedBoosters((prev) => [
                                ...prev,
                                ...Array(newCount - prev.length).fill("Beta"),
                              ]);
                            }}
                            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {sealedBoosters.map((setName, idx) => (
                          <div
                            key={`sealed-booster-${idx}`}
                            className="flex items-center gap-2"
                          >
                            <div className="text-xs text-slate-400 w-16">
                              Pack {idx + 1}
                            </div>
                            <select
                              value={setName}
                              onChange={(e) => {
                                setSealedBoosters((prev) => {
                                  const next = [...prev];
                                  next[idx] = e.target.value;
                                  return next;
                                });
                              }}
                              className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-xs"
                            >
                              <option value="Beta">Beta</option>
                              <option value="Arthurian Legends">
                                Arthurian Legends
                              </option>
                              <option value="Alpha">Alpha</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {sealedUseCube && (
                    <>
                      <div>
                        <label className="block text-xs opacity-80 mb-1">
                          Select Cube
                        </label>
                        {loadingCubes ? (
                          <div className="text-xs text-slate-400 py-2">
                            Loading cubes...
                          </div>
                        ) : userCubes.length === 0 ? (
                          <div className="text-xs text-slate-400 py-2">
                            No cubes found. Create a cube first to use for
                            sealed.
                          </div>
                        ) : (
                          <select
                            value={sealedCubeId}
                            onChange={(e) => setSealedCubeId(e.target.value)}
                            className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                          >
                            <option value="">-- Select a cube --</option>
                            {userCubes.map((cube) => (
                              <option key={cube.id} value={cube.id}>
                                {cube.name} ({cube.cardCount} cards)
                              </option>
                            ))}
                          </select>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          Choose one of your cubes for this sealed tournament
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-medium">Pack Count</div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSealedBoosterCount((c) => Math.max(1, c - 1))
                            }
                            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-semibold">
                            {sealedBoosterCount}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSealedBoosterCount((c) => Math.min(10, c + 1))
                            }
                            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <label className="mt-2 flex items-start gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 w-3 h-3 rounded border-slate-600 bg-slate-700 text-blue-600"
                          checked={sealedIncludeCubeSideboard}
                          onChange={(e) =>
                            setSealedIncludeCubeSideboard(e.target.checked)
                          }
                        />
                        <span>
                          Include cube&apos;s sideboard cards in the standard
                          card pool during deckbuilding.
                        </span>
                      </label>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs opacity-80 mb-1">
                        Time Limit (min)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={90}
                        value={sealedTimeLimit}
                        onChange={(e) =>
                          setSealedTimeLimit(
                            Math.max(
                              10,
                              Math.min(90, parseInt(e.target.value) || 40)
                            )
                          )
                        }
                        className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <label
                      className="flex items-center gap-2 text-xs mt-5 cursor-pointer"
                      title="When enabled, boosters replace the 'guaranteed avatar' slot with another random card (more variety, but no guaranteed avatar per pack)"
                    >
                      <input
                        type="checkbox"
                        checked={sealedReplaceAvatars}
                        onChange={(e) =>
                          setSealedReplaceAvatars(e.target.checked)
                        }
                      />
                      <span>
                        No guaranteed avatar
                        <span className="text-slate-400 ml-1">
                          (random cards instead)
                        </span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-xs mt-2">
                      <input
                        type="checkbox"
                        checked={sealedAllowDragonlordChampion}
                        onChange={(e) =>
                          setSealedAllowDragonlordChampion(e.target.checked)
                        }
                      />
                      Allow Dragonlord Champion
                    </label>
                  </div>
                </div>
              )}
              {tournamentMatchType === "draft" && (
                <div className="space-y-3 mt-2">
                  {/* Cube draft toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftUseCube}
                      onChange={(e) => setDraftUseCube(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600"
                    />
                    <span className="text-xs">Use Cube for draft</span>
                  </label>

                  {!draftUseCube && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-medium">Booster Count</div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const newCount = Math.max(
                                1,
                                draftBoosterCount - 1
                              );
                              setDraftBoosterCount(newCount);
                              setDraftBoosters((prev) =>
                                prev.slice(0, newCount)
                              );
                            }}
                            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-xs font-semibold">
                            {draftBoosterCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const newCount = Math.min(
                                5,
                                draftBoosterCount + 1
                              );
                              setDraftBoosterCount(newCount);
                              setDraftBoosters((prev) => [
                                ...prev,
                                ...Array(newCount - prev.length).fill(
                                  "Arthurian Legends"
                                ),
                              ]);
                            }}
                            className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {draftBoosters.map((setName, idx) => (
                          <div
                            key={`draft-booster-${idx}`}
                            className="flex items-center gap-2"
                          >
                            <div className="text-xs text-slate-400 w-16">
                              Pack {idx + 1}
                            </div>
                            <select
                              value={setName}
                              onChange={(e) => {
                                setDraftBoosters((prev) => {
                                  const next = [...prev];
                                  next[idx] = e.target.value;
                                  return next;
                                });
                              }}
                              className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-xs"
                            >
                              <option value="Beta">Beta</option>
                              <option value="Arthurian Legends">
                                Arthurian Legends
                              </option>
                              <option value="Alpha">Alpha</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {draftUseCube && (
                    <>
                      <div>
                        <label className="block text-xs opacity-80 mb-1">
                          Select Cube
                        </label>
                        {loadingCubes ? (
                          <div className="text-xs text-slate-400 py-2">
                            Loading cubes...
                          </div>
                        ) : userCubes.length === 0 ? (
                          <div className="text-xs text-slate-400 py-2">
                            No cubes found. Create a cube first to use for
                            drafting.
                          </div>
                        ) : (
                          <select
                            value={draftCubeId}
                            onChange={(e) => setDraftCubeId(e.target.value)}
                            className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                          >
                            <option value="">-- Select a cube --</option>
                            {userCubes.map((cube) => (
                              <option key={cube.id} value={cube.id}>
                                {cube.name} ({cube.cardCount} cards)
                              </option>
                            ))}
                          </select>
                        )}
                        <p className="text-xs text-slate-400 mt-1">
                          Choose one of your cubes for this draft tournament
                        </p>
                      </div>
                      <label className="mt-2 flex items-start gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 w-3 h-3 rounded border-slate-600 bg-slate-700 text-blue-600"
                          checked={draftIncludeCubeSideboard}
                          onChange={(e) =>
                            setDraftIncludeCubeSideboard(e.target.checked)
                          }
                        />
                        <span>
                          When drafting from a cube, offer the cube&apos;s
                          sideboard cards in the standard card pool during
                          deckbuilding.
                        </span>
                      </label>
                    </>
                  )}

                  {/* Draft Time Limits */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <label className="block text-xs opacity-80 mb-1">
                        Pick Time Limit (sec)
                      </label>
                      <input
                        type="number"
                        min={30}
                        max={300}
                        step={15}
                        value={draftPickTimeLimit}
                        onChange={(e) =>
                          setDraftPickTimeLimit(
                            Math.max(
                              30,
                              Math.min(300, parseInt(e.target.value) || 60)
                            )
                          )
                        }
                        className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs opacity-80 mb-1">
                        Construction Time (min)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={60}
                        step={5}
                        value={draftConstructionTimeLimit}
                        onChange={(e) =>
                          setDraftConstructionTimeLimit(
                            Math.max(
                              10,
                              Math.min(60, parseInt(e.target.value) || 20)
                            )
                          )
                        }
                        className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs mt-3">
                    <input
                      type="checkbox"
                      checked={draftAllowDragonlordChampion}
                      onChange={(e) =>
                        setDraftAllowDragonlordChampion(e.target.checked)
                      }
                    />
                    Allow Dragonlord Champion
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium mb-2">
                  Max Players
                </label>
                <select
                  value={tournamentMaxPlayers}
                  onChange={(e) =>
                    setTournamentMaxPlayers(parseInt(e.target.value))
                  }
                  className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm"
                >
                  <option value={2}>2 Players</option>
                  <option value={4}>4 Players</option>
                  <option value={8}>8 Players</option>
                  <option value={16}>16 Players</option>
                  <option value={32}>32 Players</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm"
                onClick={() => setTournamentOverlayOpen(false)}
              >
                Cancel
              </button>
              <button
                className="rounded bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                disabled={
                  !tournamentName.trim() ||
                  (tournamentMatchType === "draft" &&
                    draftUseCube &&
                    !draftCubeId) ||
                  (tournamentMatchType === "sealed" &&
                    sealedUseCube &&
                    !sealedCubeId)
                }
                onClick={() => {
                  const trimmedName = tournamentName.trim();
                  if (trimmedName) {
                    // Validate cube selection if using cube mode
                    if (
                      tournamentMatchType === "draft" &&
                      draftUseCube &&
                      !draftCubeId
                    ) {
                      alert("Please select a cube for the draft tournament");
                      return;
                    }
                    if (
                      tournamentMatchType === "sealed" &&
                      sealedUseCube &&
                      !sealedCubeId
                    ) {
                      alert("Please select a cube for the sealed tournament");
                      return;
                    }
                    const payload: CreateTournamentConfig = {
                      name: trimmedName,
                      format: tournamentFormat,
                      matchType: tournamentMatchType,
                      maxPlayers: tournamentMaxPlayers,
                      isPrivate: tournamentIsPrivate,
                    };
                    if (tournamentMatchType === "sealed") {
                      if (sealedUseCube && sealedCubeId) {
                        // Cube sealed mode
                        payload.sealedConfig = {
                          packCounts: {},
                          packCount: sealedBoosterCount,
                          cubeId: sealedCubeId,
                          timeLimit: sealedTimeLimit,
                          replaceAvatars: sealedReplaceAvatars,
                          allowDragonlordChampion:
                            sealedAllowDragonlordChampion,
                          includeCubeSideboardInStandard:
                            sealedIncludeCubeSideboard,
                        };
                      } else {
                        // Convert booster array to packCounts format
                        const packCounts: Record<string, number> = {};
                        sealedBoosters.forEach((setName) => {
                          packCounts[setName] = (packCounts[setName] || 0) + 1;
                        });
                        payload.sealedConfig = {
                          packCounts,
                          timeLimit: sealedTimeLimit,
                          replaceAvatars: sealedReplaceAvatars,
                          allowDragonlordChampion:
                            sealedAllowDragonlordChampion,
                        };
                      }
                    } else if (tournamentMatchType === "draft") {
                      if (draftUseCube && draftCubeId) {
                        // Cube draft mode
                        payload.draftConfig = {
                          setMix: [],
                          packCount: draftBoosterCount,
                          packSize: 15,
                          packCounts: {},
                          cubeId: draftCubeId,
                          pickTimeLimit: draftPickTimeLimit,
                          constructionTimeLimit: draftConstructionTimeLimit,
                          includeCubeSideboardInStandard:
                            draftIncludeCubeSideboard,
                          allowDragonlordChampion: draftAllowDragonlordChampion,
                        };
                      } else {
                        // Convert booster array to packCounts format
                        const packCounts: Record<string, number> = {};
                        draftBoosters.forEach((setName) => {
                          packCounts[setName] = (packCounts[setName] || 0) + 1;
                        });
                        const mix = Object.keys(packCounts);
                        payload.draftConfig = {
                          setMix: mix.length ? mix : ["Beta"],
                          packCount: draftBoosterCount,
                          packSize: 15,
                          packCounts,
                          pickTimeLimit: draftPickTimeLimit,
                          constructionTimeLimit: draftConstructionTimeLimit,
                          allowDragonlordChampion: draftAllowDragonlordChampion,
                        };
                      }
                    }
                    onCreateTournament(payload);
                    setTournamentOverlayOpen(false);
                  }
                }}
              >
                Create Tournament
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tournament Settings Modal */}
      {tournamentsEnabled && settingsModalOpen && editingTournament && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">
                Tournament Settings
              </h3>

              <TournamentSettingsForm
                tournament={editingTournament}
                onSave={(settings) => {
                  if (onUpdateTournamentSettings) {
                    onUpdateTournamentSettings(editingTournament.id, settings);
                  }
                  setSettingsModalOpen(false);
                  setEditingTournament(null);
                }}
                onCancel={() => {
                  setSettingsModalOpen(false);
                  setEditingTournament(null);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* End Tournament Confirmation Modal */}
      {tournamentsEnabled && endTournamentConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-lg border border-slate-700 w-full max-w-md">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">
                End Tournament
              </h3>
              <p className="text-slate-300 mb-6">
                Are you sure you want to end this tournament? This action cannot
                be undone and will complete the tournament immediately.
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setEndTournamentConfirm(null)}
                  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (onEndTournament && endTournamentConfirm) {
                      onEndTournament(endTournamentConfirm);
                    }
                    setEndTournamentConfirm(null);
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors"
                >
                  End Tournament
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tournament Matches Modal */}
      <TournamentMatchesModal
        open={matchesModalOpen}
        onClose={() => setMatchesModalOpen(false)}
        loading={matchesLoading}
        error={matchesError}
        data={matchesData}
        myId={myId}
      />
    </div>
  );
}

function TournamentSettingsForm({
  tournament,
  onSave,
  onCancel,
}: {
  tournament: TournamentInfo;
  onSave: (settings: {
    name?: string;
    format?: "swiss" | "elimination" | "round_robin";
    matchType?: "constructed" | "sealed" | "draft";
    maxPlayers?: number;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tournament.name);
  // Tournament pairing format is always Swiss
  const format = "swiss";
  const [matchType, setMatchType] = useState(tournament.matchType);
  const [maxPlayers, setMaxPlayers] = useState(tournament.maxPlayers);

  const handleSave = () => {
    const settings: {
      name?: string;
      format?: "swiss" | "elimination" | "round_robin";
      matchType?: "constructed" | "sealed" | "draft";
      maxPlayers?: number;
    } = {};

    if (name !== tournament.name) settings.name = name;
    // Always ensure format is swiss
    settings.format = "swiss";
    if (matchType !== tournament.matchType) settings.matchType = matchType;
    if (maxPlayers !== tournament.maxPlayers) settings.maxPlayers = maxPlayers;

    onSave(settings);
  };

  const hasChanges =
    name !== tournament.name ||
    matchType !== tournament.matchType ||
    maxPlayers !== tournament.maxPlayers;

  return (
    <div className="space-y-4">
      {/* Tournament Name */}
      <div>
        <label className="block text-xs font-medium mb-2">
          Tournament Name *
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            placeholder="Enter tournament name"
            maxLength={50}
          />
          <button
            type="button"
            onClick={() => setName(generateLobbyName())}
            className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-xs transition-colors"
            title="Generate random name"
          >
            🎲
          </button>
        </div>
      </div>

      {/* Match Type */}
      <div>
        <label className="block text-xs font-medium mb-2">Match Type</label>
        <div className="grid grid-cols-3 gap-2">
          {["constructed", "sealed", "draft"].map((type) => (
            <button
              key={type}
              className={`px-3 py-2 text-xs rounded transition-colors ${
                matchType === type
                  ? "bg-purple-600/80 text-white"
                  : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
              }`}
              onClick={() =>
                setMatchType(type as "constructed" | "sealed" | "draft")
              }
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Max Players */}
      <div>
        <label className="block text-xs font-medium mb-2">Max Players</label>
        <select
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(Number(e.target.value))}
          className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm"
        >
          <option value={2}>2 Players</option>
          <option value={4}>4 Players</option>
          <option value={8}>8 Players</option>
          <option value={16}>16 Players</option>
          <option value={32}>32 Players</option>
        </select>
        {maxPlayers < tournament.registeredPlayers.length && (
          <p className="text-red-400 text-xs mt-1">
            Cannot reduce below current player count (
            {tournament.registeredPlayers.length})
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={
            !hasChanges || maxPlayers < tournament.registeredPlayers.length
          }
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-sm text-white transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
