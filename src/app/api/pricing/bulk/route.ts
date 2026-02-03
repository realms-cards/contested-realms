import type { Finish } from "@prisma/client";
import { NextRequest } from "next/server";
import { getPriceForCard } from "@/lib/collection/price-cache";
import {
  getAffiliateLink,
  buildPriceCacheKey,
} from "@/lib/collection/pricing-provider";
import { prisma } from "@/lib/prisma";

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
    const cardIds: number[] = Array.from(
      new Set<number>(cards.map((c: { cardId: number }) => c.cardId))
    );

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
        lowPrice: number | null;
        midPrice: number | null;
        highPrice: number | null;
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

      const setName = variant?.set.name;
      const priceData = setName
        ? await getPriceForCard(card.name, setName, finish)
        : null;

      const key = buildPriceCacheKey(cardId, variantId ?? null, finish);
      prices[key] = {
        marketPrice: priceData?.marketPrice ?? null,
        lowPrice: priceData?.lowPrice ?? null,
        midPrice: priceData?.midPrice ?? null,
        highPrice: priceData?.highPrice ?? null,
        currency: "USD",
        affiliateUrl:
          priceData?.affiliateUrl ??
          getAffiliateLink(card.name, setName, finish),
      };
    }

    return new Response(
      JSON.stringify({
        prices,
        notFound,
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
