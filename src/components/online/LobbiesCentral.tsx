"use client";

import { useMemo, useState } from "react";

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

type PlayerInfo = { id: string; displayName: string };
type LobbyInfo = {
  id: string;
  name?: string;
  hostId: string;
  status: "open" | "started" | string;
  visibility?: "open" | "private" | string;
  maxPlayers: number;
  players: PlayerInfo[];
};

export type CreateLobbyConfig = {
  name: string;
  visibility: "open" | "private";
  maxPlayers: number;
};

export type CreateTournamentConfig = {
  name: string;
  format: "swiss" | "elimination" | "round_robin";
  matchType: "constructed" | "sealed" | "draft";
  maxPlayers: number;
};

export default function LobbiesCentral({
  lobbies,
  myId,
  joinedLobbyId,
  onJoin,
  onCreate,
  onCreateTournament,
  onRefresh,
}: {
  lobbies: LobbyInfo[];
  myId: string | null;
  joinedLobbyId: string | null;
  onJoin: (lobbyId: string) => void;
  onCreate: (config: CreateLobbyConfig) => void;
  onCreateTournament?: (config: CreateTournamentConfig) => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [hideFull, setHideFull] = useState(false);
  const [hideStarted, setHideStarted] = useState(true);
  const [sortKey, setSortKey] = useState<"invited" | "playersAsc" | "playersDesc" | "status">("status");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [tournamentOverlayOpen, setTournamentOverlayOpen] = useState(false);
  const [cfgName, setCfgName] = useState<string>("");
  const [cfgVisibility, setCfgVisibility] = useState<"open" | "private">("open");
  const [cfgMaxPlayers, setCfgMaxPlayers] = useState<number>(2);
  
  // Tournament creation state
  const [tournamentName, setTournamentName] = useState<string>("");
  const [tournamentFormat, setTournamentFormat] = useState<"swiss" | "elimination" | "round_robin">("swiss");
  const [tournamentMatchType, setTournamentMatchType] = useState<"constructed" | "sealed" | "draft">("sealed");
  const [tournamentMaxPlayers, setTournamentMaxPlayers] = useState<number>(8);

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
      if (hideFull && l.players.length >= l.maxPlayers) return false;
      if (hideStarted && l.status !== "open") return false;
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
  }, [lobbies, query, hideFull, hideStarted, sortKey, joinedLobbyId]);

  return (
    <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold opacity-90">Lobbies</div>
        <div className="flex items-center gap-2">
          <button
            className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs"
            onClick={onRefresh}
          >
            Refresh
          </button>
          <button
            className="rounded bg-green-600/80 hover:bg-green-600 px-3 py-1 text-xs"
            onClick={handleOverlayOpen}
          >
            Create Lobby
          </button>
          {onCreateTournament && (
            <button
              className="rounded bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 px-3 py-1 text-xs font-semibold"
              onClick={handleTournamentOverlayOpen}
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
      <div className="flex flex-wrap gap-3">
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
        {filtered.map((l) => {
          const isMine = l.id === joinedLobbyId;
          const host = l.players.find((p) => p.id === l.hostId)?.displayName || "Host";
          const open = l.status === "open";
          const full = l.players.length >= l.maxPlayers;
          return (
            <div
              key={l.id}
              className={`flex items-center gap-3 px-3 py-2 bg-black/20 ${
                isMine ? "ring-1 ring-emerald-500/40 bg-emerald-500/5" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-white mb-1 truncate">
                  {l.name || "Unnamed Lobby"}
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono opacity-50 text-xs truncate">{l.id}</span>
                  <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    open ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30" : "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30"
                  }`}>
                    {l.status}
                  </span>
                  {l.visibility && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-white/70 ring-1 ring-white/10">
                      {l.visibility}
                    </span>
                  )}
                  <span className="opacity-70">•</span>
                  <span className="opacity-90">Host: {host}</span>
                  <span className="opacity-70">•</span>
                  <span className="opacity-90">Players: {l.players.length}/{l.maxPlayers}</span>
                </div>
                <div className="text-xs opacity-70 truncate">
                  {l.players.map((p) => p.displayName).join(", ") || "No players yet"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-xs disabled:opacity-40"
                  onClick={() => onJoin(l.id)}
                  disabled={!open || full || l.id === joinedLobbyId}
                  title={open ? (full ? "Lobby is full" : "Join lobby") : "Lobby not open"}
                >
                  {l.id === joinedLobbyId ? "Joined" : full ? "Full" : "Join"}
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-sm opacity-60">No lobbies match your filters.</div>
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
      {tournamentOverlayOpen && onCreateTournament && (
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
                      onClick={() => setTournamentFormat(format as any)}
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
                      onClick={() => setTournamentMatchType(type as any)}
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
    </div>
  );
}

