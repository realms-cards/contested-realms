'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';

interface Tournament {
  id: string;
  name: string;
  format: 'sealed' | 'draft' | 'constructed';
  status: 'registering' | 'preparing' | 'active' | 'completed' | 'cancelled';
  maxPlayers: number;
  currentPlayers: number;
  creatorId: string;
  startedAt: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface CreateTournamentForm {
  name: string;
  format: 'sealed' | 'draft' | 'constructed';
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
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateTournamentForm>({
    name: '',
    format: 'constructed',
    maxPlayers: 8,
    settings: {
      totalRounds: 3,
      roundDuration: 60,
      allowSpectators: true
    }
  });

  // Fetch tournaments list
  const fetchTournaments = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/tournaments');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTournaments(data.tournaments || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch tournaments:', err);
      setError('Failed to load tournaments');
      setTournaments([]);
    }
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchTournaments().finally(() => setLoading(false));
    } else if (status === 'unauthenticated') {
      router.push('/auth/signin?callbackUrl=/tournaments');
    }
  }, [status, fetchTournaments, router]);

  // Auto-refresh tournaments every 5 seconds
  useEffect(() => {
    if (status === 'authenticated') {
      const interval = setInterval(fetchTournaments, 5000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [status, fetchTournaments]);

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setCreating(true);
    setError(null);

    try {
      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create tournament');
      }

      const newTournament = await response.json();
      
      // Add to local state immediately for better UX
      setTournaments(prev => [newTournament, ...prev]);
      
      // Reset form and close modal
      setForm({
        name: '',
        format: 'constructed',
        maxPlayers: 8,
        settings: {
          totalRounds: 3,
          roundDuration: 60,
          allowSpectators: true
        }
      });
      setShowCreateForm(false);
      
      // Navigate to the new tournament
      router.push(`/tournaments/${newTournament.id}`);
    } catch (err) {
      console.error('Failed to create tournament:', err);
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinTournament = async (tournamentId: string) => {
    if (!session) return;

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: session.user?.name || 'Anonymous Player'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join tournament');
      }

      // Navigate to tournament page
      router.push(`/tournaments/${tournamentId}`);
    } catch (err) {
      console.error('Failed to join tournament:', err);
      setError(err instanceof Error ? err.message : 'Failed to join tournament');
    }
  };

  const getStatusBadgeColor = (status: Tournament['status']) => {
    switch (status) {
      case 'registering':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'preparing':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'active':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getFormatIcon = (format: Tournament['format']) => {
    switch (format) {
      case 'sealed':
        return '📦';
      case 'draft':
        return '🎯';
      case 'constructed':
        return '⚔️';
      default:
        return '🏆';
    }
  };

  if (status === 'loading' || loading) {
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
            <h1 className="text-3xl font-bold text-white mb-2">Tournaments</h1>
            <p className="text-slate-400">Join or create competitive tournaments</p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Create Tournament
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          </div>
        )}

        {/* Tournaments Grid */}
        {tournaments.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-2xl font-semibold text-slate-300 mb-2">No tournaments available</h2>
            <p className="text-slate-500 mb-6">Be the first to create a tournament!</p>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Create First Tournament
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((tournament) => (
              <div
                key={tournament.id}
                className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:bg-slate-750 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{getFormatIcon(tournament.format)}</span>
                    <div>
                      <h3 className="font-semibold text-lg text-white truncate">
                        {tournament.name}
                      </h3>
                      <p className="text-slate-400 text-sm capitalize">
                        {tournament.format}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium border capitalize ${getStatusBadgeColor(tournament.status)}`}
                  >
                    {tournament.status}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Players:</span>
                    <span className="text-white">
                      {tournament.currentPlayers}/{tournament.maxPlayers}
                    </span>
                  </div>
                  
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min((tournament.currentPlayers / tournament.maxPlayers) * 100, 100)}%`
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
                  
                  {tournament.status === 'registering' && tournament.currentPlayers < tournament.maxPlayers && (
                    <button
                      onClick={() => handleJoinTournament(tournament.id)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                    >
                      Join
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Tournament Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Create Tournament</h2>
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
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter tournament name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Format
                  </label>
                  <select
                    value={form.format}
                    onChange={(e) => setForm(prev => ({ ...prev, format: e.target.value as 'sealed' | 'draft' | 'constructed' }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="constructed">Constructed</option>
                    <option value="sealed">Sealed</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Max Players
                  </label>
                  <select
                    value={form.maxPlayers}
                    onChange={(e) => setForm(prev => ({ ...prev, maxPlayers: parseInt(e.target.value) }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={4}>4 Players</option>
                    <option value={8}>8 Players</option>
                    <option value={16}>16 Players</option>
                    <option value={32}>32 Players</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Rounds
                  </label>
                  <select
                    value={form.settings.totalRounds || 3}
                    onChange={(e) => setForm(prev => ({ 
                      ...prev, 
                      settings: { ...prev.settings, totalRounds: parseInt(e.target.value) }
                    }))}
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
                    {creating ? 'Creating...' : 'Create Tournament'}
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