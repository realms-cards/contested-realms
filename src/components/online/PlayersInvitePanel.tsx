"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AvailablePlayer } from "@/app/online/online-context";
import type { LobbyInfo, PlayerInfo } from "@/lib/net/protocol";
import { fetchPatrons, PATRON_COLORS, type PatronData } from "@/lib/patrons";

export type PlayersInvitePanelProps = {
  // Legacy socket-driven list (fallback)
  players?: PlayerInfo[];
  // New HTTP-derived available players list (preferred)
  available?: AvailablePlayer[];
  loading?: boolean;
  nextCursor?: string | null;
  requestPlayers?: (opts?: {
    q?: string;
    sort?: "recent" | "alphabetical";
    cursor?: string | null;
    reset?: boolean;
  }) => void;
  error?: string | null;
  me: PlayerInfo | null;
  lobby: LobbyInfo | null;
  onInvite: (playerId: string, lobbyId?: string) => void;
};

export default function PlayersInvitePanel({
  players = [],
  available = [],
  loading = false,
  nextCursor = null,
  requestPlayers,
  error = null,
  me,
  lobby,
  onInvite,
}: PlayersInvitePanelProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "alphabetical">("recent");
  const searchingRef = useRef(false);
  const isHost = lobby && me && lobby.hostId === me.id;
  const [status, setStatus] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const statusTimer = useRef<number | null>(null);
  // Track pending friend action to disable buttons for the specific userId
  const [pendingFriendUserId, setPendingFriendUserId] = useState<string | null>(
    null
  );
  // Optimistic friend state overlay to immediately reflect UI changes
  const [optimisticFriends, setOptimisticFriends] = useState<Set<string>>(
    () => new Set()
  );
  const [patrons, setPatrons] = useState<PatronData | null>(null);

  useEffect(() => {
    fetchPatrons().then(setPatrons);
  }, []);

  useEffect(() => {
    return () => {
      if (statusTimer.current) {
        window.clearTimeout(statusTimer.current);
        statusTimer.current = null;
      }
    };
  }, []);

  // Presence visibility toggle state
  const [presenceHiddenUI, setPresenceHiddenUI] = useState<boolean | null>(
    null
  );
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/users/me/presence");
        if (res.ok) {
          const j = await res.json();
          if (typeof j?.hidden === "boolean") setPresenceHiddenUI(!!j.hidden);
        }
      } catch {}
    })();
  }, []);

  async function setPresence(hidden: boolean) {
    try {
      const res = await fetch("/api/users/me/presence", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hidden }),
      });
      if (!res.ok) {
        let msg = `Failed to update visibility (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        setStatus({ kind: "error", text: msg });
      } else {
        setPresenceHiddenUI(hidden);
        setStatus({
          kind: "success",
          text: hidden ? "Set to Invisible" : "Set to Visible",
        });
        if (requestPlayers) requestPlayers({ q: query, sort, reset: true });
      }
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      console.warn("Update presence error", e);
      setStatus({
        kind: "error",
        text: "Network error while updating visibility",
      });
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
    }
  }

  async function removeFriend(userId: string) {
    try {
      // Optimistically reflect removal in UI
      setPendingFriendUserId(userId);
      setOptimisticFriends((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      const res = await fetch("/api/friends", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      if (!res.ok) {
        let msg = `Remove friend failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        setStatus({ kind: "error", text: msg });
        // Revert optimistic change on failure
        setOptimisticFriends((prev) => {
          const next = new Set(prev);
          next.add(userId);
          return next;
        });
      } else {
        setStatus({ kind: "success", text: "Friend removed" });
        if (requestPlayers) requestPlayers({ q: query, sort, reset: true });
      }
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      console.warn("Remove friend error", e);
      setStatus({ kind: "error", text: "Network error while removing friend" });
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
      // Revert optimistic change on error
      setOptimisticFriends((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    }
    setPendingFriendUserId((curr) => (curr === userId ? null : curr));
  }

  const showLegacy = available.length === 0;
  const filteredLegacy = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!showLegacy) return [];
    if (!q) return players.filter((p) => !me || p.id !== me.id);
    return players.filter(
      (p) => (!me || p.id !== me.id) && p.displayName.toLowerCase().includes(q)
    );
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
      // Optimistically mark as friend and disable button
      setPendingFriendUserId(userId);
      setOptimisticFriends((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      });
      if (!res.ok) {
        let msg = `Add friend failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        setStatus({ kind: "error", text: msg });
        // Revert optimistic friend mark on failure
        setOptimisticFriends((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      } else {
        let msg = "Friend added";
        try {
          const j = await res.json();
          if (j?.status === "already_friend") msg = "Already a friend";
        } catch {}
        setStatus({ kind: "success", text: msg });
        if (requestPlayers) requestPlayers({ q: query, sort, reset: true });
      }
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      console.warn("Add friend error", e);
      setStatus({ kind: "error", text: "Network error while adding friend" });
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
      statusTimer.current = window.setTimeout(() => setStatus(null), 3000);
      // Revert optimistic friend mark on error
      setOptimisticFriends((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
    setPendingFriendUserId((curr) => (curr === userId ? null : curr));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          name="q"
          autoComplete="off"
          role="searchbox"
          inputMode="search"
          aria-autocomplete="list"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore="true"
          data-dashlane-ignore="true"
          data-np-ignore="true"
          data-keeper-lock="true"
          className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
          placeholder="Search players"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && requestPlayers) {
              requestPlayers({ q: query, sort, reset: true });
            }
          }}
        />
        <div className="flex items-center gap-1 text-xs">
          <button
            className={`px-2 py-1 rounded ${
              sort === "recent"
                ? "bg-blue-600/80 text-white"
                : "bg-slate-700/70 hover:bg-slate-600/70"
            }`}
            onClick={() => {
              setSort("recent");
              if (requestPlayers)
                requestPlayers({ q: query, sort: "recent", reset: true });
            }}
            title="Sort by recent opponents first"
          >
            Recent
          </button>
          <button
            className={`px-2 py-1 rounded ${
              sort === "alphabetical"
                ? "bg-blue-600/80 text-white"
                : "bg-slate-700/70 hover:bg-slate-600/70"
            }`}
            onClick={() => {
              setSort("alphabetical");
              if (requestPlayers)
                requestPlayers({ q: query, sort: "alphabetical", reset: true });
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
        {/* Presence toggle (eye open/closed) */}
        <button
          className={`ml-auto inline-flex items-center gap-1 px-2 py-1 rounded ring-1 ${
            presenceHiddenUI === true
              ? "ring-amber-700 bg-amber-800/30 hover:bg-amber-800/50"
              : "ring-emerald-700 bg-emerald-800/30 hover:bg-emerald-800/50"
          } disabled:opacity-50`}
          onClick={() => {
            if (presenceHiddenUI === null) return;
            setPresence(!presenceHiddenUI);
          }}
          disabled={presenceHiddenUI === null}
          title={
            presenceHiddenUI
              ? "Currently Invisible – click to become Visible"
              : "Currently Visible – click to become Invisible"
          }
        >
          {/* Simple inline eye icon */}
          {presenceHiddenUI ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4 text-amber-300"
            >
              <path d="M3.53 2.47a.75.75 0 0 0-1.06 1.06l18 18a.75.75 0 1 0 1.06-1.06l-2.36-2.36A11.7 11.7 0 0 0 21.75 12S18 5.25 12 5.25c-1.63 0-3.1.36-4.41.96L3.53 2.47ZM12 7.5c3.9 0 7.17 3.05 8.59 4.5a20.52 20.52 0 0 1-2.48 2.16l-2.2-2.2A4.5 4.5 0 0 0 10.04 9.1l-1.7-1.7c1.05-.36 2.17-.6 3.66-.6Zm.75 6.75a1.5 1.5 0 0 1-2.03-2.03l2.03 2.03Zm-6.6-6.6 2.67 2.67a4.5 4.5 0 0 0 5.61 5.61l2.01 2.01c-1.12.35-2.37.61-3.44.61-6 0-9.75-6.75-9.75-6.75a20.74 20.74 0 0 1 2.9-3.15Z" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-4 h-4 text-emerald-300"
            >
              <path d="M12 5.25c6 0 9.75 6.75 9.75 6.75S18 18.75 12 18.75 2.25 12 2.25 12 6 5.25 12 5.25Zm0 2.25a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm0 2.25a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Z" />
            </svg>
          )}
          <span className="text-[11px] opacity-80">
            {presenceHiddenUI ? "Invisible" : "Visible"}
          </span>
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
        <div
          className={`text-xs px-2 py-1 rounded ${
            status.kind === "error"
              ? "bg-red-900/40 ring-1 ring-red-800 text-red-200"
              : "bg-emerald-900/30 ring-1 ring-emerald-800 text-emerald-200"
          }`}
        >
          {status.text}
        </div>
      )}

      {showLegacy ? (
        !filteredLegacy || filteredLegacy.length === 0 ? (
          <div className="text-sm opacity-60">No players online</div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
            {filteredLegacy.map((p) => {
              const isSelf = !!me && p.id === me.id;
              const patronTier = patrons
                ? patrons.grandmaster.some((pt) => pt.id === p.id)
                  ? "grandmaster"
                  : patrons.apprentice.some((pt) => pt.id === p.id)
                  ? "apprentice"
                  : null
                : null;
              const patronStyle = patronTier ? PATRON_COLORS[patronTier] : null;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div
                    className={`truncate ${patronStyle?.text ?? ""}`}
                    style={
                      patronStyle
                        ? { textShadow: patronStyle.textShadowMinimal }
                        : undefined
                    }
                  >
                    {p.displayName}
                  </div>
                  {!isSelf && (
                    <button
                      className="rounded bg-indigo-600/80 hover:bg-indigo-600 px-2 py-0.5 text-xs disabled:opacity-40"
                      disabled={!lobby || !isHost}
                      onClick={() => {
                        onInvite(p.id, lobby?.id);
                        setStatus({ kind: "success", text: "Invite sent" });
                        if (statusTimer.current)
                          window.clearTimeout(statusTimer.current);
                        statusTimer.current = window.setTimeout(
                          () => setStatus(null),
                          2500
                        );
                      }}
                      title={
                        !lobby
                          ? "Join or create a lobby first"
                          : isHost
                          ? "Invite to lobby"
                          : "Only host can invite"
                      }
                    >
                      Invite
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {available.length === 0 ? (
            <div className="text-sm opacity-60">No players available</div>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
              {available.map((p) => {
                const isSelf = !!me && p.userId === me.id;
                const isFriend = p.isFriend || optimisticFriends.has(p.userId);
                const isPending = pendingFriendUserId === p.userId;
                const patronTier = patrons
                  ? patrons.grandmaster.some((pt) => pt.id === p.userId)
                    ? "grandmaster"
                    : patrons.apprentice.some((pt) => pt.id === p.userId)
                    ? "apprentice"
                    : null
                  : null;
                const patronStyle = patronTier
                  ? PATRON_COLORS[patronTier]
                  : null;
                return (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between gap-3 text-sm bg-white/5 rounded px-2 py-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {p.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.avatarUrl}
                          alt={p.displayName}
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-700/70 flex items-center justify-center text-[11px]">
                          {p.displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`truncate font-medium ${
                              patronStyle?.text ?? ""
                            }`}
                            style={
                              patronStyle
                                ? { textShadow: patronStyle.textShadowMinimal }
                                : undefined
                            }
                          >
                            {p.displayName}
                          </span>
                          {/* Location badge */}
                          {p.presence.location &&
                            p.presence.location !== "lobby" && (
                              <span
                                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${
                                  p.presence.location === "collection" ||
                                  p.presence.location === "decks"
                                    ? "bg-purple-900/50 text-purple-300"
                                    : p.presence.location === "match"
                                    ? "bg-amber-900/50 text-amber-300"
                                    : "bg-slate-700/50 text-slate-400"
                                }`}
                              >
                                {p.presence.location === "collection"
                                  ? "📦 Collection"
                                  : p.presence.location === "decks"
                                  ? "🃏 Decks"
                                  : p.presence.location === "match"
                                  ? "⚔️ In Match"
                                  : p.presence.location === "browsing"
                                  ? "Browsing"
                                  : p.presence.location}
                              </span>
                            )}
                        </div>
                        <div className="text-[11px] opacity-60 font-mono">
                          {p.shortUserId}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isSelf && isFriend ? (
                        <button
                          className={`relative inline-flex items-center justify-center px-2 py-0.5 text-[11px] rounded ring-1 transition-colors group
                          ${isPending ? "opacity-60 cursor-not-allowed" : ""}
                          bg-emerald-800/40 ring-emerald-700 text-emerald-200
                          hover:bg-red-800/60 hover:ring-red-700 hover:text-white focus:bg-red-800/60 focus:ring-red-700 focus:text-white
                        `}
                          onClick={() => removeFriend(p.userId)}
                          disabled={isPending}
                          title={isPending ? "Removing…" : "Remove Friend"}
                          aria-label="Remove Friend"
                        >
                          {/* Default label */}
                          <span className="transition-opacity duration-150 group-hover:opacity-0 group-focus:opacity-0">
                            Friend
                          </span>
                          {/* Hover/focus label overlays on top */}
                          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100">
                            Remove
                          </span>
                        </button>
                      ) : !isSelf ? (
                        <button
                          className="rounded bg-slate-700/80 hover:bg-slate-700 px-2 py-0.5 text-xs"
                          onClick={() => addFriend(p.userId)}
                          disabled={isPending}
                          title="Add Friend"
                        >
                          Add Friend
                        </button>
                      ) : null}
                      {!isSelf && (
                        <button
                          className="rounded bg-indigo-600/80 hover:bg-indigo-600 px-2 py-0.5 text-xs disabled:opacity-40"
                          disabled={!lobby || !isHost}
                          onClick={() => {
                            onInvite(p.userId, lobby?.id);
                            setStatus({ kind: "success", text: "Invite sent" });
                            if (statusTimer.current)
                              window.clearTimeout(statusTimer.current);
                            statusTimer.current = window.setTimeout(
                              () => setStatus(null),
                              2500
                            );
                          }}
                          title={
                            !lobby
                              ? "Join or create a lobby first"
                              : isHost
                              ? "Invite to lobby"
                              : "Only host can invite"
                          }
                        >
                          Invite
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between text-[11px] opacity-70">
            <div>{loading ? "Loading…" : null}</div>
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
        {lobby
          ? isHost
            ? "Invite players to your lobby (private lobbies require invite)."
            : "Only the host can send invites."
          : "Join or create a lobby to send invites."}
      </div>
    </div>
  );
}
