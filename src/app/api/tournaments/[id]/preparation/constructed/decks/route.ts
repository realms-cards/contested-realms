import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/tournaments/[id]/preparation/constructed/decks
// Get available decks for constructed format
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

    if (registration.tournament.format !== 'constructed') {
      return new Response(JSON.stringify({ error: 'Tournament is not constructed format' }), { status: 400 });
    }

    if (registration.tournament.status !== 'preparing') {
      return new Response(JSON.stringify({ error: 'Tournament is not in preparation phase' }), { status: 400 });
    }

    // Get player's decks that are valid for this tournament
    const playerDecks = await prisma.deck.findMany({
      where: {
        userId: session.user.id
      },
      select: {
        id: true,
        name: true,
        format: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    // Filter decks based on tournament format restrictions
    const settings = registration.tournament.settings as Record<string, unknown> || {};
    const constructedConfig = settings.constructed as Record<string, unknown> || {};
    const allowedFormats = constructedConfig.allowedFormats as string[] || ['standard', 'pioneer', 'modern'];

    const validDecks = playerDecks.filter(deck => {
      // Check if deck format is allowed
      if (!allowedFormats.includes(deck.format || 'standard')) {
        return false;
      }

      // For now, assume all decks are valid - in a real app we'd check card counts
      return true;
    });

    // Get currently selected deck from preparation data
    const prepData = registration.preparationData as Record<string, unknown> || {};
    const constructedData = prepData.constructed as Record<string, unknown> || {};
    const selectedDeckId = constructedData.deckId as string || null;

    return new Response(JSON.stringify({
      tournamentId: id,
      playerId: session.user.id,
      format: 'constructed',
      availableDecks: validDecks,
      selectedDeckId,
      allowedFormats,
      deckRequirements: {
        minimumCards: 60,
        maximumCards: null,
        sideboardAllowed: true,
        validationRequired: false
      },
      settings: constructedConfig
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error getting constructed decks:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// POST /api/tournaments/[id]/preparation/constructed/decks
// Select a deck for constructed tournament
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await req.json();
    const { deckId } = body;

    if (!deckId || typeof deckId !== 'string') {
      return new Response(JSON.stringify({ error: 'deckId is required' }), { status: 400 });
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
            status: true,
            settings: true
          }
        }
      }
    });

    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 404 });
    }

    if (registration.tournament.format !== 'constructed') {
      return new Response(JSON.stringify({ error: 'Tournament is not constructed format' }), { status: 400 });
    }

    if (registration.preparationStatus !== 'inProgress') {
      return new Response(JSON.stringify({ error: 'Preparation not started. Call /start first' }), { status: 400 });
    }

    // Validate the selected deck
    const deck = await prisma.deck.findFirst({
      where: {
        id: deckId,
        userId: session.user.id
      }
    });

    if (!deck) {
      return new Response(JSON.stringify({ error: 'Deck not found or not owned by player' }), { status: 404 });
    }

    // Validate deck meets tournament requirements
    const settings = registration.tournament.settings as Record<string, unknown> || {};
    const constructedConfig = settings.constructed as Record<string, unknown> || {};
    const allowedFormats = constructedConfig.allowedFormats as string[] || ['standard', 'pioneer', 'modern'];

    if (!allowedFormats.includes(deck.format || 'standard')) {
      return new Response(JSON.stringify({ 
        error: `Deck format '${deck.format}' not allowed. Allowed formats: ${allowedFormats.join(', ')}` 
      }), { status: 400 });
    }

    // For now, skip deck validation - in a real app we'd check card counts and validity

    // Update preparation data
    const currentPrepData = registration.preparationData as Record<string, unknown> || {};
    const updatedConstructedData = {
      deckSelected: true,
      deckId,
      deckName: deck.name,
      deckFormat: deck.format,
      deckValidated: true,
      selectedAt: new Date().toISOString()
    };

    const updatedPrepData = {
      ...currentPrepData,
      constructed: updatedConstructedData,
      isComplete: true
    };

    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        preparationStatus: 'completed',
        deckSubmitted: true,
        preparationData: JSON.parse(JSON.stringify(updatedPrepData))
      }
    });

    console.log(`Player ${session.user.id} selected deck ${deckId} for tournament ${id}`);

    // Check if all players are ready to transition to active phase
    await checkAndTransitionToActivePhase(id);

    return new Response(JSON.stringify({
      success: true,
      selectedDeck: {
        id: deck.id,
        name: deck.name,
        format: deck.format
      },
      preparationStatus: 'completed',
      deckSubmitted: true,
      preparationData: updatedPrepData
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error selecting constructed deck:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// Helper function to check if tournament should transition to active phase
async function checkAndTransitionToActivePhase(tournamentId: string) {
  const allRegistrations = await prisma.tournamentRegistration.findMany({
    where: { tournamentId },
    select: { preparationStatus: true, deckSubmitted: true }
  });

  const allComplete = allRegistrations.every(reg => 
    reg.preparationStatus === 'completed' && reg.deckSubmitted
  );

  if (allComplete) {
    await prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: 'active' }
    });

    console.log(`Tournament ${tournamentId} transitioned to active phase - all players ready`);
  }
}