"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AvailablePlayer } from "@/app/online/online-context";
import type { LobbyInfo, PlayerInfo } from "@/lib/net/protocol";

export type PlayersInvitePanelProps = {
  // Legacy socket-driven list (fallback)
  players?: PlayerInfo[];
  // New HTTP-derived available players list (preferred)
  available?: AvailablePlayer[];
  loading?: boolean;
  nextCursor?: string | null;
  requestPlayers?: (opts?: { q?: string; sort?: "recent" | "alphabetical"; cursor?: string | null; reset?: boolean }) => void;
  error?: string | null;
  me: PlayerInfo | null;
  lobby: LobbyInfo | null;
  onInvite: (playerId: string, lobbyId?: string) => void;
};

export default function PlayersInvitePanel({ players = [], available = [], loading = false, nextCursor = null, requestPlayers, error = null, me, lobby, onInvite }: PlayersInvitePanelProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "alphabetical">("recent");
  const searchingRef = useRef(false);
  const isHost = lobby && me && lobby.hostId === me.id;
  const [status, setStatus] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const statusTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (statusTimer.current) {
        window.clearTimeout(statusTimer.current);
        statusTimer.current = null;
      }
    };
  }, []);

  const showLegacy = available.length === 0;
  const filteredLegacy = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!showLegacy) return [];
    if (!q) return players.filter((p) => !me || p.id !== me.id);
    return players.filter((p) => (!me || p.id !== me.id) && p.displayName.toLowerCase().includes(q));
  }, [players, me, query, showLegacy]);

  useEffect(() => {
    // Trigger initial fetch when component mounts if HTTP request function is provided
    if (requestPlayers && !searchingRef.current) {
      searchingRef.current = true;
      requestPlayers({ reset: true, sort });
      searchingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addFriend(userId: string) {
    try {
      const res = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId }),
      });
      if (!res.ok) {
        let msg = `Add friend failed (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
        setStatus({ kind: 'error', text: msg });
      } else {
        let msg = 'Friend added';
        try { const j = await res.json(); if (j?.status === 'already_friend') msg = 'Already a friend'; } catch {}
        setStatus({ kind: 'success', text: msg });
        if (requestPlayers) requestPlayers({ q: query, sort, reset: true });
      }
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      console.warn('Add friend error', e);
      setStatus({ kind: 'error', text: 'Network error while adding friend' });
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
          placeholder="Search players"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && requestPlayers) {
              requestPlayers({ q: query, sort, reset: true });
            }
          }}
        />
        <div className="flex items-center gap-1 text-xs">
          <button
            className={`px-2 py-1 rounded ${sort === 'recent' ? 'bg-blue-600/80 text-white' : 'bg-slate-700/70 hover:bg-slate-600/70'}`}
            onClick={() => {
              setSort('recent');
              if (requestPlayers) requestPlayers({ q: query, sort: 'recent', reset: true });
            }}
            title="Sort by recent opponents first"
          >
            Recent
          </button>
          <button
            className={`px-2 py-1 rounded ${sort === 'alphabetical' ? 'bg-blue-600/80 text-white' : 'bg-slate-700/70 hover:bg-slate-600/70'}`}
            onClick={() => {
              setSort('alphabetical');
              if (requestPlayers) requestPlayers({ q: query, sort: 'alphabetical', reset: true });
            }}
            title="Sort alphabetically"
          >
            A–Z
          </button>
        </div>
        <button
          className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs"
          onClick={() => requestPlayers?.({ q: query, sort, reset: true })}
          title="Refresh players"
        >
          Search
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="text-xs px-2 py-1 rounded bg-red-900/40 ring-1 ring-red-800 text-red-200">
          {error}
        </div>
      )}
      {/* Action status banner */}
      {status && (
        <div className={`text-xs px-2 py-1 rounded ${status.kind === 'error' ? 'bg-red-900/40 ring-1 ring-red-800 text-red-200' : 'bg-emerald-900/30 ring-1 ring-emerald-800 text-emerald-200'}`}>
          {status.text}
        </div>
      )}

      {showLegacy ? (
        (!filteredLegacy || filteredLegacy.length === 0) ? (
          <div className="text-sm opacity-60">No players online</div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
            {filteredLegacy.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="truncate">{p.displayName}</div>
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
        )
      ) : (
        <div className="space-y-2">
          {available.length === 0 ? (
            <div className="text-sm opacity-60">No players available</div>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
              {available.map((p) => (
                <div key={p.userId} className="flex items-center justify-between gap-3 text-sm bg-white/5 rounded px-2 py-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatarUrl} alt={p.displayName} className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-700/70 flex items-center justify-center text-[11px]">
                        {p.displayName.slice(0,1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.displayName}</div>
                      <div className="text-[11px] opacity-60 font-mono">{p.shortUserId}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="rounded bg-slate-700/80 hover:bg-slate-700 px-2 py-0.5 text-xs disabled:opacity-50"
                      disabled={p.isFriend}
                      onClick={() => addFriend(p.userId)}
                      title={p.isFriend ? 'Already your friend' : 'Add Friend'}
                    >
                      {p.isFriend ? 'Friend' : 'Add Friend'}
                    </button>
                    <button
                      className="rounded bg-indigo-600/80 hover:bg-indigo-600 px-2 py-0.5 text-xs disabled:opacity-40"
                      disabled={!lobby || !isHost}
                      onClick={() => onInvite(p.userId, lobby?.id)}
                      title={!lobby ? "Join or create a lobby first" : (isHost ? "Invite to lobby" : "Only host can invite")}
                    >
                      Invite
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] opacity-70">
            <div>{loading ? 'Loading…' : null}</div>
            {nextCursor && (
              <button
                className="rounded bg-slate-700/70 hover:bg-slate-600/70 px-2 py-1"
                onClick={() => requestPlayers?.({ cursor: nextCursor })}
                title="Load more"
              >
                Load more
              </button>
            )}
          </div>
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
