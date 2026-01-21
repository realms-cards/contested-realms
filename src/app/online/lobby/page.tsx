"use client";

import { Trophy, ExternalLink, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useOnline } from "@/app/online/online-context";
import LobbyChatConsole from "@/components/chat/LobbyChatConsole";
import InviteOverlay from "@/components/online/InviteOverlay";
import LobbiesCentral from "@/components/online/LobbiesCentral";
import MatchmakingPanel from "@/components/online/MatchmakingPanel";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import PlayersInvitePanel from "@/components/online/PlayersInvitePanel";
import { SoatcLeagueCheckbox } from "@/components/online/SoatcLeagueBadge";
import ChangelogOverlay from "@/components/ui/ChangelogOverlay";
import CombinedMarquee from "@/components/ui/CombinedMarquee";
import ManualOverlay from "@/components/ui/ManualOverlay";
import { useRealtimeTournaments } from "@/contexts/RealtimeTournamentContext";
import { tournamentFeatures } from "@/lib/config/features";
import {
  normalizeCubeSummary,
  type CubeSummaryInput,
} from "@/lib/cubes/normalizers";
import {
  useAvailableSets,
  buildDefaultPackCounts,
  DEFAULT_SET,
  DEFAULT_DRAFTABLE_SETS,
} from "@/lib/hooks/useAvailableSets";
import {
  useSharedTournament,
  useSoatcStatus,
} from "@/lib/hooks/useSoatcStatus";
import type {
  TournamentInfo as ProtocolTournamentInfo,
  SealedConfig,
  DraftConfig,
} from "@/lib/net/protocol";

// Map context TournamentInfo to protocol TournamentInfo
function mapToProtocolTournament(tournament: {
  id: string;
  name: string;
  creatorId: string;
  format: string;
  status: string;
  maxPlayers: number;
  registeredPlayers?: Array<{
    id: string;
    displayName?: string | null;
    name?: string | null;
    ready?: boolean;
    avatarUrl?: string | null;
    avatar?: string | null;
    image?: string | null;
    seatStatus?: string | null;
  }>;
  settings?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}): ProtocolTournamentInfo {
  const registeredPlayers = (tournament.registeredPlayers ?? []).map(
    (player) => {
      const id = player.id;
      const trimmedNameCandidates = [player.displayName, player.name]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0);
      const displayName =
        trimmedNameCandidates[0] ||
        (id && id.length >= 4 ? `Player ${id.slice(-4)}` : id || "Player");
      const avatarCandidate = [player.avatarUrl, player.avatar, player.image]
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .find((value) => value.length > 0);

      return {
        id,
        displayName,
        ready: player.ready ?? false,
        avatarUrl: avatarCandidate ?? null,
        seat: null,
        location: null,
        inLobby: false,
        inMatch: false,
        seatStatus: (player.seatStatus === "vacant" ? "vacant" : "active") as
          | "vacant"
          | "active",
      };
    }
  );

  return {
    id: tournament.id,
    name: tournament.name,
    creatorId: tournament.creatorId,
    // Pairing format (swiss/elimination/round_robin) is stored in settings.pairingFormat when available, default to 'swiss'
    format:
      (tournament.settings?.pairingFormat as
        | "swiss"
        | "elimination"
        | "round_robin"
        | undefined) || "swiss",
    // Map DB status into richer client-visible states for lobby UX
    status: (() => {
      if (tournament.status === "registering") return "registering";
      if (tournament.status === "preparing") {
        const mt = tournament.format as "sealed" | "draft" | "constructed";
        return mt === "draft"
          ? "draft_phase"
          : mt === "sealed"
          ? "sealed_phase"
          : "playing";
      }
      if (tournament.status === "active") return "playing";
      return "completed";
    })(),
    maxPlayers: tournament.maxPlayers,
    registeredPlayers,
    standings: [], // TODO: map when available
    currentRound: 0, // TODO: map when available
    totalRounds:
      typeof tournament.settings?.totalRounds === "number"
        ? tournament.settings.totalRounds
        : 3,
    rounds: [], // TODO: map when available
    // DB 'format' is the actual match type (constructed | sealed | draft)
    matchType: tournament.format as "sealed" | "draft" | "constructed",
    // Pass through configs when present so UI can display/use them if needed
    sealedConfig:
      (tournament.settings?.sealedConfig as SealedConfig | null) ?? null,
    draftConfig:
      (tournament.settings?.draftConfig as DraftConfig | null) ?? null,
    createdAt: new Date(tournament.createdAt).getTime(),
    startedAt: tournament.startedAt
      ? new Date(tournament.startedAt).getTime()
      : undefined,
    completedAt: tournament.completedAt
      ? new Date(tournament.completedAt).getTime()
      : undefined,
  };
}

// Minimal interface for the tournaments API we pass from context when enabled
interface TournamentsAPI {
  createTournament: (config: {
    name: string;
    format: "sealed" | "draft" | "constructed";
    maxPlayers: number;
    settings?: Record<string, unknown>;
    registrationMode?: "fixed" | "open";
    registrationLocked?: boolean;
  }) => Promise<unknown>;
  joinTournament: (tournamentId: string) => Promise<void>;
  leaveTournament: (tournamentId: string) => Promise<void>;
  updateTournamentSettings: (
    tournamentId: string,
    settings: Record<string, unknown>
  ) => Promise<void>;
  toggleTournamentRegistrationLock?: (
    tournamentId: string,
    locked: boolean
  ) => Promise<void>;
  toggleTournamentReady: (
    tournamentId: string,
    ready: boolean
  ) => Promise<void>;
  startTournament: (tournamentId: string) => Promise<void>;
  endTournament: (tournamentId: string) => Promise<void>;
  refreshTournaments: () => Promise<void>;
  tournaments: Array<{
    id: string;
    name: string;
    creatorId: string;
    format: string;
    status: string;
    maxPlayers: number;
    registeredPlayers?: Array<{
      id: string;
      displayName?: string | null;
      name?: string | null;
      ready?: boolean;
      avatarUrl?: string | null;
      avatar?: string | null;
      image?: string | null;
      seatStatus?: string | null;
    }>;
    settings?: Record<string, unknown>;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  }>;
}

type CubeOption = {
  id: string;
  name: string;
  cardCount: number;
};

function LobbyPageContent({
  tournamentsApi,
}: {
  tournamentsApi?: TournamentsAPI;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    connected,
    lobby,
    match,
    me,
    joinLobby,
    createLobby,
    leaveLobby,
    startMatch,

    leaveMatch,
    sendChat,
    chatLog,
    chatHasMore,
    chatLoading,
    requestMoreChatHistory,
    resync,
    // New context state/actions
    lobbies,
    players,
    availablePlayers,
    availablePlayersNextCursor,
    availablePlayersLoading,
    playersError,
    invites,
    requestLobbies,
    requestPlayers,
    setLobbyVisibility,
    setLobbyPlan,
    inviteToLobby,
    dismissInvite,
    addCpuBot,
    removeCpuBot,
    voice,
    transport,
  } = useOnline();

  // Check for invite link params
  const inviteLobbyId = searchParams?.get("invite") ?? null;
  const inviteTournamentId = searchParams?.get("tournament") ?? null;
  const [showIneligibleModal, setShowIneligibleModal] = useState(false);
  const [ineligibleReason, setIneligibleReason] = useState<string>("");

  // Get current user's SOATC status
  const { status: myStatus, loading: myStatusLoading } = useSoatcStatus();

  // Tournaments API is provided by parent when the feature is enabled; otherwise undefined
  const tournamentsEnabled = !!tournamentsApi;
  const {
    // createTournament - hidden, use /tournaments page
    joinTournament,
    leaveTournament,
    updateTournamentSettings,
    toggleTournamentRegistrationLock,
    toggleTournamentReady,
    startTournament,
    endTournament,
    refreshTournaments,
    tournaments: tournamentsFromApi,
  } = tournamentsApi ?? {
    // Provide no-op placeholders; these should never be called when disabled as handlers won't be passed further down
    createTournament: async () => {
      throw new Error("Tournaments are disabled");
    },
    joinTournament: async () => {
      throw new Error("Tournaments are disabled");
    },
    leaveTournament: async () => {
      throw new Error("Tournaments are disabled");
    },
    updateTournamentSettings: async () => {
      throw new Error("Tournaments are disabled");
    },
    toggleTournamentRegistrationLock: async () => {
      throw new Error("Tournaments are disabled");
    },
    toggleTournamentReady: async () => {
      throw new Error("Tournaments are disabled");
    },
    startTournament: async () => {
      throw new Error("Tournaments are disabled");
    },
    endTournament: async () => {
      throw new Error("Tournaments are disabled");
    },
    refreshTournaments: async () => {},
    tournaments: [] as TournamentsAPI["tournaments"],
  };

  // After a tournament first transitions to preparing/active, push the player once
  useEffect(() => {
    if (!tournamentsEnabled || !me?.id) return;
    const started = (tournamentsFromApi || []).find(
      (t) =>
        t.registeredPlayers?.some((p) => p.id === me.id) &&
        (t.status === "preparing" || t.status === "active")
    );
    if (!started) return;
    try {
      const key = `sorcery:tournamentRedirected:${started.id}`;
      const already = localStorage.getItem(key) === "1";
      if (!already) {
        localStorage.setItem(key, "1");
        router.push(`/tournaments/${started.id}`);
      }
    } catch {}
  }, [tournamentsEnabled, tournamentsFromApi, me?.id, router]);

  // Tabs removed: we show all sections in the main view
  const [chatInput, setChatInput] = useState("");
  // Default to global when not in a lobby; will auto-switch on join/leave transitions
  const [chatTab, setChatTab] = useState<"lobby" | "global">("global");

  const voiceEnabled = voice?.enabled ?? false;
  const incomingVoiceRequest = voice?.incomingRequest ?? null;
  const outgoingVoiceRequest = voice?.outgoingRequest ?? null;
  const outgoingVoiceTargetName = useMemo(() => {
    if (!outgoingVoiceRequest || !lobby) return null;
    const matchPlayer = lobby.players.find(
      (p) => p.id === outgoingVoiceRequest.targetId
    );
    return matchPlayer?.displayName || null;
  }, [outgoingVoiceRequest, lobby]);
  const incomingVoiceDisplayName = useMemo(() => {
    if (!incomingVoiceRequest) return null;
    return incomingVoiceRequest.from.displayName || null;
  }, [incomingVoiceRequest]);
  const outgoingVoiceStatus = useMemo(() => {
    if (!outgoingVoiceRequest) return null;
    switch (outgoingVoiceRequest.status) {
      case "sending":
        return "Sending request…";
      case "pending":
        return "Waiting for response…";
      case "accepted":
        return voice?.rtc.state === "connected"
          ? "Connected"
          : "Accepted, connecting…";
      case "declined":
        return "Declined";
      case "cancelled":
        return "Request cancelled";
      default:
        return null;
    }
  }, [outgoingVoiceRequest, voice?.rtc.state]);

  const outgoingVoiceTone = useMemo(() => {
    if (!outgoingVoiceRequest) return "text-slate-200";
    switch (outgoingVoiceRequest.status) {
      case "sending":
      case "pending":
        return "text-sky-300";
      case "accepted":
        return "text-emerald-300";
      case "declined":
        return "text-amber-300";
      case "cancelled":
        return "text-slate-400";
      default:
        return "text-slate-200";
    }
  }, [outgoingVoiceRequest]);

  // Match type and sealed/draft configuration
  const [matchType, setMatchType] = useState<
    "constructed" | "sealed" | "draft" | "precon"
  >("constructed");

  // Fetch available sets from the database
  const { setNames: availableSetNames, loading: setsLoading } =
    useAvailableSets();
  // Use fetched sets or fall back to defaults
  const draftableSets =
    availableSetNames.length > 0 ? availableSetNames : DEFAULT_DRAFTABLE_SETS;

  const [sealedConfig, setSealedConfig] = useState<{
    packCounts: Record<string, number>;
    timeLimit: number;
    replaceAvatars: boolean;
    allowDragonlordChampion: boolean;
    cubeId: string | null;
    cubeName: string | null;
    includeCubeSideboardInStandard?: boolean;
    enableSeer: boolean;
    freeAvatars: boolean;
  }>(() => ({
    packCounts: buildDefaultPackCounts(DEFAULT_DRAFTABLE_SETS, DEFAULT_SET, 6),
    timeLimit: 40, // minutes
    replaceAvatars: false,
    allowDragonlordChampion: true,
    cubeId: null,
    cubeName: null,
    includeCubeSideboardInStandard: false,
    enableSeer: true,
    freeAvatars: false,
  }));
  const [sealedUseCube, setSealedUseCube] = useState(false);

  const [draftConfig, setDraftConfig] = useState<{
    setMix: string[];
    packCount: number;
    packSize: number;
    packCounts: Record<string, number>;
    cubeId: string | null;
    cubeName: string | null;
    includeCubeSideboardInStandard?: boolean;
    allowDragonlordChampion?: boolean;
    enableSeer: boolean;
    freeAvatars: boolean;
  }>(() => ({
    setMix: [DEFAULT_SET],
    packCount: 3,
    packSize: 15,
    packCounts: buildDefaultPackCounts(DEFAULT_DRAFTABLE_SETS, DEFAULT_SET, 3),
    cubeId: null,
    cubeName: null,
    includeCubeSideboardInStandard: false,
    allowDragonlordChampion: true,
    enableSeer: true,
    freeAvatars: false,
  }));

  // Update configs when sets load from API
  useEffect(() => {
    if (setsLoading || availableSetNames.length === 0) return;
    // Update sealed config with all available sets (only if new sets exist)
    setSealedConfig((prev) => {
      const missingSets = availableSetNames.filter(
        (name) => !(name in prev.packCounts)
      );
      if (missingSets.length === 0) return prev; // No change needed
      const newPackCounts = { ...prev.packCounts };
      for (const name of missingSets) {
        newPackCounts[name] = 0;
      }
      return { ...prev, packCounts: newPackCounts };
    });
    // Update draft config with all available sets (only if new sets exist)
    setDraftConfig((prev) => {
      if (prev.cubeId) return prev; // Don't modify if using a cube
      const missingSets = availableSetNames.filter(
        (name) => !(name in prev.packCounts)
      );
      if (missingSets.length === 0) return prev; // No change needed
      const newPackCounts = { ...prev.packCounts };
      for (const name of missingSets) {
        newPackCounts[name] = 0;
      }
      return { ...prev, packCounts: newPackCounts };
    });
  }, [setsLoading, availableSetNames]);
  const [draftUseCube, setDraftUseCube] = useState(false);
  const [availableCubes, setAvailableCubes] = useState<CubeOption[]>([]);
  const [cubesLoading, setCubesLoading] = useState(false);
  const [cubeError, setCubeError] = useState<string | null>(null);
  const [selectedCubeId, setSelectedCubeId] = useState<string | null>(null);
  const [savedPackCounts, setSavedPackCounts] = useState<Record<
    string,
    number
  > | null>(null);

  const loadCubes = useCallback(async () => {
    if (!draftUseCube) return;
    setCubesLoading(true);
    setCubeError(null);
    try {
      const res = await fetch("/api/cubes", { cache: "no-store" });
      if (!res.ok) {
        throw new Error("Failed to load cubes");
      }
      const data = await res.json().catch(() => null);

      const raw = (data || null) as
        | { myCubes?: CubeSummaryInput[]; publicCubes?: CubeSummaryInput[] }
        | CubeSummaryInput[]
        | null;

      let candidateList: CubeSummaryInput[] = [];
      if (raw && !Array.isArray(raw)) {
        const my = Array.isArray(raw.myCubes) ? raw.myCubes : [];
        const pub = Array.isArray(raw.publicCubes) ? raw.publicCubes : [];
        candidateList = [...my, ...pub];
      } else if (Array.isArray(raw)) {
        candidateList = raw;
      }

      const normalizedSummaries = candidateList
        .map((entry) => normalizeCubeSummary(entry))
        .filter((cube) => cube.id.trim().length > 0);
      const normalized = normalizedSummaries.map((cube) => ({
        id: cube.id,
        name: cube.name,
        cardCount: cube.cardCount,
      }));
      setAvailableCubes(normalized);
      if (!normalized.length) {
        setCubeError(
          "No cubes are available yet. Visit the Cubes page to create one or explore public cubes."
        );
        setSelectedCubeId(null);
        setDraftConfig((prev) => ({
          ...prev,
          cubeId: null,
          cubeName: null,
          packCounts: {},
        }));
        return;
      }
      const existing =
        normalized.find((cube) => cube.id === selectedCubeId) ?? normalized[0];
      setSelectedCubeId(existing.id);
      setDraftConfig((prev) => ({
        ...prev,
        cubeId: existing.id,
        cubeName: existing.name,
        packCounts: { [existing.name]: prev.packCount },
        setMix: [existing.name],
      }));
    } catch (err) {
      setCubeError(err instanceof Error ? err.message : "Failed to load cubes");
      setSelectedCubeId(null);
      setDraftConfig((prev) => ({
        ...prev,
        cubeId: null,
        cubeName: null,
        packCounts: {},
        setMix: prev.setMix,
      }));
    } finally {
      setCubesLoading(false);
    }
  }, [draftUseCube, selectedCubeId, setDraftConfig]);

  useEffect(() => {
    if (!draftUseCube && !sealedUseCube) return;
    void loadCubes();
  }, [draftUseCube, sealedUseCube, loadCubes]);

  const handleCubeToggle = (enabled: boolean) => {
    if (enabled) {
      setSavedPackCounts(draftConfig.packCounts);
      setDraftUseCube(true);
      setAvailableCubes([]);
      setCubeError(null);
      setSelectedCubeId((prev) => prev);
      setDraftConfig((prev) => ({
        ...prev,
        cubeId: null,
        cubeName: null,
        packCounts: {},
        includeCubeSideboardInStandard: false,
      }));
    } else {
      setDraftUseCube(false);
      setCubeError(null);
      setCubesLoading(false);
      setAvailableCubes([]);
      setSelectedCubeId(null);
      setDraftConfig((prev) => {
        const restore =
          savedPackCounts ??
          buildDefaultPackCounts(draftableSets, DEFAULT_SET, prev.packCount);
        const total = Object.values(restore).reduce(
          (sum, count) => sum + count,
          0
        );
        const fallback = buildDefaultPackCounts(
          draftableSets,
          DEFAULT_SET,
          prev.packCount
        );
        return {
          ...prev,
          cubeId: null,
          cubeName: null,
          packCounts: total === prev.packCount ? restore : fallback,
          setMix: total === prev.packCount ? prev.setMix : [DEFAULT_SET],
          includeCubeSideboardInStandard: isHost
            ? prev.includeCubeSideboardInStandard
            : false,
        };
      });
    }
  };

  const onCubeSelectChange = useCallback(
    (cubeId: string) => {
      setSelectedCubeId(cubeId);
      const cube = availableCubes.find((entry) => entry.id === cubeId) ?? null;
      setDraftConfig((prev) => {
        if (!cube) {
          return {
            ...prev,
            cubeId: null,
            cubeName: null,
            packCounts: {},
            includeCubeSideboardInStandard: false,
          };
        }
        return {
          ...prev,
          cubeId: cube.id,
          cubeName: cube.name,
          packCounts: { [cube.name]: prev.packCount },
          setMix: [cube.name],
          includeCubeSideboardInStandard: prev.includeCubeSideboardInStandard,
        };
      });
    },
    [availableCubes, setDraftConfig]
  );

  // UI validation helpers
  const sealedTotalPacks = useMemo(
    () => Object.values(sealedConfig.packCounts).reduce((sum, c) => sum + c, 0),
    [sealedConfig.packCounts]
  );
  const sealedActiveSets = useMemo(
    () =>
      Object.entries(sealedConfig.packCounts).filter(([, c]) => c > 0).length,
    [sealedConfig.packCounts]
  );
  const sealedValid = sealedUseCube
    ? !!sealedConfig.cubeId // Cube mode: just need a cube selected
    : sealedActiveSets > 0 && sealedTotalPacks >= 3 && sealedTotalPacks <= 8;

  const draftAssigned = useMemo(
    () => Object.values(draftConfig.packCounts).reduce((sum, c) => sum + c, 0),
    [draftConfig.packCounts]
  );
  const draftValid = useMemo(
    () =>
      draftAssigned === draftConfig.packCount &&
      (!draftUseCube || !!draftConfig.cubeId),
    [draftAssigned, draftConfig.packCount, draftUseCube, draftConfig.cubeId]
  );

  const prevLobbyIdRef = useRef<string | null>(null);

  // Overlay for configuring and confirming match start (host)
  const [configOpen, setConfigOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  // Create match overlay state (shared between MatchmakingPanel and LobbiesCentral)
  const [createMatchOverlayOpen, setCreateMatchOverlayOpen] = useState(false);

  // Track whether the host has confirmed setup at least once for this lobby.
  // Once confirmed, we can auto-start the match as soon as a second player
  // joins (and all players are ready) without forcing the host through the
  // setup overlay a second time.
  const [setupConfirmedOnce, setSetupConfirmedOnce] = useState(false);
  const autoStartAttemptedRef = useRef(false);

  // Track previous match status to detect when match ends
  const prevMatchStatusRef = useRef<string | null>(null);

  // Switch default chat scope on lobby join/leave transitions only (not on every update)
  useEffect(() => {
    const prevId = prevLobbyIdRef.current;
    const currId = lobby?.id ?? null;
    if (!prevId && currId) {
      // Joined or created a lobby
      setChatTab("lobby");
    } else if (prevId && !currId) {
      // Left a lobby
      setChatTab("global");
    }
    // Reset setup tracking when changing lobbies (join, leave, or switch)
    if (prevId !== currId) {
      setSetupConfirmedOnce(false);
      autoStartAttemptedRef.current = false;
    }
    prevLobbyIdRef.current = currId;
  }, [lobby]);

  // For quick matches: sync matchType with lobby's planned type and auto-open setup for host
  const isQuickMatch = !!lobby?.isMatchmakingLobby;
  const prevLobbyPlayerCountRef = useRef<number>(0);

  useEffect(() => {
    if (!lobby) return;
    // Sync match type with lobby's planned type for quick matches
    if (lobby.plannedMatchType && lobby.isMatchmakingLobby) {
      setMatchType(lobby.plannedMatchType);
    }
    // Auto-open config for host in quick match lobbies (sealed/draft need configuration)
    if (lobby.isMatchmakingLobby && me?.id === lobby.hostId && !match) {
      if (
        lobby.plannedMatchType === "sealed" ||
        lobby.plannedMatchType === "draft"
      ) {
        // Small delay to let the UI settle
        setTimeout(() => setConfigOpen(true), 300);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lobby?.id,
    lobby?.isMatchmakingLobby,
    lobby?.plannedMatchType,
    lobby?.hostId,
    me?.id,
    match,
  ]);

  // Notify when a player leaves the lobby
  const lobbyPlayerCount = lobby?.players.length ?? 0;
  useEffect(() => {
    const prevCount = prevLobbyPlayerCountRef.current;
    // Detect player leaving (count decreased)
    if (prevCount > 0 && lobbyPlayerCount < prevCount && lobbyPlayerCount > 0) {
      // Show a toast or notification that opponent left
      console.log("[Lobby] A player left the lobby");
    }
    prevLobbyPlayerCountRef.current = lobbyPlayerCount;
  }, [lobbyPlayerCount]);

  // Note: Removed match leaving tracking since we don't have persistent sessions

  // Note: Removed auto-redirect to match to allow players to choose whether to rejoin

  // Auto-prompt lobby leave when match ends
  useEffect(() => {
    const prevStatus = prevMatchStatusRef.current;
    const currentStatus = match?.status || null;

    // Detect transition from in_progress to ended
    if (prevStatus === "in_progress" && currentStatus === "ended") {
      // Small delay to avoid conflicts with other UI updates
      setTimeout(() => {
        if (!leaveConfirmOpen) {
          // Only show if not already open
          setLeaveConfirmOpen(true);
        }
      }, 500);

      // Allow auto-start to be used again for a subsequent match in the
      // same lobby by resetting the attempt flag and setup confirmation.
      autoStartAttemptedRef.current = false;
      setSetupConfirmedOnce(false);
    }

    prevMatchStatusRef.current = currentStatus;
  }, [match?.status, leaveConfirmOpen]);

  // Track if the user explicitly left this match and declined rejoin (persisted)

  // Dynamic page title
  useEffect(() => {
    const baseTitle = "Contested Realms";
    let title = `${baseTitle} - Lobby`;

    if (lobby && !match) {
      const label =
        lobby.name && lobby.name.trim().length > 0 ? lobby.name : lobby.id;
      title = `${baseTitle} - Lobby: ${label} (${lobby.players.length}/${lobby.maxPlayers})`;
    }

    if (match) {
      // Prefer lobbyName provided by the server to maintain continuity during matches
      if (match.lobbyName && match.lobbyName.trim().length > 0) {
        title = `${baseTitle} - ${match.lobbyName} (${match.status.replaceAll(
          "_",
          " "
        )})`;
      } else {
        const playerNames =
          match.players?.map((p) => p.displayName).join(" vs ") || "Players";
        title = `${baseTitle} - ${playerNames} (${match.status.replaceAll(
          "_",
          " "
        )})`;
      }
    }

    if (!connected) {
      title = `${baseTitle} - Disconnected`;
    }

    document.title = title;
  }, [connected, lobby, match]);

  // Manual join removed with legacy Match Controls section

  // Derived lobby state for control visibility
  const joinedLobby = !!lobby;
  const isHost = joinedLobby && me?.id === lobby.hostId;
  const allReady = useMemo(() => {
    if (!lobby) return false;
    const readyIds = new Set(lobby.readyPlayerIds || []);
    return (
      lobby.players.length > 1 && lobby.players.every((p) => readyIds.has(p.id))
    );
  }, [lobby]);

  const hasAtLeastTwoPlayers = !!lobby && lobby.players.length > 1;

  // Get opponent ID for SOATC shared tournament check
  const opponentId = useMemo(() => {
    if (!lobby || !me?.id) return null;
    const opponent = lobby.players.find((p) => p.id !== me.id);
    return opponent?.id ?? null;
  }, [lobby, me?.id]);

  // Check if both players are in the same SOATC tournament
  const { status: sharedTournament } = useSharedTournament(opponentId);

  // Debug logging for SOATC shared tournament status
  useEffect(() => {
    if (opponentId) {
      console.log("[SOATC] Shared tournament check:", {
        opponentId,
        sharedTournament,
        joinedLobby,
        hasTransport: !!transport,
        lobbyLeagueMatch: lobby?.soatcLeagueMatch,
      });
    }
  }, [
    opponentId,
    sharedTournament,
    joinedLobby,
    transport,
    lobby?.soatcLeagueMatch,
  ]);

  // Auto-set league match on lobby when both players have auto-detect enabled
  useEffect(() => {
    if (
      sharedTournament?.shared &&
      sharedTournament?.bothAutoDetect &&
      sharedTournament?.tournament &&
      transport &&
      joinedLobby &&
      !lobby?.soatcLeagueMatch // Only set if not already set
    ) {
      console.log("[SOATC] Auto-setting league match:", {
        tournamentId: sharedTournament.tournament.id,
        tournamentName: sharedTournament.tournament.name,
      });
      transport.emit("setSoatcLeagueMatch", {
        soatcLeagueMatch: {
          isLeagueMatch: true,
          tournamentId: sharedTournament.tournament.id,
          tournamentName: sharedTournament.tournament.name,
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sharedTournament?.shared,
    sharedTournament?.bothAutoDetect,
    sharedTournament?.tournament,
    lobby?.soatcLeagueMatch,
    joinedLobby,
  ]);

  // Handle invite link with SOATC tournament eligibility check
  useEffect(() => {
    // Wait for myStatus to finish loading before checking eligibility
    if (
      !inviteLobbyId ||
      !inviteTournamentId ||
      !connected ||
      !me?.id ||
      myStatusLoading
    )
      return;

    // Check eligibility
    const checkEligibility = async () => {
      try {
        // Check if user has SOATC UUID (only after status is loaded)
        if (!myStatus?.soatcUuid) {
          setIneligibleReason("no-uuid");
          setShowIneligibleModal(true);
          return;
        }

        // Check if user is registered in the tournament
        const response = await fetch(
          `/api/soatc/tournaments/${inviteTournamentId}/participants`
        );
        if (!response.ok) {
          setIneligibleReason("tournament-check-failed");
          setShowIneligibleModal(true);
          return;
        }

        const data = await response.json();
        const isParticipant = data.participants?.some(
          (p: { id: string }) => p.id === myStatus.soatcUuid
        );

        if (!isParticipant) {
          setIneligibleReason("not-registered");
          setShowIneligibleModal(true);
          return;
        }

        // Get tournament details to check format
        const tournamentResponse = await fetch(
          `/api/soatc/tournaments/${inviteTournamentId}`
        );
        if (tournamentResponse.ok) {
          const tournamentData = await tournamentResponse.json();
          const tournamentFormat = tournamentData.format?.toLowerCase();

          // Check if lobby exists and has a planned match type
          if (lobby && lobby.id === inviteLobbyId) {
            const lobbyFormat = lobby.plannedMatchType?.toLowerCase();

            // Validate format match if tournament has a specific format
            if (
              tournamentFormat &&
              lobbyFormat &&
              tournamentFormat !== lobbyFormat
            ) {
              setIneligibleReason(`format-mismatch:${tournamentFormat}`);
              setShowIneligibleModal(true);
              return;
            }
          }
        }

        // Eligible - join the lobby
        if (!lobby || lobby.id !== inviteLobbyId) {
          await joinLobby(inviteLobbyId);
        }
      } catch (error) {
        console.error("Failed to check SOATC eligibility:", error);
        setIneligibleReason("check-failed");
        setShowIneligibleModal(true);
      }
    };

    checkEligibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inviteLobbyId,
    inviteTournamentId,
    connected,
    me?.id,
    myStatus?.soatcUuid,
    myStatusLoading,
    lobby?.id,
    lobby?.plannedMatchType,
  ]);

  // Determine if this client is rejoining an ongoing match (not used in simplified CTA)

  // Local flags: has deck been submitted for sealed/draft flows?
  const hasSubmittedForMatch = useMemo(() => {
    if (!match?.id) return { sealed: false, draft: false } as const;
    try {
      const sealed =
        localStorage.getItem(`sealed_submitted_${match.id}`) === "true";
      const draft =
        localStorage.getItem(`draft_submitted_${match.id}`) === "true";
      return { sealed, draft } as const;
    } catch {
      return { sealed: false, draft: false } as const;
    }
  }, [match?.id]);

  // Check if current user is actually a player in the match (not a spectator who happened to watch it)
  const isPlayerInMatch = useMemo(() => {
    if (!match || !me?.id) return false;
    // Check playerIds array (preferred)
    if (Array.isArray(match.playerIds) && match.playerIds.includes(me.id)) {
      return true;
    }
    // Fallback: check players array
    if (Array.isArray(match.players)) {
      return match.players.some((p) => p.id === me.id);
    }
    return false;
  }, [match, me?.id]);

  const matchCta = useMemo(() => {
    if (!match || !isPlayerInMatch)
      return { label: "", disabled: true } as const;
    if (match.status === "ended")
      return { label: "Match Ended", disabled: true } as const;

    // Draft-specific phases
    if (match.matchType === "draft") {
      if (match.status === "waiting") {
        return { label: "Join Draft Session", disabled: false } as const;
      }
      if (match.status === "deck_construction" && !hasSubmittedForMatch.draft) {
        return {
          label: "Join Deck Construction for Draft",
          disabled: false,
        } as const;
      }
    }

    // Sealed deck construction
    if (
      match.matchType === "sealed" &&
      match.status === "deck_construction" &&
      !hasSubmittedForMatch.sealed
    ) {
      return {
        label: "Join Deck Construction for Sealed",
        disabled: false,
      } as const;
    }

    // Waiting/default should always say Join (avoid confusing "Rejoin" wording before first entry)
    if (match.status === "waiting")
      return { label: "Join Match", disabled: false } as const;

    // In-progress
    if (match.status === "in_progress")
      return { label: "Rejoin Game", disabled: false } as const;

    // Fallback
    return { label: "Join Match", disabled: false } as const;
  }, [match, hasSubmittedForMatch, isPlayerInMatch]);

  // Auto-start logic: once the host has confirmed setup at least once for
  // this lobby, automatically start the match as soon as there are at least
  // two players in the lobby and all are ready.
  useEffect(() => {
    if (!isHost) return;
    if (!setupConfirmedOnce) return;
    if (!lobby || lobby.status !== "open") return;
    if (match) return;
    if (!hasAtLeastTwoPlayers || !allReady) return;
    if (autoStartAttemptedRef.current) return;

    // Do not attempt auto-start with invalid configurations
    if (matchType === "sealed" && !sealedValid) return;
    if (matchType === "draft" && !draftValid) return;

    autoStartAttemptedRef.current = true;

    // Get SOATC league match info from lobby
    const soatcPayload = lobby?.soatcLeagueMatch || null;

    if (matchType === "constructed" || matchType === "precon") {
      startMatch({ matchType, soatcLeagueMatch: soatcPayload });
      return;
    }

    if (matchType === "draft") {
      const activeSets = Object.entries(draftConfig.packCounts)
        .filter(([, c]) => c > 0)
        .map(([s]) => s);
      const payload = {
        ...draftConfig,
        setMix: activeSets.length ? activeSets : draftConfig.setMix,
      };
      startMatch({
        matchType: "draft",
        draftConfig: payload,
        soatcLeagueMatch: soatcPayload,
      });
      return;
    }

    // Sealed
    const totalPacks = Object.values(sealedConfig.packCounts).reduce(
      (sum, count) => sum + count,
      0
    );
    const activeSets = Object.entries(sealedConfig.packCounts).filter(
      ([, count]) => count > 0
    );
    if (activeSets.length === 0) return;
    const setMix = activeSets.map(([set]) => set);
    const legacySealedConfig = {
      packCount: totalPacks,
      setMix,
      timeLimit: sealedConfig.timeLimit,
      packCounts: sealedConfig.packCounts,
      replaceAvatars: sealedConfig.replaceAvatars,
      allowDragonlordChampion: sealedConfig.allowDragonlordChampion,
      enableSeer: sealedConfig.enableSeer,
      freeAvatars: sealedConfig.freeAvatars,
    };
    startMatch({
      matchType: "sealed",
      sealedConfig: legacySealedConfig,
      soatcLeagueMatch: soatcPayload,
    });
  }, [
    isHost,
    setupConfirmedOnce,
    lobby,
    match,
    hasAtLeastTwoPlayers,
    allReady,
    matchType,
    startMatch,
    draftConfig,
    sealedConfig,
    sealedValid,
    draftValid,
  ]);

  // Planned match summary (client-side, only reliable for host)
  const plannedSummary = useMemo(() => {
    if (!isHost) return null;
    if (matchType === "precon") return "Planned: Precon Match";
    if (matchType === "constructed") return "Planned: Constructed";
    if (matchType === "draft") {
      if (draftConfig.cubeId) {
        const label = draftConfig.cubeName || "Custom Cube";
        return `Planned: Draft • Cube: ${label} • Packs: ${draftConfig.packCount}`;
      }
      const entries = Object.entries(draftConfig.packCounts || {}).filter(
        ([, c]) => c > 0
      );
      const mix = entries.length
        ? entries.map(([s, c]) => `${s}×${c}`).join(", ")
        : draftConfig.setMix.join(", ");
      return `Planned: Draft • Mix: ${mix} • Packs: ${draftConfig.packCount}`;
    }
    const totalPacks = Object.values(sealedConfig.packCounts).reduce(
      (sum, count) => sum + count,
      0
    );
    const activeSets = Object.entries(sealedConfig.packCounts)
      .filter(([, count]) => count > 0)
      .map(([set]) => set);
    return `Planned: Sealed • Packs: ${totalPacks} • Sets: ${activeSets.join(
      ", "
    )} • Time: ${sealedConfig.timeLimit}m`;
  }, [isHost, matchType, sealedConfig, draftConfig]);

  // removed startSealedMatch helper; start is confirmed via modal action

  return (
    <OnlinePageShell>
      <div className="space-y-6">
        {/* Quick Play / Matchmaking - show when not in a lobby, and either no match or user is not a player in the match (spectators should still see this) */}
        {!lobby && (!match || !isPlayerInMatch) && (
          <MatchmakingPanel
            onCreateMatch={() => setCreateMatchOverlayOpen(true)}
          />
        )}

        {/* Match Controls - show only when user is actually a player in the match (not spectator) */}
        {match && isPlayerInMatch && (
          <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold opacity-90">
              Match Controls
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:block text-xs opacity-70">
                {match.matchType?.toUpperCase()} • Status:{" "}
                {match.status.replaceAll("_", " ")}
                {match.lobbyName ? ` • ${match.lobbyName}` : ""}
              </div>
              <button
                className={`rounded-lg px-4 py-2 text-sm font-semibold shadow ${
                  matchCta.disabled
                    ? "bg-slate-700/80 text-slate-300 cursor-not-allowed"
                    : "bg-blue-600/90 hover:bg-blue-600"
                }`}
                onClick={() => {
                  if (!matchCta.disabled && match?.id) {
                    router.push(`/online/play/${encodeURIComponent(match.id)}`);
                  }
                }}
                disabled={matchCta.disabled}
                title={
                  matchCta.disabled
                    ? "Match has ended"
                    : `Go to match ${match.id}`
                }
              >
                {matchCta.label}
              </button>
              <button
                className="rounded bg-red-600/80 hover:bg-red-600 px-4 py-2 text-sm font-medium transition-colors"
                onClick={() => setLeaveConfirmOpen(true)}
                title="Leave current match"
              >
                Leave Match
              </button>
            </div>
          </div>
        )}
        {/* SOATC League Match indicator */}
        {lobby?.soatcLeagueMatch?.isLeagueMatch && (
          <div className="rounded-xl bg-gradient-to-r from-amber-900/40 to-amber-800/20 ring-1 ring-amber-500/40 p-4 flex items-center gap-3">
            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-amber-200">
                SATC League Match
              </div>
              <div className="text-xs text-amber-300/70 truncate">
                {lobby.soatcLeagueMatch.tournamentName}
              </div>
            </div>
            {lobby.players &&
              lobby.players.length < (lobby.maxPlayers || 2) && (
                <button
                  className="rounded-lg bg-amber-600/20 hover:bg-amber-600/30 ring-1 ring-amber-500/50 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors shrink-0"
                  onClick={() => {
                    if (lobby?.soatcLeagueMatch?.tournamentId) {
                      const inviteUrl = `${
                        window.location.origin
                      }/online/lobby?invite=${encodeURIComponent(
                        lobby.id
                      )}&tournament=${encodeURIComponent(
                        lobby.soatcLeagueMatch.tournamentId
                      )}`;
                      navigator.clipboard.writeText(inviteUrl);
                      alert(
                        "Invite link copied! Share with tournament participants."
                      );
                    }
                  }}
                  title="Copy invite link for tournament participants"
                >
                  Copy Invite Link
                </button>
              )}
          </div>
        )}
        {/* Host-only match start/config controls, only when lobby is open, all players ready, and no active match exists */}
        {isHost && !match && lobby?.status === "open" && allReady && (
          <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-semibold opacity-90">
              Host Controls
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 px-5 py-2.5 text-base font-semibold shadow"
                onClick={() => setConfigOpen(true)}
                title="Set up match and start when all players are ready"
              >
                Set up and Start
              </button>
            </div>
          </div>
        )}
        {voiceEnabled && (incomingVoiceRequest || outgoingVoiceRequest) && (
          <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3">
            {incomingVoiceRequest && voice && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
                <div>
                  <span className="font-semibold">
                    {incomingVoiceDisplayName || incomingVoiceRequest.from.id}
                  </span>{" "}
                  wants to start a voice chat.
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded bg-emerald-600/80 hover:bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white"
                    onClick={() =>
                      voice.respondToRequest(
                        incomingVoiceRequest.requestId,
                        incomingVoiceRequest.from.id,
                        true
                      )
                    }
                  >
                    Accept
                  </button>
                  <button
                    className="rounded bg-rose-600/80 hover:bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white"
                    onClick={() =>
                      voice.respondToRequest(
                        incomingVoiceRequest.requestId,
                        incomingVoiceRequest.from.id,
                        false
                      )
                    }
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}
            {outgoingVoiceRequest && outgoingVoiceStatus && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm">
                <div>
                  Voice request to{" "}
                  <span className="font-semibold">
                    {outgoingVoiceTargetName || outgoingVoiceRequest.targetId}
                  </span>
                  :{" "}
                  <span className={`${outgoingVoiceTone} font-medium`}>
                    {outgoingVoiceStatus}
                  </span>
                </div>
                {voice &&
                  ["declined", "cancelled"].includes(
                    outgoingVoiceRequest.status
                  ) && (
                    <button
                      className="self-start rounded bg-slate-700/80 hover:bg-slate-700 px-3 py-1 text-xs text-slate-200"
                      onClick={voice.dismissOutgoingRequest}
                    >
                      Dismiss
                    </button>
                  )}
              </div>
            )}
          </div>
        )}
        {/* Lobbies (central, full width) */}
        <LobbiesCentral
          lobbies={lobbies}
          tournaments={(tournamentsEnabled ? tournamentsFromApi : []).map(
            mapToProtocolTournament
          )}
          myId={me?.id ?? null}
          joinedLobbyId={lobby?.id ?? null}
          onJoin={(id) => joinLobby(id)}
          onCreate={async (cfg) => {
            console.log(
              `Creating lobby: "${cfg.name}" with ${cfg.maxPlayers} max players`
            );
            try {
              await createLobby({
                name: cfg.name,
                visibility: cfg.visibility,
                maxPlayers: cfg.maxPlayers,
              });
            } catch (error) {
              console.error("Failed to create lobby:", error);
              return;
            }

            setConfigOpen(true);
          }}
          onLeaveLobby={leaveLobby}
          onSetLobbyVisibility={(v) => setLobbyVisibility(v)}
          onResync={() => resync()}
          onAddCpuBot={addCpuBot}
          onRemoveCpuBot={removeCpuBot}
          voiceSupport={
            voice?.enabled && lobby
              ? {
                  enabled: true,
                  outgoingRequest: voice.outgoingRequest,
                  incomingFrom: voice.incomingRequest?.from.id ?? null,
                  onRequest: voice.requestConnection,
                  connectedPeerIds: voice.connectedPeerIds,
                }
              : null
          }
          onCreateTournament={undefined /* hidden - use /tournaments page */}
          onJoinTournament={
            tournamentsEnabled
              ? async (tournamentId: string) => {
                  console.log(`Joining tournament: ${tournamentId}`);
                  try {
                    await joinTournament(tournamentId);
                  } catch (error) {
                    console.error("Failed to join tournament:", error);
                  }
                }
              : undefined
          }
          onLeaveTournament={
            tournamentsEnabled
              ? async (tournamentId: string) => {
                  console.log(`Leaving tournament: ${tournamentId}`);
                  try {
                    await leaveTournament(tournamentId);
                  } catch (error) {
                    console.error("Failed to leave tournament:", error);
                  }
                }
              : undefined
          }
          onUpdateTournamentSettings={
            tournamentsEnabled
              ? async (tournamentId: string, settings) => {
                  console.log(
                    `Updating tournament settings: ${tournamentId}`,
                    settings
                  );
                  try {
                    await updateTournamentSettings(tournamentId, settings);
                  } catch (error) {
                    console.error(
                      "Failed to update tournament settings:",
                      error
                    );
                  }
                }
              : undefined
          }
          onToggleTournamentRegistrationLock={
            tournamentsEnabled
              ? async (tournamentId: string, locked: boolean) => {
                  console.log(
                    `Toggling tournament registration lock: ${tournamentId}`,
                    locked
                  );
                  try {
                    await toggleTournamentRegistrationLock?.(
                      tournamentId,
                      locked
                    );
                  } catch (error) {
                    console.error(
                      "Failed to toggle tournament registration lock:",
                      error
                    );
                  }
                }
              : undefined
          }
          onToggleTournamentReady={
            tournamentsEnabled
              ? async (tournamentId: string, ready: boolean) => {
                  console.log(
                    `Toggling tournament ready: ${tournamentId}`,
                    ready
                  );
                  try {
                    await toggleTournamentReady(tournamentId, ready);
                  } catch (error) {
                    console.error("Failed to toggle tournament ready:", error);
                  }
                }
              : undefined
          }
          onStartTournament={
            tournamentsEnabled
              ? async (tournamentId: string) => {
                  console.log(`Starting tournament: ${tournamentId}`);
                  try {
                    await startTournament(tournamentId);
                  } catch (error) {
                    console.error("Failed to start tournament:", error);
                  }
                }
              : undefined
          }
          onEndTournament={
            tournamentsEnabled
              ? async (tournamentId: string) => {
                  console.log(`Ending tournament: ${tournamentId}`);
                  try {
                    await endTournament(tournamentId);
                  } catch (error) {
                    console.error("Failed to end tournament:", error);
                  }
                }
              : undefined
          }
          tournamentsEnabled={tournamentsEnabled}
          externalOverlayOpen={createMatchOverlayOpen}
          onExternalOverlayChange={setCreateMatchOverlayOpen}
          soatcStatus={myStatus}
          onRefresh={async () => {
            try {
              await requestLobbies();
            } catch {}
            if (tournamentsEnabled) {
              try {
                await refreshTournaments();
              } catch {}
            }
          }}
        />

        {/* Leave Match confirmation dialog */}
        {leaveConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setLeaveConfirmOpen(false)}
            />
            <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-md p-5">
              <div className="text-base font-semibold">Leave match</div>
              <div className="mt-2 text-sm text-slate-300">
                Are you sure you want to leave the match?
              </div>
              <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-end">
                <button
                  className="px-4 py-2 text-sm rounded bg-slate-700/70 hover:bg-slate-600/70"
                  onClick={() => setLeaveConfirmOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 text-sm rounded bg-red-600/90 hover:bg-red-600 text-white"
                  onClick={() => {
                    try {
                      leaveMatch();
                    } finally {
                      try {
                        leaveLobby();
                      } catch {}
                      setLeaveConfirmOpen(false);
                    }
                  }}
                >
                  Leave Match
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Social and Chat row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-stretch">
          {/* Friends + Invites Panel */}
          <div
            className={`rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3 h-full`}
          >
            {/* Invites count indicator */}
            {invites && invites.length > 0 && (
              <div className="text-xs text-indigo-300">
                {invites.length} pending invite{invites.length > 1 ? "s" : ""}
              </div>
            )}

            {/* Friends browser */}
            <div id="players-invite-panel">
              <PlayersInvitePanel
                players={players}
                available={availablePlayers}
                loading={availablePlayersLoading}
                nextCursor={availablePlayersNextCursor}
                requestPlayers={requestPlayers}
                error={playersError}
                me={me}
                lobby={lobby}
                onInvite={(pid, lid) => inviteToLobby(pid, lid)}
              />
            </div>
          </div>

          {/* Inline lobby chat console (global + lobby scopes) */}
          <div className="h-full min-h-[20rem] max-h-[28rem]">
            <LobbyChatConsole
              connected={connected}
              chatLog={chatLog}
              chatTab={chatTab}
              setChatTab={setChatTab}
              chatInput={chatInput}
              setChatInput={setChatInput}
              onSendChat={(message, scope) => sendChat(message, scope)}
              myPlayerId={me?.id ?? null}
              chatHasMore={chatHasMore}
              chatLoading={chatLoading}
              onRequestMoreHistory={requestMoreChatHistory}
              inline
            />
          </div>
        </div>
        {/* Match Configuration Overlay (Host) */}
        {isHost && configOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setConfigOpen(false)}
            />
            <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-xl p-5">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold">
                  Match Configuration
                </div>
                <button
                  className="text-slate-300 hover:text-white text-sm"
                  onClick={() => setConfigOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="mt-3 space-y-4">
                {/* Tournament Match Mode - show if player is in a SOATC tournament matching the selected game type */}
                {(() => {
                  // Filter tournaments by selected match type
                  const matchingTournaments =
                    myStatus?.tournaments?.filter(
                      (t) => t.gameType?.toLowerCase() === matchType
                    ) || [];

                  if (matchingTournaments.length === 0) return null;

                  // Use first matching tournament or selected one
                  const selectedTournament = matchingTournaments[0];
                  const isTournamentMode =
                    lobby?.soatcLeagueMatch?.isLeagueMatch === true;

                  return (
                    <div className="p-3 rounded-lg bg-amber-900/20 ring-1 ring-amber-500/30">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isTournamentMode}
                          onChange={(e) => {
                            if (transport && selectedTournament) {
                              if (e.target.checked) {
                                // Set the SOATC league match flag
                                transport.emit("setSoatcLeagueMatch", {
                                  soatcLeagueMatch: {
                                    isLeagueMatch: true,
                                    tournamentId: selectedTournament.id,
                                    tournamentName: selectedTournament.name,
                                  },
                                });
                                // Also set visibility to tournament
                                if (setLobbyVisibility) {
                                  setLobbyVisibility("tournament");
                                }
                              } else {
                                // Clear the SOATC league match flag
                                transport.emit("setSoatcLeagueMatch", {
                                  soatcLeagueMatch: null,
                                });
                                if (setLobbyVisibility) {
                                  setLobbyVisibility("open");
                                }
                              }
                            }
                          }}
                          className="mt-0.5 rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-amber-200">
                            <Trophy className="w-4 h-4 shrink-0" />
                            <span>Tournament Match</span>
                          </div>
                          <div className="text-xs text-amber-300/80 mt-1">
                            {selectedTournament.name}
                          </div>
                          <div className="text-xs text-amber-300/60 mt-0.5 flex items-center gap-2">
                            <span>Invite-only • Spectators enabled</span>
                            {selectedTournament.playersCount && (
                              <span className="text-amber-400/70">
                                • {selectedTournament.playersCount} players
                              </span>
                            )}
                          </div>
                        </div>
                      </label>

                      {/* Tournament Invite Link - show when tournament mode is enabled */}
                      {isTournamentMode && lobby && (
                        <div className="mt-3 pt-3 border-t border-amber-500/20">
                          <label className="block text-xs font-medium mb-2 text-amber-200">
                            Tournament Invite Link
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={`${window.location.origin}/online/lobby?invite=${lobby.id}&tournament=${selectedTournament.id}`}
                              className="flex-1 bg-slate-900/60 ring-1 ring-amber-500/30 rounded px-2 py-1.5 text-xs font-mono text-slate-200"
                            />
                            <button
                              className="rounded-lg bg-amber-600/20 hover:bg-amber-600/30 ring-1 ring-amber-500/50 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors"
                              onClick={() => {
                                const inviteUrl = `${
                                  window.location.origin
                                }/online/lobby?invite=${encodeURIComponent(
                                  lobby.id
                                )}&tournament=${encodeURIComponent(
                                  selectedTournament.id
                                )}`;
                                navigator.clipboard.writeText(inviteUrl);
                                alert("Invite link copied!");
                              }}
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Open Lobby section - applies to all lobbies */}
                {lobby && !lobby.hostReady && (
                  <div className="rounded-lg bg-slate-800/50 ring-1 ring-slate-700 p-3">
                    <p className="text-xs text-slate-300 mb-2">
                      Other players cannot join until you open the lobby.
                    </p>
                    <button
                      className="w-full rounded-lg bg-emerald-600/80 hover:bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors"
                      onClick={() => {
                        if (transport?.openLobby) {
                          transport.openLobby();
                        }
                      }}
                    >
                      Open Lobby for Players
                    </button>
                  </div>
                )}
                {lobby && lobby.hostReady && (
                  <div className="rounded-lg bg-emerald-900/30 ring-1 ring-emerald-700/50 p-3">
                    <p className="text-xs text-emerald-400">
                      ✓ Lobby is open - waiting for players to join
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium mb-2">
                    Match Type
                    {isQuickMatch && (
                      <span className="ml-2 text-xs text-slate-400">
                        (locked for Quick Play)
                      </span>
                    )}
                  </label>
                  <div className="flex gap-2">
                    <button
                      className={`px-3 py-2 text-sm rounded transition-colors ${
                        matchType === "constructed"
                          ? "bg-indigo-600/80 text-white"
                          : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                      } ${isQuickMatch ? "opacity-60 cursor-not-allowed" : ""}`}
                      onClick={() => {
                        if (isQuickMatch) return;
                        setMatchType("constructed");
                        if (isHost && setLobbyPlan) setLobbyPlan("constructed");
                      }}
                      disabled={isQuickMatch}
                    >
                      Constructed
                    </button>
                    <button
                      className={`px-3 py-2 text-sm rounded transition-colors ${
                        matchType === "sealed"
                          ? "bg-indigo-600/80 text-white"
                          : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                      } ${isQuickMatch ? "opacity-60 cursor-not-allowed" : ""}`}
                      onClick={() => {
                        if (isQuickMatch) return;
                        setMatchType("sealed");
                        if (isHost && setLobbyPlan) setLobbyPlan("sealed");
                      }}
                      disabled={isQuickMatch}
                    >
                      Sealed
                    </button>
                    <button
                      className={`px-3 py-2 text-sm rounded transition-colors ${
                        matchType === "draft"
                          ? "bg-indigo-600/80 text-white"
                          : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                      } ${isQuickMatch ? "opacity-60 cursor-not-allowed" : ""}`}
                      onClick={() => {
                        if (isQuickMatch) return;
                        setMatchType("draft");
                        if (isHost && setLobbyPlan) setLobbyPlan("draft");
                      }}
                      disabled={isQuickMatch}
                    >
                      Draft
                    </button>
                  </div>
                </div>
                {matchType === "draft" && (
                  <div>
                    <label className="block text-xs font-medium mb-3">
                      Draft Configuration
                    </label>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={draftUseCube}
                            onChange={(e) => handleCubeToggle(e.target.checked)}
                            className="rounded"
                          />
                          <span>
                            Use one of your cubes as the booster source
                          </span>
                        </label>
                        {draftUseCube ? (
                          <div className="space-y-2 rounded-lg bg-slate-800/60 ring-1 ring-slate-700 p-3 text-sm">
                            {cubesLoading ? (
                              <div className="text-xs text-slate-300">
                                Loading cubes...
                              </div>
                            ) : null}
                            {cubeError ? (
                              <div className="text-xs text-red-300 bg-red-900/30 rounded px-3 py-2 ring-1 ring-red-800/40">
                                {cubeError}
                              </div>
                            ) : (
                              <>
                                <label className="block text-xs font-medium mb-1">
                                  Select cube
                                </label>
                                <select
                                  value={selectedCubeId ?? ""}
                                  onChange={(e) =>
                                    onCubeSelectChange(e.target.value)
                                  }
                                  className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                                >
                                  <option value="" disabled>
                                    Choose a cube…
                                  </option>
                                  {availableCubes.map((cube) => (
                                    <option key={cube.id} value={cube.id}>
                                      {cube.name} ({cube.cardCount} cards)
                                    </option>
                                  ))}
                                </select>
                                {selectedCubeId && !cubeError ? (
                                  <div className="text-xs text-slate-300/90">
                                    Packs will be generated from{" "}
                                    {availableCubes.find(
                                      (cube) => cube.id === selectedCubeId
                                    )?.name ?? "your cube"}
                                    .
                                  </div>
                                ) : null}
                                <p className="text-xs text-slate-400">
                                  Manage cubes on the{" "}
                                  <Link
                                    href="/cubes"
                                    className="underline text-slate-200 hover:text-white"
                                  >
                                    Cubes page
                                  </Link>
                                  .
                                </p>
                                <label className="mt-2 flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={
                                      !!draftConfig.includeCubeSideboardInStandard
                                    }
                                    onChange={(e) =>
                                      setDraftConfig((prev) => ({
                                        ...prev,
                                        includeCubeSideboardInStandard:
                                          e.target.checked,
                                      }))
                                    }
                                  />
                                  <span>
                                    When drafting from a cube, offer the
                                    cube&apos;s sideboard cards in the standard
                                    card pool during deckbuilding.
                                  </span>
                                </label>
                              </>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">
                            Draft from official set boosters. Adjust the pack
                            mix below.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-2">
                          Number of Packs
                        </label>
                        <select
                          value={draftConfig.packCount}
                          onChange={(e) => {
                            const nextCount = parseInt(e.target.value) || 3;
                            setDraftConfig((prev) => {
                              if (draftUseCube) {
                                const cube =
                                  availableCubes.find(
                                    (entry) =>
                                      entry.id ===
                                      (selectedCubeId ?? prev.cubeId ?? "")
                                  ) ?? null;
                                const label =
                                  cube?.name ?? prev.cubeName ?? null;
                                return {
                                  ...prev,
                                  packCount: nextCount,
                                  packCounts: label
                                    ? { [label]: nextCount }
                                    : {},
                                  setMix: label ? [label] : prev.setMix,
                                };
                              }
                              const total = Object.values(
                                prev.packCounts
                              ).reduce((s, c) => s + c, 0);
                              const packs = { ...prev.packCounts };
                              if (total > nextCount) {
                                // Remove from sets in reverse order (newest sets first)
                                const order = [...draftableSets].reverse();
                                let excess = total - nextCount;
                                for (const name of order) {
                                  const take = Math.min(
                                    excess,
                                    packs[name] || 0
                                  );
                                  if (take > 0) {
                                    packs[name] = (packs[name] || 0) - take;
                                    excess -= take;
                                  }
                                  if (excess <= 0) break;
                                }
                              } else if (total < nextCount) {
                                // Add to default set
                                const defaultSet =
                                  draftableSets[0] || DEFAULT_SET;
                                packs[defaultSet] =
                                  (packs[defaultSet] || 0) +
                                  (nextCount - total);
                              }
                              return {
                                ...prev,
                                packCount: nextCount,
                                packCounts: packs,
                              };
                            });
                          }}
                          className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                        >
                          <option value={3}>3 Packs</option>
                          <option value={4}>4 Packs</option>
                        </select>
                      </div>
                      {!draftUseCube && (
                        <div>
                          <label className="block text-xs font-medium mb-2">
                            Exact Pack Mix (sum must equal{" "}
                            {draftConfig.packCount})
                            <span
                              className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] ring-1 ${
                                draftValid
                                  ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                                  : "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                              }`}
                            >
                              {draftValid
                                ? "OK"
                                : draftAssigned < draftConfig.packCount
                                ? `Need ${
                                    draftConfig.packCount - draftAssigned
                                  }`
                                : `Remove ${
                                    draftAssigned - draftConfig.packCount
                                  }`}
                            </span>
                          </label>
                          <div className="space-y-2">
                            {draftableSets.map((set) => {
                              const count = draftConfig.packCounts[set] || 0;
                              const total = Object.values(
                                draftConfig.packCounts
                              ).reduce((s, c) => s + c, 0);
                              const canInc = total < draftConfig.packCount;
                              const canDec = count > 0;
                              return (
                                <div
                                  key={set}
                                  className="flex items-center justify-between"
                                >
                                  <span className="text-sm">{set}</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                                      onClick={() =>
                                        setDraftConfig((prev) => ({
                                          ...prev,
                                          setMix: Array.from(
                                            new Set([
                                              ...(prev.setMix || []),
                                              set,
                                            ])
                                          ),
                                          packCounts: {
                                            ...prev.packCounts,
                                            [set]: Math.max(
                                              0,
                                              (prev.packCounts[set] || 0) - 1
                                            ),
                                          },
                                        }))
                                      }
                                      disabled={!canDec}
                                    >
                                      −
                                    </button>
                                    <span className="w-8 text-center text-sm font-medium">
                                      {count}
                                    </span>
                                    <button
                                      className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                                      onClick={() =>
                                        setDraftConfig((prev) => ({
                                          ...prev,
                                          setMix: Array.from(
                                            new Set([
                                              ...(prev.setMix || []),
                                              set,
                                            ])
                                          ),
                                          packCounts: {
                                            ...prev.packCounts,
                                            [set]: Math.min(
                                              prev.packCount,
                                              (prev.packCounts[set] || 0) + 1
                                            ),
                                          },
                                        }))
                                      }
                                      disabled={!canInc}
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm mt-2">
                        <input
                          type="checkbox"
                          checked={draftConfig.enableSeer}
                          onChange={(e) =>
                            setDraftConfig((prev) => ({
                              ...prev,
                              enableSeer: e.target.checked,
                            }))
                          }
                          className="rounded"
                        />
                        <span>Enable Second Seer (2nd player scries 1)</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm mt-2">
                        <input
                          type="checkbox"
                          checked={draftConfig.freeAvatars}
                          onChange={(e) =>
                            setDraftConfig((prev) => ({
                              ...prev,
                              freeAvatars: e.target.checked,
                            }))
                          }
                          className="rounded"
                        />
                        <span>
                          Free Avatars (remove from packs, all available in deck
                          editor)
                        </span>
                      </label>
                    </div>
                  </div>
                )}
                {matchType === "sealed" && (
                  <>
                    <div>
                      <label className="block text-xs font-medium mb-3">
                        Sealed Configuration
                      </label>
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={sealedUseCube}
                            onChange={(e) => {
                              const useCube = e.target.checked;
                              setSealedUseCube(useCube);
                              if (useCube) {
                                // When enabling cube mode, load cubes
                                setSealedConfig((prev) => ({
                                  ...prev,
                                  cubeId: null,
                                  cubeName: null,
                                  packCounts: {},
                                }));
                              } else {
                                // Reset to default set boosters
                                setSealedConfig((prev) => ({
                                  ...prev,
                                  cubeId: null,
                                  cubeName: null,
                                  packCounts: buildDefaultPackCounts(
                                    draftableSets,
                                    DEFAULT_SET,
                                    6
                                  ),
                                  allowDragonlordChampion: false,
                                }));
                              }
                            }}
                            className="rounded"
                          />
                          <span>
                            Use one of your cubes as the booster source
                          </span>
                        </label>
                        {sealedUseCube ? (
                          <div className="space-y-2 rounded-lg bg-slate-800/60 ring-1 ring-slate-700 p-3 text-sm">
                            {cubesLoading ? (
                              <div className="text-xs text-slate-300">
                                Loading cubes...
                              </div>
                            ) : cubeError ? (
                              <div className="text-xs text-red-300 bg-red-900/30 rounded px-3 py-2 ring-1 ring-red-800/40">
                                {cubeError}
                              </div>
                            ) : (
                              <>
                                <label className="block text-xs font-medium mb-1">
                                  Select cube
                                </label>
                                <select
                                  value={sealedConfig.cubeId ?? ""}
                                  onChange={(e) => {
                                    const cubeId = e.target.value;
                                    const cube =
                                      availableCubes.find(
                                        (c) => c.id === cubeId
                                      ) ?? null;
                                    setSealedConfig((prev) => ({
                                      ...prev,
                                      cubeId: cube?.id ?? null,
                                      cubeName: cube?.name ?? null,
                                      packCounts: cube
                                        ? { [cube.name]: 6 }
                                        : {},
                                    }));
                                  }}
                                  className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                                >
                                  <option value="" disabled>
                                    Choose a cube…
                                  </option>
                                  {availableCubes.map((cube) => (
                                    <option key={cube.id} value={cube.id}>
                                      {cube.name} ({cube.cardCount} cards)
                                    </option>
                                  ))}
                                </select>
                                {sealedConfig.cubeId && (
                                  <div className="text-xs text-slate-300/90">
                                    Packs will be generated from{" "}
                                    {sealedConfig.cubeName ?? "your cube"}.
                                  </div>
                                )}
                                <p className="text-xs text-slate-400">
                                  Manage cubes on the{" "}
                                  <Link
                                    href="/cubes"
                                    className="underline text-slate-200 hover:text-white"
                                  >
                                    Cubes page
                                  </Link>
                                  .
                                </p>
                                <label className="mt-2 flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    className="rounded"
                                    checked={
                                      !!sealedConfig.includeCubeSideboardInStandard
                                    }
                                    onChange={(e) =>
                                      setSealedConfig((prev) => ({
                                        ...prev,
                                        includeCubeSideboardInStandard:
                                          e.target.checked,
                                      }))
                                    }
                                  />
                                  <span>
                                    When building from a cube, offer the
                                    cube&apos;s sideboard cards in the standard
                                    card pool during deckbuilding.
                                  </span>
                                </label>
                              </>
                            )}
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-medium mb-2">
                              Pack Configuration
                              <span className="text-xs opacity-70 ml-2">
                                (Total: {sealedTotalPacks} packs, 3-8 required)
                              </span>
                              <span
                                className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] ring-1 ${
                                  sealedValid
                                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                                    : "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                                }`}
                              >
                                {sealedValid
                                  ? "OK"
                                  : sealedActiveSets === 0
                                  ? "No packs set"
                                  : sealedTotalPacks < 3
                                  ? `Need ${3 - sealedTotalPacks} more`
                                  : `Remove ${sealedTotalPacks - 8}`}
                              </span>
                            </label>
                            <div className="space-y-2">
                              {Object.entries(sealedConfig.packCounts).map(
                                ([set, count]) => (
                                  <div
                                    key={set}
                                    className="flex items-center justify-between"
                                  >
                                    <span className="text-sm">{set}</span>
                                    <div className="flex items-center gap-2">
                                      <button
                                        className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                                        onClick={() =>
                                          setSealedConfig((prev) => ({
                                            ...prev,
                                            packCounts: {
                                              ...prev.packCounts,
                                              [set]: Math.max(0, count - 1),
                                            },
                                          }))
                                        }
                                        disabled={count <= 0}
                                      >
                                        −
                                      </button>
                                      <span className="w-8 text-center text-sm font-medium">
                                        {count}
                                      </span>
                                      <button
                                        className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                                        onClick={() =>
                                          setSealedConfig((prev) => ({
                                            ...prev,
                                            packCounts: {
                                              ...prev.packCounts,
                                              [set]: Math.min(8, count + 1),
                                            },
                                          }))
                                        }
                                        disabled={sealedTotalPacks >= 8}
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-2">
                        Deck Construction Time Limit (minutes)
                      </label>
                      <input
                        type="number"
                        min="15"
                        max="90"
                        step="5"
                        value={sealedConfig.timeLimit}
                        onChange={(e) =>
                          setSealedConfig((prev) => ({
                            ...prev,
                            timeLimit: parseInt(e.target.value) || 40,
                          }))
                        }
                        className="w-24 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={sealedConfig.replaceAvatars}
                        onChange={(e) =>
                          setSealedConfig((prev) => ({
                            ...prev,
                            replaceAvatars: e.target.checked,
                          }))
                        }
                        className="rounded"
                      />
                      <span>Replace Sorcerer with Beta avatars</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm mt-2">
                      <input
                        type="checkbox"
                        checked={sealedConfig.allowDragonlordChampion}
                        onChange={(e) =>
                          setSealedConfig((prev) => ({
                            ...prev,
                            allowDragonlordChampion: e.target.checked,
                          }))
                        }
                        className="rounded"
                      />
                      <span>Allow Dragonlord Champion selection</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm mt-2">
                      <input
                        type="checkbox"
                        checked={sealedConfig.enableSeer}
                        onChange={(e) =>
                          setSealedConfig((prev) => ({
                            ...prev,
                            enableSeer: e.target.checked,
                          }))
                        }
                        className="rounded"
                      />
                      <span>Enable Second Seer (2nd player scries 1)</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm mt-2">
                      <input
                        type="checkbox"
                        checked={sealedConfig.freeAvatars}
                        onChange={(e) =>
                          setSealedConfig((prev) => ({
                            ...prev,
                            freeAvatars: e.target.checked,
                          }))
                        }
                        className="rounded"
                      />
                      <span>
                        Free Avatars (remove from packs, all available in deck
                        editor)
                      </span>
                    </label>
                  </>
                )}

                {/* SOATC League Match option - show when both players are in same tournament */}
                {sharedTournament?.shared && (
                  <div className="mt-4 pt-4 border-t border-slate-700">
                    <SoatcLeagueCheckbox
                      checked={!!lobby?.soatcLeagueMatch?.isLeagueMatch}
                      onChange={(checked) => {
                        if (
                          transport &&
                          joinedLobby &&
                          sharedTournament?.tournament
                        ) {
                          transport.emit("setSoatcLeagueMatch", {
                            soatcLeagueMatch: checked
                              ? {
                                  isLeagueMatch: true,
                                  tournamentId: sharedTournament.tournament.id,
                                  tournamentName:
                                    sharedTournament.tournament.name,
                                }
                              : null,
                          });
                        }
                      }}
                      tournamentName={sharedTournament.tournament?.name}
                    />
                  </div>
                )}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <div className="text-xs opacity-70 truncate">
                  {plannedSummary}
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm"
                    onClick={() => setConfigOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="rounded bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
                    onClick={() => {
                      // If there aren't enough players yet or not all are ready,
                      // treat this as "confirm setup" only: close the overlay and
                      // let the host return to the lobby while waiting for others.
                      if (!hasAtLeastTwoPlayers || !allReady) {
                        setSetupConfirmedOnce(true);
                        setConfigOpen(false);
                        return;
                      }

                      // Use lobby's soatcLeagueMatch flag (set via auto-detect or manually)
                      const soatcPayload = lobby?.soatcLeagueMatch || null;

                      if (matchType === "constructed") {
                        startMatch({
                          matchType: "constructed",
                          soatcLeagueMatch: soatcPayload,
                        });
                        setConfigOpen(false);
                        return;
                      }
                      if (matchType === "draft") {
                        if (draftUseCube && !draftConfig.cubeId) {
                          alert(
                            "Select a cube to draft from before starting the draft."
                          );
                          return;
                        }
                        const total = Object.values(
                          draftConfig.packCounts
                        ).reduce((s, c) => s + c, 0);
                        if (total !== draftConfig.packCount) {
                          alert(
                            `Draft pack mix must sum to ${draftConfig.packCount}.`
                          );
                          return;
                        }
                        const activeSets = Object.entries(
                          draftConfig.packCounts
                        )
                          .filter(([, c]) => c > 0)
                          .map(([s]) => s);
                        const payload = {
                          ...draftConfig,
                          setMix: activeSets.length
                            ? activeSets
                            : draftConfig.setMix,
                        };
                        startMatch({
                          matchType: "draft",
                          draftConfig: payload,
                          soatcLeagueMatch: soatcPayload,
                        });
                        setConfigOpen(false);
                        return;
                      }
                      // Handle sealed with cube mode
                      if (sealedUseCube) {
                        if (!sealedConfig.cubeId) {
                          alert("Select a cube before starting sealed.");
                          return;
                        }
                        const cubeSealedConfig = {
                          packCount: 6,
                          setMix: [sealedConfig.cubeName || "Cube"],
                          timeLimit: sealedConfig.timeLimit,
                          packCounts: sealedConfig.packCounts,
                          replaceAvatars: sealedConfig.replaceAvatars,
                          allowDragonlordChampion:
                            sealedConfig.allowDragonlordChampion,
                          cubeId: sealedConfig.cubeId,
                          cubeName: sealedConfig.cubeName,
                          includeCubeSideboardInStandard:
                            sealedConfig.includeCubeSideboardInStandard,
                          enableSeer: sealedConfig.enableSeer,
                          freeAvatars: sealedConfig.freeAvatars,
                        };
                        startMatch({
                          matchType: "sealed",
                          sealedConfig: cubeSealedConfig,
                          soatcLeagueMatch: soatcPayload,
                        });
                        setConfigOpen(false);
                        return;
                      }
                      // Regular sealed from boosters
                      const totalPacks = Object.values(
                        sealedConfig.packCounts
                      ).reduce((sum, count) => sum + count, 0);
                      const activeSets = Object.entries(
                        sealedConfig.packCounts
                      ).filter(([, count]) => count > 0);
                      if (activeSets.length === 0) {
                        alert(
                          "Please configure at least one set with packs for sealed play."
                        );
                        return;
                      }
                      if (totalPacks < 3 || totalPacks > 8) {
                        alert("Total pack count must be between 3 and 8.");
                        return;
                      }
                      const setMix = activeSets.map(([set]) => set);
                      const legacySealedConfig = {
                        packCount: totalPacks,
                        setMix,
                        timeLimit: sealedConfig.timeLimit,
                        packCounts: sealedConfig.packCounts,
                        replaceAvatars: sealedConfig.replaceAvatars,
                        allowDragonlordChampion:
                          sealedConfig.allowDragonlordChampion,
                        enableSeer: sealedConfig.enableSeer,
                        freeAvatars: sealedConfig.freeAvatars,
                      };
                      startMatch({
                        matchType: "sealed",
                        sealedConfig: legacySealedConfig,
                        soatcLeagueMatch: soatcPayload,
                      });
                      setConfigOpen(false);
                    }}
                    disabled={
                      (matchType === "sealed" && !sealedValid) ||
                      (matchType === "draft" && !draftValid)
                    }
                    title={
                      (matchType === "sealed" && !sealedValid) ||
                      (matchType === "draft" && !draftValid)
                        ? "Fix configuration issues before confirming setup"
                        : hasAtLeastTwoPlayers && allReady
                        ? `Confirm setup and start ${matchType} match`
                        : "Confirm setup and return to lobby"
                    }
                  >
                    Confirm Setup
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* end Social and Chat row */}

        {/* Footer links */}
        <div className="mt-8 text-center text-xs text-slate-500 space-x-3">
          <span>Info & Support:</span>
          <a
            href="https://discord.gg/UE2Gfbxjym"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-slate-300"
          >
            Official Discord
          </a>
          <span>·</span>
          <a
            href="mailto:kingofthe@realms.cards"
            className="underline hover:text-slate-300"
          >
            Email
          </a>
          <span>·</span>
          <ChangelogOverlay />
          <span>·</span>
          <ManualOverlay />
          <span>·</span>
          <Link href="/terms" className="underline hover:text-slate-300">
            Terms
          </Link>
          <span>·</span>
          <Link href="/privacy" className="underline hover:text-slate-300">
            Privacy
          </Link>
          <span>·</span>
          <a
            href="https://www.patreon.com/realmscards"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md 
              bg-gradient-to-r from-blue-500/20 via-sky-400/30 to-blue-500/20 
              border border-blue-400/50 hover:border-blue-300/80
              text-blue-200 hover:text-blue-100 font-medium
              shadow-[0_0_12px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]
              transition-all duration-300"
          >
            Patreon
          </a>
        </div>
        <CombinedMarquee />
      </div>

      {/* Invite Overlay - shows first pending invite */}
      {invites && invites.length > 0 && (
        <InviteOverlay
          invite={invites[0]}
          onAccept={async () => {
            const inv = invites[0];
            await joinLobby(inv.lobbyId);
            dismissInvite(inv.lobbyId, inv.from.id);
          }}
          onDecline={() => {
            const inv = invites[0];
            dismissInvite(inv.lobbyId, inv.from.id);
          }}
        />
      )}

      {/* SOATC Tournament Invite Ineligibility Modal */}
      {showIneligibleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-xl ring-1 ring-slate-700 max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-slate-100 mb-2">
                  Sorcerers at the Core Tournament Match
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {ineligibleReason === "no-uuid" && (
                    <>
                      You need to link your Sorcerers at the Core account to
                      join this tournament match. Please add your UUID in
                      settings (the long string at the end of your profile page
                      URL).
                    </>
                  )}
                  {ineligibleReason === "not-registered" && (
                    <>
                      You are not registered for this tournament. Please
                      register at sorcerersatthecore.com first.
                    </>
                  )}
                  {ineligibleReason?.startsWith("format-mismatch:") && (
                    <>
                      This match format doesn&apos;t match the tournament
                      format. This tournament requires{" "}
                      <strong className="text-amber-300">
                        {ineligibleReason.split(":")[1]}
                      </strong>{" "}
                      format matches.
                    </>
                  )}
                  {(ineligibleReason === "tournament-check-failed" ||
                    ineligibleReason === "check-failed") && (
                    <>
                      Failed to verify your tournament registration. Please
                      check your connection and try again.
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              {ineligibleReason === "no-uuid" && (
                <Link
                  href="/settings/soatc"
                  className="rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-2"
                  onClick={() => setShowIneligibleModal(false)}
                >
                  Go to Sorcerers at the Core Settings
                  <ExternalLink className="w-4 h-4" />
                </Link>
              )}
              {ineligibleReason === "not-registered" && (
                <a
                  href="https://sorcerersatthecore.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-medium transition-colors inline-flex items-center gap-2"
                >
                  Visit SOATC
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button
                onClick={() => {
                  setShowIneligibleModal(false);
                  router.push("/online/lobby");
                }}
                className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </OnlinePageShell>
  );
}

// Helper component that provides tournaments API via context
function LobbyPageWithTournaments() {
  const api = useRealtimeTournaments();
  return <LobbyPageContent tournamentsApi={api as unknown as TournamentsAPI} />;
}

export default function LobbyPage() {
  const tournamentsEnabled = tournamentFeatures.isEnabled();
  // RealtimeTournamentProvider is already provided at root level in app/layout.tsx
  // No need to nest providers here - it causes duplicate socket connections
  return tournamentsEnabled ? (
    <LobbyPageWithTournaments />
  ) : (
    <LobbyPageContent />
  );
}
