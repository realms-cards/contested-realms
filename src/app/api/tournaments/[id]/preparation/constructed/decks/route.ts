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
    const url = new URL(req.url);
    const sp = url.searchParams;
    const includePublic = sp.get('includePublic') === 'true';
    const userId = session.user.id;
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
        userId
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
    const allowedFormatsRaw = (constructedConfig as Record<string, unknown>).allowedFormats;
    const allowedFormats = Array.isArray(allowedFormatsRaw)
      ? (allowedFormatsRaw.filter((v): v is string => typeof v === 'string'))
      : [];

    // Prepare to validate deck composition according to official constructed rules
    const baseMyDecks = playerDecks; // Do not filter by textual format; validity is enforced below

    let publicDecks: Array<{ id: string; name: string; format: string | null }> = [];
    if (includePublic) {
      try {
        const decksUrl = new URL('/api/decks', url.origin);
        const decksRes = await fetch(decksUrl.toString(), { headers: req.headers });
        const decksJson = await decksRes.json();
        if (decksRes.ok && Array.isArray(decksJson?.publicDecks)) {
          publicDecks = (decksJson.publicDecks as Array<{ id: string; name: string; format: string | null }>);
        }
      } catch (e) {
        console.warn('Failed to fetch public decks from /api/decks:', e);
      }
    }

    // Validate constructed rules for both my decks and public decks
    const allForValidation = [...baseMyDecks.map(d => d.id), ...publicDecks.map(d => d.id)];
    const deckCards = allForValidation.length
      ? await prisma.deckCard.findMany({
          where: { deckId: { in: allForValidation } },
          select: {
            deckId: true,
            cardId: true,
            setId: true,
            zone: true,
            count: true,
            variant: { select: { typeText: true } },
          }
        })
      : [];
    // Build meta fallback map (cardId,setId -> type)
    const pairs = deckCards
      .filter(dc => dc.setId != null)
      .map(dc => ({ cardId: dc.cardId, setId: dc.setId as number }));
    const metaMap = new Map<string, string>();
    if (pairs.length) {
      const metas = await prisma.cardSetMetadata.findMany({
        where: { OR: pairs },
        select: { cardId: true, setId: true, type: true },
      });
      for (const m of metas) metaMap.set(`${m.cardId}:${m.setId}`, m.type);
    }

    const constructedValidityByDeck = new Map<string, { avatarCount: number; spellbook: number; atlas: number; valid: boolean }>();
    for (const dc of deckCards) {
      const key = dc.deckId as string;
      let agg = constructedValidityByDeck.get(key);
      if (!agg) {
        agg = { avatarCount: 0, spellbook: 0, atlas: 0, valid: false };
        constructedValidityByDeck.set(key, agg);
      }
      // Count zones
      const qty = Number(dc.count || 0);
      if (dc.zone === 'Spellbook') agg.spellbook += qty;
      if (dc.zone === 'Atlas') agg.atlas += qty;
      // Avatar detection via variant or CardSetMetadata fallback
      const type = (dc.variant?.typeText || (dc.setId != null ? metaMap.get(`${dc.cardId}:${dc.setId}`) : undefined) || '').toLowerCase();
      if (type.includes('avatar')) {
        agg.avatarCount += qty;
      }
    }
    // Finalize validity
    for (const [deckId, agg] of constructedValidityByDeck) {
      agg.valid = (agg.avatarCount === 1) && (agg.spellbook >= 50) && (agg.atlas >= 30);
    }
    const isDeckValid = (id: string) => constructedValidityByDeck.get(id)?.valid === true;

    const validMyDecks = baseMyDecks.filter(d => isDeckValid(d.id));
    publicDecks = publicDecks.filter(d => isDeckValid(d.id));

    // Get currently selected deck from preparation data
    const prepData = registration.preparationData as Record<string, unknown> || {};
    const constructedData = prepData.constructed as Record<string, unknown> || {};
    const selectedDeckId = constructedData.deckId as string || null;

    return new Response(JSON.stringify({
      tournamentId: id,
      playerId: session.user.id,
      format: 'constructed',
      // New shape
      myDecks: validMyDecks,
      publicDecks,
      // Back-compat
      availableDecks: validMyDecks,
      selectedDeckId,
      allowedFormats,
      deckRequirements: {
        minimumCards: 50,
        minimumAtlas: 30,
        avatar: 1,
        maximumCards: null,
        sideboardAllowed: true,
        validationRequired: true
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
    const deckFull = await prisma.deck.findFirst({
      where: { id: deckId },
      include: { cards: { select: { cardId: true, setId: true, zone: true, count: true, variantId: true, variant: { select: { typeText: true } } } } }
    });

    if (!deckFull) {
      return new Response(JSON.stringify({ error: 'Deck not found' }), { status: 404 });
    }

    // Validate deck meets tournament requirements
    const settings = registration.tournament.settings as Record<string, unknown> || {};
    const constructedConfig = settings.constructed as Record<string, unknown> || {};
    const allowedFormats = constructedConfig.allowedFormats as string[] || ['standard', 'pioneer', 'modern'];

    if (allowedFormats.length > 0 && !allowedFormats.includes(deckFull.format || 'constructed')) {
      return new Response(JSON.stringify({ 
        error: `Deck format '${deckFull.format}' not allowed. Allowed formats: ${allowedFormats.join(', ')}` 
      }), { status: 400 });
    }

    // Validate official constructed rules: exactly 1 Avatar, >=50 in Spellbook, >=30 in Atlas
    const pairsSel = deckFull.cards.filter(c => c.setId != null).map(c => ({ cardId: c.cardId, setId: c.setId as number }));
    const metaSel = new Map<string, string>();
    if (pairsSel.length) {
      const metas = await prisma.cardSetMetadata.findMany({ where: { OR: pairsSel }, select: { cardId: true, setId: true, type: true } });
      for (const m of metas) metaSel.set(`${m.cardId}:${m.setId}`, m.type);
    }
    let avatarCount = 0; let spellbook = 0; let atlas = 0;
    for (const c of deckFull.cards) {
      const qty = Number(c.count || 0);
      if (c.zone === 'Spellbook') spellbook += qty;
      if (c.zone === 'Atlas') atlas += qty;
      const type = (c.variant?.typeText || (c.setId != null ? metaSel.get(`${c.cardId}:${c.setId}`) : undefined) || '').toLowerCase();
      if (type.includes('avatar')) avatarCount += qty;
    }
    const isConstructedValid = (avatarCount === 1) && (spellbook >= 50) && (atlas >= 30);
    if (!isConstructedValid) {
      return new Response(JSON.stringify({ error: `Deck does not meet constructed rules (avatar=${avatarCount}, spellbook=${spellbook}, atlas=${atlas}).` }), { status: 400 });
    }

    // If the deck is not owned by the player, allow selection only if it's public by cloning it to the player's account
    let selectedDeckIdFinal = deckFull.id;
    let selectedDeckNameFinal = deckFull.name;
    let selectedDeckFormatFinal = deckFull.format;
    if (deckFull.userId !== session.user.id) {
      // Check public (use scalar field on the fetched deck)
      if (!(deckFull as { isPublic?: boolean }).isPublic) {
        return new Response(JSON.stringify({ error: 'Deck is not available for public use' }), { status: 403 });
      }
      // Clone deck
      const cloned = await prisma.deck.create({
        data: {
          userId: session.user.id,
          name: deckFull.name,
          format: 'constructed',
          cards: {
            create: deckFull.cards.map((c) => ({
              cardId: c.cardId,
              setId: c.setId,
              variantId: c.variantId,
              zone: c.zone,
              count: c.count,
            }))
          }
        }
      });
      selectedDeckIdFinal = cloned.id;
      selectedDeckNameFinal = cloned.name;
      selectedDeckFormatFinal = cloned.format;
    }

    // Update preparation data
    const currentPrepData = registration.preparationData as Record<string, unknown> || {};
    const updatedConstructedData = {
      deckSelected: true,
      deckId: selectedDeckIdFinal,
      deckName: selectedDeckNameFinal,
      deckFormat: selectedDeckFormatFinal,
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
        id: selectedDeckIdFinal,
        name: selectedDeckNameFinal,
        format: selectedDeckFormatFinal
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