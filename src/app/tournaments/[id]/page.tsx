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
    setCurrentTournament,
    setCurrentTournamentById,
    joinTournament: rtJoinTournament,
    leaveTournament: rtLeaveTournament,
    startTournament: rtStartTournament,
    endTournament: rtEndTournament,
    statistics: rtStatistics,
    loading: rtLoading,
    error: rtError,
    lastUpdated
  } = useRealtimeTournaments();
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'overview' | 'standings' | 'rounds'>('overview');

  // Redirect unauthenticated users to signin
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/signin?callbackUrl=/tournaments/${tournamentId}`);
    }
  }, [status, tournamentId, router]);

  // Lightweight toast listener (used by deck submission + phase changes)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string } | undefined;
      if (detail?.message) {
        setToast(detail.message);
        setTimeout(() => setToast(null), 3500);
      }
    };
    window.addEventListener('app:toast', handler as EventListener);
    // Pick up pending toast from localStorage on mount
    try {
      const pending = localStorage.getItem('app:toast');
      if (pending) {
        setToast(pending);
        localStorage.removeItem('app:toast');
        setTimeout(() => setToast(null), 3500);
      }
    } catch {}
    return () => window.removeEventListener('app:toast', handler as EventListener);
  }, []);

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
  const [viewerDeckCards, setViewerDeckCards] = useState<Array<{ cardId: number; name: string; slug: string; setName: string; quantity: number }>>([]);
  const [viewerDeckLoaded, setViewerDeckLoaded] = useState(false);
  const [checkedDirect, setCheckedDirect] = useState(false);
  const [showDeckDetails, setShowDeckDetails] = useState(false);

  // Fallback: if list hasn't provided the tournament yet, attempt fetching by id directly once
  useEffect(() => {
    (async () => {
      try {
        if (tournament || rtLoading || checkedDirect || !lastUpdated) return;
        const res = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}`);
        if (res.ok) {
          const detail = await res.json();
          setCurrentTournament(detail as unknown as typeof currentTournament);
        }
      } catch {
        // ignore
      } finally {
        setCheckedDirect(true);
      }
    })();
  }, [tournament, rtLoading, lastUpdated, checkedDirect, tournamentId, setCurrentTournament]);

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

  // Load viewer deck card metadata when available (from socket detail or by fetching detail endpoint)
  useEffect(() => {
    (async () => {
      try {
        if (viewerDeckLoaded) return;
        let deck: Array<{ cardId: string; quantity: number }> | null = null;
        const fromContext = (tournament as unknown as { viewerDeck?: Array<{ cardId: string; quantity: number }> }).viewerDeck || null;
        if (fromContext && fromContext.length) {
          deck = fromContext;
        } else if (tournament?.id) {
          const resDetail = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}`);
          if (resDetail.ok) {
            const detail = await resDetail.json();
            if (Array.isArray(detail?.viewerDeck)) deck = detail.viewerDeck as Array<{ cardId: string; quantity: number }>;
          }
        }
        if (!deck || deck.length === 0) { setViewerDeckCards([]); return; }
        const ids = Array.from(new Set(deck.map(it => Number(it.cardId)).filter(n => Number.isFinite(n) && n > 0)));
        if (!ids.length) { setViewerDeckCards([]); return; }
        const res = await fetch(`/api/cards/by-id?ids=${encodeURIComponent(ids.join(','))}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load deck cards');
        const byId = new Map<number, { name: string; slug: string; setName: string }>();
        for (const c of (data as Array<{ cardId: number; name: string; slug: string; setName: string }>)) {
          byId.set(c.cardId, { name: c.name, slug: c.slug, setName: c.setName });
        }
        const merged = deck.map(it => {
          const id = Number(it.cardId);
          const meta = byId.get(id);
          return { cardId: id, name: meta?.name || `Card ${id}`, slug: meta?.slug || '', setName: meta?.setName || '', quantity: Number(it.quantity) || 0 };
        }).sort((a, b) => a.name.localeCompare(b.name));
        setViewerDeckCards(merged);
        setViewerDeckLoaded(true);
      } catch {
        setViewerDeckCards([]);
      }
    })();
  }, [tournament?.id, viewerDeckLoaded]);

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

  const handleEndTournament = async () => {
    if (!session || !tournament || !isCreator) return;

    const ok = window.confirm('End this tournament now? This cannot be undone.');
    if (!ok) return;

    setError(null);
    try {
      await rtEndTournament(tournamentId);
      try {
        localStorage.setItem('app:toast', 'Tournament ended');
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: 'Tournament ended' } }));
      } catch {}
    } catch (err) {
      console.error('Failed to end tournament:', err);
      setError(err instanceof Error ? err.message : 'Failed to end tournament');
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

  // Avoid flashing "not found" before the realtime context hydrates and direct check completes
  if (!derivedTournament && (!lastUpdated || !checkedDirect || rtLoading)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading tournament...</div>
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
      {/* Toast overlay */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded bg-black/70 border border-white/20 text-sm shadow-lg">
          {toast}
        </div>
      )}
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

            {/* End/Forfeit controls moved to bottom of page */}
          </div>
        </div>

        {/* Prominent Submitted Deck (collapsed by default) */}
        {isRegistered && (() => {
          // Determine if the player has a submitted deck (server + optimistic flags)
          const meId = session?.user?.id;
          const rp = (tournament as unknown as { registeredPlayers?: Array<{ id: string; deckSubmitted?: boolean }> }).registeredPlayers || [];
          const mine = rp.find(p => p.id === meId);
          const serverSubmitted = Boolean((mine as { deckSubmitted?: boolean })?.deckSubmitted);
          let optimistic = false;
          try {
            optimistic =
              localStorage.getItem(`sealed_submitted_tournament_${tournament.id}`) === 'true' ||
              localStorage.getItem(`draft_submitted_tournament_${tournament.id}`) === 'true';
          } catch {}
          const hasDeck = viewerDeckCards.length > 0;
          const submittedDeck = serverSubmitted || optimistic || hasDeck;
          if (!submittedDeck) return null;

          const totalCards = viewerDeckCards.reduce((sum, c) => sum + (Number(c.quantity) || 0), 0);

          return (
            <div className="mb-6 rounded-lg border border-emerald-700 bg-emerald-900/20">
              <div className="p-4 flex items-center justify-between">
                <div className="text-emerald-200">
                  <div className="font-semibold">Your Submitted Deck</div>
                  <div className="text-sm opacity-80">
                    {viewerDeckCards.length > 0 ? `${totalCards} cards` : 'Deck submitted — syncing list…'}
                  </div>
                </div>
                <button
                  onClick={() => setShowDeckDetails(v => !v)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                >
                  {showDeckDetails ? 'Hide' : 'Show'}
                </button>
              </div>
              {showDeckDetails && (
                <div className="px-4 pb-4">
                  {viewerDeckCards.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {viewerDeckCards.map((c) => (
                        <div key={`${c.cardId}`} className="bg-black/20 rounded p-2 ring-1 ring-emerald-700/40">
                          <div className="text-xs text-slate-200 truncate" title={c.name}>{c.name}</div>
                          <div className="text-[11px] text-slate-400">x{c.quantity} • {c.setName}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-emerald-200/80">Loading deck list…</div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Phase Actions */}
        {tournament.status === 'preparing' && (
          <div className="mb-6 rounded-lg border border-blue-700 bg-blue-900/20 p-4 flex items-center justify-between">
            <div className="text-slate-200">
              {tournament.format === 'draft' && 'Draft phase in progress. Join the draft to begin selecting cards.'}
              {tournament.format === 'sealed' && 'Sealed preparation in progress. Open packs and build your deck.'}
              {tournament.format === 'constructed' && 'Constructed preparation. Select and validate your deck.'}
            </div>
            {isRegistered && (
              <div className="flex items-center gap-2">
                {tournament.format === 'draft' && (
                  <button
                    onClick={() => { try { window.location.href = `/tournaments/${tournament.id}/draft`; } catch {} }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm"
                  >
                    Enter Draft
                  </button>
                )}
                {tournament.format === 'sealed' && (() => {
                  const meId = session?.user?.id;
                  const rp = (tournament as unknown as { registeredPlayers?: Array<{ id: string; ready?: boolean; deckSubmitted?: boolean }> }).registeredPlayers || [];
                  const mine = rp.find(p => p.id === meId);
                  // Only treat a deck as submitted when the server marks deckSubmitted.
                  // Also allow an optimistic local flag to avoid flicker on redirect.
                  let optimisticSubmitted = false;
                  try { optimisticSubmitted = localStorage.getItem(`sealed_submitted_tournament_${tournament.id}`) === 'true'; } catch {}
                  const submitted = Boolean((mine as { deckSubmitted?: boolean })?.deckSubmitted) || optimisticSubmitted || (viewerDeckCards.length > 0);
                  if (submitted) {
                    return (
                      <div className="flex items-center gap-3">
                        <span className="bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-500/30 px-4 py-2 rounded-md text-sm" title="Deck submitted">
                          Sealed Deck submitted!
                        </span>
                      </div>
                    );
                  }
                  return (
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data?.error || 'Failed to start preparation');
                        const packs = data?.preparationData?.sealed?.generatedPacks as Array<{ packId: string; setId: string; cards: unknown[] }> | undefined;
                        if (Array.isArray(packs)) {
                          const storePacks = packs.map(p => ({ id: p.packId, set: p.setId, cards: Array.isArray(p.cards) ? p.cards : [], opened: false }));
                          try { localStorage.setItem(`sealedPacks_tournament_${tournament.id}`, JSON.stringify(storePacks)); } catch {}
                        }
                      } catch (e) {
                        console.warn('Failed to start preparation:', e);
                      }
                      try {
                        const cfg = (tournament as unknown as { settings?: { sealedConfig?: { packCounts?: Record<string, number>; timeLimit?: number; replaceAvatars?: boolean }}}).settings?.sealedConfig || {};
                        const packCount = Object.values(cfg.packCounts || { Beta: 6 }).reduce((a, b) => a + (b || 0), 0) || 6;
                        const setMix = Object.entries(cfg.packCounts || { Beta: 6 }).filter(([, c]) => (c || 0) > 0).map(([s]) => s);
                        const timeLimit = cfg.timeLimit ?? 40;
                        const replaceAvatars = cfg.replaceAvatars ?? false;
                        const params = new URLSearchParams({
                          sealed: 'true',
                          tournament: tournament.id,
                          packCount: String(packCount),
                          setMix: setMix.join(','),
                          timeLimit: String(timeLimit),
                          constructionStartTime: String(Date.now()),
                          replaceAvatars: String(replaceAvatars),
                          matchName: tournament.name,
                        });
                        window.location.href = `/decks/editor-3d?${params.toString()}`;
                      } catch {}
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm"
                  >
                    Build Deck
                  </button>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {tournament.status === 'active' && isRegistered && (() => {
          const myStanding = statistics?.standings.find(s => s.playerId === session?.user?.id);
          const myMatchId = myStanding?.currentMatchId;
          if (!myMatchId) return null;
          return (
            <div className="mb-6 rounded-lg border border-emerald-700 bg-emerald-900/20 p-4 flex items-center justify-between">
              <div className="text-slate-200">Your match is ready. Join when you are set.</div>
              <button
                onClick={() => { try { window.location.href = `/online/play/${encodeURIComponent(String(myMatchId))}`; } catch {} }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm"
              >
                Join Match
              </button>
            </div>
          );
        })()}

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
      {/* Bottom actions: Forfeit/End */}
      <div className="container mx-auto px-4 pb-10">
        <div className="mt-10 border-t border-slate-800 pt-6 flex items-center justify-between">
          <div className="text-xs text-slate-400">Tournament actions</div>
          <div className="flex gap-3">
            {isRegistered && tournament.status !== 'completed' && !isCreator && (
              <button
                onClick={async () => {
                  const ok = window.confirm('Forfeit this tournament now?');
                  if (!ok) return;
                  try {
                    const res = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/forfeit`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.error || 'Failed to forfeit');
                    try {
                      localStorage.setItem('app:toast', 'You forfeited the tournament');
                      window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: 'You forfeited the tournament' } }));
                    } catch {}
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to forfeit');
                  }
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-md text-sm"
                title="Forfeit this tournament"
              >
                Forfeit Tournament
              </button>
            )}

            {isCreator && tournament.status !== 'completed' && (
              <button
                onClick={handleEndTournament}
                className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-md text-sm"
                title="End this tournament now"
              >
                End Tournament
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
