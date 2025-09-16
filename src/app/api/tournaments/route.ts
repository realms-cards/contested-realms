import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TournamentFormat, TournamentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

function getServerHttpOrigin(): string | null {
  const explicit = (process.env.SERVER_HTTP_ORIGIN || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const ws = (process.env.NEXT_PUBLIC_WS_URL || '').trim();
  if (!ws) return null;
  try {
    const u = new URL(ws);
    // Map ws(s) -> http(s)
    if (u.protocol === 'ws:') u.protocol = 'http:';
    if (u.protocol === 'wss:') u.protocol = 'https:';
    return u.origin;
  } catch {
    return null;
  }
}

function getInternalToken(): string | null {
  const t = (process.env.INTERNAL_API_TOKEN || '').trim();
  return t || null;
}

function getTotalRoundsFromSettings(settings: unknown): number {
  if (settings && typeof settings === 'object') {
    const val = (settings as Record<string, unknown>).totalRounds;
    if (typeof val === 'number' && Number.isFinite(val)) return val;
  }
  return 3;
}

// GET /api/tournaments
// Returns all active tournaments
export async function GET(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const base = getServerHttpOrigin();
  const token = getInternalToken();
  if (base && token) {
    try {
      const search = req.nextUrl?.search || '';
      const r = await fetch(`${base}/api/tournaments${search}`, {
        method: 'GET',
        headers: {
          'x-internal-auth': token,
        },
        cache: 'no-store',
      });
      const txt = await r.text();
      return new Response(txt, { status: r.status, headers: { 'content-type': 'application/json' } });
    } catch (e: unknown) {
      console.error('Error proxying tournaments:', e);
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
      return new Response(JSON.stringify({ error: message }), { status: 502 });
    }
  }

  // Fallback for dev/test when server is not configured
  if (process.env.NODE_ENV !== 'production') {
    try {
      const url = req.nextUrl;
      const statusParam = url.searchParams.get('status');
      const formatParam = url.searchParams.get('format');
      const where: { status?: TournamentStatus; format?: TournamentFormat } = {};
      if (statusParam) where.status = statusParam as TournamentStatus;
      if (formatParam) where.format = formatParam as TournamentFormat;
      const tournaments = await prisma.tournament.findMany({
        where,
        include: {
          registrations: {
            include: {
              player: { select: { id: true, name: true } },
            },
          },
          standings: true,
          rounds: { include: { matches: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      const tournamentInfos = tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        creatorId: t.creatorId,
        format: t.format,
        status: t.status,
        maxPlayers: t.maxPlayers,
        registeredPlayers: t.registrations.map((reg) => {
          const prepData = reg.preparationData as Record<string, unknown> | null;
          return {
            id: reg.playerId,
            displayName: (reg.player && reg.player.name) || 'Anonymous',
            ready: Boolean(prepData?.ready),
          };
        }),
        standings: t.standings.map((s) => ({
          playerId: s.playerId,
          displayName: s.displayName,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          matchPoints: s.matchPoints,
          gameWinPercentage: s.gameWinPercentage,
          opponentMatchWinPercentage: s.opponentMatchWinPercentage,
          isEliminated: s.isEliminated,
          currentMatchId: s.currentMatchId,
        })),
        currentRound: t.rounds.length > 0 ? Math.max(...t.rounds.map((r) => r.roundNumber)) : 0,
        totalRounds: getTotalRoundsFromSettings(t.settings),
        rounds: t.rounds.map((r) => ({
          roundNumber: r.roundNumber,
          status: r.status,
          matches: r.matches.map((m) => m.id),
        })),
        settings: t.settings,
        createdAt: t.createdAt.getTime(),
      }));
      return new Response(JSON.stringify(tournamentInfos), { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (e) {
      console.error('Tournament list fallback error:', e);
      return new Response(JSON.stringify({ error: 'Failed to fetch tournaments (fallback)' }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
}

// POST /api/tournaments
// Body: { name: string, format: 'swiss' | 'elimination' | 'round_robin', matchType: 'constructed' | 'sealed' | 'draft', maxPlayers: number, sealedConfig?: any, draftConfig?: any }
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const base = getServerHttpOrigin();
  const token = getInternalToken();
  if (base && token) {
    try {
      const body = await req.json();
      const r = await fetch(`${base}/api/tournaments`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-auth': token,
          'x-user-id': session.user.id,
        },
        body: JSON.stringify(body ?? {}),
      });
      const txt = await r.text();
      return new Response(txt, { status: r.status, headers: { 'content-type': 'application/json' } });
    } catch (e: unknown) {
      console.error('Error proxying tournament creation:', e);
      const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
      return new Response(JSON.stringify({ error: message }), { status: 502 });
    }
  }

  // Fallback for dev/test when server is not configured
  if (process.env.NODE_ENV !== 'production') {
    try {
      const body = await req.json();
      const name = String(body?.name || '').trim();
      const format = (body?.format as TournamentFormat) || ('sealed' as TournamentFormat);
      const maxPlayers = Number(body?.maxPlayers || 8);
      const sealedConfig = body?.sealedConfig || null;
      const draftConfig = body?.draftConfig || null;

      if (!name) return new Response(JSON.stringify({ error: 'Missing tournament name' }), { status: 400 });
      if (!['sealed', 'draft', 'constructed'].includes(format)) return new Response(JSON.stringify({ error: 'Invalid tournament format' }), { status: 400 });
      if (![2, 4, 8, 16, 32].includes(maxPlayers)) return new Response(JSON.stringify({ error: 'Invalid max players count' }), { status: 400 });

      const existing = await prisma.tournamentRegistration.findMany({
        where: {
          playerId: session.user.id,
          tournament: { status: { in: ['registering', 'preparing', 'active'] } },
        },
        include: { tournament: { select: { name: true } } },
      });
      if (existing.length > 0) {
        return new Response(JSON.stringify({ error: `You are already in tournament "${existing[0].tournament.name}". Leave that tournament before creating a new one.` }), { status: 400 });
      }

      const optimalRounds = Math.ceil(Math.log2(maxPlayers));
      const totalRounds = Math.max(3, optimalRounds);

      const tournament = await prisma.tournament.create({
        data: {
          name,
          creatorId: session.user.id,
          format,
          status: 'registering',
          maxPlayers,
          settings: {
            totalRounds,
            roundTimeLimit: 50,
            matchTimeLimit: 60,
            sealedConfig,
            draftConfig,
          },
        },
      });

      try {
        const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { name: true, email: true } });
        const displayName = (user?.name) || (user?.email ? user.email.split('@')[0] : null) || 'Tournament Host';
        await prisma.$transaction([
          prisma.tournamentRegistration.create({ data: { tournamentId: tournament.id, playerId: session.user.id } }),
          prisma.playerStanding.create({ data: { tournamentId: tournament.id, playerId: session.user.id, displayName } }),
        ]);
      } catch {}

      return new Response(JSON.stringify({
        id: tournament.id,
        name: tournament.name,
        format: tournament.format,
        status: tournament.status,
        maxPlayers: tournament.maxPlayers,
        settings: tournament.settings,
      }), { status: 201, headers: { 'content-type': 'application/json' } });
    } catch (e) {
      console.error('Tournament creation fallback error:', e);
      return new Response(JSON.stringify({ error: 'Failed to create tournament (fallback)' }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
}