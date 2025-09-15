'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRealtimeTournaments } from '@/contexts/RealtimeTournamentContext';

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
  settings: {
    totalRounds?: number;
    roundDuration?: number;
    allowSpectators?: boolean;
  };
}

// Removed local interfaces; we rely on realtime context shapes


// Statistics are obtained from realtime context; local interface not required here

export default function TournamentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const tournamentId = params?.id as string;
  const {
    tournaments,
    currentTournament,
    setCurrentTournamentById,
    joinTournament: rtJoinTournament,
    leaveTournament: rtLeaveTournament,
    startTournament: rtStartTournament,
    statistics: rtStatistics,
    loading: rtLoading,
    error: rtError
  } = useRealtimeTournaments();
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'standings' | 'rounds'>('overview');

  // Redirect unauthenticated users to signin
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/signin?callbackUrl=/tournaments/${tournamentId}`);
    }
  }, [status, tournamentId, router]);

  // Derive tournament from realtime context and ensure we set it as current
  const derivedTournament: Tournament | null = (currentTournament && currentTournament.id === tournamentId)
    ? (currentTournament as unknown as Tournament)
    : ((tournaments.find(t => t.id === tournamentId)) as unknown as Tournament | undefined) || null;

  useEffect(() => {
    if (derivedTournament && (!currentTournament || currentTournament.id !== derivedTournament.id)) {
      setCurrentTournamentById(derivedTournament.id);
    }
  }, [derivedTournament, currentTournament, setCurrentTournamentById]);

  // Alias realtime statistics for easier usage
  const statistics = rtStatistics;

  // Choose tournament reference for below sections
  const tournament = derivedTournament;

  // Helpers: safe currentPlayers count
  function getCurrentPlayersCount(t: Tournament | null): number {
    if (!t) return 0;
    const cp = (t as Partial<Tournament>).currentPlayers;
    if (typeof cp === 'number') return cp;
    const rp = (t as unknown as { registeredPlayers?: Array<unknown> }).registeredPlayers;
    return Array.isArray(rp) ? rp.length : 0;
  }

  // Check if current user is registered
  const isRegistered = Boolean(
    tournament && session?.user?.id &&
    statistics?.standings.some(s => s.playerId === session.user?.id)
  );
  
  // Check if current user is the creator
  const isCreator = tournament && session?.user?.id === tournament.creatorId;

  const handleJoinTournament = async () => {
    if (!session || !tournament) return;

    setJoining(true);
    setError(null);

    try {
      await rtJoinTournament(tournamentId);
    } catch (err) {
      console.error('Failed to join tournament:', err);
      setError(err instanceof Error ? err.message : 'Failed to join tournament');
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveTournament = async () => {
    if (!session || !tournament) return;

    setLeaving(true);
    setError(null);

    try {
      await rtLeaveTournament(tournamentId);
    } catch (err) {
      console.error('Failed to leave tournament:', err);
      setError(err instanceof Error ? err.message : 'Failed to leave tournament');
    } finally {
      setLeaving(false);
    }
  };

  const handleStartTournament = async () => {
    if (!session || !tournament || !isCreator) return;

    setStarting(true);
    setError(null);

    try {
      await rtStartTournament(tournamentId);
    } catch (err) {
      console.error('Failed to start tournament:', err);
      setError(err instanceof Error ? err.message : 'Failed to start tournament');
    } finally {
      setStarting(false);
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

  if (status === 'loading' || rtLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading tournament...</div>
      </div>
    );
  }

  if (!session) {
    return null; // Redirecting to signin
  }

  if (error || rtError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">{error || rtError}</div>
          <Link
            href="/tournaments"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Back to Tournaments
          </Link>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Tournament not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <Link
              href="/tournaments"
              className="text-slate-400 hover:text-white mb-2 inline-flex items-center"
            >
              ← Back to Tournaments
            </Link>
            <div className="flex items-center space-x-3 mb-2">
              <span className="text-3xl">{getFormatIcon(tournament.format)}</span>
              <div>
                <h1 className="text-3xl font-bold text-white">{tournament.name}</h1>
                <div className="flex items-center space-x-4 mt-1">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium border capitalize ${getStatusBadgeColor(tournament.status)}`}
                  >
                    {tournament.status}
                  </span>
                  <span className="text-slate-400 capitalize">
                    {tournament.format} Tournament
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex space-x-3">
            {tournament.status === 'registering' && !isRegistered && tournament.currentPlayers < tournament.maxPlayers && (
              <button
                onClick={handleJoinTournament}
                disabled={joining}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {joining ? 'Joining...' : 'Join Tournament'}
              </button>
            )}

            {tournament.status === 'registering' && isRegistered && (
              <button
                onClick={handleLeaveTournament}
                disabled={leaving}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {leaving ? 'Leaving...' : 'Leave Tournament'}
              </button>
            )}

            {tournament.status === 'registering' && isCreator && tournament.currentPlayers >= 2 && (
              <button
                onClick={handleStartTournament}
                disabled={starting}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {starting ? 'Starting...' : 'Start Tournament'}
              </button>
            )}
          </div>
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

        {/* Tournament Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm">Players</div>
            <div className="text-2xl font-bold text-white">
              {getCurrentPlayersCount(tournament)}/{tournament.maxPlayers}
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{
                  width: `${Math.min((getCurrentPlayersCount(tournament) / tournament.maxPlayers) * 100, 100)}%`
                }}
              />
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm">Rounds</div>
            <div className="text-2xl font-bold text-white">
              {(statistics?.rounds?.filter(r => r.status === 'completed').length ?? 0)}/{tournament.settings.totalRounds || 3}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm">Matches</div>
            <div className="text-2xl font-bold text-white">
              {statistics?.overview.completedMatches || 0}/{statistics?.overview.totalMatches || 0}
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="text-slate-400 text-sm">Created</div>
            <div className="text-lg font-semibold text-white">
              {new Date(tournament.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-700 mb-8">
          <nav className="flex space-x-8">
            {(['overview', 'standings', 'rounds'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-1 border-b-2 font-medium text-sm capitalize transition-colors ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-white hover:border-slate-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Tournament Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-400">Format:</span>
                  <span className="text-white ml-2 capitalize">{tournament.format}</span>
                </div>
                <div>
                  <span className="text-slate-400">Max Players:</span>
                  <span className="text-white ml-2">{tournament.maxPlayers}</span>
                </div>
                <div>
                  <span className="text-slate-400">Total Rounds:</span>
                  <span className="text-white ml-2">{tournament.settings.totalRounds || 3}</span>
                </div>
                <div>
                  <span className="text-slate-400">Round Duration:</span>
                  <span className="text-white ml-2">{tournament.settings.roundDuration || 60} minutes</span>
                </div>
                {tournament.startedAt && (
                  <div>
                    <span className="text-slate-400">Started:</span>
                    <span className="text-white ml-2">
                      {new Date(tournament.startedAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {tournament.completedAt && (
                  <div>
                    <span className="text-slate-400">Completed:</span>
                    <span className="text-white ml-2">
                      {new Date(tournament.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {tournament.status === 'registering' && (
              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-blue-300 mb-2">
                  Registration Open
                </h3>
                <p className="text-blue-200">
                  Tournament is accepting new players. {tournament.maxPlayers - tournament.currentPlayers} spots remaining.
                </p>
                {isCreator && (
                  <p className="text-blue-200 mt-2">
                    <strong>Creator:</strong> You can start the tournament once at least 2 players have joined.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'standings' && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Player Standings</h3>
            {statistics && statistics.standings && statistics.standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-600">
                      <th className="text-left py-2 text-slate-300">Rank</th>
                      <th className="text-left py-2 text-slate-300">Player</th>
                      <th className="text-center py-2 text-slate-300">Wins</th>
                      <th className="text-center py-2 text-slate-300">Losses</th>
                      <th className="text-center py-2 text-slate-300">Draws</th>
                      <th className="text-center py-2 text-slate-300">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statistics?.standings?.map((standing, index) => (
                      <tr key={standing.playerId} className="border-b border-slate-700">
                        <td className="py-2 font-semibold">#{index + 1}</td>
                        <td className="py-2">
                          <span className={
                            standing.playerId === session?.user?.id 
                              ? 'text-blue-400 font-semibold' 
                              : 'text-white'
                          }>
                            {standing.playerName}
                          </span>
                        </td>
                        <td className="py-2 text-center text-green-400">{standing.wins}</td>
                        <td className="py-2 text-center text-red-400">{standing.losses}</td>
                        <td className="py-2 text-center text-yellow-400">{standing.draws}</td>
                        <td className="py-2 text-center font-semibold">{standing.matchPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                No standings available yet.
              </div>
            )}
          </div>
        )}

        {activeTab === 'rounds' && (
          <div className="space-y-6">
            {statistics && statistics.rounds && statistics.rounds.length > 0 ? (
              statistics.rounds.map((round) => (
                <div key={round.id} className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      Round {round.roundNumber}
                    </h3>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium border capitalize ${
                      round.status === 'completed' 
                        ? 'bg-gray-100 text-gray-800 border-gray-200'
                        : round.status === 'active'
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                    }`}>
                      {round.status}
                    </span>
                  </div>
                  
                  <div className="text-sm text-slate-400">
                    {round.startedAt && (
                      <div>Started: {new Date(round.startedAt).toLocaleString()}</div>
                    )}
                    {round.completedAt && (
                      <div>Completed: {new Date(round.completedAt).toLocaleString()}</div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <div className="text-center py-8 text-slate-400">
                  No rounds started yet.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
