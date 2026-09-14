"use client";

import { useCallback, useEffect, useState } from "react";
import { useOnline, type AvailablePlayer } from "@/app/online/online-context";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";

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
  const eliminatedPlayers = registrations.filter(
    (r) => r.seatStatus === "vacant",
  );
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
    <section className="rc-panel">
      <PanelHeader
        title="Players"
        meta={`${activePlayers.length} ${
          activePlayers.length === 1 ? "player" : "players"
        }`}
      >
        {isHost && isActive && (
          <RcButton variant="outline" size="sm" onClick={handleShowOnline}>
            {showOnlinePlayers ? "Refresh" : "Show Online Players"}
          </RcButton>
        )}
      </PanelHeader>

      <div className="px-[18px] py-3.5">
        {error && (
          <div className="rc-alert mb-3" data-tone="danger">
            {error}
          </div>
        )}

        {/* Online Players List (host only) */}
        {isHost && isActive && showOnlinePlayers && (
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4 className="rc-eyebrow m-0">
                Online Players
                {availablePlayersLoading && (
                  <span className="ml-1 text-rc-fg-dim">(loading...)</span>
                )}
              </h4>
              <RcButton
                variant="ghost"
                size="sm"
                onClick={() =>
                  requestPlayers({ reset: true, sort: "alphabetical" })
                }
                disabled={availablePlayersLoading}
              >
                Refresh
              </RcButton>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-rc-md border border-rc-line/18 bg-black/30">
              {availablePlayers.length === 0 && !availablePlayersLoading && (
                <div className="rc-hint px-3 py-2.5">
                  No online players found
                </div>
              )}
              {availablePlayers.map((player) => (
                <div
                  key={player.userId}
                  className="flex items-center justify-between gap-3 border-b border-rc-line/8 px-3 py-2 transition-colors last:border-b-0 hover:bg-rc-accent/6"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`rc-dot ${
                        player.presence.inMatch
                          ? "text-rc-warning"
                          : "text-rc-success"
                      }`}
                    />
                    <span className="truncate font-rc-mono text-[13px] text-rc-fg-strong">
                      {player.displayName}
                    </span>
                    {player.presence.inMatch && (
                      <span className="font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-warning">
                        in match
                      </span>
                    )}
                  </div>
                  {registeredIds.has(player.userId) ? (
                    <span className="font-rc-mono text-[11px] uppercase tracking-[0.14em] text-rc-fg-subtle">
                      Joined
                    </span>
                  ) : (
                    <RcButton
                      variant="outline"
                      size="sm"
                      onClick={() => handleInvitePlayer(player)}
                      disabled={adding === player.userId}
                    >
                      {adding === player.userId ? "..." : "Invite"}
                    </RcButton>
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
                className="flex items-center justify-between gap-3 rounded-rc-md bg-black/30 px-3 py-2 transition-colors hover:bg-rc-accent/6"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                    {reg.player.name ?? "Unknown"}
                  </span>
                  {standing && (
                    <span className="font-rc-mono text-[11px] tracking-[0.1em] tabular-nums text-rc-fg-subtle">
                      {standing.wins}W-{standing.losses}L-{standing.draws}D
                      <span className="ml-1 text-rc-fg-dim">
                        ({standing.matchPoints} pts)
                      </span>
                    </span>
                  )}
                </div>
                {isHost && isActive && (
                  <RcButton
                    variant="danger-soft"
                    size="sm"
                    onClick={() => handleRemovePlayer(reg.playerId)}
                    title="Remove player"
                  >
                    Remove
                  </RcButton>
                )}
              </div>
            );
          })}
        </div>

        {/* Eliminated/Removed Players */}
        {eliminatedPlayers.length > 0 && (
          <div className="mt-3 border-t border-rc-line/12 pt-3">
            <h4 className="mb-1.5 font-rc-mono text-[11px] uppercase tracking-[0.24em] text-rc-fg-dim">
              Removed
            </h4>
            {eliminatedPlayers.map((reg) => (
              <div key={reg.playerId} className="rc-hint px-3 py-1">
                {reg.player.name ?? "Unknown"}
              </div>
            ))}
          </div>
        )}

        {activePlayers.length === 0 && !showOnlinePlayers && (
          <RcEmpty title="No players yet.">
            {isHost ? 'use "Show Online Players" to invite players' : ""}
          </RcEmpty>
        )}
      </div>
    </section>
  );
}
