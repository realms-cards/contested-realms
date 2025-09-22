'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useState, useEffect, useRef, useMemo } from 'react';
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
  // Round/match flow helpers
  const [startingRound, setStartingRound] = useState(false);
  const [joinPrompt, setJoinPrompt] = useState<{ open: boolean; matchId: string | null }>({ open: false, matchId: null });
  const prevMyMatchIdRef = useRef<string | null>(null);

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
  // Derived helpers: my standing and match id
  const myStanding = useMemo(() => statistics?.standings?.find(s => s.playerId === session?.user?.id), [statistics?.standings, session?.user?.id]);
  const myMatchId = useMemo(() => (myStanding?.currentMatchId ? String(myStanding.currentMatchId) : null), [myStanding?.currentMatchId]);
  // Round helpers
  const rounds = useMemo(() => statistics?.rounds || [], [statistics?.rounds]);
  const activeRound = rounds.find(r => r.status === 'active') || null;
  const maxRoundNumber = rounds.length ? Math.max(...rounds.map(r => (typeof r.roundNumber === 'number' ? r.roundNumber : 0))) : 0;
  const lastCompletedRoundNumber = useMemo(() => {
    const list = (rounds || [])
      .map((r) => r as unknown as { roundNumber?: number; status?: string })
      .filter((r) => r.status === 'completed' && typeof r.roundNumber === 'number')
      .map((r) => r.roundNumber as number);
    return list.length ? Math.max(...list) : 0;
  }, [rounds]);
  const [viewerDeckCards, setViewerDeckCards] = useState<Array<{ cardId: number; name: string; slug: string; setName: string; quantity: number }>>([]);
  const [viewerDeckLoaded, setViewerDeckLoaded] = useState(false);
  const [checkedDirect, setCheckedDirect] = useState(false);
  const [showDeckDetails, setShowDeckDetails] = useState(false);
  // Constructed preparation state
  const [constructedLoading, setConstructedLoading] = useState(false);
  const [constructedError, setConstructedError] = useState<string | null>(null);
  const [constructedDecks, setConstructedDecks] = useState<Array<{ id: string; name: string; format?: string }>>([]);
  const [constructedPublicDecks, setConstructedPublicDecks] = useState<Array<{ id: string; name: string; format?: string }>>([]);
  const [constructedSelectedDeckId, setConstructedSelectedDeckId] = useState<string | null>(null);
  const [constructedAllowedFormats, setConstructedAllowedFormats] = useState<string[]>([]);
  const constructedPanelRef = useRef<HTMLDivElement | null>(null);
  const [constructedModalOpen, setConstructedModalOpen] = useState(false);
  const [includePublicDecks, setIncludePublicDecks] = useState(false);

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

  // Check if current user is registered (prefer explicit registrations over standings)
  const isRegistered = useMemo(() => {
    const userId = session?.user?.id;
    if (!tournament || !userId) return false;
    const rp = (tournament as unknown as { registeredPlayers?: Array<{ id: string }> }).registeredPlayers || [];
    if (Array.isArray(rp) && rp.some(p => p.id === userId)) return true;
    // Fallback for active phase when registrations may not be present
    return Boolean(statistics?.standings?.some(s => s.playerId === userId));
  }, [tournament, statistics?.standings, session?.user?.id]);
  
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
  }, [tournament, tournament?.id, viewerDeckLoaded]);

  // Ping players when a new match assignment appears for them
  useEffect(() => {
    if (!tournament) return;
    if (tournament.status !== 'active') return;
    const curr = myMatchId ?? null;
    const prev = prevMyMatchIdRef.current;
    if (curr && curr !== prev) {
      setJoinPrompt({ open: true, matchId: curr });
      try {
        localStorage.setItem('app:toast', 'Your tournament match is ready');
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: 'Your tournament match is ready' } }));
      } catch {}
    }
    prevMyMatchIdRef.current = curr;
  }, [tournament, tournament?.status, myMatchId]);

  // Load constructed deck choices when in preparing + constructed
  useEffect(() => {
    (async () => {
      try {
        setConstructedError(null);
        if (!tournament || tournament.status !== 'preparing' || tournament.format !== 'constructed') return;
        if (!isRegistered) return;
        setConstructedLoading(true);
        // Ensure preparation has started (ignore errors if already started)
        try {
          await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/start`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }
          });
        } catch {}
        const res = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/constructed/decks?includePublic=${includePublicDecks ? 'true' : 'false'}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load constructed decks');
        const decks = Array.isArray(data?.myDecks) ? data.myDecks as Array<{ id: string; name: string; format?: string }> : (Array.isArray(data?.availableDecks) ? data.availableDecks as Array<{ id: string; name: string; format?: string }> : []);
        const pubDecks = Array.isArray(data?.publicDecks) ? data.publicDecks as Array<{ id: string; name: string; format?: string }> : [];
        const selected = (data?.selectedDeckId ? String(data.selectedDeckId) : null);
        const allowed = Array.isArray(data?.allowedFormats) ? data.allowedFormats as string[] : [];
        setConstructedDecks(decks);
        setConstructedPublicDecks(pubDecks);
        setConstructedSelectedDeckId(selected);
        setConstructedAllowedFormats(allowed);
      } catch (e) {
        setConstructedError(e instanceof Error ? e.message : 'Failed to load constructed decks');
        setConstructedDecks([]);
        setConstructedPublicDecks([]);
      } finally {
        setConstructedLoading(false);
      }
    })();
  }, [tournament, tournament?.id, tournament?.status, tournament?.format, isRegistered, includePublicDecks]);

  const handleSubmitConstructedDeck = async (deckId: string, isPublic: boolean = false) => {
    if (!tournament) return;
    setConstructedError(null);
    setConstructedLoading(true);
    try {
      // Ensure prep is started (ignore if already)
      try {
        await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      } catch {}
      let finalDeckId = deckId;
      if (isPublic) {
        // Clone and select via constructed/decks POST (handles cloning and updating preparation data)
        const selectRes = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/constructed/decks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckId })
        });
        const selData = await selectRes.json();
        if (!selectRes.ok) throw new Error(selData?.error || 'Failed to select public deck');
        finalDeckId = (selData?.selectedDeck?.id as string) || finalDeckId;
        // Optionally broadcast readiness via submit route for consistent events
        try {
          await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/submit`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preparationData: { constructed: { deckSelected: true, deckValidated: true, deckId: finalDeckId } } })
          });
        } catch {}
      } else {
        // Owned deck: submit constructed selection so server can transition when all submitted
        const submitRes = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preparationData: { constructed: { deckSelected: true, deckValidated: true, deckId } } })
        });
        const submitData = await submitRes.json();
        if (!submitRes.ok) throw new Error(submitData?.error || 'Failed to submit deck');
      }
      setConstructedSelectedDeckId(finalDeckId);
      try {
        localStorage.setItem(`constructed_submitted_tournament_${tournament.id}`, 'true');
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: 'Constructed deck submitted!' } }));
      } catch {}
      // Ask stats to refresh
      try { statistics?.actions?.refreshAll?.(); } catch {}
    } catch (e) {
      setConstructedError(e instanceof Error ? e.message : 'Failed to submit deck');
    } finally {
      setConstructedLoading(false);
    }
  };

  // Helper: start/join a specific match id (bootstrap online match with tournament context)
  const startJoinMatch = async (matchId: string) => {
    if (!tournament) return;
    try {
      // Load matches to find roster for this match
      const res = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/matches`);
      if (res.ok) {
        const data = await res.json();
        const match = Array.isArray(data?.matches) ? data.matches.find((m: { id: string }) => m.id === matchId) : null;
        if (match && Array.isArray(match.players)) {
          // Determine match type from tournament settings/format
          const tSettings = (tournament as unknown as { settings?: Record<string, unknown> }).settings || {};
          const matchType = (tournament.format as 'constructed'|'sealed'|'draft') || 'constructed';
          // Try to include sealed/draft configs
          let sealedConfig = (tSettings as { sealedConfig?: unknown }).sealedConfig || null;
          let draftConfig = (tSettings as { draftConfig?: unknown }).draftConfig || null;
          if (!sealedConfig && !draftConfig) {
            try {
              const detailRes = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}`);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                sealedConfig = detail?.settings?.sealedConfig || null;
                draftConfig = detail?.settings?.draftConfig || null;
              }
            } catch {}
          }
          if (matchType === 'sealed' && !sealedConfig) {
            sealedConfig = { packCounts: { Beta: 6 }, timeLimit: 40, replaceAvatars: false };
          }
          if (matchType === 'draft' && !draftConfig) {
            draftConfig = { setMix: ['Beta'], packCount: 3, packSize: 15, packCounts: { Beta: 3 } };
          }
          const payload = {
            players: match.players.map((p: { id: string }) => p.id),
            matchType,
            lobbyName: tournament.name,
            sealedConfig,
            draftConfig,
            tournamentId: String(tournament.id),
          };
          try { localStorage.setItem(`tournamentMatchBootstrap_${matchId}`, JSON.stringify(payload)); } catch {}
        }
      }
    } catch {}
    try { window.location.href = `/online/play/${encodeURIComponent(matchId)}`; } catch {}
  };

  // Creator-only: start next round and pair players
  const handleStartNextRound = async () => {
    if (!tournament || !isCreator) return;
    setStartingRound(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/next-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to start next round');
      try {
        const msg = `Round ${data?.roundNumber ?? ''} started`;
        localStorage.setItem('app:toast', msg);
        window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: msg } }));
      } catch {}
      try { statistics?.actions?.refreshAll?.(); } catch {}
    } catch (err) {
      console.error('Failed to start next round:', err);
      setError(err instanceof Error ? err.message : 'Failed to start next round');
    } finally {
      setStartingRound(false);
    }
  };

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
      {/* Creator Sticky: Start next round banner */}
      {tournament.status === 'active' && isCreator && !activeRound && (
        <div className="fixed inset-x-0 bottom-0 z-40">
          <div className="container mx-auto px-4 pb-4">
            <div className="rounded-lg border border-indigo-600 bg-indigo-900/90 backdrop-blur flex items-center justify-between px-4 py-3 shadow-lg">
              <div className="text-indigo-100 text-sm">
                {rounds.length > 0 ? (
                  <span>
                    Round {lastCompletedRoundNumber} completed. Start next round when ready.
                  </span>
                ) : (
                  <span>Tournament is active. Start Round 1 when you&apos;re ready.</span>
                )}
              </div>
              <button
                onClick={handleStartNextRound}
                disabled={startingRound}
                className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {startingRound ? 'Starting…' : `Start Round ${Math.max(1, maxRoundNumber + 1)}`}
              </button>
            </div>
          </div>
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
                {tournament.format === 'constructed' && (
                  <button
                    onClick={async () => {
                      // Emphasize the deck panel and scroll into view
                      try {
                        localStorage.setItem('app:toast', 'Load and select your constructed deck below');
                        window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: 'Load and select your constructed deck below' } }));
                      } catch {}
                      try { constructedPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
                      // Additionally open a modal to avoid confusion if the inline panel is off-screen or not visible yet
                      setConstructedModalOpen(true);
                      // Ensure preparation is started (idempotent) and refresh deck list
                      try {
                        await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
                      } catch {}
                      try {
                        setConstructedLoading(true);
                        const res = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/constructed/decks?includePublic=${includePublicDecks ? 'true' : 'false'}`);
                        const data = await res.json();
                        if (res.ok) {
                          const decks = Array.isArray(data?.availableDecks) ? data.availableDecks as Array<{ id: string; name: string; format?: string }> : [];
                          const selected = (data?.selectedDeckId ? String(data.selectedDeckId) : null);
                          const allowed = Array.isArray(data?.allowedFormats) ? data.allowedFormats as string[] : [];
                          setConstructedDecks(decks);
                          const pubDecks = Array.isArray(data?.publicDecks) ? data.publicDecks as Array<{ id: string; name: string; format?: string }> : [];
                          setConstructedPublicDecks(pubDecks);
                          setConstructedSelectedDeckId(selected);
                          setConstructedAllowedFormats(allowed);
                        } else {
                          setConstructedError(data?.error || 'Failed to load constructed decks');
                        }
                      } catch (err) {
                        setConstructedError(err instanceof Error ? err.message : 'Failed to load constructed decks');
                      } finally {
                        setConstructedLoading(false);
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm"
                  >
                    Load Decks
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Constructed deck loader (only when preparing + constructed) */}
        {tournament.status === 'preparing' && tournament.format === 'constructed' && isRegistered && (
          <div ref={constructedPanelRef} className="mb-6 rounded-lg border border-emerald-700 bg-emerald-900/20">
            <div className="p-4 flex items-center justify-between">
              <div className="text-emerald-200">
                <div className="font-semibold">Select Your Constructed Deck</div>
                <div className="text-sm opacity-80">This deck will be used for all matches in this tournament.</div>
              </div>
              {constructedSelectedDeckId ? (
                <span className="bg-emerald-600/20 text-emerald-200 ring-1 ring-emerald-500/30 px-4 py-2 rounded-md text-sm" title="Deck submitted">
                  Deck submitted
                </span>
              ) : null}
            </div>
            <div className="px-4 pb-4">
              {constructedError && (
                <div className="mb-3 text-sm text-red-300">{constructedError}</div>
              )}
              <div className="text-xs text-emerald-200/80 mb-2">
                Allowed formats: {constructedAllowedFormats.length ? constructedAllowedFormats.join(', ') : 'standard'}
              </div>
              <label className="flex items-center gap-2 text-xs text-emerald-200/80 mb-3">
                <input type="checkbox" className="accent-emerald-600" checked={includePublicDecks} onChange={(e) => setIncludePublicDecks(e.target.checked)} />
                Include public decks
              </label>
              {constructedLoading ? (
                <div className="text-emerald-200/80 text-sm">Loading your decks…</div>
              ) : (constructedDecks.length || constructedPublicDecks.length) ? (
                <div className="space-y-4">
                  {constructedDecks.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">My Decks</div>
                      <div className="space-y-2">
                        {constructedDecks.map((d) => (
                          <div key={`my-${d.id}`} className={`flex items-center justify-between px-3 py-2 rounded ${constructedSelectedDeckId === d.id ? 'bg-emerald-600/20 ring-1 ring-emerald-500/30' : 'bg-slate-800/40'}`}>
                            <div className="text-sm text-slate-200">
                              <div className="font-medium">{d.name}</div>
                              <div className="text-xs text-slate-400">{d.format || 'constructed'}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {constructedSelectedDeckId === d.id ? (
                                <span className="text-emerald-300 text-xs">Selected</span>
                              ) : (
                                <button
                                  onClick={() => handleSubmitConstructedDeck(d.id, false)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                                  disabled={constructedLoading}
                                >
                                  Select
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {includePublicDecks && constructedPublicDecks.length > 0 && (
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">Public Decks</div>
                      <div className="space-y-2">
                        {constructedPublicDecks.map((d) => (
                          <div key={`pub-${d.id}`} className={`flex items-center justify-between px-3 py-2 rounded ${constructedSelectedDeckId === d.id ? 'bg-emerald-600/20 ring-1 ring-emerald-500/30' : 'bg-slate-800/40'}`}>
                            <div className="text-sm text-slate-200">
                              <div className="font-medium">{d.name}</div>
                              <div className="text-xs text-slate-400">{d.format || 'constructed'}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {constructedSelectedDeckId === d.id ? (
                                <span className="text-emerald-300 text-xs">Selected</span>
                              ) : (
                                <button
                                  onClick={() => handleSubmitConstructedDeck(d.id, true)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                                  disabled={constructedLoading}
                                >
                                  Select
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-emerald-200/80 text-sm">No decks found. Create a constructed deck in the Decks section first.</div>
              )}
            </div>
          </div>
        )}

        {tournament.status === 'active' && isRegistered && (() => {
          if (!myMatchId) return null;
          return (
            <div className="mb-6 rounded-lg border border-emerald-700 bg-emerald-900/20 p-4 flex items-center justify-between">
              <div className="text-slate-200">Your match is ready. Join when you are set.</div>
              <button
                onClick={async () => { await startJoinMatch(String(myMatchId)); }}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md text-sm"
              >
                Join Match
              </button>
            </div>
          );
        })()}

        {/* Round Controls and Current Matches */}
        {tournament.status === 'active' && (
          <div className="mb-6">
            <div className="rounded-lg border border-indigo-700 bg-indigo-900/20 p-4 flex items-center justify-between">
              <div className="text-slate-200">
                {activeRound ? (
                  <span>Round {activeRound.roundNumber} in progress.</span>
                ) : (
                  <span>No active round yet.</span>
                )}
              </div>
              {isCreator && !activeRound && (
                <button
                  onClick={handleStartNextRound}
                  disabled={startingRound}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startingRound ? 'Starting…' : `Start Round ${Math.max(1, maxRoundNumber + 1)}`}
                </button>
              )}
            </div>

            {activeRound && (
              <div className="mt-4 bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Round {activeRound.roundNumber} Matches</h3>
                {Array.isArray((activeRound as unknown as { matches?: Array<{ id: string; players?: Array<{ id: string; name: string }> }> }).matches) && (activeRound as unknown as { matches: Array<{ id: string; players?: Array<{ id: string; name: string }> }> }).matches.length > 0 ? (
                  <div className="space-y-2">
                    {(activeRound as unknown as { matches: Array<{ id: string; players?: Array<{ id: string; name: string }> }> }).matches.map((m) => {
                      const isMine = myMatchId && String(m.id) === String(myMatchId);
                      const players = Array.isArray(m.players) ? m.players : [];
                      const names = players.map(p => p.name).join(' vs ');
                      return (
                        <div key={m.id} className={`flex items-center justify-between px-3 py-2 rounded ${isMine ? 'bg-emerald-600/20 ring-1 ring-emerald-500/30' : 'bg-slate-800/40'}`}>
                          <div className="text-sm text-slate-200">
                            {names || m.id}
                            {isMine && <span className="text-emerald-400 text-xs ml-2">(Your match)</span>}
                          </div>
                          {isMine && (
                            <button
                              onClick={() => startJoinMatch(String(m.id))}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                            >
                              Join
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-slate-400">No matches in this round.</div>
                )}
              </div>
            )}
          </div>
        )}

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

            {/* Completed Tournament Summary */}
            {tournament.status === 'completed' && (
              <div className="bg-emerald-900/20 border border-emerald-700 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-emerald-200 mb-4">Tournament Completed</h3>
                {statistics && statistics.standings && statistics.standings.length > 0 ? (
                  <div className="space-y-4">
                    {/* Winner */}
                    <div className="flex items-center justify-between bg-emerald-800/30 rounded-md p-4 border border-emerald-700/50">
                      <div className="text-emerald-200 text-base">Winner</div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-emerald-300">
                          {statistics.standings[0]?.playerName}
                        </div>
                        <div className="text-sm text-emerald-200/80">
                          {statistics.standings[0]?.matchPoints} pts · {statistics.standings[0]?.wins}-{statistics.standings[0]?.losses}-{statistics.standings[0]?.draws}
                        </div>
                      </div>
                    </div>
                    {/* Placements (Top 3) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {statistics.standings.slice(0, 3).map((s, idx) => (
                        <div key={s.playerId} className="bg-slate-900/40 rounded-md p-4 border border-slate-700/60">
                          <div className="text-slate-400 text-sm">#{idx + 1}</div>
                          <div className="text-white font-semibold">{s.playerName}</div>
                          <div className="text-slate-300 text-sm">{s.matchPoints} pts · {s.wins}-{s.losses}-{s.draws}</div>
                        </div>
                      ))}
                    </div>
                    {/* Key statistics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-slate-900/40 rounded-md p-4 border border-slate-700/60">
                        <div className="text-slate-400 text-sm">Players</div>
                        <div className="text-white text-lg font-semibold">{statistics.overview.totalPlayers}</div>
                      </div>
                      <div className="bg-slate-900/40 rounded-md p-4 border border-slate-700/60">
                        <div className="text-slate-400 text-sm">Rounds</div>
                        <div className="text-white text-lg font-semibold">{statistics.overview.totalRounds}</div>
                      </div>
                      <div className="bg-slate-900/40 rounded-md p-4 border border-slate-700/60">
                        <div className="text-slate-400 text-sm">Matches</div>
                        <div className="text-white text-lg font-semibold">{statistics.overview.completedMatches}/{statistics.overview.totalMatches}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-emerald-200/80">Final standings will appear here.</div>
                )}
              </div>
            )}

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
      {/* Join Prompt Overlay */}
      {/* Constructed Decks Modal */}
      {constructedModalOpen && tournament.status === 'preparing' && tournament.format === 'constructed' && isRegistered && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white text-lg font-semibold">Select Your Constructed Deck</div>
              <button onClick={() => setConstructedModalOpen(false)} className="text-slate-300 hover:text-white">✕</button>
            </div>
            {constructedError && (
              <div className="mb-3 text-sm text-red-300">{constructedError}</div>
            )}
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-emerald-200/80">
                Allowed formats: {constructedAllowedFormats.length ? constructedAllowedFormats.join(', ') : 'standard'}
              </div>
              <label className="flex items-center gap-2 text-xs text-emerald-200/80">
                <input type="checkbox" className="accent-emerald-600" checked={includePublicDecks} onChange={async (e) => {
                  setIncludePublicDecks(e.target.checked);
                  try {
                    setConstructedLoading(true);
                    const res = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/preparation/constructed/decks?includePublic=${e.target.checked ? 'true' : 'false'}`);
                    const data = await res.json();
                    if (res.ok) {
                      const decks = Array.isArray(data?.myDecks) ? data.myDecks as Array<{ id: string; name: string; format?: string }> : (Array.isArray(data?.availableDecks) ? data.availableDecks as Array<{ id: string; name: string; format?: string }> : []);
                      const pubDecks = Array.isArray(data?.publicDecks) ? data.publicDecks as Array<{ id: string; name: string; format?: string }> : [];
                      setConstructedDecks(decks);
                      setConstructedPublicDecks(pubDecks);
                    }
                  } catch {}
                  finally { setConstructedLoading(false); }
                }} />
                Include public decks
              </label>
            </div>
            {constructedLoading ? (
              <div className="text-emerald-200/80 text-sm">Loading your decks…</div>
            ) : (constructedDecks.length || constructedPublicDecks.length) ? (
              <div className="space-y-4 max-h-80 overflow-auto pr-1">
                {constructedDecks.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">My Decks</div>
                    <div className="space-y-2">
                      {constructedDecks.map((d) => (
                        <div key={`my-modal-${d.id}`} className={`flex items-center justify-between px-3 py-2 rounded ${constructedSelectedDeckId === d.id ? 'bg-emerald-600/20 ring-1 ring-emerald-500/30' : 'bg-slate-800/40'}`}>
                          <div className="text-sm text-slate-200">
                            <div className="font-medium">{d.name}</div>
                            <div className="text-xs text-slate-400">{d.format || 'constructed'}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {constructedSelectedDeckId === d.id ? (
                              <span className="text-emerald-300 text-xs">Selected</span>
                            ) : (
                              <button
                                onClick={async () => { await handleSubmitConstructedDeck(d.id, false); setConstructedModalOpen(false); }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                                disabled={constructedLoading}
                              >
                                Select
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {includePublicDecks && constructedPublicDecks.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">Public Decks</div>
                    <div className="space-y-2">
                      {constructedPublicDecks.map((d) => (
                        <div key={`pub-modal-${d.id}`} className={`flex items-center justify-between px-3 py-2 rounded ${constructedSelectedDeckId === d.id ? 'bg-emerald-600/20 ring-1 ring-emerald-500/30' : 'bg-slate-800/40'}`}>
                          <div className="text-sm text-slate-200">
                            <div className="font-medium">{d.name}</div>
                            <div className="text-xs text-slate-400">{d.format || 'constructed'}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {constructedSelectedDeckId === d.id ? (
                              <span className="text-emerald-300 text-xs">Selected</span>
                            ) : (
                              <button
                                onClick={async () => { await handleSubmitConstructedDeck(d.id, true); setConstructedModalOpen(false); }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-md text-sm"
                                disabled={constructedLoading}
                              >
                                Select
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-emerald-200/80 text-sm">
                No decks found. Create a constructed deck in the <a className="underline" href="/decks">Decks</a> section first.
              </div>
            )}
          </div>
        </div>
      )}
      {/* Join Prompt Overlay */}
      {joinPrompt.open && joinPrompt.matchId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 w-full max-w-md shadow-xl">
            <div className="text-white text-lg font-semibold mb-2">Your match is ready</div>
            <div className="text-slate-300 mb-4">Round {activeRound?.roundNumber ?? ''} has been paired. Join your match when ready.</div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setJoinPrompt({ open: false, matchId: null })} className="px-4 py-2 rounded-md bg-slate-700 text-white">
                Later
              </button>
              <button onClick={() => { void startJoinMatch(String(joinPrompt.matchId)); setJoinPrompt({ open: false, matchId: null }); }} className="px-4 py-2 rounded-md bg-emerald-600 text-white">
                Join Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
