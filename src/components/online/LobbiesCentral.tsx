/*
  (moved) Tournament Matches Modal lives inside the component now.
*/
"use client";

import { RefreshCw, Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import type { TournamentInfo, LobbyInfo } from "@/lib/net/protocol";

// Fantasy-themed word lists for generating lobby names
const ADJECTIVES = [
  "Ancient", "Mystic", "Golden", "Silver", "Crystal", "Shadow", "Bright", "Dark",
  "Eternal", "Sacred", "Wild", "Hidden", "Lost", "Frozen", "Burning", "Stormy",
  "Peaceful", "Mighty", "Noble", "Brave", "Swift", "Wise", "Fierce", "Gentle",
  "Enchanted", "Forgotten", "Legendary", "Celestial", "Divine", "Ethereal",
  "Crimson", "Azure", "Emerald", "Royal", "Arcane", "Primal", "Spectral"
];

const NOUNS = [
  "Dragon", "Phoenix", "Griffin", "Unicorn", "Wyrm", "Basilisk", "Chimera",
  "Tower", "Castle", "Keep", "Citadel", "Fortress", "Sanctum", "Temple", 
  "Mountain", "Valley", "Forest", "Grove", "Meadow", "River", "Lake", "Sea",
  "Crown", "Throne", "Scepter", "Orb", "Blade", "Shield", "Staff", "Wand",
  "Storm", "Thunder", "Lightning", "Flame", "Frost", "Wind", "Earth", "Star",
  "Moon", "Sun", "Dawn", "Dusk", "Night", "Light", "Shadow", "Dream",
  "Quest", "Journey", "Path", "Gate", "Portal", "Realm", "Domain", "Kingdom"
];

function generateLobbyName(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adjective} ${noun}`;
}

//

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
            {data?.tournament?.name ? `Matches – ${data.tournament.name}` : 'Tournament Matches'}
          </div>
          <button className="text-slate-300 hover:text-white text-sm" onClick={onClose}>Close</button>
        </div>
        {loading && (
          <div className="py-10 text-center text-sm opacity-80">Loading matches…</div>
        )}
        {!loading && error && (
          <div className="py-6 text-center text-sm text-rose-300">{error}</div>
        )}
        {!loading && !error && data && (
          <div className="space-y-4">
            <div className="text-xs text-slate-300">
              <span className="mr-3">Total: {data.summary.totalMatches}</span>
              <span className="mr-3">Completed: {data.summary.completedMatches}</span>
              <span className="mr-3">Pending: {data.summary.pendingMatches}</span>
              <span className="mr-3">Avg games: {data.summary.averageGameCount}</span>
              {data.summary.averageDuration != null && (
                <span>Avg duration: {data.summary.averageDuration}s</span>
              )}
            </div>
            <div className="max-h-[60vh] overflow-auto pr-1">
              {(() => {
                const groups: Map<number | 'Unassigned', TournamentMatchesResponse['matches']> = new Map();
                for (const m of data.matches) {
                  const key = (m.roundNumber ?? 'Unassigned') as number | 'Unassigned';
                  const arr = groups.get(key) ?? [];
                  arr.push(m);
                  groups.set(key, arr);
                }
                const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
                  if (a === 'Unassigned') return 1;
                  if (b === 'Unassigned') return -1;
                  return (a as number) - (b as number);
                });
                return (
                  <div className="space-y-3">
                    {sortedKeys.map((key) => {
                      const group = groups.get(key) ?? [];
                      return (
                        <div key={String(key)} className="border border-slate-700 rounded">
                          <div className="px-3 py-2 text-xs font-medium bg-slate-800/70">
                            Round {key === 'Unassigned' ? '—' : key}
                          </div>
                          <div className="divide-y divide-slate-800">
                            {group.map((m: TournamentMatchesResponse['matches'][number]) => (
                              <div key={m.id} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{m.players.map((p: TournamentMatchesResponse['matches'][number]['players'][number]) => p.name).join(' vs ')}</span>
                                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/10 text-white/70 ring-1 ring-white/20">{m.status}</span>
                                  </div>
                                  <div className="text-xs opacity-70">
                                    Games: {m.gameCount} {m.winnerId ? `• Winner: ${m.players.find((p: TournamentMatchesResponse['matches'][number]['players'][number]) => p.id === m.winnerId)?.name ?? '—'}` : ''}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-xs text-slate-300 whitespace-nowrap">
                                    {m.startedAt ? new Date(m.startedAt).toLocaleString() : ''}
                                  </div>
                                  {/* Offer Join for current player's assignment */}
                                  {myId && m.players.some(p => p.id === myId) && (
                                    <button
                                      className="rounded bg-blue-600/80 hover:bg-blue-600 px-3 py-1 text-xs text-blue-100"
                                      onClick={async () => {
                                        try {
                                          // Compute match type from tournament info without using 'any'
                                          const tRaw = data?.tournament as unknown;
                                          const tObj = (tRaw && typeof tRaw === 'object') ? (tRaw as Record<string, unknown>) : null;
                                          const tMatchType = (tObj?.matchType as string | undefined)
                                            ?? (tObj?.format as string | undefined)
                                            ?? 'constructed';

                                          // Try to get sealed/draft configs from matches payload; fallback to tournament details API
                                          let sealedConfig: unknown = (tObj?.settings as Record<string, unknown> | undefined)?.sealedConfig || null;
                                          let draftConfig: unknown = (tObj?.settings as Record<string, unknown> | undefined)?.draftConfig || null;
                                          if (!sealedConfig && !draftConfig && (tObj?.id as string | undefined)) {
                                            try {
                                              const detailRes = await fetch(`/api/tournaments/${tObj?.id as string}`);
                                              if (detailRes.ok) {
                                                const detail = await detailRes.json();
                                                sealedConfig = detail?.settings?.sealedConfig || null;
                                                draftConfig = detail?.settings?.draftConfig || null;
                                              }
                                            } catch {}
                                          }

                                          // Sensible defaults if server settings absent
                                          if (tMatchType === 'sealed' && !sealedConfig) {
                                            sealedConfig = { packCounts: { Beta: 6 }, timeLimit: 40, replaceAvatars: false };
                                          }
                                          if (tMatchType === 'draft' && !draftConfig) {
                                            draftConfig = { setMix: ['Beta'], packCount: 3, packSize: 15, packCounts: { Beta: 3 } };
                                          }

                                          // Persist bootstrap payload so the play page can initialize the match room
                                          const payload = {
                                            players: m.players.map(p => p.id),
                                            matchType: tMatchType as 'constructed' | 'sealed' | 'draft',
                                            lobbyName: (tObj?.name as string | undefined) || undefined,
                                            sealedConfig,
                                            draftConfig,
                                          };
                                          localStorage.setItem(`tournamentMatchBootstrap_${m.id}`, JSON.stringify(payload));
                                          window.location.href = `/online/play/${encodeURIComponent(m.id)}`;
                                        } catch {}
                                      }}
                                      title="Join your match"
                                    >
                                      Join Match
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
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
  ready,
  onToggleReady,
  onSetLobbyVisibility,
  onResync,
  onCreateTournament,
  onJoinTournament,
  onLeaveTournament,
  onUpdateTournamentSettings,
  onToggleTournamentReady,
  onStartTournament,
  onEndTournament,
  onRefresh,
  tournamentsEnabled = true,
}: {
  lobbies: LobbyInfo[];
  tournaments: TournamentInfo[];
  myId: string | null;
  joinedLobbyId: string | null;
  onJoin: (lobbyId: string) => void;
  onCreate: (config: CreateLobbyConfig) => void;
  onLeaveLobby?: () => void;
  ready?: boolean;
  onToggleReady?: () => void;
  onSetLobbyVisibility?: (visibility: "open" | "private") => void;
  onResync?: () => void;
  onCreateTournament?: (config: CreateTournamentConfig) => void;
  onJoinTournament?: (tournamentId: string) => void;
  onLeaveTournament?: (tournamentId: string) => void;
  onUpdateTournamentSettings?: (tournamentId: string, settings: {
    name?: string;
    format?: "swiss" | "elimination" | "round_robin";
    matchType?: "constructed" | "sealed" | "draft";
    maxPlayers?: number;
  }) => void;
  onToggleTournamentReady?: (tournamentId: string, ready: boolean) => void;
  onStartTournament?: (tournamentId: string) => void;
  onEndTournament?: (tournamentId: string) => void;
  onRefresh: () => void;
  tournamentsEnabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [hideFull, setHideFull] = useState(false);
  const [hideStarted, setHideStarted] = useState(true);
  const [sortKey, setSortKey] = useState<"invited" | "playersAsc" | "playersDesc" | "status">("status");
  const [showTournaments, setShowTournaments] = useState(tournamentsEnabled);
  const [showLobbies, setShowLobbies] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<TournamentInfo | null>(null);
  const [endTournamentConfirm, setEndTournamentConfirm] = useState<string | null>(null);
  const [tournamentOverlayOpen, setTournamentOverlayOpen] = useState(false);
  const [matchesModalOpen, setMatchesModalOpen] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matchesData, setMatchesData] = useState<TournamentMatchesResponse | null>(null);
  
  // Check if user is already engaged in a lobby or tournament
  const isInLobby = joinedLobbyId !== null;
  const joinedTournament = tournaments.find(t => t.registeredPlayers.some(p => p.id === myId) && t.status !== "completed");
  const isInTournament = joinedTournament !== undefined;
  const isEngaged = isInLobby || isInTournament;
  const [cfgName, setCfgName] = useState<string>("");
  const [cfgVisibility, setCfgVisibility] = useState<"open" | "private">("open");
  const [cfgMaxPlayers, setCfgMaxPlayers] = useState<number>(2);
  
  // Tournament creation state
  const [tournamentName, setTournamentName] = useState<string>("");
  const [tournamentFormat, setTournamentFormat] = useState<"swiss" | "elimination" | "round_robin">("swiss");
  const [tournamentMatchType, setTournamentMatchType] = useState<"constructed" | "sealed" | "draft">("sealed");
  const [tournamentMaxPlayers, setTournamentMaxPlayers] = useState<number>(2);

  // Generate a random name when overlay opens
  const handleOverlayOpen = () => {
    setCfgName(generateLobbyName());
    setOverlayOpen(true);
  };

  const handleTournamentOverlayOpen = () => {
    setTournamentName(generateLobbyName());
    setTournamentOverlayOpen(true);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusWeight = (s: string) => (s === "open" ? 0 : s === "started" ? 1 : 2);
    const list = lobbies.filter((l) => {
      const isJoined = l.players.some(p => p.id === myId);
      // Don't hide joined lobbies even if they're full or started
      if (hideFull && l.players.length >= l.maxPlayers && !isJoined) return false;
      if (hideStarted && l.status !== "open" && !isJoined) return false;
      if (!q) return true;
      const hostName = l.players.find((p) => p.id === l.hostId)?.displayName?.toLowerCase() || "";
      const players = l.players.map((p) => p.displayName.toLowerCase()).join(" ");
      const lobbyName = l.name?.toLowerCase() || "";
      return l.id.toLowerCase().includes(q) || hostName.includes(q) || players.includes(q) || lobbyName.includes(q);
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
  }, [lobbies, query, hideFull, hideStarted, sortKey, joinedLobbyId, myId]);

  // Filter tournaments
  const filteredTournaments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tournaments.filter(tournament => {
      // Always exclude completed tournaments from Active Games view
      if (tournament.status === "completed") return false;
      const isJoined = tournament.registeredPlayers.some(p => p.id === myId);
      if (q && !tournament.name.toLowerCase().includes(q)) return false;
      // Don't hide joined tournaments even if they're full or started
      if (hideFull && tournament.registeredPlayers.length >= tournament.maxPlayers && !isJoined) return false;
      if (hideStarted && tournament.status !== "registering" && !isJoined) return false;
      return true;
    }).sort((a, b) => {
      // Sort by status first (registering before others)
      const statusOrder = { registering: 0, draft_phase: 1, sealed_phase: 1, playing: 2, completed: 3 };
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
          if (typeof err?.error === 'string') errMsg = err.error;
        } catch {}
        throw new Error(errMsg);
      }
      const data = await res.json() as TournamentMatchesResponse;
      setMatchesData(data);
    } catch (e) {
      setMatchesError(e instanceof Error ? e.message : 'Failed to load matches');
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
            title={isEngaged ? `Already in ${isInLobby ? 'lobby' : 'tournament'}` : "Create a new lobby"}
          >
            Create Lobby
          </button>
          {onCreateTournament && (
            <button
              className={`rounded px-3 py-1 text-xs font-semibold ${
                isEngaged 
                  ? "bg-slate-600/50 text-slate-400 cursor-not-allowed" 
                  : "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              }`}
              onClick={isEngaged ? undefined : handleTournamentOverlayOpen}
              disabled={isEngaged}
              title={isEngaged ? `Already in ${isInLobby ? 'lobby' : 'tournament'}` : "Create a new tournament"}
            >
              Create Tournament
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
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
              showLobbies ? "bg-blue-600/80 text-white" : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
            }`}
            onClick={() => setShowLobbies(!showLobbies)}
            title="Toggle lobbies"
          >
            Lobbies ({filtered.length})
          </button>
          {tournamentsEnabled && (
            <button
              className={`text-[11px] px-2 py-0.5 rounded ${
                showTournaments ? "bg-purple-600/80 text-white" : "bg-slate-700/50 text-slate-300 hover:bg-slate-600/50"
              }`}
              onClick={() => setShowTournaments(!showTournaments)}
              title="Toggle tournaments"
            >
              Tournaments ({filteredTournaments.length})
            </button>
          )}
        </div>
        <label className="text-xs flex items-center gap-1 opacity-80">
          <input type="checkbox" checked={hideFull} onChange={(e) => setHideFull(e.target.checked)} />
          Hide full
        </label>
        <label className="text-xs flex items-center gap-1 opacity-80">
          <input type="checkbox" checked={hideStarted} onChange={(e) => setHideStarted(e.target.checked)} />
          Hide started/closed
        </label>
      </div>

      <div className="divide-y divide-white/5 rounded-lg overflow-hidden ring-1 ring-white/10">
        {showLobbies && filtered.map((l) => {
          const isMine = l.id === joinedLobbyId;
          const host = l.players.find((p) => p.id === l.hostId)?.displayName || "Host";
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
                  <span className="truncate">{l.name || "Unnamed Lobby"}</span>
                  {l.plannedMatchType && (
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ring-1 ${
                        l.plannedMatchType === 'constructed'
                          ? 'bg-slate-600/30 text-slate-200 ring-slate-500/40'
                          : l.plannedMatchType === 'sealed'
                          ? 'bg-purple-600/15 text-purple-200 ring-purple-500/30'
                          : 'bg-indigo-600/15 text-indigo-200 ring-indigo-500/30'
                      }`}
                      title={`Planned: ${l.plannedMatchType}`}
                    >
                      {l.plannedMatchType}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono opacity-50 text-xs truncate">{l.id}</span>
                  {l.status !== "open" && (
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      l.status === "started" ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30" : "bg-white/10 text-white/70 ring-1 ring-white/20"
                    }`}>
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
                      title={l.visibility === "open" ? "Open lobby" : "Private lobby"}
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
                  <span className="opacity-90">Players: {l.players.length}/{l.maxPlayers}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {l.players.length === 0 && (
                    <span className="text-xs opacity-70">No players yet</span>
                  )}
                  {l.players.map((p) => {
                    const isReady = (l.readyPlayerIds || []).includes(p.id);
                    const isHostP = p.id === l.hostId;
                    const isYou = !!myId && p.id === myId;
                    return (
                      <span
                        key={p.id}
                        className={`text-[11px] px-1.5 py-0.5 rounded ring-1 ${
                          isReady
                            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                            : "bg-slate-800/60 text-slate-300 ring-slate-700/60"
                        }`}
                        title={`${p.displayName}${isYou ? " • You" : ""}${isHostP ? " • Host" : ""}${
                          isReady ? " • Ready" : " • Not ready"
                        }`}
                      >
                        {p.displayName}
                        {isYou && <span className="opacity-70"> • You</span>}
                        {isHostP && <span className="opacity-70"> • Host</span>}
                        <span className="opacity-80"> {isReady ? " • ✓" : " • …"}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isMine ? (
                  <>
                    <div className="flex items-center gap-1">
                      {typeof ready === 'boolean' && onToggleReady && (
                        <button
                          className={`rounded px-3 py-1 text-xs ${
                            ready
                              ? "bg-yellow-600/80 hover:bg-yellow-600 text-yellow-100"
                              : "bg-green-600/80 hover:bg-green-600 text-green-100"
                          }`}
                          onClick={() => onToggleReady()}
                          title="Toggle your ready state"
                        >
                          {ready ? "Not Ready" : "Ready"}
                        </button>
                      )}
                      {onLeaveLobby && (
                        <button
                          className="rounded bg-red-600/80 hover:bg-red-600 px-3 py-1 text-xs"
                          onClick={() => onLeaveLobby()}
                        >
                          Leave
                        </button>
                      )}
                    </div>
                    {onSetLobbyVisibility && myId && l.hostId === myId && (
                      <button
                        className="ml-1 rounded bg-slate-700 hover:bg-slate-600 p-1.5 text-xs"
                        onClick={() => onSetLobbyVisibility(l.visibility === "open" ? "private" : "open")}
                        title={l.visibility === "open" ? "Set lobby to private" : "Set lobby to open"}
                        aria-label="Toggle lobby visibility"
                      >
                        {l.visibility === "open" ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    <button
                      className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs"
                      onClick={() => {
                        try {
                          if (navigator.clipboard) void navigator.clipboard.writeText(l.id);
                        } catch {}
                      }}
                      title="Copy lobby ID"
                    >
                      Copy ID
                    </button>
                  </>
                ) : (
                  <button
                    className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-xs disabled:opacity-40"
                    onClick={() => onJoin(l.id)}
                    disabled={!open || full || (isEngaged && l.id !== joinedLobbyId)}
                    title={
                      !open ? "Lobby not open" :
                      full ? "Lobby is full" :
                      isEngaged ? `Already in ${isInLobby ? 'another lobby' : 'tournament'}` :
                      "Join lobby"
                    }
                  >
                    {full ? "Full" : "Join"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        
        {tournamentsEnabled && showTournaments && filteredTournaments.map((tournament) => {
          const isRegistered = tournament.registeredPlayers.some(p => p.id === myId);
          const myRegistration = tournament.registeredPlayers.find(p => p.id === myId);
          const isReady = myRegistration?.ready || false;
          const canJoin = tournament.status === "registering" && !isRegistered && tournament.registeredPlayers.length < tournament.maxPlayers && !isEngaged;
          const allPlayersReady = tournament.registeredPlayers.length >= 2 && tournament.registeredPlayers.every(p => p.ready);
          const canStart = tournament.creatorId === myId && tournament.status === "registering" && allPlayersReady;
          const statusColors = {
            registering: "text-green-400",
            draft_phase: "text-blue-400", 
            sealed_phase: "text-blue-400",
            playing: "text-yellow-400",
            completed: "text-slate-400"
          };
          const statusColor = statusColors[tournament.status as keyof typeof statusColors] || "text-slate-400";
          
          return (
            <div
              key={`tournament-${tournament.id}`}
              className={`flex items-center gap-3 px-3 py-2 bg-black/20 border-l-4 border-purple-500/50 ${
                isRegistered ? "ring-1 ring-purple-500/40 bg-purple-500/5" : ""
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
                    Players: {tournament.registeredPlayers.length}/{tournament.maxPlayers} • 
                    Round: {tournament.currentRound}/{tournament.totalRounds}
                  </div>
                  <div className={statusColor}>
                    Status: {tournament.status.replace('_', ' ')}
                  </div>
                  {isRegistered && tournament.status === "registering" && (
                    <div className={isReady ? "text-green-400" : "text-yellow-400"}>
                      You: {isReady ? "Ready" : "Not Ready"}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canJoin && onJoinTournament && (
                  <button
                    className="rounded bg-purple-600/80 hover:bg-purple-600 px-3 py-1 text-xs"
                    onClick={() => onJoinTournament(tournament.id)}
                  >
                    Join
                  </button>
                )}
                {isRegistered && tournament.status === "registering" && onLeaveTournament && (
                  <button
                    className="rounded bg-red-600/80 hover:bg-red-600 px-3 py-1 text-xs"
                    onClick={() => onLeaveTournament(tournament.id)}
                  >
                    Leave
                  </button>
                )}
                {tournament.creatorId === myId && tournament.status === "registering" && onUpdateTournamentSettings && (
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
                {isRegistered && tournament.status === "registering" && onToggleTournamentReady && (
                  <button
                    className={`rounded px-3 py-1 text-xs ${
                      isReady 
                        ? "bg-yellow-600/80 hover:bg-yellow-600 text-yellow-100" 
                        : "bg-green-600/80 hover:bg-green-600 text-green-100"
                    }`}
                    onClick={() => onToggleTournamentReady(tournament.id, !isReady)}
                  >
                    {isReady ? "Not Ready" : "Ready"}
                  </button>
                )}
                {canStart && onStartTournament && (
                  <button
                    className="rounded bg-blue-600/80 hover:bg-blue-600 px-3 py-1 text-xs text-blue-100 font-medium"
                    onClick={() => onStartTournament(tournament.id)}
                  >
                    Start Tournament
                  </button>
                )}
                {tournament.creatorId === myId && tournament.status !== "completed" && onEndTournament && (
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
                    onClick={() => window.location.href = `/online/play/tournament-${tournament.id}`}
                  >
                    Enter Draft
                  </button>
                )}
                {isRegistered && tournament.status === "sealed_phase" && (
                  <button
                    className="rounded bg-green-600/80 hover:bg-green-600 px-3 py-1 text-xs text-green-100"
                    onClick={() => window.location.href = `/decks/editor-3d?mode=sealed&tournament=${tournament.id}`}
                  >
                    Build Deck
                  </button>
                )}
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
                {tournament.status === "registering" && !isRegistered && tournament.registeredPlayers.length >= tournament.maxPlayers && (
                  <div className="rounded bg-slate-600/20 px-3 py-1 text-xs text-slate-400">
                    Full
                  </div>
                )}
                {tournament.status === "registering" && !isRegistered && tournament.registeredPlayers.length < tournament.maxPlayers && isEngaged && (
                  <div className="rounded bg-slate-600/20 px-3 py-1 text-xs text-slate-400">
                    In {isInLobby ? 'Lobby' : 'Tournament'}
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
        
        {showLobbies && showTournaments && filtered.length === 0 && filteredTournaments.length === 0 && (
          <div className="px-3 py-8 text-center text-sm opacity-60">No games match your filters.</div>
        )}
        {showLobbies && !showTournaments && filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-sm opacity-60">No lobbies match your filters.</div>
        )}
        {tournamentsEnabled && !showLobbies && showTournaments && filteredTournaments.length === 0 && (
          <div className="px-3 py-8 text-center text-sm opacity-60">No tournaments match your filters.</div>
        )}
        {!showLobbies && !(tournamentsEnabled && showTournaments) && (
          <div className="px-3 py-8 text-center text-sm opacity-60">Select lobby or tournament filters to view games.</div>
        )}
      </div>

      {overlayOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOverlayOpen(false)} />
          <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Create Lobby</div>
              <button className="text-slate-300 hover:text-white text-sm" onClick={() => setOverlayOpen(false)}>Close</button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2">Lobby Name *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cfgName}
                    onChange={(e) => setCfgName(e.target.value)}
                    className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                    placeholder="Enter lobby name"
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
                <label className="block text-xs font-medium mb-2">Visibility</label>
                <div className="flex gap-2">
                  <button
                    className={`px-3 py-2 text-sm rounded transition-colors ${cfgVisibility === 'open' ? 'bg-emerald-600/80 text-white' : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60'}`}
                    onClick={() => setCfgVisibility('open')}
                  >
                    Open
                  </button>
                  <button
                    className={`px-3 py-2 text-sm rounded transition-colors ${cfgVisibility === 'private' ? 'bg-amber-600/80 text-white' : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60'}`}
                    onClick={() => setCfgVisibility('private')}
                  >
                    Private
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-2">Max Players</label>
                <input
                  type="number"
                  min={2}
                  max={8}
                  value={cfgMaxPlayers}
                  onChange={(e) => setCfgMaxPlayers(Math.max(2, Math.min(8, parseInt(e.target.value) || 2)))}
                  className="w-24 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm" onClick={() => setOverlayOpen(false)}>Cancel</button>
                <button
                  className="rounded bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 px-4 py-1.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!cfgName.trim()}
                  onClick={() => {
                    const trimmedName = cfgName.trim();
                    if (trimmedName) {
                      onCreate({ name: trimmedName, visibility: cfgVisibility, maxPlayers: cfgMaxPlayers });
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
          <div className="absolute inset-0 bg-black/60" onClick={() => setTournamentOverlayOpen(false)} />
          <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Create Tournament</div>
              <button className="text-slate-300 hover:text-white text-sm" onClick={() => setTournamentOverlayOpen(false)}>Close</button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2">Tournament Name *</label>
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
              
              <div>
                <label className="block text-xs font-medium mb-2">Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {["swiss", "elimination", "round_robin"].map((format) => (
                    <button
                      key={format}
                      className={`px-3 py-2 text-xs rounded transition-colors ${
                        tournamentFormat === format
                          ? "bg-blue-600/80 text-white"
                          : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                      }`}
                      onClick={() => setTournamentFormat(format as "swiss" | "elimination" | "round_robin")}
                    >
                      {format === "swiss" ? "Swiss" : format === "elimination" ? "Elimination" : "Round Robin"}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium mb-2">Match Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {["constructed", "sealed", "draft"].map((type) => (
                    <button
                      key={type}
                      className={`px-3 py-2 text-xs rounded transition-colors ${
                        tournamentMatchType === type
                          ? "bg-purple-600/80 text-white"
                          : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                      }`}
                      onClick={() => setTournamentMatchType(type as "constructed" | "sealed" | "draft")}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium mb-2">Max Players</label>
                <select
                  value={tournamentMaxPlayers}
                  onChange={(e) => setTournamentMaxPlayers(parseInt(e.target.value))}
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
                disabled={!tournamentName.trim()}
                onClick={() => {
                  const trimmedName = tournamentName.trim();
                  if (trimmedName) {
                    onCreateTournament({
                      name: trimmedName,
                      format: tournamentFormat,
                      matchType: tournamentMatchType,
                      maxPlayers: tournamentMaxPlayers
                    });
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
              <h3 className="text-lg font-bold text-white mb-4">Tournament Settings</h3>
              
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
              <h3 className="text-lg font-bold text-white mb-4">End Tournament</h3>
              <p className="text-slate-300 mb-6">
                Are you sure you want to end this tournament? This action cannot be undone and will 
                complete the tournament immediately.
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
  const [format, setFormat] = useState(tournament.format);
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
    if (format !== tournament.format) settings.format = format;
    if (matchType !== tournament.matchType) settings.matchType = matchType;
    if (maxPlayers !== tournament.maxPlayers) settings.maxPlayers = maxPlayers;
    
    onSave(settings);
  };

  const hasChanges = 
    name !== tournament.name ||
    format !== tournament.format ||
    matchType !== tournament.matchType ||
    maxPlayers !== tournament.maxPlayers;

  return (
    <div className="space-y-4">
      {/* Tournament Name */}
      <div>
        <label className="block text-xs font-medium mb-2">Tournament Name *</label>
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

      {/* Tournament Format */}
      <div>
        <label className="block text-xs font-medium mb-2">Format</label>
        <div className="grid grid-cols-3 gap-2">
          {["swiss", "elimination", "round_robin"].map((formatOption) => (
            <button
              key={formatOption}
              className={`px-3 py-2 text-xs rounded transition-colors ${
                format === formatOption
                  ? "bg-blue-600/80 text-white"
                  : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
              }`}
              onClick={() => setFormat(formatOption as "swiss" | "elimination" | "round_robin")}
            >
              {formatOption === "swiss" ? "Swiss" : formatOption === "elimination" ? "Elimination" : "Round Robin"}
            </button>
          ))}
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
              onClick={() => setMatchType(type as "constructed" | "sealed" | "draft")}
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
            Cannot reduce below current player count ({tournament.registeredPlayers.length})
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
          disabled={!hasChanges || maxPlayers < tournament.registeredPlayers.length}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-sm text-white transition-colors"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
