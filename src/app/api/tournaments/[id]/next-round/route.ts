import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatePairings, createRoundMatches } from '@/lib/tournament/pairing';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/next-round
// Advances tournament to next round and generates pairings
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        rounds: {
          orderBy: { roundNumber: 'desc' },
          take: 1
        }
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.status !== 'playing') {
      return new Response(JSON.stringify({ error: 'Tournament must be in playing status' }), { status: 400 });
    }

    if (tournament.currentRound >= tournament.totalRounds) {
      return new Response(JSON.stringify({ error: 'Tournament is already complete' }), { status: 400 });
    }

    const nextRoundNumber = tournament.currentRound + 1;

    // Check if current round is complete (if any)
    if (tournament.rounds.length > 0) {
      const currentRound = tournament.rounds[0];
      const pendingMatches = await prisma.match.count({
        where: {
          roundId: currentRound.id,
          status: { in: ['pending', 'in_progress'] }
        }
      });

      if (pendingMatches > 0) {
        return new Response(JSON.stringify({ error: 'Current round is not complete' }), { status: 400 });
      }
    }

    // Create new round
    const newRound = await prisma.tournamentRound.create({
      data: {
        tournamentId: id,
        roundNumber: nextRoundNumber,
        status: 'pending'
      }
    });

    // Generate pairings
    const pairings = await generatePairings(id, nextRoundNumber);

    // Create matches
    const matchIds = await createRoundMatches(id, newRound.id, pairings);

    // Update tournament current round
    await prisma.tournament.update({
      where: { id },
      data: {
        currentRound: nextRoundNumber
      }
    });

    // Update round status
    await prisma.tournamentRound.update({
      where: { id: newRound.id },
      data: {
        status: 'in_progress',
        startedAt: new Date()
      }
    });

    return new Response(JSON.stringify({
      success: true,
      roundNumber: nextRoundNumber,
      roundId: newRound.id,
      matchIds,
      pairings: {
        matches: pairings.matches.length,
        byes: pairings.byes.length
      }
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}