import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAffiliateLink,
  buildPriceCacheKey,
} from "@/lib/collection/pricing-provider";
import type { Finish } from "@prisma/client";

export const dynamic = "force-dynamic";

// POST /api/pricing/bulk
// Get pricing for multiple cards at once
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cards = Array.isArray(body?.cards) ? body.cards : [];

    if (cards.length === 0) {
      return new Response(JSON.stringify({ error: "No cards provided" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (cards.length > 100) {
      return new Response(
        JSON.stringify({ error: "Maximum 100 cards per request" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Get all card IDs
    const cardIds = [
      ...new Set(cards.map((c: { cardId: number }) => c.cardId)),
    ];

    // Fetch cards with their variants
    const dbCards = await prisma.card.findMany({
      where: { id: { in: cardIds } },
      include: {
        variants: {
          include: {
            set: true,
          },
        },
      },
    });

    // Build card lookup map
    const cardById = new Map(dbCards.map((c) => [c.id, c]));

    // Build price response
    const prices: Record<
      string,
      {
        marketPrice: number | null;
        currency: string;
        affiliateUrl: string;
      }
    > = {};
    const notFound: number[] = [];

    for (const input of cards) {
      const {
        cardId,
        variantId,
        finish = "Standard",
      } = input as {
        cardId: number;
        variantId?: number;
        finish?: Finish;
      };

      const card = cardById.get(cardId);
      if (!card) {
        notFound.push(cardId);
        continue;
      }

      // Find matching variant or use first one
      let variant = card.variants[0];
      if (variantId) {
        const specific = card.variants.find((v) => v.id === variantId);
        if (specific) variant = specific;
      } else if (finish) {
        const byFinish = card.variants.find((v) => v.finish === finish);
        if (byFinish) variant = byFinish;
      }

      const key = buildPriceCacheKey(cardId, variantId ?? null, finish);
      prices[key] = {
        marketPrice: null, // Real pricing not available without API
        currency: "USD",
        affiliateUrl: getAffiliateLink(card.name, variant?.set.name, finish),
      };
    }

    return new Response(
      JSON.stringify({
        prices,
        notFound,
        cacheHit: false, // No real caching without pricing data
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
