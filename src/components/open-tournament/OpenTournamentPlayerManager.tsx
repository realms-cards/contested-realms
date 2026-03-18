"use client";

import { useState } from "react";

interface Registration {
  playerId: string;
  seatStatus: string;
  player: { id: string; name: string | null; image?: string | null };
}

interface Standing {
  playerId: string;
  displayName: string;
  matchPoints: number;
  wins: number;
  losses: number;
  draws: number;
  isEliminated: boolean;
}

interface Props {
  tournamentId: string;
  registrations: Registration[];
  standings: Standing[];
  isHost: boolean;
  isActive: boolean;
  onRefresh: () => void;
}

export function OpenTournamentPlayerManager({
  tournamentId,
  registrations,
  standings,
  isHost,
  isActive,
  onRefresh,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const standingsMap = new Map(standings.map((s) => [s.playerId, s]));
  const activePlayers = registrations.filter((r) => r.seatStatus === "active");
  const eliminatedPlayers = registrations.filter((r) => r.seatStatus === "vacant");

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(searchQuery.trim())}&limit=10`,
      );
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data.users ?? data ?? []);
    } catch {
      setError("Failed to search users");
    } finally {
      setSearching(false);
    }
  };

  const handleAddPlayer = async (userId: string) => {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/open-tournaments/${tournamentId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add player");
      setSearchResults([]);
      setSearchQuery("");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add player");
    } finally {
      setAdding(false);
    }
  };

  const handleRemovePlayer = async (userId: string) => {
    if (!confirm("Remove this player from the tournament?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/open-tournaments/${tournamentId}/players`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to remove player");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove player");
    }
  };

  const registeredIds = new Set(registrations.map((r) => r.playerId));

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3">
        Players ({activePlayers.length})
      </h3>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded text-xs mb-3">
          {error}
        </div>
      )}

      {/* Add Player (host only) */}
      {isHost && isActive && (
        <div className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search users to add..."
              className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded text-sm"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 bg-slate-700 border border-slate-600 rounded max-h-40 overflow-y-auto">
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-slate-600 border-b border-slate-600 last:border-b-0"
                >
                  <span className="text-sm text-white">{user.name ?? "Unknown"}</span>
                  {registeredIds.has(user.id) ? (
                    <span className="text-xs text-slate-400">Already added</span>
                  ) : (
                    <button
                      onClick={() => handleAddPlayer(user.id)}
                      disabled={adding}
                      className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2 py-1 rounded"
                    >
                      Add
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Active Players */}
      <div className="space-y-1">
        {activePlayers.map((reg) => {
          const standing = standingsMap.get(reg.playerId);
          return (
            <div
              key={reg.playerId}
              className="flex items-center justify-between px-3 py-2 bg-slate-700/50 rounded"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-white">
                  {reg.player.name ?? "Unknown"}
                </span>
                {standing && (
                  <span className="text-xs text-slate-400">
                    {standing.wins}W-{standing.losses}L-{standing.draws}D
                    <span className="ml-1 text-slate-500">
                      ({standing.matchPoints} pts)
                    </span>
                  </span>
                )}
              </div>
              {isHost && isActive && (
                <button
                  onClick={() => handleRemovePlayer(reg.playerId)}
                  className="text-xs text-red-400 hover:text-red-300"
                  title="Remove player"
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Eliminated/Removed Players */}
      {eliminatedPlayers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <h4 className="text-xs font-medium text-slate-500 mb-1">Removed</h4>
          {eliminatedPlayers.map((reg) => (
            <div
              key={reg.playerId}
              className="text-xs text-slate-500 px-3 py-1"
            >
              {reg.player.name ?? "Unknown"}
            </div>
          ))}
        </div>
      )}

      {activePlayers.length === 0 && (
        <div className="text-center py-4 text-slate-500 text-sm">
          No players yet. {isHost ? "Search and add players above." : ""}
        </div>
      )}
    </div>
  );
}
