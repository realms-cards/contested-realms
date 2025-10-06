import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/preparation/sealed/packs
// Get sealed packs for the player
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const registration = await prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId: id,
        playerId: session.user.id
      },
      include: {
        tournament: {
          select: {
            format: true,
            status: true,
            settings: true
          }
        }
      }
    });

    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 404 });
    }

    if (registration.tournament.format !== 'sealed') {
      return new Response(JSON.stringify({ error: 'Tournament is not sealed format' }), { status: 400 });
    }

    if (registration.tournament.status !== 'preparing') {
      return new Response(JSON.stringify({ error: 'Tournament is not in preparation phase' }), { status: 400 });
    }

    if (registration.preparationStatus === 'notStarted') {
      return new Response(JSON.stringify({ error: 'Preparation not started. Call /start first' }), { status: 400 });
    }

    const prepData = registration.preparationData as Record<string, unknown> || {};
    const sealedData = prepData.sealed as Record<string, unknown> || {};

    return new Response(JSON.stringify({
      tournamentId: id,
      playerId: session.user.id,
      format: 'sealed',
      packs: sealedData.generatedPacks || [],
      packsOpened: sealedData.packsOpened || false,
      deckBuilt: sealedData.deckBuilt || false,
      deckList: sealedData.deckList || [],
      settings: registration.tournament.settings
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error getting sealed packs:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// POST /api/tournaments/[id]/preparation/sealed/packs
// Open sealed packs (mark as opened)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await req.json();
    const { packIds } = body;

    if (!Array.isArray(packIds)) {
      return new Response(JSON.stringify({ error: 'packIds must be an array' }), { status: 400 });
    }

    const registration = await prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId: id,
        playerId: session.user.id
      },
      include: {
        tournament: {
          select: {
            format: true,
            status: true
          }
        }
      }
    });

    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 404 });
    }

    if (registration.tournament.format !== 'sealed') {
      return new Response(JSON.stringify({ error: 'Tournament is not sealed format' }), { status: 400 });
    }

    if (registration.preparationStatus !== 'inProgress') {
      return new Response(JSON.stringify({ error: 'Preparation not in progress' }), { status: 400 });
    }

    const currentPrepData = registration.preparationData as Record<string, unknown> || {};
    const sealedData = currentPrepData.sealed as Record<string, unknown> || {};

    if (sealedData.packsOpened) {
      return new Response(JSON.stringify({ error: 'Packs already opened' }), { status: 400 });
    }

    // Extract card pool from the generated packs
    const generatedPacks = (sealedData.generatedPacks as Array<{ packId: string; cards: unknown[] }>) || [];
    const cardPool = extractCardPoolFromPacks(generatedPacks, packIds);

    const updatedSealedData = {
      ...sealedData,
      packsOpened: true,
      openedPackIds: packIds,
      cardPool,
      openedAt: new Date().toISOString()
    };

    const updatedPrepData = {
      ...currentPrepData,
      sealed: updatedSealedData
    };

    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        preparationData: JSON.parse(JSON.stringify(updatedPrepData))
      }
    });

    return new Response(JSON.stringify({
      success: true,
      packsOpened: true,
      cardPool,
      openedPackIds: packIds
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error opening sealed packs:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// Helper function to extract card pool from generated packs
function extractCardPoolFromPacks(
  generatedPacks: Array<{ packId: string; cards: unknown[] }>,
  packIds: string[]
) {
  const cardPool: unknown[] = [];

  for (const packId of packIds) {
    const pack = generatedPacks.find(p => p.packId === packId);
    if (pack && Array.isArray(pack.cards)) {
      cardPool.push(...pack.cards);
    }
  }

  return cardPool;
}