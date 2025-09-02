"use client";

import React from "react";
import type { LobbyInfo } from "@/lib/net/protocol";

type LobbyListProps = {
  lobbies: LobbyInfo[];
  onJoin: (lobbyId: string) => void;
  meId?: string | null;
  inviteLobbyIds?: string[];
  // Optional planned match summaries keyed by lobbyId (client-known, e.g., your own lobby)
  plannedSummaries?: Record<string, string>;
};

function shortId(id: string, left = 6, right = 4) {
  if (id.length <= left + right + 1) return id;
  return `${id.slice(0, left)}…${id.slice(-right)}`;
}

export default function LobbyList({ lobbies, onJoin, meId, inviteLobbyIds, plannedSummaries }: LobbyListProps) {
  if (!lobbies || lobbies.length === 0) {
    return <div className="text-sm opacity-60">No active lobbies</div>;
  }

  return (
    <div className="space-y-2">
      {lobbies.map((lobby) => (
        <div
          key={lobby.id}
          className="flex items-center justify-between rounded-lg bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium flex items-center gap-2">
              <span className="font-mono text-slate-200/90">{shortId(lobby.id)}</span>
              <span
                className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                  lobby.visibility === "open"
                    ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30"
                }`}
                title={lobby.visibility === "private" ? "Invite required" : "Anyone can join"}
              >
                {lobby.visibility}
              </span>
              <span className="text-xs opacity-70">{lobby.status}</span>
              {inviteLobbyIds?.includes(lobby.id) && (
                <span
                  className="ml-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/30"
                  title="You have an invite to this lobby"
                >
                  Invited
                </span>
              )}
            </div>
            <div className="text-xs opacity-70 truncate">
              Host: {lobby.players.find((p) => p.id === lobby.hostId)?.displayName || lobby.hostId}
              <span className="mx-2">•</span>
              Players: {lobby.players.length}/{lobby.maxPlayers}
            </div>
            {plannedSummaries?.[lobby.id] && (
              <div className="text-[11px] opacity-70 mt-0.5 truncate">
                {plannedSummaries[lobby.id]}
              </div>
            )}
            {lobby.players.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {lobby.players.map((p) => {
                  const isReady = (lobby.readyPlayerIds || []).includes(p.id);
                  const isHost = p.id === lobby.hostId;
                  const isYou = !!meId && p.id === meId;
                  return (
                    <span
                      key={p.id}
                      className={`text-[11px] px-1.5 py-0.5 rounded ring-1 ${
                        isReady
                          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                          : "bg-slate-800/60 text-slate-300 ring-slate-700/60"
                      }`}
                      title={`${p.displayName}${isYou ? " • You" : ""}${isHost ? " • Host" : ""}${
                        isReady ? " • Ready" : " • Not ready"
                      }`}
                    >
                      {p.displayName}
                      {isYou && <span className="opacity-70"> • You</span>}
                      {isHost && <span className="opacity-70"> • Host</span>}
                      <span className="opacity-80"> {isReady ? " • ✓" : " • …"}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          {(() => {
            const joinable = lobby.status === "open" && lobby.players.length < lobby.maxPlayers;
            const isHostHere = !!meId && lobby.hostId === meId;
            if (!joinable || isHostHere) return null;
            return (
              <div className="shrink-0">
                <button
                  className="rounded bg-indigo-600/80 hover:bg-indigo-600 px-3 py-1 text-xs font-medium"
                  onClick={() => onJoin(lobby.id)}
                  title={lobby.visibility === "private" ? "May require invite" : "Join lobby"}
                >
                  Join
                </button>
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}
