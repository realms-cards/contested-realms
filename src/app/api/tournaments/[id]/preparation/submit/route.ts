import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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
        isComplete = sealedData.packsOpened && sealedData.deckBuilt && sealedData.deckList.length >= 40;
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
        isComplete = draftData.draftCompleted && draftData.deckBuilt && draftData.deckList.length >= 40;
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

    // Check if all players are ready to start matches
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
  if (deckList.length < 40) return false;
  
  const totalCards = deckList.reduce((sum, card) => sum + card.quantity, 0);
  if (totalCards < 40) return false;
  
  // Check for invalid quantities (max 4 of any card except basic lands)
  for (const card of deckList) {
    if (card.quantity > 4 && !isBasicLand(card.cardId)) {
      return false;
    }
  }
  
  return true;
}

// Helper function to check if a card is a basic land
function isBasicLand(cardId: string) {
  const basicLands = ['mountain', 'island', 'forest', 'plains', 'swamp'];
  return basicLands.includes(cardId.toLowerCase());
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