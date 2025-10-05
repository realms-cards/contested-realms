"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import { useOnline } from "@/app/online/online-context";
import InvitesPanel from "@/components/online/InvitesPanel";
import LobbiesCentral, { CreateTournamentConfig } from "@/components/online/LobbiesCentral";
import PlayersInvitePanel from "@/components/online/PlayersInvitePanel";
import { useRealtimeTournaments, RealtimeTournamentProvider } from "@/contexts/RealtimeTournamentContext";
import { tournamentFeatures } from "@/lib/config/features";
import type { TournamentInfo as ProtocolTournamentInfo, SealedConfig, DraftConfig } from "@/lib/net/protocol";
import OnlinePageShell from "@/components/online/OnlinePageShell";
 

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
  }>;
  settings?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}): ProtocolTournamentInfo {
  const registeredPlayers = (tournament.registeredPlayers ?? []).map((player) => {
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
    };
  });

  return {
    id: tournament.id,
    name: tournament.name,
    creatorId: tournament.creatorId,
    // Pairing format (swiss/elimination/round_robin) is stored in settings.pairingFormat when available, default to 'swiss'
    format: (tournament.settings?.pairingFormat as 'swiss' | 'elimination' | 'round_robin' | undefined) || 'swiss',
    // Map DB status into richer client-visible states for lobby UX
    status: (() => {
      if (tournament.status === 'registering') return 'registering';
      if (tournament.status === 'preparing') {
        const mt = (tournament.format as 'sealed' | 'draft' | 'constructed');
        return mt === 'draft' ? 'draft_phase' : mt === 'sealed' ? 'sealed_phase' : 'playing';
      }
      if (tournament.status === 'active') return 'playing';
      return 'completed';
    })(),
    maxPlayers: tournament.maxPlayers,
    registeredPlayers,
    standings: [], // TODO: map when available
    currentRound: 0, // TODO: map when available
    totalRounds: (typeof tournament.settings?.totalRounds === 'number' ? tournament.settings.totalRounds : 3),
    rounds: [], // TODO: map when available
    // DB 'format' is the actual match type (constructed | sealed | draft)
    matchType: tournament.format as "sealed" | "draft" | "constructed",
    // Pass through configs when present so UI can display/use them if needed
    sealedConfig: (tournament.settings?.sealedConfig as SealedConfig | null) ?? null,
    draftConfig: (tournament.settings?.draftConfig as DraftConfig | null) ?? null,
    createdAt: new Date(tournament.createdAt).getTime(),
    startedAt: tournament.startedAt ? new Date(tournament.startedAt).getTime() : undefined,
    completedAt: tournament.completedAt ? new Date(tournament.completedAt).getTime() : undefined,
  };
}

// Minimal interface for the tournaments API we pass from context when enabled
interface TournamentsAPI {
  createTournament: (config: { name: string; format: "sealed" | "draft" | "constructed"; maxPlayers: number; settings?: Record<string, unknown> }) => Promise<unknown>;
  joinTournament: (tournamentId: string) => Promise<void>;
  leaveTournament: (tournamentId: string) => Promise<void>;
  updateTournamentSettings: (tournamentId: string, settings: Record<string, unknown>) => Promise<void>;
  toggleTournamentReady: (tournamentId: string, ready: boolean) => Promise<void>;
  startTournament: (tournamentId: string) => Promise<void>;
  endTournament: (tournamentId: string) => Promise<void>;
  refreshTournaments: () => Promise<void>;
  tournaments: Array<{
    id: string; name: string; creatorId: string; format: string; status: string; maxPlayers: number;
    registeredPlayers?: Array<{
      id: string;
      displayName?: string | null;
      name?: string | null;
      ready?: boolean;
      avatarUrl?: string | null;
      avatar?: string | null;
      image?: string | null;
    }>;
    settings?: Record<string, unknown>;
    createdAt: string; startedAt?: string; completedAt?: string;
  }>;
}

function LobbyPageContent({ tournamentsApi }: { tournamentsApi?: TournamentsAPI }) {
  const router = useRouter();
  const {
    connected,
    lobby,
    match,
    me,
    ready,
    toggleReady,
    joinLobby,
    createLobby,
    leaveLobby,
    startMatch,
    
    leaveMatch,
    sendChat,
    chatLog,
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
  } = useOnline();

  // Tournaments API is provided by parent when the feature is enabled; otherwise undefined
  const tournamentsEnabled = !!tournamentsApi;
  const {
    createTournament,
    joinTournament,
    leaveTournament,
    updateTournamentSettings,
    toggleTournamentReady,
    startTournament,
    endTournament,
    refreshTournaments,
    tournaments: tournamentsFromApi,
  } = tournamentsApi ?? {
    // Provide no-op placeholders; these should never be called when disabled as handlers won't be passed further down
    createTournament: async () => { throw new Error("Tournaments are disabled"); },
    joinTournament: async () => { throw new Error("Tournaments are disabled"); },
    leaveTournament: async () => { throw new Error("Tournaments are disabled"); },
    updateTournamentSettings: async () => { throw new Error("Tournaments are disabled"); },
    toggleTournamentReady: async () => { throw new Error("Tournaments are disabled"); },
    startTournament: async () => { throw new Error("Tournaments are disabled"); },
    endTournament: async () => { throw new Error("Tournaments are disabled"); },
    refreshTournaments: async () => {},
    tournaments: [] as TournamentsAPI['tournaments'],
  };

  // After a tournament first transitions to preparing/active, push the player once
  useEffect(() => {
    if (!tournamentsEnabled || !me?.id) return;
    const started = (tournamentsFromApi || []).find(t =>
      t.registeredPlayers?.some(p => p.id === me.id) && (t.status === 'preparing' || t.status === 'active')
    );
    if (!started) return;
    try {
      const key = `sorcery:tournamentRedirected:${started.id}`;
      const already = localStorage.getItem(key) === '1';
      if (!already) {
        localStorage.setItem(key, '1');
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
    const matchPlayer = lobby.players.find((p) => p.id === outgoingVoiceRequest.targetId);
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
        return voice?.rtc.state === "connected" ? "Connected" : "Accepted, connecting…";
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
  const [matchType, setMatchType] = useState<"constructed" | "sealed" | "draft">("constructed");
  const [sealedConfig, setSealedConfig] = useState({
    packCounts: { "Beta": 6, "Arthurian Legends": 0 } as Record<string, number>,
    timeLimit: 40, // minutes
    replaceAvatars: false
  });
  const [draftConfig, setDraftConfig] = useState({
    // Available sets restricted for now
    setMix: ["Beta"] as string[],
    packCount: 3,
    packSize: 15,
    packCounts: { "Beta": 3, "Arthurian Legends": 0 } as Record<string, number>,
  });
  
  // UI validation helpers
  const sealedTotalPacks = useMemo(
    () => Object.values(sealedConfig.packCounts).reduce((sum, c) => sum + c, 0),
    [sealedConfig.packCounts]
  );
  const sealedActiveSets = useMemo(
    () => Object.entries(sealedConfig.packCounts).filter(([, c]) => c > 0).length,
    [sealedConfig.packCounts]
  );
  const sealedValid = sealedActiveSets > 0 && sealedTotalPacks >= 3 && sealedTotalPacks <= 8;

  const draftAssigned = useMemo(
    () => Object.values(draftConfig.packCounts).reduce((sum, c) => sum + c, 0),
    [draftConfig.packCounts]
  );
  const draftValid = draftAssigned === draftConfig.packCount;
  const chatRef = useRef<HTMLDivElement | null>(null);
  const prevLobbyIdRef = useRef<string | null>(null);
  
  // Overlay for configuring and confirming match start (host)
  const [configOpen, setConfigOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  
  // Track previous match status to detect when match ends
  const prevMatchStatusRef = useRef<string | null>(null);



  const lobbyMessages = chatLog.filter((m) => m.scope === "lobby");
  const globalMessages = chatLog.filter((m) => m.scope === "global");
  const activeMessages = chatTab === "lobby" ? lobbyMessages : globalMessages;

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatTab, activeMessages.length]);

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
    prevLobbyIdRef.current = currId;
  }, [lobby]);

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
        if (!leaveConfirmOpen) { // Only show if not already open
          setLeaveConfirmOpen(true);
        }
      }, 500);
    }
    
    prevMatchStatusRef.current = currentStatus;
  }, [match?.status, leaveConfirmOpen]);

  // Track if the user explicitly left this match and declined rejoin (persisted)
  

  // Dynamic page title
  useEffect(() => {
    const baseTitle = "Contested Realms";
    let title = `${baseTitle} - Lobby`;

    if (lobby && !match) {
      const label = lobby.name && lobby.name.trim().length > 0 ? lobby.name : lobby.id;
      title = `${baseTitle} - Lobby: ${label} (${lobby.players.length}/${lobby.maxPlayers})`;
    }

    if (match) {
      // Prefer lobbyName provided by the server to maintain continuity during matches
      if (match.lobbyName && match.lobbyName.trim().length > 0) {
        title = `${baseTitle} - ${match.lobbyName} (${match.status.replaceAll("_", " ")})`;
      } else {
        const playerNames = match.players?.map((p) => p.displayName).join(" vs ") || "Players";
        title = `${baseTitle} - ${playerNames} (${match.status.replaceAll("_", " ")})`;
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
    return lobby.players.length > 1 && lobby.players.every((p) => readyIds.has(p.id));
  }, [lobby]);

  // Determine if this client is rejoining an ongoing match (not used in simplified CTA)

  // Local flags: has deck been submitted for sealed/draft flows?
  const hasSubmittedForMatch = useMemo(() => {
    if (!match?.id) return { sealed: false, draft: false } as const;
    try {
      const sealed = localStorage.getItem(`sealed_submitted_${match.id}`) === "true";
      const draft = localStorage.getItem(`draft_submitted_${match.id}`) === "true";
      return { sealed, draft } as const;
    } catch {
      return { sealed: false, draft: false } as const;
    }
  }, [match?.id]);

  const matchCta = useMemo(() => {
    if (!match) return { label: "", disabled: true } as const;
    if (match.status === "ended") return { label: "Match Ended", disabled: true } as const;

    // Draft-specific phases
    if (match.matchType === "draft") {
      if (match.status === "waiting") {
        return { label: "Join Draft Session", disabled: false } as const;
      }
      if (match.status === "deck_construction" && !hasSubmittedForMatch.draft) {
        return { label: "Join Deck Construction for Draft", disabled: false } as const;
      }
    }

    // Sealed deck construction
    if (match.matchType === "sealed" && match.status === "deck_construction" && !hasSubmittedForMatch.sealed) {
      return { label: "Join Deck Construction for Sealed", disabled: false } as const;
    }

    // Waiting/default should always say Join (avoid confusing "Rejoin" wording before first entry)
    if (match.status === "waiting") return { label: "Join Match", disabled: false } as const;

    // In-progress
    if (match.status === "in_progress") return { label: "Rejoin Game", disabled: false } as const;

    // Fallback
    return { label: "Join Match", disabled: false } as const;
  }, [match, hasSubmittedForMatch]);

  // Planned match summary (client-side, only reliable for host)
  const plannedSummary = useMemo(() => {
    if (!isHost) return null;
    if (matchType === "constructed") return "Planned: Constructed";
    if (matchType === "draft") {
      const entries = Object.entries(draftConfig.packCounts || {}).filter(([, c]) => c > 0);
      const mix = entries.length ? entries.map(([s, c]) => `${s}×${c}`).join(", ") : draftConfig.setMix.join(", ");
      return `Planned: Draft • Mix: ${mix} • Packs: ${draftConfig.packCount} • Pack size: ${draftConfig.packSize}`;
    }
    const totalPacks = Object.values(sealedConfig.packCounts).reduce((sum, count) => sum + count, 0);
    const activeSets = Object.entries(sealedConfig.packCounts)
      .filter(([, count]) => count > 0)
      .map(([set]) => set);
    return `Planned: Sealed • Packs: ${totalPacks} • Sets: ${activeSets.join(", ")} • Time: ${sealedConfig.timeLimit}m`;
  }, [isHost, matchType, sealedConfig, draftConfig]);

  // removed startSealedMatch helper; start is confirmed via modal action

  return (
    <OnlinePageShell>
    <div className="space-y-6">
      {/* Match Controls - show when a match exists in context */}
      {match && (
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold opacity-90">Match Controls</div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-xs opacity-70">
              {match.matchType?.toUpperCase()} • Status: {match.status.replaceAll("_", " ")}
              {match.lobbyName ? ` • ${match.lobbyName}` : ""}
            </div>
            <button
              className={`rounded-lg px-4 py-2 text-sm font-semibold shadow ${
                matchCta.disabled ? "bg-slate-700/80 text-slate-300 cursor-not-allowed" : "bg-blue-600/90 hover:bg-blue-600"
              }`}
              onClick={() => {
                if (!matchCta.disabled && match?.id) {
                  router.push(`/online/play/${encodeURIComponent(match.id)}`);
                }
              }}
              disabled={matchCta.disabled}
              title={matchCta.disabled ? "Match has ended" : `Go to match ${match.id}`}
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
      {/* Host-only match start/config controls, only when lobby is open, all players ready, and no active match exists */}
      {isHost && !match && lobby?.status === "open" && allReady && (
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold opacity-90">Host Controls</div>
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
              {voice && ["declined", "cancelled"].includes(outgoingVoiceRequest.status) && (
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
        tournaments={(tournamentsEnabled ? tournamentsFromApi : []).map(mapToProtocolTournament)}
        myId={me?.id ?? null}
        joinedLobbyId={lobby?.id ?? null}
        onJoin={(id) => joinLobby(id)}
        onCreate={(cfg) => {
          console.log(`Creating lobby: "${cfg.name}" with ${cfg.maxPlayers} max players`);
          createLobby({ 
            name: cfg.name,
            visibility: cfg.visibility, 
            maxPlayers: cfg.maxPlayers 
          });
        }}
        onLeaveLobby={leaveLobby}
        ready={ready}
        onToggleReady={toggleReady}
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
        onCreateTournament={tournamentsEnabled ? async (cfg: CreateTournamentConfig) => {
          console.log(`Creating tournament: "${cfg.name}"`);
          try {
            // DB "format" is the match type (constructed | sealed | draft)
            // Store pairing system separately in settings.pairingFormat
            const settings: Record<string, unknown> = {
              pairingFormat: cfg.format,
            };
            // Apply provided pack settings or sensible defaults
            if (cfg.matchType === 'sealed') {
              settings.sealedConfig = cfg.sealedConfig ?? {
                packCounts: { Beta: 6, "Arthurian Legends": 0 },
                timeLimit: 40,
                replaceAvatars: false,
              };
            } else if (cfg.matchType === 'draft') {
              settings.draftConfig = cfg.draftConfig ?? {
                setMix: ['Beta'],
                packCount: 3,
                packSize: 15,
                packCounts: { Beta: 3, "Arthurian Legends": 0 },
              };
            }

            await createTournament({
              name: cfg.name,
              format: cfg.matchType,
              maxPlayers: cfg.maxPlayers,
              settings,
            });
            // Stay on lobby page - tournaments are now shown here
          } catch (error) {
            console.error('Failed to create tournament:', error);
          }
        } : undefined}
        onJoinTournament={tournamentsEnabled ? async (tournamentId: string) => {
          console.log(`Joining tournament: ${tournamentId}`);
          try {
            await joinTournament(tournamentId);
          } catch (error) {
            console.error('Failed to join tournament:', error);
          }
        } : undefined}
        onLeaveTournament={tournamentsEnabled ? async (tournamentId: string) => {
          console.log(`Leaving tournament: ${tournamentId}`);
          try {
            await leaveTournament(tournamentId);
          } catch (error) {
            console.error('Failed to leave tournament:', error);
          }
        } : undefined}
        onUpdateTournamentSettings={tournamentsEnabled ? async (tournamentId: string, settings) => {
          console.log(`Updating tournament settings: ${tournamentId}`, settings);
          try {
            await updateTournamentSettings(tournamentId, settings);
          } catch (error) {
            console.error('Failed to update tournament settings:', error);
          }
        } : undefined}
        onToggleTournamentReady={tournamentsEnabled ? async (tournamentId: string, ready: boolean) => {
          console.log(`Toggling tournament ready: ${tournamentId}`, ready);
          try {
            await toggleTournamentReady(tournamentId, ready);
          } catch (error) {
            console.error('Failed to toggle tournament ready:', error);
          }
        } : undefined}
        onStartTournament={tournamentsEnabled ? async (tournamentId: string) => {
          console.log(`Starting tournament: ${tournamentId}`);
          try {
            await startTournament(tournamentId);
          } catch (error) {
            console.error('Failed to start tournament:', error);
          }
        } : undefined}
        onEndTournament={tournamentsEnabled ? async (tournamentId: string) => {
          console.log(`Ending tournament: ${tournamentId}`);
          try {
            await endTournament(tournamentId);
          } catch (error) {
            console.error('Failed to end tournament:', error);
          }
        } : undefined}
        tournamentsEnabled={tournamentsEnabled}
        onRefresh={async () => {
          try { await requestLobbies(); } catch {}
          if (tournamentsEnabled) {
            try { await refreshTournaments(); } catch {}
          }
        }}
      />

      {/* Leave Match confirmation dialog */}
      {leaveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setLeaveConfirmOpen(false)} />
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
                  try { leaveMatch(); } finally {
                    try { leaveLobby(); } catch {}
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
      {/* We present Chat and Friends containers side-by-side on wide screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Chat Panel */}
        <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
          <div className="flex items-center justify-between mb-2">
            {/* tabs for Lobby/Global chat scopes */}
            <div className="flex items-center gap-1">
              <button
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  chatTab === "lobby"
                    ? "bg-white/15"
                    : "hover:bg-white/10 opacity-80"
                }`}
                onClick={() => setChatTab("lobby")}
              >
                Lobby
                {lobbyMessages.length > 0 && (
                  <span className="ml-1 bg-emerald-500/70 text-white text-[10px] px-1 rounded-full">
                    {lobbyMessages.length}
                  </span>
                )}
              </button>
              <button
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  chatTab === "global"
                    ? "bg-white/15"
                    : "hover:bg-white/10 opacity-80"
                }`}
                onClick={() => setChatTab("global")}
              >
                Global
                {globalMessages.length > 0 && (
                  <span className="ml-1 bg-sky-500/70 text-white text-[10px] px-1 rounded-full">
                    {globalMessages.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div
            ref={chatRef}
            className="max-h-48 overflow-y-auto space-y-1 text-sm pr-1"
          >
            {activeMessages.length === 0 && (
              <div className="opacity-60">No messages</div>
            )}
            {activeMessages.map((m, i) => (
              <div key={i} className="opacity-90">
                <span className="font-medium">
                  {m.from?.displayName ?? "System"}
                </span>
                : {m.content}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={
                chatTab === "global"
                  ? "Type a global message"
                  : "Type a message"
              }
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && connected) {
                  const msg = chatInput.trim();
                  if (!msg) return;
                  sendChat(msg, chatTab);
                  setChatInput("");
                }
              }}
              disabled={!connected}
            />
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                const msg = chatInput.trim();
                if (!msg) return;
                sendChat(msg, chatTab);
                setChatInput("");
              }}
              disabled={!connected || !chatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>

        {/* Friends + Invites Panel */}
        <div className={`rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3`}>
          {/* Inline invites (if any) */}
          {invites && invites.length > 0 && (
            <InvitesPanel
              invites={invites}
              onAccept={async (inv) => {
                await joinLobby(inv.lobbyId);
                dismissInvite(inv.lobbyId, inv.from.id);
              }}
              onDecline={(inv) => dismissInvite(inv.lobbyId, inv.from.id)}
            />
          )}

          {/* Friends browser */}
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
      {/* Match Configuration Overlay (Host) */}
      {isHost && configOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfigOpen(false)} />
          <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Match Configuration</div>
              <button
                className="text-slate-300 hover:text-white text-sm"
                onClick={() => setConfigOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-3 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2">Match Type</label>
                <div className="flex gap-2">
                  <button
                    className={`px-3 py-2 text-sm rounded transition-colors ${
                      matchType === "constructed"
                        ? "bg-indigo-600/80 text-white"
                        : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                    }`}
                    onClick={() => {
                      setMatchType("constructed");
                      if (isHost && setLobbyPlan) setLobbyPlan("constructed");
                    }}
                  >
                    Constructed
                  </button>
                  <button
                    className={`px-3 py-2 text-sm rounded transition-colors ${
                      matchType === "sealed"
                        ? "bg-indigo-600/80 text-white"
                        : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                    }`}
                    onClick={() => {
                      setMatchType("sealed");
                      if (isHost && setLobbyPlan) setLobbyPlan("sealed");
                    }}
                  >
                    Sealed
                  </button>
                  <button
                    className={`px-3 py-2 text-sm rounded transition-colors ${
                      matchType === "draft"
                        ? "bg-indigo-600/80 text-white"
                        : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                    }`}
                    onClick={() => {
                      setMatchType("draft");
                      if (isHost && setLobbyPlan) setLobbyPlan("draft");
                    }}
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
                      <div className="grid grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="block text-xs font-medium mb-2">Number of Packs</label>
                          <select
                            value={draftConfig.packCount}
                            onChange={(e) => {
                              const nextCount = parseInt(e.target.value) || 3;
                              setDraftConfig(prev => {
                                const total = Object.values(prev.packCounts).reduce((s, c) => s + c, 0);
                                const packs = { ...prev.packCounts };
                                // Clamp or pad counts to match nextCount
                                if (total > nextCount) {
                                  // Reduce from the last non-zero set first
                                  const order = ["Arthurian Legends", "Beta"]; // prefer reducing AL first if needed
                                  let excess = total - nextCount;
                                  for (const name of order) {
                                    const take = Math.min(excess, packs[name] || 0);
                                    if (take > 0) { packs[name] = (packs[name] || 0) - take; excess -= take; }
                                    if (excess <= 0) break;
                                  }
                                } else if (total < nextCount) {
                                  // Add remainder to Beta by default
                                  packs["Beta"] = (packs["Beta"] || 0) + (nextCount - total);
                                }
                                return { ...prev, packCount: nextCount, packCounts: packs };
                              });
                            }}
                            className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                          >
                            <option value={3}>3 Packs</option>
                            <option value={4}>4 Packs</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-2">Pack Size</label>
                          <input
                            type="number"
                            min="12"
                            max="18"
                            value={draftConfig.packSize}
                            onChange={(e) => setDraftConfig(prev => ({ ...prev, packSize: parseInt(e.target.value) || 15 }))}
                            className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-2">
                          Exact Pack Mix (sum must equal {draftConfig.packCount})
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
                              ? `Need ${draftConfig.packCount - draftAssigned}`
                              : `Remove ${draftAssigned - draftConfig.packCount}`}
                          </span>
                        </label>
                        <div className="space-y-2">
                          {["Beta", "Arthurian Legends"].map((set) => {
                            const count = draftConfig.packCounts[set] || 0;
                            const total = Object.values(draftConfig.packCounts).reduce((s, c) => s + c, 0);
                            const canInc = total < draftConfig.packCount;
                            const canDec = count > 0;
                            return (
                              <div key={set} className="flex items-center justify-between">
                                <span className="text-sm">{set}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                                    onClick={() => setDraftConfig(prev => ({
                                      ...prev,
                                      setMix: Array.from(new Set([...(prev.setMix || []), set])),
                                      packCounts: { ...prev.packCounts, [set]: Math.max(0, (prev.packCounts[set] || 0) - 1) }
                                    }))}
                                    disabled={!canDec}
                                  >
                                    −
                                  </button>
                                  <span className="w-8 text-center text-sm font-medium">{count}</span>
                                  <button
                                    className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                                    onClick={() => setDraftConfig(prev => ({
                                      ...prev,
                                      setMix: Array.from(new Set([...(prev.setMix || []), set])),
                                      packCounts: { ...prev.packCounts, [set]: Math.min(prev.packCount, (prev.packCounts[set] || 0) + 1) }
                                    }))}
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
                    </div>
                  </div>
              )}
              {matchType === "sealed" && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-3">
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
                        {sealedValid ? "OK" : sealedActiveSets === 0 ? "No packs set" : sealedTotalPacks < 3 ? `Need ${3 - sealedTotalPacks} more` : `Remove ${sealedTotalPacks - 8}`}
                      </span>
                    </label>
                    <div className="space-y-3">
                      {Object.entries(sealedConfig.packCounts).map(([set, count]) => (
                        <div key={set} className="flex items-center justify-between">
                          <span className="text-sm">{set}</span>
                          <div className="flex items-center gap-2">
                            <button
                              className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                              onClick={() => setSealedConfig(prev => ({
                                ...prev,
                                packCounts: {
                                  ...prev.packCounts,
                                  [set]: Math.max(0, count - 1)
                                }
                              }))}
                              disabled={count <= 0}
                            >
                              −
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{count}</span>
                            <button
                              className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                              onClick={() => setSealedConfig(prev => ({
                                ...prev,
                                packCounts: {
                                  ...prev.packCounts,
                                  [set]: Math.min(8, count + 1)
                                }
                              }))}
                              disabled={Object.values(sealedConfig.packCounts).reduce((sum, c) => sum + c, 0) >= 8}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
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
                      onChange={(e) => setSealedConfig(prev => ({ ...prev, timeLimit: parseInt(e.target.value) || 40 }))}
                      className="w-24 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sealedConfig.replaceAvatars}
                      onChange={(e) => setSealedConfig(prev => ({ ...prev, replaceAvatars: e.target.checked }))}
                      className="rounded"
                    />
                    <span>Replace Sorcerer with Beta avatars</span>
                  </label>
                </>
              )}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <div className="text-xs opacity-70 truncate">{plannedSummary}</div>
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
                    if (matchType === "constructed") {
                      startMatch({ matchType: "constructed" });
                      setConfigOpen(false);
                      return;
                    }
                    if (matchType === "draft") {
                      const total = Object.values(draftConfig.packCounts).reduce((s, c) => s + c, 0);
                      if (total !== draftConfig.packCount) {
                        alert(`Draft pack mix must sum to ${draftConfig.packCount}.`);
                        return;
                      }
                      const activeSets = Object.entries(draftConfig.packCounts).filter(([, c]) => c > 0).map(([s]) => s);
                      const payload = {
                        ...draftConfig,
                        setMix: activeSets.length ? activeSets : draftConfig.setMix,
                      };
                      startMatch({ matchType: "draft", draftConfig: payload });
                      setConfigOpen(false);
                      return;
                    }
                    const totalPacks = Object.values(sealedConfig.packCounts).reduce((sum, count) => sum + count, 0);
                    const activeSets = Object.entries(sealedConfig.packCounts).filter(([, count]) => count > 0);
                    if (activeSets.length === 0) {
                      alert("Please configure at least one set with packs for sealed play.");
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
                    };
                    startMatch({ matchType: "sealed", sealedConfig: legacySealedConfig });
                    setConfigOpen(false);
                  }}
                  disabled={!allReady || (matchType === "sealed" && !sealedValid) || (matchType === "draft" && !draftValid)}
                  title={!allReady ? "All players must be ready to start" : `Start ${matchType} match`}
                >
                  Confirm Start
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

      {/* end Social and Chat row */}
    </div>
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
  return (
    tournamentsEnabled ? (
      <RealtimeTournamentProvider>
        <LobbyPageWithTournaments />
      </RealtimeTournamentProvider>
    ) : (
      <LobbyPageContent />
    )
  );
}
