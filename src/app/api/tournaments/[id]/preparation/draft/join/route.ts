import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { countActiveSeats } from '@/lib/tournament/registration';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/preparation/draft/join
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const userId = session.user.id;
    const registration = await prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId: id,
        playerId: userId,
      },
      include: {
        tournament: {
          select: {
            format: true,
            status: true,
            settings: true,
            registrations: {
              select: { playerId: true, seatStatus: true },
            },
          },
        },
      },
    });

    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 404 });
    }

    if (registration.tournament.format !== 'draft') {
      return new Response(JSON.stringify({ error: 'Tournament is not draft format' }), { status: 400 });
    }

    if (registration.tournament.status !== 'preparing') {
      return new Response(JSON.stringify({ error: 'Tournament is not in preparation phase' }), { status: 400 });
    }

    const draftSession = await prisma.draftSession.findFirst({
      where: { tournamentId: id },
      include: {
        participants: {
          include: {
            player: { select: { name: true } },
          },
          orderBy: { seatNumber: 'asc' },
        },
      },
    });

    if (!draftSession) {
      return new Response(JSON.stringify({ error: 'Draft session not initialized yet' }), { status: 409 });
    }

    const participant = draftSession.participants.find((p) => p.playerId === userId);
    if (!participant) {
      return new Response(JSON.stringify({ error: 'Draft participant record missing for player' }), { status: 409 });
    }

    const currentPrep = (registration.preparationData as Record<string, unknown> | null) ?? {};
    const nextDraftData = {
      ...(currentPrep.draft as Record<string, unknown> | undefined ?? {}),
      draftSessionId: draftSession.id,
      seatNumber: participant.seatNumber,
    };

    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        preparationStatus: 'inProgress',
        preparationData: JSON.parse(JSON.stringify({
          ...currentPrep,
          draft: nextDraftData,
        })),
      },
    });

    const playersJoined = draftSession.participants.length;
    const totalPlayers = countActiveSeats(registration.tournament.registrations);

    return new Response(JSON.stringify({
      success: true,
      draftSession,
      playersJoined,
      totalPlayers,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
