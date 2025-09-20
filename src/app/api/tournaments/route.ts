import { TournamentFormat, TournamentStatus } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-socket-service';

export const dynamic = 'force-dynamic';

// GET /api/tournaments
// Returns all active tournaments
export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    console.log('Fetching tournaments...');
    const tournaments = await prisma.tournament.findMany({
      where: {
        status: {
          in: ['registering', 'preparing', 'active'] as TournamentStatus[]
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

    console.log('Found tournaments:', tournaments.length);
    
    // Debug tournament registrations
    tournaments.forEach(tournament => {
      console.log(`Tournament ${tournament.name} has ${tournament.registrations.length} registrations:`, 
        tournament.registrations.map(reg => ({ 
          playerId: reg.playerId, 
          playerName: reg.player?.name, 
          hasPlayer: !!reg.player 
        })));
    });
    
    // Transform to match protocol format
    const tournamentInfos = tournaments.map(tournament => ({
      id: tournament.id,
      name: tournament.name,
      creatorId: tournament.creatorId,
      format: tournament.format,
      status: tournament.status,
      maxPlayers: tournament.maxPlayers,
      registeredPlayers: tournament.registrations.map(reg => {
        const prepData = reg.preparationData as Record<string, unknown> | null;
        return {
          id: reg.playerId,
          displayName: reg.player.name || 'Anonymous',
          ready: Boolean(prepData?.ready),
          deckSubmitted: Boolean(reg.deckSubmitted)
        };
      }),
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
      currentRound: tournament.rounds.length > 0 ? Math.max(...tournament.rounds.map(r => r.roundNumber)) : 0,
      totalRounds: ((tournament.settings as Record<string, unknown>)?.totalRounds as number) || 3,
      rounds: tournament.rounds.map(round => ({
        roundNumber: round.roundNumber,
        status: round.status,
        matches: round.matches.map(match => match.id)
      })),
      settings: tournament.settings,
      createdAt: tournament.createdAt.getTime()
    }));

    return new Response(JSON.stringify(tournamentInfos), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error fetching tournaments:', e);
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
    // Accept sealed/draft config from either top-level or nested in `settings`
    const incomingSettings = (body?.settings as Record<string, unknown> | undefined) || {};
    const sealedConfig = (body?.sealedConfig as unknown)
      ?? (incomingSettings?.sealedConfig as unknown)
      ?? null;
    const draftConfig = (body?.draftConfig as unknown)
      ?? (incomingSettings?.draftConfig as unknown)
      ?? null;

    console.log("Creating tournament:", { name, format, matchType, maxPlayers, creatorId: session.user.id });

    if (!name) {
      return new Response(JSON.stringify({ error: 'Missing tournament name' }), { status: 400 });
    }

    if (!['sealed', 'draft', 'constructed'].includes(format)) {
      return new Response(JSON.stringify({ error: 'Invalid tournament format' }), { status: 400 });
    }

    if (![2, 4, 8, 16, 32].includes(maxPlayers)) {
      return new Response(JSON.stringify({ error: 'Invalid max players count' }), { status: 400 });
    }

    // Enforce "one lobby rule" - check if user is already in any active tournament
    const existingTournamentRegistrations = await prisma.tournamentRegistration.findMany({
      where: {
        playerId: session.user.id,
        tournament: {
          status: { in: ['registering', 'preparing', 'active'] }
        }
      },
      include: { tournament: { select: { name: true } } }
    });

    if (existingTournamentRegistrations.length > 0) {
      const tournamentName = existingTournamentRegistrations[0].tournament.name;
      return new Response(JSON.stringify({ 
        error: `You are already in tournament "${tournamentName}". Leave that tournament before creating a new one.` 
      }), { status: 400 });
    }

    // Calculate optimal rounds based on player count (Swiss system)
    const optimalRounds = Math.ceil(Math.log2(maxPlayers));
    const totalRounds = Math.max(3, optimalRounds); // Minimum 3 rounds

    // Merge provided arbitrary settings (e.g., pairingFormat) while enforcing server-calculated fields
    const settingsOut: Record<string, unknown> = {
      ...incomingSettings,
      totalRounds,
      roundTimeLimit: 50,
      matchTimeLimit: 60,
      sealedConfig,
      draftConfig,
    };

    const tournament = await prisma.tournament.create({
      data: {
        name,
        creatorId: session.user.id,
        format,
        status: 'registering',
        maxPlayers,
        // Ensure a Prisma-compatible JSON shape
        settings: JSON.parse(JSON.stringify(settingsOut))
      }
    });

    // Auto-register the tournament creator
    console.log("Starting auto-registration for tournament creator:", session.user.id);
    
    try {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true }
      });
      
      console.log("Found user for auto-registration:", user);

      const displayName = user?.name || (user?.email ? user.email.split('@')[0] : null) || 'Tournament Host';
      
      console.log("Auto-registering with displayName:", displayName);

      await prisma.$transaction([
        prisma.tournamentRegistration.create({
          data: {
            tournamentId: tournament.id,
            playerId: session.user.id
          }
        }),
        prisma.playerStanding.create({
          data: {
            tournamentId: tournament.id,
            playerId: session.user.id,
            displayName
          }
        })
      ]);

      console.log("Tournament creator auto-registered successfully:", { tournamentId: tournament.id, creatorId: session.user.id });
    } catch (autoRegError) {
      console.error("Error during auto-registration:", autoRegError);
      // Don't fail tournament creation if auto-registration fails
    }

    // Broadcast new tournament so lobby/tournaments lists auto-update
    try {
      await tournamentSocketService.broadcastTournamentUpdateById(tournament.id);
    } catch (socketErr) {
      console.warn('Failed to broadcast tournament creation:', socketErr);
    }

    return new Response(JSON.stringify({
      id: tournament.id,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      maxPlayers: tournament.maxPlayers,
      settings: tournament.settings
    }), {
      status: 201,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error creating tournament:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
