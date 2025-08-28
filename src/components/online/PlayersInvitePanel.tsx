"use client";

import React, { useMemo, useState } from "react";
import type { LobbyInfo, PlayerInfo } from "@/lib/net/protocol";

export type PlayersInvitePanelProps = {
  players: PlayerInfo[];
  me: PlayerInfo | null;
  lobby: LobbyInfo | null;
  onInvite: (playerId: string, lobbyId?: string) => void;
  onRefresh?: () => void;
};

export default function PlayersInvitePanel({ players, me, lobby, onInvite, onRefresh }: PlayersInvitePanelProps) {
  const [query, setQuery] = useState("");
  const isHost = lobby && me && lobby.hostId === me.id;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = players.filter((p) => p.id !== me?.id);
    if (!q) return list;
    return list.filter((p) => p.displayName.toLowerCase().includes(q));
  }, [players, me?.id, query]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
          placeholder="Search players"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {onRefresh && (
          <button
            className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs"
            onClick={onRefresh}
            title="Refresh players"
          >
            Refresh
          </button>
        )}
      </div>
      {(!players || players.length === 0) ? (
        <div className="text-sm opacity-60">No players online</div>
      ) : (
        <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <div className="truncate">
                {p.displayName}
              </div>
              <button
                className="rounded bg-indigo-600/80 hover:bg-indigo-600 px-2 py-0.5 text-xs disabled:opacity-40"
                disabled={!lobby || !isHost}
                onClick={() => onInvite(p.id, lobby?.id)}
                title={!lobby ? "Join or create a lobby first" : (isHost ? "Invite to lobby" : "Only host can invite")}
              >
                Invite
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="text-[11px] opacity-60">
        {lobby ? (
          isHost ? "Invite players to your lobby (private lobbies require invite)." : "Only the host can send invites."
        ) : (
          "Join or create a lobby to send invites."
        )}
      </div>
    </div>
  );
}
