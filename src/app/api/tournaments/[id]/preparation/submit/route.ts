import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { tournamentSocketService } from '@/lib/services/tournament-broadcast';
import { createRoundMatches, generatePairings } from '@/lib/tournament/pairing';
import { getRegistrationSettings } from '@/lib/tournament/registration';

const SubmitPreparationRequestSchema = z.object({
  preparationData: z.object({
    sealed: z.object({
      packsOpened: z.boolean(),
      deckBuilt: z.boolean(),
      deckList: z.array(z.object({
        cardId: z.string(),
        quantity: z.number()
      }))
    }).optional(),
    draft: z.object({
      draftCompleted: z.boolean(),
      deckBuilt: z.boolean(),
      deckList: z.array(z.object({
        cardId: z.string(),
        quantity: z.number()
      }))
    }).optional(),
    constructed: z.object({
      deckSelected: z.boolean(),
      deckValidated: z.boolean(),
      deckId: z.string()
    }).optional()
  })
});

export const dynamic = 'force-dynamic';

// Minimum total cards required for a limited deck (Avatar + 24 Spells + 12 Sites = 37)
const MIN_DECK_CARDS = 37;

function getTotalCards(deckList: Array<{ cardId: string; quantity: number }>) {
  return deckList.reduce((sum, card) => sum + (Number(card.quantity) || 0), 0);
}

// POST /api/tournaments/[id]/preparation/submit
// Submit preparation data (deck, draft picks, etc.)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await req.json();
    const validatedRequest = SubmitPreparationRequestSchema.parse(body);

    // Get player's registration
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

    if (registration.tournament.status !== 'preparing') {
      return new Response(JSON.stringify({ error: 'Tournament is not in preparation phase' }), { status: 400 });
    }

    if (registration.preparationStatus !== 'inProgress') {
      return new Response(JSON.stringify({ error: 'Preparation not started or already completed' }), { status: 400 });
    }

    // Validate format-specific preparation data
    const format = registration.tournament.format;
    const preparationData = validatedRequest.preparationData;
    
    let isComplete = false;
    let deckSubmitted = false;

    switch (format) {
      case 'sealed':
        if (!preparationData.sealed) {
          return new Response(JSON.stringify({ error: 'Sealed preparation data required' }), { status: 400 });
        }
        
        const sealedData = preparationData.sealed;
        {
          const total = getTotalCards(sealedData.deckList);
          isComplete = sealedData.packsOpened && sealedData.deckBuilt && total >= MIN_DECK_CARDS;
        }
        deckSubmitted = isComplete;
        
        if (isComplete && !validateDeckList(sealedData.deckList)) {
          return new Response(JSON.stringify({ error: 'Invalid deck list' }), { status: 400 });
        }
        break;

      case 'draft':
        if (!preparationData.draft) {
          return new Response(JSON.stringify({ error: 'Draft preparation data required' }), { status: 400 });
        }
        
        const draftData = preparationData.draft;
        {
          const total = getTotalCards(draftData.deckList);
          isComplete = draftData.draftCompleted && draftData.deckBuilt && total >= MIN_DECK_CARDS;
        }
        deckSubmitted = isComplete;
        
        if (isComplete && !validateDeckList(draftData.deckList)) {
          return new Response(JSON.stringify({ error: 'Invalid deck list' }), { status: 400 });
        }
        break;

      case 'constructed':
        if (!preparationData.constructed) {
          return new Response(JSON.stringify({ error: 'Constructed preparation data required' }), { status: 400 });
        }
        
        const constructedData = preparationData.constructed;
        isComplete = constructedData.deckSelected && constructedData.deckValidated && !!constructedData.deckId;
        deckSubmitted = isComplete;
        break;
    }

    // Merge with existing preparation data
    const currentPrepData = registration.preparationData as Record<string, unknown> || {};
    const updatedPrepData = {
      ...currentPrepData,
      ...preparationData,
      // Mark ready for lobby list UX once a valid deck is submitted
      ready: isComplete ? true : (currentPrepData as { ready?: boolean })?.ready ?? false,
      lastUpdated: new Date().toISOString(),
      isComplete
    };

    // Update registration
    const newStatus = isComplete ? 'completed' : 'inProgress';
    
    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        preparationStatus: newStatus,
        deckSubmitted,
        preparationData: JSON.parse(JSON.stringify(updatedPrepData))
      }
    });

    console.log(`Preparation updated for player ${session.user.id}: ${newStatus}, deckSubmitted: ${deckSubmitted}`);

    // Broadcast preparation progress
    try {
      const [readyCount, totalCount] = await Promise.all([
        prisma.tournamentRegistration.count({ where: { tournamentId: id, preparationStatus: 'completed', deckSubmitted: true, seatStatus: 'active' } }),
        prisma.tournamentRegistration.count({ where: { tournamentId: id, seatStatus: 'active' } })
      ]);
      await tournamentSocketService.broadcastPreparationUpdate(
        id,
        session.user.id,
        newStatus,
        readyCount,
        totalCount,
        deckSubmitted
      );
    } catch (socketErr) {
      console.warn('Failed to broadcast preparation update:', socketErr);
    }

    // Check if all players are ready to start matches; host will manually trigger rounds
    if (isComplete) {
      await checkAndTransitionToActivePhase(id);
    }

    return new Response(JSON.stringify({
      success: true,
      preparationStatus: newStatus,
      deckSubmitted,
      preparationData: updatedPrepData,
      isComplete
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: unknown) {
    console.error('Error submitting preparation:', e);
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// Helper function to validate deck list
function validateDeckList(deckList: Array<{ cardId: string; quantity: number }>) {
  const totalCards = getTotalCards(deckList);
  if (totalCards < MIN_DECK_CARDS) return false;
  // Basic sanity checks: positive integer quantities
  for (const card of deckList) {
    if (!Number.isInteger(card.quantity) || card.quantity <= 0) return false;
  }
  // Detailed legality (copy limits, composition) is enforced by the deck editor and match server.
  return true;
}

// Helper function to check if tournament should transition to active phase
async function checkAndTransitionToActivePhase(tournamentId: string) {
  const [allRegistrations, tournament] = await Promise.all([
    prisma.tournamentRegistration.findMany({
      where: { tournamentId, seatStatus: 'active' },
      select: { preparationStatus: true, deckSubmitted: true }
    }),
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, name: true, settings: true }
    })
  ]);

  if (!tournament) return false;

  const registrationSettings = getRegistrationSettings(tournament.settings);
  if (registrationSettings.mode === 'open' && !registrationSettings.locked) {
    return false;
  }

  const allComplete = allRegistrations.every(reg => 
    reg.preparationStatus === 'completed' && reg.deckSubmitted
  );

  if (!allComplete || tournament.status === 'active') {
    return false;
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: 'active' }
  });

  console.log(`Tournament ${tournamentId} transitioned to active phase - host may start Round 1 manually`);

  // Create a pending first round with proposed pairings if none exist yet
  const existingRound = await prisma.tournamentRound.findFirst({
    where: { tournamentId },
    select: { id: true }
  });

  if (!existingRound) {
    const pairings = await generatePairings(tournamentId);
    const pendingRound = await prisma.tournamentRound.create({
      data: {
        tournamentId,
        roundNumber: 1,
        status: 'pending',
        pairingData: {
          algorithm: 'swiss',
          seed: Date.now(),
          byes: pairings.byes.map((bye) => bye.playerId)
        }
      }
    });

    await createRoundMatches(tournamentId, pendingRound.id, pairings, {
      assignMatches: false,
      applyByes: false
    });
  }

  try {
    await tournamentSocketService.broadcastPhaseChanged(tournamentId, 'active', {
      previousStatus: 'preparing',
      message: 'All players ready. Host can start the next round when ready.'
    });
    await tournamentSocketService.broadcastTournamentUpdateById(tournamentId);
  } catch (socketError) {
    console.warn('Failed to broadcast phase change:', socketError);
  }

  return true;
}
