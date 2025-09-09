import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { TournamentFormat, TournamentStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

// GET /api/tournaments
// Returns all active tournaments
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const tournaments = await prisma.tournament.findMany({
      where: {
        status: {
          in: ['registering', 'draft_phase', 'sealed_phase', 'playing'] as TournamentStatus[]
        }
      },
      include: {
        registrations: {
          include: {
            player: {
              select: { id: true, name: true }
            }
          }
        },
        standings: true,
        rounds: {
          include: {
            matches: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Transform to match protocol format
    const tournamentInfos = tournaments.map(tournament => ({
      id: tournament.id,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      maxPlayers: tournament.maxPlayers,
      registeredPlayers: tournament.registrations.map(reg => ({
        id: reg.playerId,
        displayName: reg.displayName
      })),
      standings: tournament.standings.map(standing => ({
        playerId: standing.playerId,
        displayName: standing.displayName,
        wins: standing.wins,
        losses: standing.losses,
        draws: standing.draws,
        matchPoints: standing.matchPoints,
        gameWinPercentage: standing.gameWinPercentage,
        opponentMatchWinPercentage: standing.opponentMatchWinPercentage,
        isEliminated: standing.isEliminated,
        currentMatchId: standing.currentMatchId
      })),
      currentRound: tournament.currentRound,
      totalRounds: tournament.totalRounds,
      rounds: tournament.rounds.map(round => ({
        roundNumber: round.roundNumber,
        status: round.status,
        matches: round.matches.map(match => match.id)
      })),
      matchType: tournament.matchType,
      sealedConfig: tournament.sealedConfig,
      draftConfig: tournament.draftConfig,
      createdAt: tournament.createdAt.getTime()
    }));

    return new Response(JSON.stringify(tournamentInfos), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// POST /api/tournaments
// Body: { name: string, format: 'swiss' | 'elimination' | 'round_robin', matchType: 'constructed' | 'sealed' | 'draft', maxPlayers: number, sealedConfig?: any, draftConfig?: any }
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await req.json();
    const name = String(body?.name || '').trim();
    const format = body?.format as TournamentFormat;
    const matchType = String(body?.matchType || 'sealed');
    const maxPlayers = Number(body?.maxPlayers || 8);
    const sealedConfig = body?.sealedConfig || null;
    const draftConfig = body?.draftConfig || null;

    if (!name) {
      return new Response(JSON.stringify({ error: 'Missing tournament name' }), { status: 400 });
    }

    if (!['swiss', 'elimination', 'round_robin'].includes(format)) {
      return new Response(JSON.stringify({ error: 'Invalid tournament format' }), { status: 400 });
    }

    if (!['constructed', 'sealed', 'draft'].includes(matchType)) {
      return new Response(JSON.stringify({ error: 'Invalid match type' }), { status: 400 });
    }

    if (![4, 8, 16, 32].includes(maxPlayers)) {
      return new Response(JSON.stringify({ error: 'Invalid max players count' }), { status: 400 });
    }

    // Calculate total rounds based on format
    let totalRounds = 3; // Default for swiss
    if (format === 'elimination') {
      totalRounds = Math.ceil(Math.log2(maxPlayers));
    } else if (format === 'round_robin') {
      totalRounds = maxPlayers - 1;
    }

    const tournament = await prisma.tournament.create({
      data: {
        name,
        format,
        status: 'registering',
        maxPlayers,
        totalRounds,
        matchType,
        sealedConfig,
        draftConfig
      }
    });

    return new Response(JSON.stringify({
      id: tournament.id,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      maxPlayers: tournament.maxPlayers,
      matchType: tournament.matchType
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}