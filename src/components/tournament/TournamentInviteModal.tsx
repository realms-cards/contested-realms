"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { useSocket } from "@/lib/hooks/useSocket";

interface Player {
  id: string;
  name: string | null;
  image: string | null;
  email?: string | null;
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
  const socket = useSocket();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load all players
  useEffect(() => {
    if (!isOpen || !session?.user) return;

    setLoading(true);
    setError(null);

    fetch("/api/users")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load players");
        const data = await res.json();
        // Filter out current user and extract player list
        const playersList = (data.users || data || []).filter(
          (player: Player) => player.id !== session.user?.id
        );
        setPlayers(playersList);
      })
      .catch((err) => {
        console.error("Error loading players:", err);
        setError("Failed to load players list");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, session?.user]);

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
        `Successfully sent ${inviteCount} invitation${
          inviteCount !== 1 ? "s" : ""
        }`
      );

      // Notify invited players via socket for real-time toast
      if (socket && data.invitations?.length > 0) {
        for (const inv of data.invitations) {
          socket.emit("sendTournamentInvite", {
            targetPlayerId: inv.inviteeId,
            tournamentId,
            tournamentName,
          });
        }
      }

      setSelectedPlayers(new Set());

      if (onInvitesSent) {
        onInvitesSent();
      }

      // Close modal after short delay
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

  const filteredPlayers = players.filter(
    (player) =>
      player.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      player.email?.toLowerCase().includes(searchQuery.toLowerCase())
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
        <div className="mb-4">
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
            placeholder="Search players by name or email..."
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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

        {/* Players List */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-2">
          {loading ? (
            <div className="text-center text-slate-400 py-8">
              Loading players...
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="text-center text-slate-400 py-8">
              {searchQuery
                ? "No players found matching your search"
                : "No players available"}
            </div>
          ) : (
            filteredPlayers.map((player) => (
              <label
                key={player.id}
                className="flex items-center gap-3 p-3 bg-slate-700 rounded hover:bg-slate-650 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedPlayers.has(player.id)}
                  onChange={() => handleTogglePlayer(player.id)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex items-center gap-2 flex-1">
                  {player.image && (
                    <Image
                      src={player.image}
                      alt={player.name || "User"}
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-full"
                      unoptimized
                    />
                  )}
                  <div className="flex flex-col">
                    <span className="text-white">
                      {player.name || "Unknown User"}
                    </span>
                    {player.email && (
                      <span className="text-xs text-slate-400">
                        {player.email}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            ))
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
              ? "Sending..."
              : `Invite ${
                  selectedPlayers.size > 0 ? `(${selectedPlayers.size})` : ""
                }`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
