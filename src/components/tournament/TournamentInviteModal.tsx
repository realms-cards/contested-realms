"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { useOnline } from "@/app/online/online-context";
import { Modal } from "@/components/ui/Modal";

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
    <Modal onClose={onClose}>
      <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Invite Players</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <p className="text-slate-400 text-sm mb-4">
          Invite players to {tournamentName}
        </p>

        {/* Search */}
        <div className="mb-4 relative">
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
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
          />
          {loadingSearch && (
            <span className="absolute right-3 top-2.5 text-slate-400 text-xs">
              …
            </span>
          )}
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-3 py-2 rounded text-sm mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-900/50 border border-green-700 text-green-300 px-3 py-2 rounded text-sm mb-4">
            {success}
          </div>
        )}

        {/* Player List */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-1">
          {/* Friends section — always visible */}
          {!searchQuery && (
            <>
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Friends
                </span>
                {selectedPlayers.size > 0 && (
                  <span className="ml-auto text-xs text-blue-400">
                    {selectedPlayers.size} selected
                  </span>
                )}
              </div>
              {loadingFriends ? (
                <div className="text-center text-slate-400 py-4 text-sm">
                  Loading friends…
                </div>
              ) : friends.length === 0 ? (
                <div className="text-center text-slate-500 py-4 text-sm">
                  No friends yet — use search to find players
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
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Search results
                </span>
                {selectedPlayers.size > 0 && (
                  <span className="ml-auto text-xs text-blue-400">
                    {selectedPlayers.size} selected
                  </span>
                )}
              </div>

              {/* Friends matching search first */}
              {friends
                .filter(
                  (f) =>
                    f.name?.toLowerCase().includes(searchQuery.toLowerCase())
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
                <div className="text-center text-slate-400 py-4 text-sm">
                  Searching…
                </div>
              ) : filteredSearchResults.length === 0 &&
                friends.filter(
                  (f) =>
                    f.name?.toLowerCase().includes(searchQuery.toLowerCase())
                ).length === 0 ? (
                <div className="text-center text-slate-400 py-4 text-sm">
                  No players found for &ldquo;{searchQuery}&rdquo;
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
        <div className="flex space-x-3 pt-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded font-medium transition-colors"
            disabled={sending}
          >
            Cancel
          </button>
          <button
            onClick={handleSendInvites}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={sending || selectedPlayers.size === 0}
          >
            {sending
              ? "Sending…"
              : `Invite${selectedPlayers.size > 0 ? ` (${selectedPlayers.size})` : ""}`}
          </button>
        </div>
      </div>
    </Modal>
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
      className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors ${
        selected
          ? "bg-blue-900/40 border border-blue-600/50"
          : "bg-slate-700 hover:bg-slate-650 border border-transparent"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(player.id)}
        className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {player.image ? (
          <Image
            src={player.image}
            alt={player.name || "User"}
            width={32}
            height={32}
            className="w-8 h-8 rounded-full shrink-0"
            unoptimized
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-slate-600 shrink-0 flex items-center justify-center text-slate-300 text-sm font-medium">
            {player.name?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-white text-sm truncate">
              {player.name || "Unknown User"}
            </span>
            {badge === "friend" && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded">
                friend
              </span>
            )}
          </div>
        </div>
      </div>
    </label>
  );
}
