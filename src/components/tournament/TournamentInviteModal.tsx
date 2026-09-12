"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useOnline } from "@/app/online/online-context";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";

interface Player {
  id: string;
  name: string | null;
  image: string | null;
}

interface TournamentInviteModalProps {
  tournamentId: string;
  tournamentName: string;
  isOpen: boolean;
  onClose: () => void;
  onInvitesSent?: () => void;
}

export default function TournamentInviteModal({
  tournamentId,
  tournamentName,
  isOpen,
  onClose,
  onInvitesSent,
}: TournamentInviteModalProps) {
  const { data: session } = useSession();
  const { transport } = useOnline();
  const socket = transport?.getSocket() ?? null;
  const [friends, setFriends] = useState<Player[]>([]);
  const [searchResults, setSearchResults] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(
    new Set()
  );
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load friends when modal opens
  useEffect(() => {
    if (!isOpen || !session?.user) return;

    setLoadingFriends(true);
    setError(null);

    fetch("/api/friends")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load friends");
        const data = await res.json();
        const list = (data.friends || []).filter(
          (p: Player) => p.id !== session.user?.id
        );
        setFriends(list);
      })
      .catch((err) => {
        console.error("Error loading friends:", err);
      })
      .finally(() => setLoadingFriends(false));
  }, [isOpen, session?.user]);

  // Server-side search when query changes (debounced)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }

    setLoadingSearch(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users?q=${encodeURIComponent(q)}&limit=30`
        );
        if (!res.ok) throw new Error("Failed to search");
        const data = await res.json();
        const users = (data.users || []).filter(
          (p: Player) => p.id !== session?.user?.id
        );
        setSearchResults(users);
      } catch (err) {
        console.error("Search error:", err);
        setSearchResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 300);

    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, session?.user?.id]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen]);

  const handleTogglePlayer = (playerId: string) => {
    setSelectedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) {
        next.delete(playerId);
      } else {
        next.add(playerId);
      }
      return next;
    });
  };

  const handleSendInvites = async () => {
    if (selectedPlayers.size === 0) {
      setError("Please select at least one player to invite");
      return;
    }

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteeIds: Array.from(selectedPlayers),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send invitations");
      }

      const inviteCount = data.invitations?.length || 0;
      setSuccess(
        `Successfully sent ${inviteCount} invitation${inviteCount !== 1 ? "s" : ""}`
      );

      // Notify invited players via socket for real-time toast
      if (socket && data.invitations?.length > 0) {
        for (const inv of data.invitations) {
          socket.emit("sendTournamentInvite", {
            targetPlayerId: inv.inviteeId,
            tournamentId,
            tournamentName,
            invitationId: inv.id,
          });
        }
      }

      setSelectedPlayers(new Set());

      if (onInvitesSent) {
        onInvitesSent();
      }

      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 2000);
    } catch (err) {
      console.error("Error sending invitations:", err);
      setError(
        err instanceof Error ? err.message : "Failed to send invitations"
      );
    } finally {
      setSending(false);
    }
  };

  // Search results exclude already-shown friends
  const friendIds = new Set(friends.map((f) => f.id));
  const filteredSearchResults = searchResults.filter(
    (p) => !friendIds.has(p.id)
  );

  if (!isOpen) return null;

  return (
    <RcDialog
      title="Invite Players"
      eyebrow="tournament"
      onClose={onClose}
      size="sm"
    >
      <div className="flex max-h-[70vh] flex-col">
        <p className="m-0 text-sm text-rc-fg-muted">
          Invite players to {tournamentName}
        </p>

        {/* Search */}
        <div className="relative mt-4">
          <input
            type="search"
            name="q"
            autoComplete="off"
            role="searchbox"
            inputMode="search"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore="true"
            data-dashlane-ignore="true"
            data-np-ignore="true"
            data-keeper-lock="true"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all players by name…"
            className="rc-input h-10 w-full pr-8"
          />
          {loadingSearch && (
            <span className="absolute right-3 top-3 font-rc-mono text-xs text-rc-fg-dim">
              …
            </span>
          )}
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="rc-alert mt-4" data-tone="danger">
            {error}
          </div>
        )}
        {success && (
          <div className="rc-alert mt-4" data-tone="success">
            {success}
          </div>
        )}

        {/* Player List */}
        <div className="thin-scrollbar mt-4 flex-1 space-y-1 overflow-y-auto">
          {/* Friends section — always visible */}
          {!searchQuery && (
            <>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <span className="rc-eyebrow">Friends</span>
                {selectedPlayers.size > 0 && (
                  <span className="ml-auto font-rc-mono text-[11px] tracking-[0.1em] text-rc-accent-link">
                    {selectedPlayers.size} selected
                  </span>
                )}
              </div>
              {loadingFriends ? (
                <div className="rc-hint py-4 text-center">loading friends…</div>
              ) : friends.length === 0 ? (
                <div className="rc-hint py-4 text-center">
                  no friends yet — use search to find players
                </div>
              ) : (
                friends.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    selected={selectedPlayers.has(player.id)}
                    onToggle={handleTogglePlayer}
                    badge="friend"
                  />
                ))
              )}
            </>
          )}

          {/* Search results */}
          {searchQuery && (
            <>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <span className="rc-eyebrow">Search results</span>
                {selectedPlayers.size > 0 && (
                  <span className="ml-auto font-rc-mono text-[11px] tracking-[0.1em] text-rc-accent-link">
                    {selectedPlayers.size} selected
                  </span>
                )}
              </div>

              {/* Friends matching search first */}
              {friends
                .filter((f) =>
                  f.name?.toLowerCase().includes(searchQuery.toLowerCase()),
                )
                .map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    selected={selectedPlayers.has(player.id)}
                    onToggle={handleTogglePlayer}
                    badge="friend"
                  />
                ))}

              {loadingSearch ? (
                <div className="rc-hint py-4 text-center">searching…</div>
              ) : filteredSearchResults.length === 0 &&
                friends.filter((f) =>
                  f.name?.toLowerCase().includes(searchQuery.toLowerCase()),
                ).length === 0 ? (
                <div className="rc-hint py-4 text-center">
                  no players found for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                filteredSearchResults.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    selected={selectedPlayers.has(player.id)}
                    onToggle={handleTogglePlayer}
                  />
                ))
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex gap-2 border-t border-rc-line/12 pt-4">
          <RcButton
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </RcButton>
          <RcButton
            className="flex-1"
            onClick={handleSendInvites}
            disabled={sending || selectedPlayers.size === 0}
          >
            {sending
              ? "Sending…"
              : `Invite${selectedPlayers.size > 0 ? ` (${selectedPlayers.size})` : ""}`}
          </RcButton>
        </div>
      </div>
    </RcDialog>
  );
}

function PlayerRow({
  player,
  selected,
  onToggle,
  badge,
}: {
  player: Player;
  selected: boolean;
  onToggle: (id: string) => void;
  badge?: "friend";
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-rc-md border px-3 py-2 transition-colors ${
        selected
          ? "border-rc-accent/45 bg-rc-accent/10"
          : "border-rc-line/14 bg-black/30 hover:bg-rc-accent/6"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(player.id)}
        className="h-4 w-4 accent-rc-accent"
      />
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {player.image ? (
          <Image
            src={player.image}
            alt={player.name || "User"}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-rc-md border border-rc-line/18 object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-rc-md border border-rc-line/18 bg-black/30 font-rc-mono text-[13px] text-rc-fg-muted">
            {player.name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-rc-mono text-sm text-rc-fg-strong">
              {player.name || "Unknown User"}
            </span>
            {badge === "friend" && (
              <Badge tone="ok" className="shrink-0">
                friend
              </Badge>
            )}
          </div>
        </div>
      </div>
    </label>
  );
}
