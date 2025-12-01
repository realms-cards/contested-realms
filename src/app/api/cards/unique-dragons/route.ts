import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/cards/unique-dragons
 * Returns all Unique Dragon cards that can be chosen as a Dragonlord champion
 */
export async function GET(_req: NextRequest) {
  try {
    // Find cards where any variant has "Unique Dragon" in its typeText
    const dragons = await prisma.card.findMany({
      where: {
        variants: {
          some: {
            typeText: {
              contains: "Unique Dragon",
              mode: "insensitive",
            },
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
        variants: {
          select: {
            id: true,
            slug: true,
            setId: true,
            typeText: true,
          },
          where: {
            typeText: {
              contains: "Unique Dragon",
              mode: "insensitive",
            },
          },
          take: 1,
        },
        meta: {
          select: {
            setId: true,
            rulesText: true,
            thresholds: true,
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
