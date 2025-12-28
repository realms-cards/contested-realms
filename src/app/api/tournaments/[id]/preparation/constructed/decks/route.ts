import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { CONSTRUCTED_REQUIREMENTS } from "@/lib/deck/validation-rules";
import { prisma } from "@/lib/prisma";
import { tournamentSocketService } from "@/lib/services/tournament-broadcast";
import {
  buildTournamentDeckList,
  deckCardSelect,
  type DeckCardWithRelations,
} from "@/lib/tournament/deck-utils";
import { createRoundMatches, generatePairings } from "@/lib/tournament/pairing";
import { getRegistrationSettings } from "@/lib/tournament/registration";

export const dynamic = "force-dynamic";

// GET /api/tournaments/[id]/preparation/constructed/decks
// Get available decks for constructed format
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "User ID missing from session" }),
        { status: 400 }
      );
    }

    const url = new URL(req.url);
    const sp = url.searchParams;
    const includePublic = sp.get("includePublic") === "true";

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
          },
        },
      },
    });

    if (!registration) {
      return new Response(
        JSON.stringify({ error: "Not registered for this tournament" }),
        { status: 404 }
      );
    }

    if (registration.tournament.format !== "constructed") {
      return new Response(
        JSON.stringify({ error: "Tournament is not constructed format" }),
        { status: 400 }
      );
    }

    if (registration.tournament.status !== "preparing") {
      return new Response(
        JSON.stringify({ error: "Tournament is not in preparation phase" }),
        { status: 400 }
      );
    }

    // Get player's decks that are valid for this tournament
    const playerDecks = await prisma.deck.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        name: true,
        format: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // Filter decks based on tournament format restrictions
    const settings =
      (registration.tournament.settings as Record<string, unknown>) || {};
    const constructedConfig =
      (settings.constructed as Record<string, unknown>) || {};
    const allowedFormatsRaw = (constructedConfig as Record<string, unknown>)
      .allowedFormats;
    const allowedFormats = Array.isArray(allowedFormatsRaw)
      ? allowedFormatsRaw.filter((v): v is string => typeof v === "string")
      : [];

    // Prepare to validate deck composition according to official constructed rules
    const baseMyDecks = playerDecks; // Do not filter by textual format; validity is enforced below

    let publicDecks: Array<{
      id: string;
      name: string;
      format: string | null;
    }> = [];
    if (includePublic) {
      try {
        const decksUrl = new URL("/api/decks", url.origin);
        const decksRes = await fetch(decksUrl.toString(), {
          headers: req.headers,
        });
        const decksJson = await decksRes.json();
        if (decksRes.ok && Array.isArray(decksJson?.publicDecks)) {
          publicDecks = decksJson.publicDecks as Array<{
            id: string;
            name: string;
            format: string | null;
          }>;
        }
      } catch (e) {
        console.warn("Failed to fetch public decks from /api/decks:", e);
      }
    }

    // Validate constructed rules for both my decks and public decks
    const allForValidation = [
      ...baseMyDecks.map((d) => d.id),
      ...publicDecks.map((d) => d.id),
    ];
    console.log("[Constructed Decks] Validating decks:", allForValidation);
    console.log(
      "[Constructed Decks] baseMyDecks:",
      baseMyDecks.map((d) => ({ id: d.id, name: d.name }))
    );
    console.log("[Constructed Decks] publicDecks count:", publicDecks.length);

    const deckCards = allForValidation.length
      ? await prisma.deckCard.findMany({
          where: { deckId: { in: allForValidation } },
          select: {
            deckId: true,
            cardId: true,
            setId: true,
            zone: true,
            count: true,
            variant: { select: { typeText: true, setId: true } },
            card: { select: { name: true } },
          },
        })
      : [];
    console.log("[Constructed Decks] Found deck cards:", deckCards.length);
    // Build meta fallback map (cardId,setId -> type)
    // Include both DeckCard.setId and Variant.setId for lookup
    const pairs = deckCards
      .map((dc) => {
        const sId = dc.setId ?? dc.variant?.setId ?? null;
        return sId != null ? { cardId: dc.cardId, setId: sId } : null;
      })
      .filter((p): p is { cardId: number; setId: number } => p !== null);
    const metaMap = new Map<string, string>();
    if (pairs.length) {
      const metas = await prisma.cardSetMetadata.findMany({
        where: { OR: pairs },
        select: { cardId: true, setId: true, type: true },
      });
      for (const m of metas) metaMap.set(`${m.cardId}:${m.setId}`, m.type);
    }
    console.log("[Constructed Decks] MetaMap size:", metaMap.size);

    const constructedValidityByDeck = new Map<
      string,
      {
        avatarCount: number;
        spellbook: number;
        atlas: number;
        collection: number;
        hasDragonlordAvatar: boolean;
        valid: boolean;
      }
    >();
    for (const dc of deckCards) {
      const key = dc.deckId as string;
      let agg = constructedValidityByDeck.get(key);
      if (!agg) {
        agg = {
          avatarCount: 0,
          spellbook: 0,
          atlas: 0,
          collection: 0,
          hasDragonlordAvatar: false,
          valid: false,
        };
        constructedValidityByDeck.set(key, agg);
      }
      // Count zones
      const qty = Number(dc.count || 0);
      if (dc.zone === "Spellbook") agg.spellbook += qty;
      if (dc.zone === "Atlas") agg.atlas += qty;
      if (dc.zone === "Collection") agg.collection += qty;
      // Avatar detection - use metadata.type from CardSetMetadata (not typeText which is flavor text)
      // Use DeckCard.setId or fall back to Variant.setId for metaMap lookup
      const effectiveSetId = dc.setId ?? dc.variant?.setId ?? null;
      const type = (
        effectiveSetId != null
          ? metaMap.get(`${dc.cardId}:${effectiveSetId}`) || ""
          : ""
      ).toLowerCase();
      if (type.includes("avatar")) {
        console.log(`[Constructed Decks] Found avatar in deck ${key}:`, {
          cardId: dc.cardId,
          name: dc.card?.name,
          type,
          qty,
        });
        agg.avatarCount += qty;
        const cardName = dc.card?.name?.toLowerCase() || "";
        if (cardName === "dragonlord") {
          agg.hasDragonlordAvatar = true;
        }
      }
    }
    // Log sample of deck cards for debugging
    if (deckCards.length > 0) {
      const sample = deckCards.slice(0, 3);
      console.log(
        "[Constructed Decks] Sample deck cards:",
        sample.map((dc) => ({
          deckId: dc.deckId,
          cardId: dc.cardId,
          zone: dc.zone,
          count: dc.count,
          typeText: dc.variant?.typeText,
          setId: dc.setId,
          variantSetId: dc.variant?.setId,
        }))
      );
    }
    // Look up champion assignment for decks so Dragonlord decks require a champion
    const championRows = allForValidation.length
      ? await prisma.deck.findMany({
          where: { id: { in: allForValidation } },
          select: { id: true, championCardId: true },
        })
      : [];
    const championByDeckId = new Map<string, number | null>();
    for (const row of championRows) {
      championByDeckId.set(row.id, row.championCardId ?? null);
    }

    const {
      minSpellbook,
      minAtlas,
      maxCollection,
      avatarCount: requiredAvatars,
    } = CONSTRUCTED_REQUIREMENTS;

    // Finalize validity
    for (const [deckId, agg] of constructedValidityByDeck) {
      const meetsCounts =
        agg.avatarCount === requiredAvatars &&
        agg.spellbook >= minSpellbook &&
        agg.atlas >= minAtlas &&
        (maxCollection == null || agg.collection <= maxCollection);

      const championCardId = championByDeckId.get(deckId) ?? null;
      const needsChampion = agg.hasDragonlordAvatar;
      const championOk = !needsChampion || championCardId != null;

      agg.valid = meetsCounts && championOk;

      console.log(`[Constructed Decks] Deck ${deckId}:`, {
        avatarCount: agg.avatarCount,
        spellbook: agg.spellbook,
        atlas: agg.atlas,
        collection: agg.collection,
        hasDragonlordAvatar: agg.hasDragonlordAvatar,
        championCardId,
        meetsCounts,
        championOk,
        valid: agg.valid,
        requirements: {
          requiredAvatars,
          minSpellbook,
          minAtlas,
          maxCollection,
        },
      });
    }
    const isDeckValid = (id: string) =>
      constructedValidityByDeck.get(id)?.valid === true;

    const validMyDecks = baseMyDecks.filter((d) => isDeckValid(d.id));
    publicDecks = publicDecks.filter((d) => isDeckValid(d.id));

    console.log(
      "[Constructed Decks] Valid decks:",
      validMyDecks.map((d) => d.id),
      "Public valid:",
      publicDecks.length
    );

    // Get currently selected deck from preparation data
    const prepData =
      (registration.preparationData as Record<string, unknown>) || {};
    const constructedData =
      (prepData.constructed as Record<string, unknown>) || {};
    const selectedDeckId = (constructedData.deckId as string) || null;

    return new Response(
      JSON.stringify({
        tournamentId: id,
        playerId: session.user.id,
        format: "constructed",
        // New shape
        myDecks: validMyDecks,
        publicDecks,
        // Back-compat
        availableDecks: validMyDecks,
        selectedDeckId,
        allowedFormats,
        deckRequirements: {
          minimumCards: CONSTRUCTED_REQUIREMENTS.minSpellbook,
          minimumAtlas: CONSTRUCTED_REQUIREMENTS.minAtlas,
          avatar: CONSTRUCTED_REQUIREMENTS.avatarCount,
          maximumCards: CONSTRUCTED_REQUIREMENTS.maxSpellbook,
          maxCollection: CONSTRUCTED_REQUIREMENTS.maxCollection,
          sideboardAllowed: CONSTRUCTED_REQUIREMENTS.sideboardAllowed,
          validationRequired: true,
        },
        settings: constructedConfig,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e: unknown) {
    console.error("Error getting constructed decks:", e);
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// POST /api/tournaments/[id]/preparation/constructed/decks
// Select a deck for constructed tournament
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  try {
    const userId = (session.user as { id?: string }).id;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "User ID missing from session" }),
        { status: 400 }
      );
    }

    const body = await req.json();
    const { deckId } = body;

    if (!deckId || typeof deckId !== "string") {
      return new Response(JSON.stringify({ error: "deckId is required" }), {
        status: 400,
      });
    }

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
          },
        },
      },
    });

    if (!registration) {
      return new Response(
        JSON.stringify({ error: "Not registered for this tournament" }),
        { status: 404 }
      );
    }

    if (registration.tournament.format !== "constructed") {
      return new Response(
        JSON.stringify({ error: "Tournament is not constructed format" }),
        { status: 400 }
      );
    }

    if (registration.preparationStatus !== "inProgress") {
      return new Response(
        JSON.stringify({ error: "Preparation not started. Call /start first" }),
        { status: 400 }
      );
    }

    // Validate the selected deck
    const deckFull = await prisma.deck.findFirst({
      where: { id: deckId },
      select: {
        id: true,
        userId: true,
        name: true,
        format: true,
        isPublic: true,
        cards: {
          select: deckCardSelect,
        },
      },
    });

    if (!deckFull) {
      return new Response(JSON.stringify({ error: "Deck not found" }), {
        status: 404,
      });
    }

    // For constructed tournaments, we don't validate textual deck format - we only validate constructed rules below
    // (avatar count, spellbook size, atlas size)

    // Validate official constructed rules: exactly 1 Avatar, >=60 in Spellbook, >=30 in Atlas
    const pairsSel = deckFull.cards
      .filter((c) => c.setId != null)
      .map((c) => ({ cardId: c.cardId, setId: c.setId as number }));
    const metaSel = new Map<string, string>();
    if (pairsSel.length) {
      const metas = await prisma.cardSetMetadata.findMany({
        where: { OR: pairsSel },
        select: { cardId: true, setId: true, type: true },
      });
      for (const m of metas) metaSel.set(`${m.cardId}:${m.setId}`, m.type);
    }
    let avatarCount = 0;
    let spellbook = 0;
    let atlas = 0;
    for (const c of deckFull.cards) {
      const qty = Number(c.count || 0);
      if (c.zone === "Spellbook") spellbook += qty;
      if (c.zone === "Atlas") atlas += qty;
      // Use metadata.type from CardSetMetadata (not typeText which is flavor text)
      const type = (
        c.setId != null ? metaSel.get(`${c.cardId}:${c.setId}`) || "" : ""
      ).toLowerCase();
      if (type.includes("avatar")) avatarCount += qty;
    }
    const isConstructedValid =
      avatarCount === 1 && spellbook >= 60 && atlas >= 30;
    if (!isConstructedValid) {
      return new Response(
        JSON.stringify({
          error: `Deck does not meet constructed rules (avatar=${avatarCount}, spellbook=${spellbook}, atlas=${atlas}).`,
        }),
        { status: 400 }
      );
    }

    // If the deck is not owned by the player, allow selection only if it's public by cloning it to the player's account
    let selectedDeckIdFinal = deckFull.id;
    let selectedDeckNameFinal = deckFull.name;
    let selectedDeckFormatFinal = deckFull.format;
    if (deckFull.userId !== userId) {
      // Check public
      if (!deckFull.isPublic) {
        return new Response(
          JSON.stringify({ error: "Deck is not available for public use" }),
          { status: 403 }
        );
      }
      // Clone deck
      const cloned = await prisma.deck.create({
        data: {
          userId,
          name: deckFull.name,
          format: "constructed",
          cards: {
            create: deckFull.cards.map((c) => ({
              cardId: c.cardId,
              setId: c.setId,
              variantId: c.variantId,
              zone: c.zone,
              count: c.count,
            })),
          },
        },
      });
      selectedDeckIdFinal = cloned.id;
      selectedDeckNameFinal = cloned.name;
      selectedDeckFormatFinal = cloned.format;
    }

    // Update preparation data
    const currentPrepData =
      (registration.preparationData as Record<string, unknown>) || {};
    // Convert deck to deckList format (same as sealed/draft)
    const deckListRaw = buildTournamentDeckList(
      deckFull.cards as DeckCardWithRelations[]
    );
    const deckList = JSON.parse(JSON.stringify(deckListRaw));

    const updatedConstructedData = {
      deckSelected: true,
      deckId: selectedDeckIdFinal,
      deckName: selectedDeckNameFinal,
      deckFormat: selectedDeckFormatFinal,
      deckValidated: true,
      selectedAt: new Date().toISOString(),
      deckList, // Store deck list like sealed/draft (already normalized)
    };

    const updatedPrepData = {
      ...currentPrepData,
      constructed: updatedConstructedData,
      isComplete: true,
    };

    await prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        preparationStatus: "completed",
        deckSubmitted: true,
        preparationData: JSON.parse(JSON.stringify(updatedPrepData)),
      },
    });

    console.log(
      `Player ${userId} selected deck ${deckId} for tournament ${id}`
    );

    // Broadcast preparation update so UI syncs immediately
    try {
      const [readyCount, totalCount] = await Promise.all([
        prisma.tournamentRegistration.count({
          where: {
            tournamentId: id,
            preparationStatus: "completed",
            deckSubmitted: true,
            seatStatus: "active",
          },
        }),
        prisma.tournamentRegistration.count({
          where: { tournamentId: id, seatStatus: "active" },
        }),
      ]);

      await tournamentSocketService.broadcastPreparationUpdate(
        id,
        userId,
        "completed",
        readyCount,
        totalCount,
        true
      );
    } catch (socketError) {
      console.warn("Failed to broadcast preparation update:", socketError);
    }

    // Check if all players are ready to transition to active phase. Host controls round start.
    await checkAndTransitionToActivePhase(id);

    return new Response(
      JSON.stringify({
        success: true,
        selectedDeck: {
          id: selectedDeckIdFinal,
          name: selectedDeckNameFinal,
          format: selectedDeckFormatFinal,
        },
        preparationStatus: "completed",
        deckSubmitted: true,
        preparationData: updatedPrepData,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  } catch (e: unknown) {
    console.error("Error selecting constructed deck:", e);
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

// Helper function to check if tournament should transition to active phase
async function checkAndTransitionToActivePhase(tournamentId: string) {
  const [allRegistrations, tournament] = await Promise.all([
    prisma.tournamentRegistration.findMany({
      where: { tournamentId, seatStatus: "active" },
      select: { preparationStatus: true, deckSubmitted: true },
    }),
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { status: true, settings: true },
    }),
  ]);

  if (!tournament) return;

  const registrationSettings = getRegistrationSettings(tournament.settings);
  if (registrationSettings.mode === "open" && !registrationSettings.locked) {
    return;
  }

  const allComplete = allRegistrations.every(
    (reg) => reg.preparationStatus === "completed" && reg.deckSubmitted
  );

  if (!allComplete || tournament.status === "active") {
    return;
  }

  await prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "active" },
  });

  console.log(
    `Tournament ${tournamentId} transitioned to active phase - host may start Round 1 manually`
  );

  // Create a pending first round with proposed pairings if none exist yet
  const existingRound = await prisma.tournamentRound.findFirst({
    where: { tournamentId },
    select: { id: true },
  });

  if (!existingRound) {
    const pairings = await generatePairings(tournamentId);
    const pendingRound = await prisma.tournamentRound.create({
      data: {
        tournamentId,
        roundNumber: 1,
        status: "pending",
        pairingData: {
          algorithm: "swiss",
          seed: Date.now(),
          byes: pairings.byes.map((bye) => bye.playerId),
        },
      },
    });

    await createRoundMatches(tournamentId, pendingRound.id, pairings, {
      assignMatches: false,
      applyByes: false,
    });
  }

  try {
    await tournamentSocketService.broadcastPhaseChanged(
      tournamentId,
      "active",
      {
        previousStatus: "preparing",
        message: "All players ready. Host can start the next round when ready.",
      }
    );
    await tournamentSocketService.broadcastTournamentUpdateById(tournamentId);
  } catch (socketError) {
    console.warn("Failed to broadcast phase change:", socketError);
  }
}
