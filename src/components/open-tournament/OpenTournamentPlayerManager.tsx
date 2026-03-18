"use client";

import { useCallback, useEffect, useState } from "react";
import { useOnline, type AvailablePlayer } from "@/app/online/online-context";

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
  tournamentName: string;
  registrations: Registration[];
  standings: Standing[];
  isHost: boolean;
  isActive: boolean;
  onRefresh: () => void;
}

export function OpenTournamentPlayerManager({
  tournamentId,
  tournamentName,
  registrations,
  standings,
  isHost,
  isActive,
  onRefresh,
}: Props) {
  const {
    transport,
    availablePlayers,
    availablePlayersLoading,
    requestPlayers,
  } = useOnline();
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOnlinePlayers, setShowOnlinePlayers] = useState(false);

  const standingsMap = new Map(standings.map((s) => [s.playerId, s]));
  const activePlayers = registrations.filter((r) => r.seatStatus === "active");
  const eliminatedPlayers = registrations.filter((r) => r.seatStatus === "vacant");
  const registeredIds = new Set(registrations.map((r) => r.playerId));

  // Load online players when the panel is opened
  const handleShowOnline = useCallback(() => {
    setShowOnlinePlayers(true);
    requestPlayers({ reset: true, sort: "alphabetical" });
  }, [requestPlayers]);

  // Auto-load online players on mount for host
  useEffect(() => {
    if (isHost && isActive) {
      requestPlayers({ reset: true, sort: "alphabetical" });
    }
  }, [isHost, isActive, requestPlayers]);

  const handleAddPlayer = async (userId: string) => {
    setAdding(userId);
    setError(null);
    try {
      const res = await fetch(`/api/open-tournaments/${tournamentId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add player");
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add player");
    } finally {
      setAdding(null);
    }
  };

  const handleInvitePlayer = (player: AvailablePlayer) => {
    // Send socket invite notification
    const socket = transport?.getSocket();
    if (socket) {
      socket.emit("sendTournamentInvite", {
        targetPlayerId: player.userId,
        tournamentId,
        tournamentName,
      });
    }
    // Also add them to the tournament directly
    handleAddPlayer(player.userId);
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

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-300">
          Players ({activePlayers.length})
        </h3>
        {isHost && isActive && (
          <button
            onClick={handleShowOnline}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {showOnlinePlayers ? "Refresh" : "Show Online Players"}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded text-xs mb-3">
          {error}
        </div>
      )}

      {/* Online Players List (host only) */}
      {isHost && isActive && showOnlinePlayers && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-slate-400">
              Online Players
              {availablePlayersLoading && (
                <span className="ml-1 text-slate-500">(loading...)</span>
              )}
            </h4>
            <button
              onClick={() => requestPlayers({ reset: true, sort: "alphabetical" })}
              disabled={availablePlayersLoading}
              className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          <div className="bg-slate-700 border border-slate-600 rounded max-h-48 overflow-y-auto">
            {availablePlayers.length === 0 && !availablePlayersLoading && (
              <div className="px-3 py-2 text-xs text-slate-500">
                No online players found
              </div>
            )}
            {availablePlayers.map((player) => (
              <div
                key={player.userId}
                className="flex items-center justify-between px-3 py-2 hover:bg-slate-600 border-b border-slate-600 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      player.presence.inMatch
                        ? "bg-amber-400"
                        : "bg-green-400"
                    }`}
                  />
                  <span className="text-sm text-white">
                    {player.displayName}
                  </span>
                  {player.presence.inMatch && (
                    <span className="text-xs text-amber-400">in match</span>
                  )}
                </div>
                {registeredIds.has(player.userId) ? (
                  <span className="text-xs text-slate-400">Joined</span>
                ) : (
                  <button
                    onClick={() => handleInvitePlayer(player)}
                    disabled={adding === player.userId}
                    className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-2 py-1 rounded"
                  >
                    {adding === player.userId ? "..." : "Invite"}
                  </button>
                )}
              </div>
            ))}
          </div>
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

      {activePlayers.length === 0 && !showOnlinePlayers && (
        <div className="text-center py-4 text-slate-500 text-sm">
          No players yet.{" "}
          {isHost ? "Click \"Show Online Players\" to invite players." : ""}
        </div>
      )}
    </div>
  );
}
