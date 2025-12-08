import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/cards/random-spell
 * Returns a random spell card (anything that is not a Site or Avatar).
 * Includes card name, type, slug, cost, thresholds, etc.
 */
export async function GET() {
  try {
    // Find all spell cards: type NOT LIKE '%Site%' AND type NOT LIKE '%Avatar%'
    // Use CardSetMetadata for type info, then pick a random variant
    const spellMeta = await prisma.cardSetMetadata.findMany({
      where: {
        AND: [
          { type: { not: { contains: "Site" } } },
          { type: { not: { contains: "Avatar" } } },
        ],
      },
      select: {
        cardId: true,
        setId: true,
        type: true,
        rarity: true,
        rulesText: true,
        cost: true,
        attack: true,
        defence: true,
        thresholds: true,
        card: {
          select: {
            id: true,
            name: true,
            elements: true,
            subTypes: true,
          },
        },
        set: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (spellMeta.length === 0) {
      return NextResponse.json(
        { error: "No spells found in database" },
        { status: 404 }
      );
    }

    // Pick a random spell
    const randomIndex = Math.floor(Math.random() * spellMeta.length);
    const spell = spellMeta[randomIndex];

    // Find a random variant for this card+set combo
    const variants = await prisma.variant.findMany({
      where: {
        cardId: spell.cardId,
        setId: spell.setId,
      },
      select: {
        id: true,
        slug: true,
        finish: true,
        product: true,
        artist: true,
        flavorText: true,
      },
    });

    // Prefer standard finish if available
    const standardVariant = variants.find((v) => v.finish === "Standard");
    const variant =
      standardVariant || variants[Math.floor(Math.random() * variants.length)];

    if (!variant) {
      // Fallback: pick any variant for this card
      const anyVariant = await prisma.variant.findFirst({
        where: { cardId: spell.cardId },
        select: {
          id: true,
          slug: true,
          finish: true,
          product: true,
          artist: true,
          flavorText: true,
        },
      });

      if (!anyVariant) {
        return NextResponse.json(
          { error: "No variant found for the spell" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        cardId: spell.card.id,
        variantId: anyVariant.id,
        name: spell.card.name,
        type: spell.type,
        slug: anyVariant.slug,
        set: spell.set.name,
        setId: spell.set.id,
        rarity: spell.rarity,
        rulesText: spell.rulesText,
        cost: spell.cost,
        attack: spell.attack,
        defence: spell.defence,
        thresholds: spell.thresholds,
        elements: spell.card.elements,
        subTypes: spell.card.subTypes,
        finish: anyVariant.finish,
        artist: anyVariant.artist,
        flavorText: anyVariant.flavorText,
      });
    }

    return NextResponse.json({
      cardId: spell.card.id,
      variantId: variant.id,
      name: spell.card.name,
      type: spell.type,
      slug: variant.slug,
      set: spell.set.name,
      setId: spell.set.id,
      rarity: spell.rarity,
      rulesText: spell.rulesText,
      cost: spell.cost,
      attack: spell.attack,
      defence: spell.defence,
      thresholds: spell.thresholds,
      elements: spell.card.elements,
      subTypes: spell.card.subTypes,
      finish: variant.finish,
      artist: variant.artist,
      flavorText: variant.flavorText,
    });
  } catch (error) {
    console.error("[API /cards/random-spell] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch random spell" },
      { status: 500 }
    );
  }
}
