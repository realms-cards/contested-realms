"use client";

import React from "react";
import type { LobbyInfo } from "@/lib/net/protocol";

type LobbyListProps = {
  lobbies: LobbyInfo[];
  onJoin: (lobbyId: string) => void;
};

function shortId(id: string, left = 6, right = 4) {
  if (id.length <= left + right + 1) return id;
  return `${id.slice(0, left)}…${id.slice(-right)}`;
}

export default function LobbyList({ lobbies, onJoin }: LobbyListProps) {
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
            </div>
            <div className="text-xs opacity-70 truncate">
              Host: {lobby.players.find((p) => p.id === lobby.hostId)?.displayName || lobby.hostId}
              <span className="mx-2">•</span>
              Players: {lobby.players.length}/{lobby.maxPlayers}
            </div>
          </div>
          <div className="shrink-0">
            <button
              className="rounded bg-indigo-600/80 hover:bg-indigo-600 px-3 py-1 text-xs font-medium"
              onClick={() => onJoin(lobby.id)}
              title={lobby.visibility === "private" ? "May require invite" : "Join lobby"}
            >
              Join
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
