"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AvailablePlayer } from "@/app/online/online-context";
import { getLeagueShortName } from "@/components/online/LeagueBadge";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";
import { useLeaguePlayers } from "@/lib/hooks/useLeagueStatus";
import { useSoatcPlayers } from "@/lib/hooks/useSoatcStatus";
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
  /** Pending lobby invites addressed to the viewer (shown as a count) */
  pendingInvites?: number;
};

type PlayerView = "recent" | "az" | "friends";

// Patron tiers keep their glow colour on the name (feature, not chrome)
const PATRON_HEX = {
  apprentice: "#60a5fa",
  grandmaster: "#fbbf24",
  kingofthe: "#34d399",
} as const;

function presenceState(p: AvailablePlayer): string {
  if (p.presence.inMatch || p.presence.location === "match") return "in match";
  switch (p.presence.location) {
    case "lobby":
      return "in lobby";
    case "collection":
      return "collection";
    case "decks":
      return "decks";
    default:
      return p.presence.online ? "idle" : "offline";
  }
}

function PlayerAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  return (
    <div className="flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-rc-md border border-rc-line/25 bg-gradient-to-br from-[#1a2440] to-[#0b1020] font-rc-display text-[17px] text-rc-fg-muted">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

/**
 * Players panel: online players with friend management and lobby invites.
 * Recent / A–Z sort comes from the server; Friends is a client-side filter.
 */
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
  pendingInvites = 0,
}: PlayersInvitePanelProps) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PlayerView>("recent");
  const sort: "recent" | "alphabetical" =
    view === "az" ? "alphabetical" : "recent";
  const searchingRef = useRef(false);
  const isHost = !!lobby && !!me && lobby.hostId === me.id;
  const [status, setStatus] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const statusTimer = useRef<number | null>(null);
  // Track pending friend action to disable buttons for the specific userId
  const [pendingFriendUserId, setPendingFriendUserId] = useState<string | null>(
    null,
  );
  // Optimistic friend state overlay to immediately reflect UI changes
  const [optimisticFriends, setOptimisticFriends] = useState<Set<string>>(
    () => new Set(),
  );
  const [patrons, setPatrons] = useState<PatronData | null>(null);

  // Get user IDs for SOATC + league status checks
  const playerUserIds = useMemo(() => available.map((p) => p.userId), [
    available,
  ]);
  const { players: soatcPlayers } = useSoatcPlayers(playerUserIds);
  const leaguePlayers = useLeaguePlayers(playerUserIds);

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

  const flash = (next: { kind: "error" | "success"; text: string }, ms = 3000) => {
    setStatus(next);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), ms);
  };

  // Presence visibility toggle state
  const [presenceHiddenUI, setPresenceHiddenUI] = useState<boolean | null>(
    null,
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
        flash({ kind: "error", text: msg });
      } else {
        setPresenceHiddenUI(hidden);
        flash({
          kind: "success",
          text: hidden ? "You are now invisible" : "You are now visible",
        });
        if (requestPlayers) requestPlayers({ q: query, sort, reset: true });
      }
    } catch (e) {
      console.warn("Update presence error", e);
      flash({ kind: "error", text: "Network error while updating visibility" });
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
        flash({ kind: "error", text: msg });
        // Revert optimistic change on failure
        setOptimisticFriends((prev) => {
          const next = new Set(prev);
          next.add(userId);
          return next;
        });
      } else {
        flash({ kind: "success", text: "Friend removed" });
        if (requestPlayers) requestPlayers({ q: query, sort, reset: true });
      }
    } catch (e) {
      console.warn("Remove friend error", e);
      flash({ kind: "error", text: "Network error while removing friend" });
      // Revert optimistic change on error
      setOptimisticFriends((prev) => {
        const next = new Set(prev);
        next.add(userId);
        return next;
      });
    }
    setPendingFriendUserId((curr) => (curr === userId ? null : curr));
  }

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
        flash({ kind: "error", text: msg });
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
        flash({ kind: "success", text: msg });
        if (requestPlayers) requestPlayers({ q: query, sort, reset: true });
      }
    } catch (e) {
      console.warn("Add friend error", e);
      flash({ kind: "error", text: "Network error while adding friend" });
      // Revert optimistic friend mark on error
      setOptimisticFriends((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
    setPendingFriendUserId((curr) => (curr === userId ? null : curr));
  }

  const showLegacy = available.length === 0;
  const filteredLegacy = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!showLegacy) return [];
    return players.filter(
      (p) =>
        (!me || p.id !== me.id) &&
        (!q || p.displayName.toLowerCase().includes(q)),
    );
  }, [players, me, query, showLegacy]);

  const isFriend = (p: AvailablePlayer) =>
    p.isFriend || optimisticFriends.has(p.userId);
  const visiblePlayers = useMemo(
    () => (view === "friends" ? available.filter(isFriend) : available),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isFriend closes over optimisticFriends
    [available, view, optimisticFriends],
  );

  useEffect(() => {
    // Trigger initial fetch when component mounts if HTTP request function is provided
    if (requestPlayers && !searchingRef.current) {
      searchingRef.current = true;
      requestPlayers({ reset: true, sort });
      searchingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectView = (next: PlayerView) => {
    setView(next);
    const nextSort = next === "az" ? "alphabetical" : "recent";
    if (requestPlayers && nextSort !== sort) {
      requestPlayers({ q: query, sort: nextSort, reset: true });
    }
  };

  const invite = (playerId: string) => {
    onInvite(playerId, lobby?.id);
    flash({ kind: "success", text: "Invite sent" }, 2500);
  };
  const inviteTitle = !lobby
    ? "Join or create a lobby first"
    : isHost
      ? "Invite to lobby"
      : "Only the host can invite";
  const canInvite = !!lobby && isHost;

  const patronTierFor = (id: string) => {
    if (!patrons) return null;
    if (patrons.kingofthe?.some((pt) => pt.id === id)) return "kingofthe";
    if (patrons.grandmaster.some((pt) => pt.id === id)) return "grandmaster";
    if (patrons.apprentice.some((pt) => pt.id === id)) return "apprentice";
    return null;
  };

  const nameStyle = (id: string): React.CSSProperties | undefined => {
    const tier = patronTierFor(id);
    return tier
      ? {
          color: PATRON_HEX[tier],
          textShadow: PATRON_COLORS[tier].textShadowMinimal,
        }
      : undefined;
  };

  const rowClass =
    "flex items-center gap-3.5 border-t border-rc-line/8 px-[18px] py-2.5 transition-colors hover:bg-rc-accent/6";

  return (
    <section id="players-invite-panel" className="rc-panel rounded-rc-lg">
      <div className="rc-panel-head">
        <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
          Players
        </h2>
        {pendingInvites > 0 && (
          <Badge tone="gold">
            {pendingInvites} invite{pendingInvites > 1 ? "s" : ""}
          </Badge>
        )}
        <div className="flex-1" />
        <div className="rc-segment" role="group" aria-label="Player list view">
          <button
            type="button"
            aria-pressed={view === "recent"}
            onClick={() => selectView("recent")}
            title="Recent opponents first"
          >
            Recent
          </button>
          <button
            type="button"
            aria-pressed={view === "az"}
            onClick={() => selectView("az")}
            title="Sort alphabetically"
          >
            A–Z
          </button>
          <button
            type="button"
            aria-pressed={view === "friends"}
            onClick={() => selectView("friends")}
            title="Only your friends"
          >
            Friends
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-3.5">
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
          className="rc-input h-[38px] min-w-[180px] flex-1"
          placeholder="Search players"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && requestPlayers) {
              requestPlayers({ q: query, sort, reset: true });
            }
          }}
        />
        <RcButton
          variant="outline"
          size="sm"
          onClick={() => {
            if (presenceHiddenUI === null) return;
            void setPresence(!presenceHiddenUI);
          }}
          disabled={presenceHiddenUI === null}
          title={
            presenceHiddenUI
              ? "Currently invisible – click to become visible"
              : "Currently visible – click to become invisible"
          }
        >
          {presenceHiddenUI ? "● Go Visible" : "◌ Go Invisible"}
        </RcButton>
      </div>

      {error && (
        <div className="rc-alert mx-[18px] mb-3" data-tone="danger">
          {error}
        </div>
      )}
      {status && (
        <div
          className="rc-alert mx-[18px] mb-3"
          data-tone={status.kind === "error" ? "danger" : "success"}
          role="status"
        >
          {status.text}
        </div>
      )}

      {showLegacy ? (
        filteredLegacy.length === 0 ? (
          <div className="border-t border-rc-line/8 px-[18px] py-6 text-center font-rc-mono text-xs tracking-[0.1em] text-rc-fg-dim">
            {loading ? "loading players…" : "no players online"}
          </div>
        ) : (
          <div className="thin-scrollbar max-h-[480px] overflow-y-auto">
            {filteredLegacy.map((p) => (
              <div key={p.id} className={rowClass}>
                <PlayerAvatar name={p.displayName} />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate font-rc-mono text-sm font-semibold text-rc-fg-strong"
                    style={nameStyle(p.id)}
                  >
                    {p.displayName}
                  </div>
                  <div className="mt-0.5 truncate font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-dim">
                    {p.id.slice(-8)} · online
                  </div>
                </div>
                <RcButton
                  variant="ghost"
                  size="sm"
                  disabled={!canInvite}
                  onClick={() => invite(p.id)}
                  title={inviteTitle}
                >
                  Invite
                </RcButton>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {visiblePlayers.length === 0 ? (
            <div className="border-t border-rc-line/8 px-[18px] py-6 text-center font-rc-mono text-xs tracking-[0.1em] text-rc-fg-dim">
              {view === "friends"
                ? "none of your friends are around"
                : "no players available"}
            </div>
          ) : (
            <div className="thin-scrollbar max-h-[480px] overflow-y-auto">
              {visiblePlayers.map((p) => {
                const isSelf = !!me && p.userId === me.id;
                const friend = isFriend(p);
                const isPending = pendingFriendUserId === p.userId;
                const soatc = soatcPlayers[p.userId];
                const leagues = leaguePlayers[p.userId] ?? [];
                return (
                  <div key={p.userId} className={rowClass}>
                    <PlayerAvatar name={p.displayName} avatarUrl={p.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="truncate font-rc-mono text-sm font-semibold text-rc-fg-strong"
                          style={nameStyle(p.userId)}
                        >
                          {p.displayName}
                        </span>
                        {soatc?.isParticipant && (
                          <Badge
                            tone="gold"
                            title={soatc.tournamentName || "SATC League participant"}
                          >
                            SATC
                          </Badge>
                        )}
                        {leagues.map((league) => (
                          <Badge key={league.slug} tone="ok" title={league.name}>
                            {getLeagueShortName(league.slug, league.name)}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-0.5 truncate font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-dim">
                        {p.shortUserId} · {presenceState(p)}
                      </div>
                    </div>
                    <div className="flex flex-none gap-2">
                      {!isSelf && friend ? (
                        <RcButton
                          variant="outline"
                          size="sm"
                          className="group hover:border-rc-danger hover:bg-rc-danger/12 hover:text-rc-fg-strong"
                          onClick={() => void removeFriend(p.userId)}
                          disabled={isPending}
                          title={isPending ? "Removing…" : "Remove friend"}
                          aria-label="Remove friend"
                        >
                          <span className="group-hover:hidden">Friend</span>
                          <span className="hidden group-hover:inline">Remove</span>
                        </RcButton>
                      ) : !isSelf ? (
                        <RcButton
                          variant="outline"
                          size="sm"
                          onClick={() => void addFriend(p.userId)}
                          disabled={isPending}
                          title="Add friend"
                        >
                          Add Friend
                        </RcButton>
                      ) : null}
                      {!isSelf && (
                        <RcButton
                          variant="ghost"
                          size="sm"
                          disabled={!canInvite}
                          onClick={() => invite(p.userId)}
                          title={inviteTitle}
                        >
                          Invite
                        </RcButton>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {(loading || nextCursor) && (
            <div className="flex items-center justify-between border-t border-rc-line/8 px-[18px] py-2 font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-dim">
              <span>{loading ? "loading…" : ""}</span>
              {nextCursor && view !== "friends" && (
                <RcButton
                  variant="ghost"
                  size="sm"
                  onClick={() => requestPlayers?.({ cursor: nextCursor })}
                  title="Load more players"
                >
                  Load more
                </RcButton>
              )}
            </div>
          )}
        </>
      )}

      <div className="border-t border-rc-line/12 px-[18px] py-3 font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-dim">
        {lobby
          ? isHost
            ? "invite players to your lobby (private lobbies require an invite)"
            : "only the host can send invites"
          : "join or create a lobby to send invites"}
      </div>
    </section>
  );
}
