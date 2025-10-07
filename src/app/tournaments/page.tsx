"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRealtimeTournaments } from "@/contexts/RealtimeTournamentContext";

// Random name generation (same as lobby)
const PREDICATES = ["Eternal", "Ancient", "Forgotten", "Sacred", "Cursed", "Divine"];
const ADJECTIVES = ["Mystic", "Shadow", "Crystal", "Storm", "Fire", "Ice"];
const SUBJECTS = ["Dragons", "Wizards", "Knights", "Realms", "Legends", "Heroes"];

function generateTournamentName(): string {
  const predicate = PREDICATES[Math.floor(Math.random() * PREDICATES.length)];
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
  return `${predicate} of ${adjective} ${subject}`;
}

interface Tournament {
  id: string;
  name: string;
  format: "sealed" | "draft" | "constructed";
  status: "registering" | "preparing" | "active" | "completed" | "cancelled";
  maxPlayers: number;
  currentPlayers: number;
  creatorId: string;
  startedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface CreateTournamentForm {
  name: string;
  format: "sealed" | "draft" | "constructed";
  maxPlayers: number;
  settings: {
    totalRounds?: number;
    roundDuration?: number;
    allowSpectators?: boolean;
  };
}

export default function TournamentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const {
    tournaments,
    createTournament: rtCreateTournament,
    joinTournament: rtJoinTournament,
    loading: rtLoading,
    error: rtError,
  } = useRealtimeTournaments();
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate tournament name when form opens
  const handleShowCreateForm = () => {
    setForm(prev => ({ ...prev, name: generateTournamentName() }));
    setShowCreateForm(true);
  };

  // View filter: default 'active' uses realtime context; other filters fetch via API
  const [viewFilter, setViewFilter] = useState<
    "active" | "completed" | "all" | "mine"
  >("active");
  const [localTournaments, setLocalTournaments] = useState<Tournament[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [form, setForm] = useState<CreateTournamentForm>({
    name: "",
    format: "constructed",
    maxPlayers: 8,
    settings: {
      totalRounds: 3,
      roundDuration: 60,
      allowSpectators: true,
    },
  });

  // Pack configuration (pack size is fixed at 15; do not expose)
  // Tournament pairing format is always Swiss
  // New format: array of set names, one per booster
  const [sealedBoosterCount, setSealedBoosterCount] = useState<number>(6);
  const [sealedBoosters, setSealedBoosters] = useState<string[]>([
    "Beta",
    "Beta",
    "Beta",
    "Beta",
    "Beta",
    "Beta"
  ]);
  const [draftBoosterCount, setDraftBoosterCount] = useState<number>(3);
  const [draftBoosters, setDraftBoosters] = useState<string[]>([
    "Beta",
    "Arthurian Legends",
    "Arthurian Legends"
  ]);

  // Type guard helpers
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
  function getCurrentPlayersCount(t: unknown): number {
    if (!isRecord(t)) return 0;
    const cp = t.currentPlayers;
    if (typeof cp === "number") return cp;
    const rp = (t as Record<string, unknown>).registeredPlayers;
    if (Array.isArray(rp)) return rp.length;
    return 0;
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin?callbackUrl=/tournaments");
    }
  }, [status, router]);

  // Polling removed; realtime provider handles live updates

  // Load completed/all/mine tournaments when requested
  useEffect(() => {
    (async () => {
      if (viewFilter === "active") return;
      setLoadingLocal(true);
      setLocalError(null);
      try {
        const params = new URLSearchParams();
        if (viewFilter === "completed") {
          params.set("status", "completed");
          params.set("limit", String(pageSize));
          params.set("offset", String((page - 1) * pageSize));
          if (search.trim()) params.set("q", search.trim());
          const res = await fetch(`/api/tournaments?${params.toString()}`);
          const data = await res.json();
          if (!res.ok)
            throw new Error(data?.error || "Failed to fetch tournaments");
          setLocalTournaments(data as Tournament[]);
        } else if (viewFilter === "all") {
          params.set("status", "all");
          params.set("limit", String(pageSize));
          params.set("offset", String((page - 1) * pageSize));
          if (search.trim()) params.set("q", search.trim());
          const res = await fetch(`/api/tournaments?${params.toString()}`);
          const data = await res.json();
          if (!res.ok)
            throw new Error(data?.error || "Failed to fetch tournaments");
          setLocalTournaments(data as Tournament[]);
        } else if (viewFilter === "mine") {
          params.set("page", String(page));
          params.set("pageSize", String(pageSize));
          if (search.trim()) params.set("q", search.trim());
          // role=any returns both creator and participant
          const res = await fetch(`/api/tournaments/my?${params.toString()}`);
          const data = await res.json();
          if (!res.ok)
            throw new Error(data?.error || "Failed to fetch my tournaments");
          setLocalTournaments((data?.items || []) as Tournament[]);
        }
      } catch (e) {
        setLocalError(
          e instanceof Error ? e.message : "Failed to fetch tournaments"
        );
        setLocalTournaments([]);
      } finally {
        setLoadingLocal(false);
      }
    })();
  }, [viewFilter, page, search]);

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setCreating(true);
    setError(null);

    try {
      // Build settings with format-specific configuration
      // Pairing format is always Swiss
      const settingsOut: Record<string, unknown> = {
        ...(form.settings as Record<string, unknown>),
        pairingFormat: "swiss",
      };
      if (form.format === "sealed") {
        // Convert booster array to packCounts format for backend
        const packCounts: Record<string, number> = {};
        sealedBoosters.forEach(setName => {
          packCounts[setName] = (packCounts[setName] || 0) + 1;
        });
        settingsOut.sealedConfig = { packCounts };
      } else if (form.format === "draft") {
        // Convert booster array to packCounts format for backend
        const packCounts: Record<string, number> = {};
        draftBoosters.forEach(setName => {
          packCounts[setName] = (packCounts[setName] || 0) + 1;
        });
        settingsOut.draftConfig = {
          packCount: draftBoosterCount,
          packCounts,
        };
      }

      const newTournament = await rtCreateTournament({
        name: form.name,
        format: form.format,
        maxPlayers: form.maxPlayers,
        settings: settingsOut,
      });

      // Add to local state immediately for better UX
      // Realtime context updates list; no manual setState needed

      // Reset form and close modal
      setForm({
        name: "",
        format: "constructed",
        maxPlayers: 8,
        settings: {
          totalRounds: 3,
          roundDuration: 60,
          allowSpectators: true,
        },
      });
      setSealedBoosterCount(6);
      setSealedBoosters(["Beta", "Beta", "Beta", "Beta", "Beta", "Beta"]);
      setDraftBoosterCount(3);
      setDraftBoosters(["Beta", "Arthurian Legends", "Arthurian Legends"]);
      setShowCreateForm(false);

      // Navigate to the new tournament
      router.push(`/tournaments/${newTournament.id}`);
    } catch (err) {
      console.error("Failed to create tournament:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create tournament"
      );
    } finally {
      setCreating(false);
    }
  };

  const handleJoinTournament = async (tournamentId: string) => {
    if (!session) return;

    try {
      await rtJoinTournament(tournamentId);

      // Navigate to tournament page
      router.push(`/tournaments/${tournamentId}`);
    } catch (err) {
      console.error("Failed to join tournament:", err);
      setError(
        err instanceof Error ? err.message : "Failed to join tournament"
      );
    }
  };

  const getStatusBadgeColor = (status: Tournament["status"]) => {
    switch (status) {
      case "registering":
        return "bg-green-100 text-green-800 border-green-200";
      case "preparing":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "active":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "completed":
        return "bg-gray-100 text-gray-800 border-gray-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getFormatIcon = (format: Tournament["format"]) => {
    switch (format) {
      case "sealed":
        return "📦";
      case "draft":
        return "🎯";
      case "constructed":
        return "⚔️";
      default:
        return "🏆";
    }
  };

  if (status === "loading" || rtLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading tournaments...</div>
      </div>
    );
  }

  if (!session) {
    return null; // Redirecting to signin
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link
              href="/online/lobby"
              className="text-slate-400 hover:text-white mb-2 inline-flex items-center text-sm"
            >
              ← Back to Lobby
            </Link>
            <h1 className="text-3xl font-fantaisie text-white mb-2">
              Tournaments
            </h1>
            <p className="text-slate-400">
              Join or create competitive tournaments
            </p>
          </div>
          <button
            onClick={handleShowCreateForm}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Create Tournament
          </button>
        </div>

        {/* View Filter */}
        <div className="flex items-center gap-2 mb-6">
          <button
            className={`px-3 py-1.5 rounded-md text-sm border ${
              viewFilter === "active"
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700"
            }`}
            onClick={() => setViewFilter("active")}
          >
            Active
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-sm border ${
              viewFilter === "completed"
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700"
            }`}
            onClick={() => setViewFilter("completed")}
          >
            Completed
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-sm border ${
              viewFilter === "all"
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700"
            }`}
            onClick={() => setViewFilter("all")}
          >
            All
          </button>
          <button
            className={`px-3 py-1.5 rounded-md text-sm border ${
              viewFilter === "mine"
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700"
            }`}
            onClick={() => {
              setViewFilter("mine");
              setPage(1);
            }}
          >
            My Tournaments
          </button>
          {viewFilter !== "active" && (
            <span className="text-xs text-slate-400 ml-2">
              Showing {viewFilter} tournaments
            </span>
          )}
          {viewFilter !== "active" && (
            <div className="ml-auto flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search…"
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Error Display */}
        {(error || rtError || localError) && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
            <div className="flex items-center">
              <svg
                className="w-5 h-5 mr-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {error || rtError || localError}
            </div>
          </div>
        )}

        {/* Pagination for non-active views */}
        {viewFilter !== "active" && (
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              className="px-3 py-1.5 rounded-md text-sm bg-slate-800 text-slate-200 border border-slate-600 disabled:opacity-50"
              disabled={page <= 1 || loadingLocal}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="text-slate-400 text-sm">Page {page}</span>
            <button
              className="px-3 py-1.5 rounded-md text-sm bg-slate-800 text-slate-200 border border-slate-600 disabled:opacity-50"
              disabled={loadingLocal || localTournaments.length < pageSize}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}

        {/* Tournaments Grid */}
        {(
          viewFilter === "active"
            ? tournaments.length === 0
            : loadingLocal
            ? false
            : localTournaments.length === 0
        ) ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-2xl font-semibold text-slate-300 mb-2">
              No tournaments found
            </h2>
            {viewFilter === "active" ? (
              <>
                <br />
                <button
                  onClick={handleShowCreateForm}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Create Tournament
                </button>
              </>
            ) : (
              <p className="text-slate-500">
                Try switching filters or check back later.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(viewFilter === "active" ? tournaments : localTournaments).map(
              (tournament) => (
                <div
                  key={tournament.id}
                  className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:bg-slate-750 transition-colors"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">
                        {getFormatIcon(tournament.format)}
                      </span>
                      <div>
                        <h3 className="font-fantaisie text-lg text-white truncate">
                          {tournament.name}
                        </h3>
                        <p className="text-slate-400 text-sm capitalize">
                          {tournament.format}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium border capitalize ${getStatusBadgeColor(
                        tournament.status
                      )}`}
                    >
                      {tournament.status}
                    </span>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">Players:</span>
                      <span className="text-white">
                        {getCurrentPlayersCount(tournament)}/
                        {tournament.maxPlayers}
                      </span>
                    </div>

                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            (getCurrentPlayersCount(tournament) /
                              tournament.maxPlayers) *
                              100,
                            100
                          )}%`,
                        }}
                      />
                    </div>

                    {tournament.startedAt && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Started:</span>
                        <span className="text-white">
                          {new Date(tournament.startedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    <Link
                      href={`/tournaments/${tournament.id}`}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-center px-4 py-2 rounded text-sm font-medium transition-colors"
                    >
                      View Details
                    </Link>

                    {tournament.status === "registering" &&
                      tournament.currentPlayers < tournament.maxPlayers && (
                        <button
                          onClick={() => handleJoinTournament(tournament.id)}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                        >
                          Join
                        </button>
                      )}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Create Tournament Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">
                  Create Tournament
                </h2>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleCreateTournament} className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Tournament Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter tournament name"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, name: generateTournamentName() }))}
                      className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-xs transition-colors"
                      title="Generate random name"
                    >
                      🎲
                    </button>
                  </div>
                </div>

                {/* Pairing Format */}
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Format
                  </label>
                  <select
                    value={form.format}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        format: e.target.value as
                          | "sealed"
                          | "draft"
                          | "constructed",
                      }))
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="constructed">Constructed</option>
                    <option value="sealed">Sealed</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>

                {/* Sealed Booster Configuration */}
                {form.format === "sealed" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="block text-slate-300 text-sm font-medium">
                        Booster Count
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const newCount = Math.max(1, sealedBoosterCount - 1);
                            setSealedBoosterCount(newCount);
                            setSealedBoosters(prev => prev.slice(0, newCount));
                          }}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white font-bold"
                        >
                          -
                        </button>
                        <span className="w-12 text-center text-white font-semibold">
                          {sealedBoosterCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const newCount = Math.min(10, sealedBoosterCount + 1);
                            setSealedBoosterCount(newCount);
                            setSealedBoosters(prev => [
                              ...prev,
                              ...Array(newCount - prev.length).fill("Beta")
                            ]);
                          }}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {sealedBoosters.map((setName, idx) => (
                        <div
                          key={`sealed-booster-${idx}`}
                          className="flex items-center gap-2"
                        >
                          <div className="text-slate-300 text-sm w-24">
                            Booster {idx + 1}
                          </div>
                          <select
                            value={setName}
                            onChange={(e) => {
                              setSealedBoosters(prev => {
                                const next = [...prev];
                                next[idx] = e.target.value;
                                return next;
                              });
                            }}
                            className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                          >
                            <option value="Beta">Beta</option>
                            <option value="Arthurian Legends">Arthurian Legends</option>
                            <option value="Alpha">Alpha</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Draft Booster Configuration */}
                {form.format === "draft" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="block text-slate-300 text-sm font-medium">
                        Booster Count
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const newCount = Math.max(1, draftBoosterCount - 1);
                            setDraftBoosterCount(newCount);
                            setDraftBoosters(prev => prev.slice(0, newCount));
                          }}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white font-bold"
                        >
                          -
                        </button>
                        <span className="w-12 text-center text-white font-semibold">
                          {draftBoosterCount}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const newCount = Math.min(5, draftBoosterCount + 1);
                            setDraftBoosterCount(newCount);
                            setDraftBoosters(prev => [
                              ...prev,
                              ...Array(newCount - prev.length).fill("Arthurian Legends")
                            ]);
                          }}
                          className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-white font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {draftBoosters.map((setName, idx) => (
                        <div
                          key={`draft-booster-${idx}`}
                          className="flex items-center gap-2"
                        >
                          <div className="text-slate-300 text-sm w-24">
                            Booster {idx + 1}
                          </div>
                          <select
                            value={setName}
                            onChange={(e) => {
                              setDraftBoosters(prev => {
                                const next = [...prev];
                                next[idx] = e.target.value;
                                return next;
                              });
                            }}
                            className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white"
                          >
                            <option value="Beta">Beta</option>
                            <option value="Arthurian Legends">Arthurian Legends</option>
                            <option value="Alpha">Alpha</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Max Players
                  </label>
                  <select
                    value={form.maxPlayers}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        maxPlayers: parseInt(e.target.value),
                      }))
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={2}>2 Players</option>
                    <option value={4}>4 Players</option>
                    <option value={8}>8 Players</option>
                    <option value={16}>16 Players</option>
                    <option value={32}>32 Players</option>
                    <option value={64}>64 Players</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Rounds
                  </label>
                  <select
                    value={form.settings.totalRounds || 3}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          totalRounds: parseInt(e.target.value),
                        },
                      }))
                    }
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={2}>2 Rounds</option>
                    <option value={3}>3 Rounds</option>
                    <option value={4}>4 Rounds</option>
                    <option value={5}>5 Rounds</option>
                  </select>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded font-medium transition-colors"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={creating}
                  >
                    {creating ? "Creating..." : "Create Tournament"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
