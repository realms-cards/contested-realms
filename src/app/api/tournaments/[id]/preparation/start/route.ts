import { NextRequest } from 'next/server';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// POST /api/tournaments/[id]/preparation/start
// Start preparation phase for a player in a tournament
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Check if tournament exists and is in preparing status
    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: { 
        registrations: {
          where: { playerId: session.user.id }
        }
      }
    });

    if (!tournament) {
      return new Response(JSON.stringify({ error: 'Tournament not found' }), { status: 404 });
    }

    if (tournament.status !== 'preparing') {
      return new Response(JSON.stringify({ error: 'Tournament is not in preparation phase' }), { status: 400 });
    }

    // Check if player is registered
    const registration = tournament.registrations[0];
    if (!registration) {
      return new Response(JSON.stringify({ error: 'Not registered for this tournament' }), { status: 400 });
    }

    // If preparation already started, return current status (idempotent)
    if (registration.preparationStatus !== 'notStarted') {
      return new Response(JSON.stringify({
        success: true,
        preparationStatus: registration.preparationStatus,
        preparationData: registration.preparationData,
        format: tournament.format,
        message: 'Preparation already in progress'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    // Initialize preparation based on format
    let initialPreparationData: Record<string, unknown> = {};
    const settings = tournament.settings as Record<string, unknown> || {};

    switch (tournament.format) {
      case 'sealed':
        // Generate sealed packs for the player
        const sealedConfig = (settings.sealedConfig as Record<string, unknown>)
          || (settings.sealed as Record<string, unknown>)
          || {};
        // Prefer packCounts map { 'Beta': 6, ... } -> packConfiguration[]; fallback to existing packConfiguration
        const packCounts = (sealedConfig.packCounts as Record<string, number>) || {};
        let packConfiguration = (sealedConfig.packConfiguration as Array<{ setId: string; packCount: number }>) || [];
        if (!Array.isArray(packConfiguration) || packConfiguration.length === 0) {
          const entries = Object.entries(packCounts).filter(([, n]) => (n || 0) > 0);
          if (entries.length) {
            packConfiguration = entries.map(([setName, n]) => ({ setId: setName, packCount: Number(n) || 0 }));
          } else {
            packConfiguration = [{ setId: 'Beta', packCount: 6 }];
          }
        }
        
        // Check if packs are already generated (from previous /start call)
        const existingPrepData = registration.preparationData as Record<string, unknown> || {};
        const existingSealed = existingPrepData.sealed as Record<string, unknown> || {};
        const existingPacks = existingSealed.generatedPacks;

        initialPreparationData = {
          sealed: {
            packsOpened: false,
            deckBuilt: false,
            packConfiguration,
            // Reuse existing packs if available, otherwise generate new ones
            generatedPacks: existingPacks || await generateSealedPacks(packConfiguration),
            deckList: []
          }
        };
        break;

      case 'draft':
        initialPreparationData = {
          draft: {
            draftCompleted: false,
            deckBuilt: false,
            draftSessionId: null,
            deckList: []
          }
        };
        break;

      case 'constructed':
        initialPreparationData = {
          constructed: {
            deckSelected: false,
            deckId: null,
            deckValidated: false
          }
        };
        break;
    }

    // Update preparation status
    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        preparationStatus: 'inProgress',
        preparationData: JSON.parse(JSON.stringify(initialPreparationData))
      }
    });

    return new Response(JSON.stringify({
      success: true,
      preparationStatus: 'inProgress',
      preparationData: initialPreparationData,
      format: tournament.format
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error starting preparation:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// Helper function to generate sealed packs
async function generateSealedPacks(packConfiguration: Array<{ setId: string; packCount: number }>) {
  const { generateBoosters } = await import('@/lib/booster');
  const packs = [];

  for (const config of packConfiguration) {
    const boosters = await generateBoosters(config.setId, config.packCount);
    for (let i = 0; i < boosters.length; i++) {
      packs.push({
        setId: config.setId,
        packId: `${config.setId}_pack_${i + 1}`,
        cards: boosters[i].map(card => ({
          id: `${card.variantId}_${i}`,
          cardId: card.cardId,
          variantId: card.variantId,
          name: card.cardName,
          slug: card.slug,
          rarity: card.rarity,
          type: card.type,
          finish: card.finish,
          product: card.product
        }))
      });
    }
  }

  return packs;
}
