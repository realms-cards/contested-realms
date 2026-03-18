"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { OpenTournamentCreateForm } from "@/components/open-tournament/OpenTournamentCreateForm";

interface OpenTournament {
  id: string;
  name: string;
  format: "open";
  status: string;
  maxPlayers: number;
  creatorId: string;
  createdAt: string;
  isPrivate?: boolean;
  settings?: Record<string, unknown>;
  registrations?: Array<{
    playerId: string;
    seatStatus: string;
    player: { id: string; name: string | null };
  }>;
  standings?: Array<{
    playerId: string;
    displayName: string;
    matchPoints: number;
  }>;
  rounds?: Array<{ id: string; roundNumber: number; status: string }>;
}

export default function OpenTournamentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<OpenTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "completed" | "all">("active");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin?callbackUrl=/open-tournaments");
    }
  }, [status, router]);

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      params.set("limit", "50");
      const res = await fetch(`/api/open-tournaments?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fetch");
      setTournaments(data.tournaments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchTournaments();
    }
  }, [status, fetchTournaments]);

  const handleCreated = (tournamentId: string) => {
    setShowCreate(false);
    router.push(`/open-tournaments/${tournamentId}`);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/tournaments"
                className="text-slate-400 hover:text-white text-sm"
              >
                Tournaments
              </Link>
              <span className="text-slate-600">/</span>
              <h1 className="text-3xl font-fantaisie text-white">Open Events</h1>
            </div>
            <p className="text-slate-400 mt-1">
              Flexible tournament organizer — play on Realms, TTS, or paper
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Create Open Event
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-6">
          {(["active", "completed", "all"] as const).map((f) => (
            <button
              key={f}
              className={`px-3 py-1.5 rounded-md text-sm border capitalize ${
                statusFilter === f
                  ? "bg-blue-600 text-white border-blue-500"
                  : "bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700"
              }`}
              onClick={() => setStatusFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">
            Loading tournaments...
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-semibold text-slate-300 mb-2">
              No open events found
            </h2>
            <p className="text-slate-500 mb-4">
              Create an open event to get started.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Create Open Event
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((t) => {
              const activePlayerCount =
                t.registrations?.filter((r) => r.seatStatus === "active").length ?? 0;
              const currentRound = t.rounds?.[0];
              const playNetworkUrl = t.settings?.playNetworkUrl as string | undefined;

              return (
                <div
                  key={t.id}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:bg-slate-750 transition-colors"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">📋</span>
                        <h3 className="font-fantaisie text-lg text-white truncate">
                          {t.name}
                        </h3>
                      </div>
                      <p className="text-slate-400 text-sm mt-1">Open Event</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium border capitalize ${
                        t.status === "active"
                          ? "bg-green-900/50 text-green-300 border-green-700"
                          : t.status === "completed"
                            ? "bg-slate-700 text-slate-300 border-slate-600"
                            : "bg-red-900/50 text-red-300 border-red-700"
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Players:</span>
                      <span className="text-white">{activePlayerCount}</span>
                    </div>
                    {currentRound && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Round:</span>
                        <span className="text-white">
                          {currentRound.roundNumber}
                        </span>
                      </div>
                    )}
                    {playNetworkUrl && (
                      <div className="flex items-center gap-1 text-xs text-blue-400">
                        <span>Play Network linked</span>
                      </div>
                    )}
                    {t.isPrivate && (
                      <span className="text-xs px-1.5 py-0.5 bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded inline-block">
                        Private
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/open-tournaments/${t.id}`}
                    className="block w-full bg-slate-700 hover:bg-slate-600 text-white text-center px-4 py-2 rounded text-sm font-medium transition-colors"
                  >
                    View Dashboard
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Create Open Event
                </h2>
                <button
                  onClick={() => setShowCreate(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <OpenTournamentCreateForm onCreated={handleCreated} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
