import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/cards/unique-dragons
 * Returns all Unique Dragon cards that can be chosen as a Dragonlord champion
 */
export async function GET() {
  try {
    // Find cards that are Unique rarity AND have "Dragon" in subTypes
    // This is more reliable than checking typeText which varies in format
    const dragons = await prisma.card.findMany({
      where: {
        // Card must have Dragon in its subTypes
        subTypes: {
          contains: "Dragon",
          mode: "insensitive",
        },
        // Card must have Unique rarity in its metadata
        meta: {
          some: {
            rarity: "Unique",
          },
        },
        // Exclude Dragonlord itself (it's the avatar, not a champion option)
        NOT: {
          name: "Dragonlord",
        },
      },
      select: {
        id: true,
        name: true,
        elements: true,
        subTypes: true,
        variants: {
          select: {
            id: true,
            slug: true,
            setId: true,
            typeText: true,
          },
          take: 1,
        },
        meta: {
          select: {
            setId: true,
            rarity: true,
            rulesText: true,
            thresholds: true,
          },
          where: {
            rarity: "Unique",
          },
          take: 1,
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    // Format response
    const formatted = dragons.map((dragon) => ({
      cardId: dragon.id,
      name: dragon.name,
      elements: dragon.elements,
      slug: dragon.variants[0]?.slug ?? null,
      variantId: dragon.variants[0]?.id ?? null,
      typeText: dragon.variants[0]?.typeText ?? null,
      rulesText: dragon.meta[0]?.rulesText ?? null,
      thresholds: dragon.meta[0]?.thresholds ?? null,
    }));

    return new Response(JSON.stringify({ dragons: formatted }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
