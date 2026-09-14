/*
  (moved) Tournament Matches Modal lives inside the component now.
*/
"use client";

import { Icon } from "@iconify/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { VoiceOutgoingRequest } from "@/app/online/online-context";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Badge } from "@/components/ui/badge";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import type { SoatcStatus } from "@/lib/hooks/useSoatcStatus";
import { playerColor, shortId } from "@/lib/lobby/playerColor";
import {
  isPracticeLobby,
  practiceIcon,
  practiceLabel,
  practiceModeForMatchType,
  withoutForeignPracticeLobbies,
} from "@/lib/lobby/practice";
import { buildLobbyInviteUrl } from "@/lib/lobby-links";
import type { TournamentInfo, LobbyInfo } from "@/lib/net/protocol";
import { generateLobbyName } from "@/lib/random-name-generator";

// Format duration from timestamp to human-readable string
function formatDuration(startedAt: number | null | undefined): string {
  if (!startedAt) return "";
  const now = Date.now();
  const diffMs = now - startedAt;
  if (diffMs < 0) return "";

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return "<1m";
}

type StatusFilter = "any" | "waiting" | "live" | "closed";
type FormatFilter = "any" | "constructed" | "sealed" | "draft";

/** Human label for a planned/tournament match type in the format column. */
function formatLabel(type: string | null | undefined): string {
  switch (type) {
    case "constructed":
      return "Constructed";
    case "sealed":
      return "Sealed";
    case "draft":
      return "Draft";
    case "precon":
      return "Precon";
    default:
      return "—";
  }
}

/** Quiet mono hint text used in the action column when there is no action. */
const HINT = "font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-dim";
/** Modal backdrop for the lobby dialogs. */
const BACKDROP = "bg-[rgba(6,10,20,0.82)] backdrop-blur-[4px]";
/** Muted help text under a form field. */
const FIELD_HELP = "font-rc-sans text-xs text-rc-fg-subtle";

export type CreateLobbyConfig = {
  name: string;
  visibility: "open" | "private" | "tournament";
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
      <div className={`absolute inset-0 ${BACKDROP}`} onClick={onClose} />
      <div className="relative rc-panel w-full max-w-3xl p-5 text-rc-fg">
        <div className="flex items-center justify-between mb-2">
          <div className="font-rc-display text-[22px] leading-none text-rc-fg-strong">
            {data?.tournament?.name
              ? `Matches – ${data.tournament.name}`
              : "Tournament Matches"}
          </div>
          <RcButton variant="ghost" size="sm" onClick={onClose}>
            Close
          </RcButton>
        </div>
        {loading && (
          <div className="py-10 text-center font-rc-sans text-sm text-rc-fg-muted">
            Loading matches…
          </div>
        )}
        {!loading && error && (
          <div className="py-6 text-center font-rc-sans text-sm text-rc-danger">
            {error}
          </div>
        )}
        {!loading && !error && data && (
          <div className="space-y-4">
            <div className="font-rc-mono text-xs tabular-nums text-rc-fg-muted">
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
            <div className="thin-scrollbar max-h-[60vh] overflow-auto pr-1">
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
                          className="overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30"
                        >
                          <div className="rc-eyebrow border-b border-rc-line/12 bg-black/30 px-3 py-2">
                            Round {key === "Unassigned" ? "—" : key}
                          </div>
                          <div className="divide-y divide-rc-line/8">
                            {group.map(
                              (
                                m: TournamentMatchesResponse["matches"][number],
                              ) => (
                                <div
                                  key={m.id}
                                  className="px-3 py-2 text-sm flex items-center justify-between gap-3"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-rc-sans font-medium text-rc-fg-strong">
                                        {m.players
                                          .map(
                                            (
                                              p: TournamentMatchesResponse["matches"][number]["players"][number],
                                            ) => p.name,
                                          )
                                          .join(" vs ")}
                                      </span>
                                      <Badge>{m.status}</Badge>
                                    </div>
                                    <div className="font-rc-mono text-xs text-rc-fg-subtle">
                                      Games: {m.gameCount}{" "}
                                      {m.winnerId
                                        ? `• Winner: ${
                                            m.players.find(
                                              (
                                                p: TournamentMatchesResponse["matches"][number]["players"][number],
                                              ) => p.id === m.winnerId,
                                            )?.name ?? "—"
                                          }`
                                        : ""}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="whitespace-nowrap font-rc-mono text-xs tabular-nums text-rc-fg-muted">
                                      {m.startedAt
                                        ? new Date(m.startedAt).toLocaleString()
                                        : ""}
                                    </div>
                                    {/* Offer Join for current player's assignment */}
                                    {myId &&
                                      m.players.some((p) => p.id === myId) && (
                                        <RcButton
                                          variant="outline"
                                          size="sm"
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
                                                    }`,
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
                                                  (p) => p.id,
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
                                                  tObj?.id || "",
                                                ),
                                              };
                                              localStorage.setItem(
                                                `tournamentMatchBootstrap_${m.id}`,
                                                JSON.stringify(payload),
                                              );
                                              window.location.href = `/online/play/${encodeURIComponent(
                                                m.id,
                                              )}`;
                                            } catch {}
                                          }}
                                          title="Join your match"
                                        >
                                          Join Match
                                        </RcButton>
                                      )}
                                  </div>
                                </div>
                              ),
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
  registrationMode?: "fixed" | "open";
  registrationLocked?: boolean;
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
  onEndPractice,
  onSetLobbyVisibility,
  onResync,
  onAddCpuBot: _onAddCpuBot,
  onRemoveCpuBot: _onRemoveCpuBot,
  onCreateTournament,
  onJoinTournament,
  onLeaveTournament,
  onUpdateTournamentSettings,
  onStartTournament,
  onEndTournament,
  onToggleTournamentRegistrationLock,
  onRefresh,
  tournamentsEnabled = true,
  voiceSupport,
  externalOverlayOpen,
  onExternalOverlayChange,
  soatcStatus,
}: {
  lobbies: LobbyInfo[];
  tournaments: TournamentInfo[];
  myId: string | null;
  joinedLobbyId: string | null;
  onJoin: (lobbyId: string) => void;
  onCreate: (config: CreateLobbyConfig) => void;
  onLeaveLobby?: () => void;
  /** Ends the viewer's own vs-CPU / goldfish practice game (match + lobby). */
  onEndPractice?: () => void;
  onSetLobbyVisibility?: (
    visibility: "open" | "private" | "tournament",
  ) => void;
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
    },
  ) => void;
  onToggleTournamentReady?: (tournamentId: string, ready: boolean) => void;
  onStartTournament?: (tournamentId: string) => void;
  onEndTournament?: (tournamentId: string) => void;
  onToggleTournamentRegistrationLock?: (
    tournamentId: string,
    locked: boolean,
  ) => void;
  onRefresh: () => void;
  tournamentsEnabled?: boolean;
  voiceSupport?: {
    enabled: boolean;
    outgoingRequest: VoiceOutgoingRequest | null;
    incomingFrom: string | null;
    onRequest: (playerId: string) => void;
    connectedPeerIds?: string[];
  } | null;
  externalOverlayOpen?: boolean;
  onExternalOverlayChange?: (open: boolean) => void;
  /** Current user's SOATC status - used to check tournament eligibility */
  soatcStatus?: SoatcStatus | null;
}) {
  const [query, setQuery] = useState("");
  const [hideFull, setHideFull] = useState(false);
  const [hideStarted, setHideStarted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [formatFilter, setFormatFilter] = useState<FormatFilter>("any");
  // Braille skull art shown behind the empty state (public/skull.txt)
  const [skull, setSkull] = useState("");
  const [internalOverlayOpen, setInternalOverlayOpen] = useState(false);

  // Use external overlay state if provided, otherwise use internal state
  const overlayOpen = externalOverlayOpen ?? internalOverlayOpen;
  const setOverlayOpen = (open: boolean) => {
    if (onExternalOverlayChange) {
      onExternalOverlayChange(open);
    } else {
      setInternalOverlayOpen(open);
    }
  };
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
    {},
  );
  const [pendingStartT, setPendingStartT] = useState<Record<string, boolean>>(
    {},
  );
  const [pendingLockT, setPendingLockT] = useState<Record<string, boolean>>({});

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
  // The viewer's own practice game is ended (match + lobby) from its card.
  const joinedIsPractice = !!joinedLobby && isPracticeLobby(joinedLobby);
  const joinedTournament = tournaments.find(
    (t) =>
      t.registeredPlayers.some(
        (p) =>
          p.id === myId &&
          (p as { seatStatus?: string }).seatStatus !== "vacant",
      ) && t.status !== "completed",
  );
  const isInTournament = joinedTournament !== undefined;
  const isEngaged = isInLobby || isInTournament;
  // Voice support is available but not used in condensed lobby list view
  void voiceSupport;
  const [cfgName, setCfgName] = useState<string>("");
  const [cfgVisibility, setCfgVisibility] = useState<
    "open" | "private" | "tournament"
  >("open");

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
  const [tournamentOpenSeat, setTournamentOpenSeat] = useState<boolean>(false);
  const [tournamentRegistrationLocked, setTournamentRegistrationLocked] =
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

  // Generate a random name when overlay is opened externally
  const prevOverlayOpenRef = useRef(overlayOpen);
  if (overlayOpen && !prevOverlayOpenRef.current) {
    // Overlay just opened - generate a name if empty
    if (!cfgName) {
      setCfgName(generateLobbyName());
    }
  }
  prevOverlayOpenRef.current = overlayOpen;

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
    // Other players' practice games (vs CPU / goldfish) are never listed.
    const list = withoutForeignPracticeLobbies(lobbies, myId).filter((l) => {
      // Pin the currently joined lobby regardless of filters
      const pinned = joinedLobbyId === l.id;
      // Don't hide the joined lobby even if it's full or started; otherwise apply filters
      if (hideFull && l.players.length >= l.maxPlayers && !pinned) return false;
      if (hideStarted && l.status !== "open" && !pinned) return false;
      if (!pinned) {
        if (statusFilter === "waiting" && l.status !== "open") return false;
        if (statusFilter === "live" && l.status !== "started") return false;
        if (statusFilter === "closed" && l.status !== "closed") return false;
        if (formatFilter !== "any" && l.plannedMatchType !== formatFilter)
          return false;
      }
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
      return statusWeight(a.status) - statusWeight(b.status);
    });
    return list;
  }, [
    lobbies,
    myId,
    query,
    hideFull,
    hideStarted,
    statusFilter,
    formatFilter,
    joinedLobbyId,
  ]);

  // Filter tournaments
  const filteredTournaments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tournaments
      .filter((tournament) => {
        // Always exclude completed tournaments from Active Games view
        if (tournament.status === "completed") return false;
        const isJoined = tournament.registeredPlayers.some(
          (p) => p.id === myId,
        );
        const registrationSettings = (
          (tournament as unknown as { settings?: Record<string, unknown> })
            .settings ?? {}
        ).registration as Record<string, unknown> | undefined;
        const status = tournament.status as string;
        const isOpenSeat = registrationSettings?.mode === "open";
        const isLocked = registrationSettings?.locked === true;
        const activeCount = tournament.registeredPlayers.filter(
          (p) => (p as { seatStatus?: string }).seatStatus !== "vacant",
        ).length;
        const vacantCount = Math.max(
          0,
          tournament.registeredPlayers.length - activeCount,
        );
        const canJoin = isOpenSeat
          ? !isJoined &&
            (vacantCount > 0 ||
              (!isLocked &&
                (status === "registering" || status === "preparing")))
          : !isJoined &&
            status === "registering" &&
            activeCount < tournament.maxPlayers;
        if (q && !tournament.name.toLowerCase().includes(q)) return false;
        if (!isJoined) {
          if (statusFilter === "waiting" && status !== "registering")
            return false;
          if (statusFilter === "live" && status === "registering") return false;
          if (statusFilter === "closed") return false;
          if (formatFilter !== "any" && tournament.matchType !== formatFilter)
            return false;
        }
        // Don't hide joined tournaments even if they're full or started
        if (hideFull && !canJoin && !isJoined) return false;
        if (
          hideStarted &&
          status !== "registering" &&
          !(isOpenSeat && !isLocked && status === "preparing") &&
          !isJoined
        )
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
        const aActive = a.registeredPlayers.filter(
          (p) => (p as { seatStatus?: string }).seatStatus !== "vacant",
        ).length;
        const bActive = b.registeredPlayers.filter(
          (p) => (p as { seatStatus?: string }).seatStatus !== "vacant",
        ).length;
        return bActive - aActive;
      });
  }, [
    tournaments,
    query,
    hideFull,
    hideStarted,
    statusFilter,
    formatFilter,
    myId,
  ]);

  const gameCount =
    filtered.length + (tournamentsEnabled ? filteredTournaments.length : 0);

  // Load the skull art lazily, only once the empty state is actually shown
  useEffect(() => {
    if (gameCount > 0 || skull) return;
    let cancelled = false;
    fetch("/skull.txt")
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) => {
        if (!cancelled && text) setSkull(text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gameCount, skull]);

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
        e instanceof Error ? e.message : "Failed to load matches",
      );
    } finally {
      setMatchesLoading(false);
    }
  }

  return (
    <section className="rc-panel">
      {/* Header */}
      <div className="rc-panel-head">
        <h2 className="m-0 font-rc-display text-3xl leading-none text-rc-fg-strong">
          Active Games
        </h2>
        <span className="font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
          {filtered.length} {filtered.length === 1 ? "lobby" : "lobbies"}
          {tournamentsEnabled
            ? ` · ${filteredTournaments.length} ${
                filteredTournaments.length === 1 ? "tournament" : "tournaments"
              }`
            : ""}
        </span>
        <div className="flex-1" />
        {onLeaveLobby &&
          !!joinedLobbyId &&
          !(onEndPractice && joinedIsPractice) && (
          <RcButton
            variant="danger-soft"
            size="sm"
            onClick={() => onLeaveLobby()}
            title={`Leave ${
              joinedLobby?.name || joinedLobby?.id || "current lobby"
            }`}
          >
            Leave Lobby
          </RcButton>
        )}
        {onCreateTournament && (
          <RcButton
            variant="outline"
            size="sm"
            onClick={handleTournamentOverlayOpen}
            disabled={isEngaged}
            title={
              isEngaged
                ? `Already in ${isInLobby ? "lobby" : "tournament"}`
                : "Create a new tournament"
            }
          >
            Create Tournament
          </RcButton>
        )}
        <button
          type="button"
          className="cursor-pointer rounded-rc-md border border-rc-line/22 bg-transparent px-3 py-[7px] font-rc-mono text-[11px] uppercase tracking-[0.18em] text-rc-fg-muted transition-colors hover:border-rc-accent hover:text-rc-accent-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring"
          onClick={() => {
            if (onResync) onResync();
            onRefresh();
          }}
          title="Refresh the games list"
        >
          ↻ refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-3.5">
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
          className="rc-input h-10 min-w-[240px] flex-1"
          placeholder="Search by name, lobby ID, host, or player"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="rc-select h-10"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Filter by status"
        >
          <option value="any">Status: any</option>
          <option value="waiting">Waiting</option>
          <option value="live">In progress</option>
          <option value="closed">Closed</option>
        </select>
        <select
          className="rc-select h-10"
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value as FormatFilter)}
          aria-label="Filter by format"
        >
          <option value="any">Format: any</option>
          <option value="constructed">Constructed</option>
          <option value="sealed">Sealed</option>
          <option value="draft">Draft</option>
        </select>
        <label className="rc-check">
          <input
            type="checkbox"
            checked={hideFull}
            onChange={(e) => setHideFull(e.target.checked)}
          />
          Hide full
        </label>
        <label className="rc-check">
          <input
            type="checkbox"
            checked={hideStarted}
            onChange={(e) => setHideStarted(e.target.checked)}
          />
          Hide started
        </label>
      </div>

      {gameCount > 0 ? (
        <div className="thin-scrollbar overflow-x-auto">
          {/* Column header */}
          <div className="rc-games-grid border-y border-rc-line/12 bg-black/30 px-[18px] py-2 font-rc-mono text-[10px] uppercase tracking-[0.22em] text-rc-fg-dim">
            <div>lobby</div>
            <div>host</div>
            <div>format</div>
            <div>seats</div>
            <div>status</div>
            <div className="text-right">action</div>
          </div>

          {filtered.map((l) => {
            const isMine = joinedLobbyId === l.id; // Source of truth: joinedLobbyId
            // Only the viewer's own practice games reach this point
            const practiceMode = isPracticeLobby(l)
              ? practiceModeForMatchType(l.plannedMatchType)
              : null;
            const hostPlayer = l.players.find((p) => p.id === l.hostId);
            const opponentPlayer = l.players.find((p) => p.id !== l.hostId);
            const host = hostPlayer?.displayName || "Host";
            const playerDisplay =
              l.status === "started" && opponentPlayer && !practiceMode
                ? `${host} vs ${opponentPlayer.displayName}`
                : host;
            const open = l.status === "open";
            const live = l.status === "started";
            const full = l.players.length >= l.maxPlayers;
            const meta: string[] = [];
            if (l.plannedTimer) {
              meta.push(
                `${l.plannedTimer.matchTimeMinutes}m timer${
                  l.plannedTimer.tiebreakEnabled ? " · tiebreak" : ""
                }`,
              );
            }
            if (l.plannedEnableSeer) meta.push("seer");
            if (l.visibility === "private" && !practiceMode)
              meta.push("invite only");
            if (l.visibility === "tournament" && l.soatcLeagueMatch) {
              meta.push(l.soatcLeagueMatch.tournamentName);
            }
            if (live && l.startedAt) meta.push(formatDuration(l.startedAt));
            const statusLabel = open ? "waiting" : live ? "live" : l.status;
            const statusClass = open
              ? "text-rc-success"
              : live
                ? "text-rc-danger"
                : "text-rc-fg-dim";
            const isRegisteredInTournament =
              l.visibility === "tournament" && l.soatcLeagueMatch
                ? soatcStatus?.tournaments?.some(
                    (t) => t.id === l.soatcLeagueMatch?.tournamentId,
                  ) ||
                  soatcStatus?.tournament?.id ===
                    l.soatcLeagueMatch?.tournamentId
                : false;
            const joinDisabled =
              !open || full || (isEngaged && l.id !== joinedLobbyId);
            const joinTitle = !open
              ? "Lobby not open"
              : full
                ? "Lobby is full"
                : isEngaged
                  ? `Already in ${isInLobby ? "another lobby" : "tournament"}`
                  : "Join this lobby";
            return (
              <div
                key={`lobby-${l.id}`}
                className={`rc-games-grid items-center border-b border-rc-line/8 px-[18px] py-3 font-rc-mono text-[13px] text-rc-fg transition-colors hover:bg-rc-accent/6 ${
                  isMine ? "bg-rc-accent/6 shadow-[inset_2px_0_0_var(--color-rc-accent)]" : ""
                }`}
              >
                <div className="min-w-0">
                  {practiceMode ? (
                    <div
                      className="flex min-w-0 items-center gap-2 font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong"
                      title={practiceLabel(practiceMode)}
                    >
                      <Icon
                        icon={practiceIcon(practiceMode)}
                        aria-hidden
                        className="h-[18px] w-[18px] shrink-0 text-rc-accent"
                      />
                      <span className="truncate">
                        {practiceLabel(practiceMode)}
                      </span>
                    </div>
                  ) : (
                    <div
                      className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong"
                      title={l.name || "Unnamed Lobby"}
                    >
                      {l.name || "Unnamed Lobby"}
                    </div>
                  )}
                  <div
                    className="truncate text-[11px] tracking-[0.1em] text-rc-fg-dim"
                    title={l.id}
                  >
                    #{shortId(l.id)}
                    {meta.map((m) => ` · ${m}`).join("")}
                  </div>
                </div>
                <div
                  className="truncate"
                  style={{ color: playerColor(l.hostId) }}
                  title={playerDisplay}
                >
                  {playerDisplay}
                </div>
                <div className="text-rc-fg-muted">
                  {formatLabel(l.plannedMatchType)}
                </div>
                <div className="tabular-nums text-rc-fg-strong">
                  {l.players.length} / {l.maxPlayers}
                </div>
                <div
                  className={`flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] ${statusClass}`}
                >
                  <span
                    className={`rc-dot ${live ? "animate-rc-blink" : ""}`}
                    style={live ? { animationDuration: "1.4s" } : undefined}
                  />
                  <span>{statusLabel}</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {practiceMode ? (
                    // A practice game is private: no join, spectate or invite.
                    // After a reconnect mid-game the server lists it without
                    // re-sending joinedLobby, so it can be ended unjoined too.
                    onEndPractice &&
                    (isMine ||
                      (!isInLobby &&
                        !!myId &&
                        l.players.some((p) => p.id === myId))) ? (
                      <RcButton
                        variant="danger-soft"
                        size="sm"
                        onClick={() => onEndPractice()}
                        title="End this practice game and close its lobby"
                      >
                        End practice
                      </RcButton>
                    ) : (
                      <span className={HINT}>practice game</span>
                    )
                  ) : isMine ? (
                    <>
                      {myId &&
                      l.hostId === myId &&
                      l.players.length < l.maxPlayers ? (
                        <RcButton
                          variant="outline"
                          size="sm"
                          className="animate-pulse"
                          onClick={() => {
                            const panel = document.getElementById(
                              "players-invite-panel",
                            );
                            if (panel) {
                              panel.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                              panel.classList.add(
                                "ring-1",
                                "ring-rc-accent-ring",
                              );
                              setTimeout(
                                () =>
                                  panel.classList.remove(
                                    "ring-1",
                                    "ring-rc-accent-ring",
                                  ),
                                2000,
                              );
                            }
                          }}
                        >
                          Invite friend!
                        </RcButton>
                      ) : (
                        <Badge tone="ok">Ready</Badge>
                      )}
                      {myId && l.hostId !== myId && l.status === "open" && (
                        <span className={HINT}>waiting for host to start</span>
                      )}
                      {onSetLobbyVisibility && myId && l.hostId === myId && (
                        <RcButton
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onSetLobbyVisibility(
                              l.visibility === "open" ? "private" : "open",
                            )
                          }
                          title={
                            l.visibility === "open"
                              ? "Set lobby to private"
                              : "Set lobby to open"
                          }
                        >
                          {l.visibility === "open"
                            ? "Make private"
                            : "Make open"}
                        </RcButton>
                      )}
                      {/* CPU bot lobby buttons hidden — use Solo vs CPU route instead */}
                      <RcButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          try {
                            if (navigator.clipboard)
                              void navigator.clipboard.writeText(
                                buildLobbyInviteUrl(
                                  window.location.origin,
                                  l.id,
                                ),
                              );
                          } catch {}
                        }}
                        title="Copy an invite link to this lobby"
                      >
                        Copy invite link
                      </RcButton>
                    </>
                  ) : (
                    <>
                      {/* Only show spectate when match is actually in progress (not during setup/draft/deck building) */}
                      {live &&
                        l.matchId &&
                        l.matchStatus === "in_progress" &&
                        l.visibility === "open" && (
                          <RcLinkButton
                            variant="outline"
                            size="sm"
                            href={`/online/play/${encodeURIComponent(
                              l.matchId,
                            )}?watch=true`}
                            title="Watch this match as a spectator"
                          >
                            Spectate
                          </RcLinkButton>
                        )}
                      {/* Open lobbies: show Join button only after host has opened the lobby */}
                      {l.visibility === "open" && l.hostReady && open && (
                        <RcButton
                          size="sm"
                          variant={full ? "secondary" : "outline"}
                          onClick={() => onJoin(l.id)}
                          disabled={joinDisabled}
                          title={joinTitle}
                        >
                          {full ? "Full" : "Join"}
                        </RcButton>
                      )}
                      {/* Open lobbies: host hasn't opened the lobby yet */}
                      {l.visibility === "open" && !l.hostReady && (
                        <span className={HINT}>host is configuring…</span>
                      )}
                      {/* Tournament lobbies: join only for registered participants */}
                      {l.visibility === "tournament" &&
                        l.soatcLeagueMatch &&
                        (isRegisteredInTournament ? (
                          <RcButton
                            size="sm"
                            variant={full ? "secondary" : "outline"}
                            onClick={() => onJoin(l.id)}
                            disabled={joinDisabled || !l.hostReady}
                            title={
                              !l.hostReady
                                ? "Host is still setting up the match"
                                : !open
                                  ? "Lobby not open"
                                  : full
                                    ? "Lobby is full"
                                    : isEngaged
                                      ? `Already in ${
                                          isInLobby
                                            ? "another lobby"
                                            : "tournament"
                                        }`
                                      : `Join tournament match: ${l.soatcLeagueMatch.tournamentName}`
                            }
                          >
                            {full
                              ? "Full"
                              : !l.hostReady
                                ? "Setting up…"
                                : "Join Match"}
                          </RcButton>
                        ) : (
                          <span className={HINT}>
                            tournament participants only
                          </span>
                        ))}
                      {l.visibility === "private" && (
                        <span className={HINT}>invite only</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {tournamentsEnabled &&
            filteredTournaments.map((tournament) => {
              const myRegistration = tournament.registeredPlayers.find(
                (p) => p.id === myId,
              );
              const isSeatVacant = myRegistration?.seatStatus === "vacant";
              const isRegistered = Boolean(myRegistration && !isSeatVacant);
              const isReady = myRegistration?.ready || false;
              const registrationSettings = (
                (
                  tournament as unknown as {
                    settings?: Record<string, unknown>;
                  }
                ).settings ?? {}
              ).registration as Record<string, unknown> | undefined;
              const status = tournament.status as string;
              const isOpenSeat = registrationSettings?.mode === "open";
              const isLocked = registrationSettings?.locked === true;
              const activePlayers = tournament.registeredPlayers.filter(
                (p) => (p as { seatStatus?: string }).seatStatus !== "vacant",
              );
              const activeCount = activePlayers.length;
              const vacantCount = Math.max(
                0,
                tournament.registeredPlayers.length - activeCount,
              );
              // Consider a deck submitted when the API marks deckSubmitted (preferred) or when the player is ready
              const hasSubmitted = (() => {
                if (!myRegistration) return false;
                const maybe = myRegistration as typeof myRegistration & {
                  deckSubmitted?: boolean;
                };
                return Boolean(maybe.deckSubmitted || isReady);
              })();
              const canRejoin = Boolean(isSeatVacant && !isEngaged);
              const canJoin = isOpenSeat
                ? canRejoin ||
                  (!isRegistered &&
                    !isEngaged &&
                    (vacantCount > 0 ||
                      (!isLocked &&
                        (status === "registering" || status === "preparing"))))
                : status === "registering" &&
                  !isRegistered &&
                  activeCount < tournament.maxPlayers &&
                  !isEngaged;
              const allPlayersReady =
                activeCount >= 2 && activePlayers.every((p) => p.ready);
              const canStart =
                tournament.creatorId === myId &&
                status === "registering" &&
                allPlayersReady;
              const live = status === "playing";
              const statusLabel =
                status === "registering"
                  ? "open"
                  : live
                    ? "live"
                    : status === "completed"
                      ? "done"
                      : "prep";
              const statusClass =
                status === "registering"
                  ? "text-rc-success"
                  : live
                    ? "text-rc-danger"
                    : status === "completed"
                      ? "text-rc-fg-dim"
                      : "text-rc-warning";
              const meta: string[] = [
                `round ${tournament.currentRound}/${tournament.totalRounds}`,
              ];
              if (isOpenSeat) {
                meta.push(`open seat${isLocked ? " · locked" : ""}`);
                if (vacantCount > 0) meta.push(`${vacantCount} vacant`);
              }
              if (isRegistered && status === "registering") {
                meta.push(isReady ? "you: ready" : "you: not ready");
              }

              return (
                <div
                  key={`tournament-${tournament.id}`}
                  className={`rc-games-grid items-center border-b border-rc-line/8 px-[18px] py-3 font-rc-mono text-[13px] text-rc-fg transition-colors hover:bg-rc-accent/6 ${
                    isRegistered
                      ? "bg-rc-accent/6 shadow-[inset_2px_0_0_var(--color-rc-accent)]"
                      : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div
                      className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong"
                      title={tournament.name}
                    >
                      {tournament.name}
                    </div>
                    <div
                      className="truncate text-[11px] tracking-[0.1em] text-rc-fg-dim"
                      title={tournament.id}
                    >
                      #{shortId(tournament.id)}
                      {meta.map((m) => ` · ${m}`).join("")}
                    </div>
                  </div>
                  <div className="truncate text-rc-accent-link">
                    tournament · {tournament.format.replace("_", " ")}
                  </div>
                  <div className="text-rc-fg-muted">
                    {formatLabel(tournament.matchType)}
                  </div>
                  <div className="tabular-nums text-rc-fg-strong">
                    {activeCount}
                    {isOpenSeat ? "" : ` / ${tournament.maxPlayers}`}
                  </div>
                  <div
                    className={`flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] ${statusClass}`}
                  >
                    <span
                      className={`rc-dot ${live ? "animate-rc-blink" : ""}`}
                      style={live ? { animationDuration: "1.4s" } : undefined}
                    />
                    <span>{statusLabel}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {canJoin && onJoinTournament && (
                      <RcButton
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (pendingJoinT[tournament.id]) return;
                          setPendingJoinT((m) => ({
                            ...m,
                            [tournament.id]: true,
                          }));
                          try {
                            await Promise.resolve(
                              onJoinTournament(tournament.id),
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
                        {pendingJoinT[tournament.id]
                          ? "Joining…"
                          : canRejoin
                            ? "Rejoin"
                            : "Join"}
                      </RcButton>
                    )}
                    {isRegistered &&
                      (tournament.status === "registering" || isOpenSeat) &&
                      onLeaveTournament && (
                        <RcButton
                          variant="danger-soft"
                          size="sm"
                          onClick={async () => {
                            if (pendingLeaveT[tournament.id]) return;
                            setPendingLeaveT((m) => ({
                              ...m,
                              [tournament.id]: true,
                            }));
                            try {
                              await Promise.resolve(
                                onLeaveTournament(tournament.id),
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
                        </RcButton>
                      )}
                    {tournament.creatorId === myId &&
                      tournament.status === "registering" &&
                      onUpdateTournamentSettings && (
                        <RcButton
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingTournament(tournament);
                            setSettingsModalOpen(true);
                          }}
                        >
                          Settings
                        </RcButton>
                      )}
                    {isOpenSeat &&
                      tournament.creatorId === myId &&
                      tournament.status !== "completed" &&
                      onToggleTournamentRegistrationLock && (
                        <RcButton
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (pendingLockT[tournament.id]) return;
                            setPendingLockT((m) => ({
                              ...m,
                              [tournament.id]: true,
                            }));
                            try {
                              await Promise.resolve(
                                onToggleTournamentRegistrationLock(
                                  tournament.id,
                                  !isLocked,
                                ),
                              );
                              if (onRefresh) onRefresh();
                            } finally {
                              setPendingLockT((m) => ({
                                ...m,
                                [tournament.id]: false,
                              }));
                            }
                          }}
                          disabled={pendingLockT[tournament.id]}
                        >
                          {pendingLockT[tournament.id]
                            ? "Updating…"
                            : isLocked
                              ? "Unlock Seats"
                              : "Lock Seats"}
                        </RcButton>
                      )}
                    {isRegistered && tournament.status === "registering" && (
                      <RcLinkButton
                        variant="outline"
                        size="sm"
                        href={`/tournaments/${tournament.id}`}
                        title="Go to tournament page to see details and participate in drafts"
                      >
                        View Tournament
                      </RcLinkButton>
                    )}
                    {canStart && onStartTournament && (
                      <RcButton
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (pendingStartT[tournament.id]) return;
                          setPendingStartT((m) => ({
                            ...m,
                            [tournament.id]: true,
                          }));
                          try {
                            await Promise.resolve(
                              onStartTournament(tournament.id),
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
                      </RcButton>
                    )}
                    {tournament.creatorId === myId &&
                      tournament.status !== "completed" &&
                      onEndTournament && (
                        <RcButton
                          variant="danger-soft"
                          size="sm"
                          onClick={() => setEndTournamentConfirm(tournament.id)}
                        >
                          End Tournament
                        </RcButton>
                      )}
                    {isRegistered && tournament.status === "draft_phase" && (
                      <RcButton
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          (window.location.href = `/tournaments/${tournament.id}/draft`)
                        }
                      >
                        Enter Draft
                      </RcButton>
                    )}
                    {isRegistered &&
                      tournament.status === "sealed_phase" &&
                      (hasSubmitted ? (
                        <Badge tone="ok" title="Deck submitted to tournament">
                          Deck submitted
                        </Badge>
                      ) : (
                        <RcButton
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const res = await fetch(
                                `/api/tournaments/${encodeURIComponent(
                                  tournament.id,
                                )}/preparation/start`,
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                },
                              );
                              const data = await res.json();
                              if (!res.ok)
                                throw new Error(
                                  data?.error || "Failed to start preparation",
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
                                    JSON.stringify(storePacks),
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
                                allowDragonlordChampion,
                              ),
                              matchName: tournament.name,
                            });
                            window.location.href = `/decks/editor-3d?${params.toString()}`;
                          }}
                        >
                          Build Deck
                        </RcButton>
                      ))}
                    {isRegistered && tournament.status === "playing" && (
                      <RcButton
                        variant="outline"
                        size="sm"
                        onClick={() => openMatchesModal(tournament.id)}
                      >
                        View Matches
                      </RcButton>
                    )}
                    {isRegistered && tournament.status === "completed" && (
                      <span className={HINT}>completed</span>
                    )}
                    {tournament.status === "registering" &&
                      !isRegistered &&
                      !isOpenSeat &&
                      activeCount >= tournament.maxPlayers && (
                        <span className={HINT}>full</span>
                      )}
                    {tournament.status === "registering" &&
                      !isRegistered &&
                      !isOpenSeat &&
                      activeCount < tournament.maxPlayers &&
                      isEngaged && (
                        <span className={HINT}>
                          in {isInLobby ? "lobby" : "tournament"}
                        </span>
                      )}
                    {tournament.status === "registering" &&
                      isOpenSeat &&
                      !isRegistered &&
                      isLocked && <span className={HINT}>locked</span>}
                    {tournament.status !== "registering" &&
                      !isRegistered &&
                      (!isOpenSeat || vacantCount === 0) && (
                        <span className={HINT}>started</span>
                      )}
                    {tournament.status !== "registering" &&
                      !isRegistered &&
                      isOpenSeat &&
                      vacantCount > 0 && (
                        <span className="font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-success">
                          vacant seats
                        </span>
                      )}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <div className="relative mx-[18px] mb-[18px] flex min-h-[288px] flex-col items-center justify-center overflow-hidden rounded-rc-md border border-dashed border-rc-line/22 bg-black/30 px-6 py-10 text-center">
          {skull && (
            <pre
              aria-hidden="true"
              className="pointer-events-none absolute -top-2.5 left-1/2 m-0 -translate-x-1/2 select-none text-[5px] leading-[5px] text-rc-fg-dim opacity-45"
            >
              {skull}
            </pre>
          )}
          <div className="relative font-rc-display text-[26px] text-rc-fg-strong">
            The realm is quiet.
          </div>
          <div className="relative mt-1.5 font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
            No games match your filters — be bold and start one.
          </div>
        </div>
      )}

      {overlayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 ${BACKDROP}`}
            onClick={() => setOverlayOpen(false)}
          />
          <div className="relative rc-panel w-full max-w-md p-5 text-rc-fg">
            <div className="flex items-center justify-between">
              <div className="font-rc-display text-[22px] leading-none text-rc-fg-strong">
                Create Match
              </div>
              <RcButton
                variant="ghost"
                size="sm"
                onClick={() => setOverlayOpen(false)}
              >
                Close
              </RcButton>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="rc-field-label mb-2">
                  Match Name *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cfgName}
                    onChange={(e) => setCfgName(e.target.value)}
                    className="rc-input h-9 min-w-0 flex-1"
                    placeholder="Enter match name"
                    maxLength={50}
                    required
                  />
                  <RcButton
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setCfgName(generateLobbyName())}
                    className="h-9 w-9"
                    title="Generate random name"
                  >
                    <Icon
                      icon="game-icons:perspective-dice-six-faces-random"
                      width={16}
                      height={16}
                      aria-hidden
                    />
                  </RcButton>
                </div>
              </div>
              <div>
                <label className="rc-field-label mb-2">
                  Visibility
                </label>
                <div className="rc-segment">
                  <button
                    aria-pressed={cfgVisibility === "open"}
                    data-tone="success"
                    onClick={() => setCfgVisibility("open")}
                  >
                    Open
                  </button>
                  <button
                    aria-pressed={cfgVisibility === "private"}
                    data-tone="warning"
                    onClick={() => setCfgVisibility("private")}
                  >
                    Private
                  </button>
                </div>
              </div>
              <div>
                <label className="rc-field-label mb-2">
                  Max Players
                </label>
                <input
                  type="number"
                  value={2}
                  disabled
                  aria-disabled
                  title="Currently limited to two players"
                  className="rc-input h-8 w-24 cursor-not-allowed px-2 opacity-60"
                />
              </div>
              <div className="flex justify-end gap-2">
                <RcButton
                  variant="outline"
                  size="sm"
                  onClick={() => setOverlayOpen(false)}
                >
                  Cancel
                </RcButton>
                <RcButton
                  size="sm"
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
                </RcButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tournament Creation Overlay */}
      {tournamentsEnabled && tournamentOverlayOpen && onCreateTournament && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className={`absolute inset-0 ${BACKDROP}`}
            onClick={() => setTournamentOverlayOpen(false)}
          />
          <div className="relative rc-panel w-full max-w-md p-5 text-rc-fg">
            <div className="flex items-center justify-between">
              <div className="font-rc-display text-[22px] leading-none text-rc-fg-strong">
                Create Tournament
              </div>
              <RcButton
                variant="ghost"
                size="sm"
                onClick={() => setTournamentOverlayOpen(false)}
              >
                Close
              </RcButton>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="rc-field-label mb-2">
                  Tournament Name *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tournamentName}
                    onChange={(e) => setTournamentName(e.target.value)}
                    className="rc-input h-9 min-w-0 flex-1"
                    placeholder="Enter tournament name"
                    maxLength={50}
                    required
                  />
                  <RcButton
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setTournamentName(generateLobbyName())}
                    className="h-9 w-9"
                    title="Generate random name"
                  >
                    <Icon
                      icon="game-icons:perspective-dice-six-faces-random"
                      width={16}
                      height={16}
                      aria-hidden
                    />
                  </RcButton>
                </div>
              </div>
              {/* Private Tournament Toggle */}
              <div>
                <label className="rc-check flex">
                  <input
                    type="checkbox"
                    checked={tournamentIsPrivate}
                    onChange={(e) => setTournamentIsPrivate(e.target.checked)}
                  />
                  <span>
                    Private tournament (invite-only)
                  </span>
                </label>
                {tournamentIsPrivate && (
                  <p className={`mt-1 ml-6 ${FIELD_HELP}`}>
                    Only invited players can see and join
                  </p>
                )}
              </div>
              <div>
                <label className="rc-check flex">
                  <input
                    type="checkbox"
                    checked={tournamentOpenSeat}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setTournamentOpenSeat(next);
                      if (!next) {
                        setTournamentRegistrationLocked(false);
                      }
                    }}
                  />
                  <span>
                    Open seat tournament (host controls registration lock)
                  </span>
                </label>
                {tournamentOpenSeat && (
                  <label className="rc-check mt-2 ml-6 flex">
                    <input
                      type="checkbox"
                      checked={tournamentRegistrationLocked}
                      onChange={(e) =>
                        setTournamentRegistrationLocked(e.target.checked)
                      }
                    />
                    Start locked (no new seats until unlocked)
                  </label>
                )}
              </div>

              <div>
                <label className="rc-field-label mb-2">
                  Match Type
                </label>
                <div className="rc-segment grid grid-cols-3">
                  {["constructed", "sealed", "draft"].map((type) => (
                    <button
                      key={type}
                      aria-pressed={tournamentMatchType === type}
                      data-tone="moonlight"
                      onClick={() =>
                        setTournamentMatchType(
                          type as "constructed" | "sealed" | "draft",
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
                  <label className="rc-check flex">
                    <input
                      type="checkbox"
                      checked={sealedUseCube}
                      onChange={(e) => setSealedUseCube(e.target.checked)}
                    />
                    <span>Use Cube for sealed</span>
                  </label>

                  {!sealedUseCube && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="rc-field-label">Booster Count</div>
                        <div className="flex items-center gap-2">
                          <RcButton
                            variant="quiet"
                            size="icon-xs"
                            onClick={() => {
                              const newCount = Math.max(
                                1,
                                sealedBoosterCount - 1,
                              );
                              setSealedBoosterCount(newCount);
                              setSealedBoosters((prev) =>
                                prev.slice(0, newCount),
                              );
                            }}
                            className="font-rc-mono font-bold"
                          >
                            -
                          </RcButton>
                          <span className="w-8 text-center font-rc-mono text-xs font-semibold tabular-nums text-rc-fg-strong">
                            {sealedBoosterCount}
                          </span>
                          <RcButton
                            variant="quiet"
                            size="icon-xs"
                            onClick={() => {
                              const newCount = Math.min(
                                10,
                                sealedBoosterCount + 1,
                              );
                              setSealedBoosterCount(newCount);
                              setSealedBoosters((prev) => [
                                ...prev,
                                ...Array(newCount - prev.length).fill("Beta"),
                              ]);
                            }}
                            className="font-rc-mono font-bold"
                          >
                            +
                          </RcButton>
                        </div>
                      </div>
                      <div className="thin-scrollbar space-y-2 max-h-40 overflow-y-auto">
                        {sealedBoosters.map((setName, idx) => (
                          <div
                            key={`sealed-booster-${idx}`}
                            className="flex items-center gap-2"
                          >
                            <div className="rc-hint w-16">
                              Pack {idx + 1}
                            </div>
                            <CustomSelect
                              value={setName}
                              onChange={(v) => {
                                setSealedBoosters((prev) => {
                                  const next = [...prev];
                                  next[idx] = v;
                                  return next;
                                });
                              }}
                              className="flex-1"
                              options={[
                                { value: "Beta", label: "Beta" },
                                {
                                  value: "Arthurian Legends",
                                  label: "Arthurian Legends",
                                },
                                { value: "Alpha", label: "Alpha" },
                              ]}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {sealedUseCube && (
                    <>
                      <div>
                        <label className="rc-field-label mb-1">
                          Select Cube
                        </label>
                        {loadingCubes ? (
                          <div className={`py-2 ${FIELD_HELP}`}>
                            Loading cubes...
                          </div>
                        ) : userCubes.length === 0 ? (
                          <div className={`py-2 ${FIELD_HELP}`}>
                            No cubes found. Create a cube first to use for
                            sealed.
                          </div>
                        ) : (
                          <CustomSelect
                            value={sealedCubeId}
                            onChange={(v) => setSealedCubeId(v)}
                            className="w-full"
                            placeholder="-- Select a cube --"
                            options={userCubes.map((cube) => ({
                              value: cube.id,
                              label: `${cube.name} (${cube.cardCount} cards)`,
                            }))}
                          />
                        )}
                        <p className={`mt-1 ${FIELD_HELP}`}>
                          Choose one of your cubes for this sealed tournament
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="rc-field-label">Pack Count</div>
                        <div className="flex items-center gap-2">
                          <RcButton
                            variant="quiet"
                            size="icon-xs"
                            onClick={() =>
                              setSealedBoosterCount((c) => Math.max(1, c - 1))
                            }
                            className="font-rc-mono font-bold"
                          >
                            -
                          </RcButton>
                          <span className="w-8 text-center font-rc-mono text-xs font-semibold tabular-nums text-rc-fg-strong">
                            {sealedBoosterCount}
                          </span>
                          <RcButton
                            variant="quiet"
                            size="icon-xs"
                            onClick={() =>
                              setSealedBoosterCount((c) => Math.min(10, c + 1))
                            }
                            className="font-rc-mono font-bold"
                          >
                            +
                          </RcButton>
                        </div>
                      </div>
                      <label className="rc-check mt-2 flex items-start">
                        <input
                          type="checkbox"
                          className="mt-0.5"
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
                      <label className="rc-field-label mb-1">
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
                              Math.min(90, parseInt(e.target.value) || 40),
                            ),
                          )
                        }
                        className="rc-input h-8 w-full px-2"
                      />
                    </div>
                    <label
                      className="rc-check mt-5 flex"
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
                        <span className="ml-1 text-rc-fg-subtle">
                          (random cards instead)
                        </span>
                      </span>
                    </label>
                    <label className="rc-check mt-2 flex">
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
                  <label className="rc-check flex">
                    <input
                      type="checkbox"
                      checked={draftUseCube}
                      onChange={(e) => setDraftUseCube(e.target.checked)}
                    />
                    <span>Use Cube for draft</span>
                  </label>

                  {!draftUseCube && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="rc-field-label">Booster Count</div>
                        <div className="flex items-center gap-2">
                          <RcButton
                            variant="quiet"
                            size="icon-xs"
                            onClick={() => {
                              const newCount = Math.max(
                                1,
                                draftBoosterCount - 1,
                              );
                              setDraftBoosterCount(newCount);
                              setDraftBoosters((prev) =>
                                prev.slice(0, newCount),
                              );
                            }}
                            className="font-rc-mono font-bold"
                          >
                            -
                          </RcButton>
                          <span className="w-8 text-center font-rc-mono text-xs font-semibold tabular-nums text-rc-fg-strong">
                            {draftBoosterCount}
                          </span>
                          <RcButton
                            variant="quiet"
                            size="icon-xs"
                            onClick={() => {
                              const newCount = Math.min(
                                5,
                                draftBoosterCount + 1,
                              );
                              setDraftBoosterCount(newCount);
                              setDraftBoosters((prev) => [
                                ...prev,
                                ...Array(newCount - prev.length).fill(
                                  "Arthurian Legends",
                                ),
                              ]);
                            }}
                            className="font-rc-mono font-bold"
                          >
                            +
                          </RcButton>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {draftBoosters.map((setName, idx) => (
                          <div
                            key={`draft-booster-${idx}`}
                            className="flex items-center gap-2"
                          >
                            <div className="rc-hint w-16">
                              Pack {idx + 1}
                            </div>
                            <CustomSelect
                              value={setName}
                              onChange={(v) => {
                                setDraftBoosters((prev) => {
                                  const next = [...prev];
                                  next[idx] = v;
                                  return next;
                                });
                              }}
                              className="flex-1"
                              options={[
                                { value: "Beta", label: "Beta" },
                                {
                                  value: "Arthurian Legends",
                                  label: "Arthurian Legends",
                                },
                                { value: "Alpha", label: "Alpha" },
                              ]}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {draftUseCube && (
                    <>
                      <div>
                        <label className="rc-field-label mb-1">
                          Select Cube
                        </label>
                        {loadingCubes ? (
                          <div className={`py-2 ${FIELD_HELP}`}>
                            Loading cubes...
                          </div>
                        ) : userCubes.length === 0 ? (
                          <div className={`py-2 ${FIELD_HELP}`}>
                            No cubes found. Create a cube first to use for
                            drafting.
                          </div>
                        ) : (
                          <CustomSelect
                            value={draftCubeId}
                            onChange={(v) => setDraftCubeId(v)}
                            className="w-full"
                            placeholder="-- Select a cube --"
                            options={userCubes.map((cube) => ({
                              value: cube.id,
                              label: `${cube.name} (${cube.cardCount} cards)`,
                            }))}
                          />
                        )}
                        <p className={`mt-1 ${FIELD_HELP}`}>
                          Choose one of your cubes for this draft tournament
                        </p>
                      </div>
                      <label className="rc-check mt-2 flex items-start">
                        <input
                          type="checkbox"
                          className="mt-0.5"
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
                      <label className="rc-field-label mb-1">
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
                              Math.min(300, parseInt(e.target.value) || 60),
                            ),
                          )
                        }
                        className="rc-input h-8 w-full px-2"
                      />
                    </div>
                    <div>
                      <label className="rc-field-label mb-1">
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
                              Math.min(60, parseInt(e.target.value) || 20),
                            ),
                          )
                        }
                        className="rc-input h-8 w-full px-2"
                      />
                    </div>
                  </div>
                  <label className="rc-check mt-3 flex">
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
                <label className="rc-field-label mb-2">
                  {tournamentOpenSeat ? "Seat Cap" : "Max Players"}
                </label>
                {tournamentOpenSeat ? (
                  <input
                    type="number"
                    min={2}
                    max={128}
                    value={tournamentMaxPlayers}
                    onChange={(e) =>
                      setTournamentMaxPlayers(
                        Math.max(
                          2,
                          Math.min(128, parseInt(e.target.value) || 2),
                        ),
                      )
                    }
                    className="rc-input h-9 w-full"
                  />
                ) : (
                  <CustomSelect
                    value={String(tournamentMaxPlayers)}
                    onChange={(v) => setTournamentMaxPlayers(parseInt(v))}
                    className="w-full"
                    options={[
                      { value: "2", label: "2 Players" },
                      { value: "4", label: "4 Players" },
                      { value: "8", label: "8 Players" },
                      { value: "16", label: "16 Players" },
                      { value: "32", label: "32 Players" },
                    ]}
                  />
                )}
                {tournamentOpenSeat && (
                  <p className={`mt-1 ${FIELD_HELP}`}>
                    Open seat tournaments ignore the cap until locked.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <RcButton
                variant="outline"
                size="sm"
                onClick={() => setTournamentOverlayOpen(false)}
              >
                Cancel
              </RcButton>
              <RcButton
                size="sm"
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
                    if (tournamentOpenSeat) {
                      payload.registrationMode = "open";
                      payload.registrationLocked = tournamentRegistrationLocked;
                    }
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
              </RcButton>
            </div>
          </div>
        </div>
      )}

      {/* Tournament Settings Modal */}
      {tournamentsEnabled && settingsModalOpen && editingTournament && (
        <div
          className={`fixed inset-0 ${BACKDROP} z-50 flex items-center justify-center p-4`}
        >
          <div className="rc-panel w-full max-w-md text-rc-fg">
            <div className="p-6">
              <h3 className="mt-0 mb-4 font-rc-display text-[22px] leading-none text-rc-fg-strong">
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
        <div
          className={`fixed inset-0 ${BACKDROP} z-50 flex items-center justify-center p-4`}
        >
          <div className="rc-panel w-full max-w-md text-rc-fg">
            <div className="p-6">
              <h3 className="mt-0 mb-4 font-rc-display text-[22px] leading-none text-rc-fg-strong">
                End Tournament
              </h3>
              <p className="mb-6 font-rc-sans text-sm text-rc-fg-muted">
                Are you sure you want to end this tournament? This action cannot
                be undone and will complete the tournament immediately.
              </p>

              <div className="flex justify-end gap-3">
                <RcButton
                  variant="ghost"
                  onClick={() => setEndTournamentConfirm(null)}
                >
                  Cancel
                </RcButton>
                <RcButton
                  variant="destructive"
                  onClick={() => {
                    if (onEndTournament && endTournamentConfirm) {
                      onEndTournament(endTournamentConfirm);
                    }
                    setEndTournamentConfirm(null);
                  }}
                >
                  End Tournament
                </RcButton>
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
    </section>
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
  const registrationSettings = (
    (tournament as unknown as { settings?: Record<string, unknown> })
      .settings ?? {}
  ).registration as Record<string, unknown> | undefined;
  const isOpenSeat = registrationSettings?.mode === "open";
  const activeCount = tournament.registeredPlayers.filter(
    (p) => (p as { seatStatus?: string }).seatStatus !== "vacant",
  ).length;

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
        <label className="rc-field-label mb-2">
          Tournament Name *
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rc-input h-9 min-w-0 flex-1"
            placeholder="Enter tournament name"
            maxLength={50}
          />
          <RcButton
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setName(generateLobbyName())}
            className="h-9 w-9"
            title="Generate random name"
          >
            <Icon
              icon="game-icons:perspective-dice-six-faces-random"
              width={16}
              height={16}
              aria-hidden
            />
          </RcButton>
        </div>
      </div>

      {/* Match Type */}
      <div>
        <label className="rc-field-label mb-2">Match Type</label>
        <div className="rc-segment grid grid-cols-3">
          {["constructed", "sealed", "draft"].map((type) => (
            <button
              key={type}
              aria-pressed={matchType === type}
              data-tone="moonlight"
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
        <label className="rc-field-label mb-2">
          {isOpenSeat ? "Seat Cap" : "Max Players"}
        </label>
        {isOpenSeat ? (
          <input
            type="number"
            min={2}
            max={128}
            value={maxPlayers}
            onChange={(e) =>
              setMaxPlayers(
                Math.max(2, Math.min(128, parseInt(e.target.value) || 2)),
              )
            }
            className="rc-input h-9 w-full"
          />
        ) : (
          <CustomSelect
            value={String(maxPlayers)}
            onChange={(v) => setMaxPlayers(Number(v))}
            className="w-full"
            options={[
              { value: "2", label: "2 Players" },
              { value: "4", label: "4 Players" },
              { value: "8", label: "8 Players" },
              { value: "16", label: "16 Players" },
              { value: "32", label: "32 Players" },
            ]}
          />
        )}
        {maxPlayers < activeCount && (
          <p className="mt-1 font-rc-sans text-xs text-rc-danger">
            Cannot reduce below current player count ({activeCount})
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 mt-6">
        <RcButton variant="outline" onClick={onCancel}>
          Cancel
        </RcButton>
        <RcButton
          onClick={handleSave}
          disabled={!hasChanges || maxPlayers < activeCount}
        >
          Save Changes
        </RcButton>
      </div>
    </div>
  );
}
