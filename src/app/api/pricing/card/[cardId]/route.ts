import type { Finish } from "@prisma/client";
import { NextRequest } from "next/server";
import { getPriceForCard } from "@/lib/collection/price-cache";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/pricing/card/[cardId]
// Get pricing for a card
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    const { cardId: cardIdStr } = await params;
    const cardId = parseInt(cardIdStr, 10);

    if (isNaN(cardId)) {
      return new Response(JSON.stringify({ error: "Invalid card ID" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const { searchParams } = new URL(req.url);
    const variantIdParam = searchParams.get("variantId");
    const variantId = variantIdParam ? parseInt(variantIdParam, 10) : undefined;
    const finish = searchParams.get("finish") as Finish | undefined;

    // Get card with variants
    const card = await prisma.card.findUnique({
      where: { id: cardId },
      include: {
        variants: {
          include: {
            set: true,
          },
        },
      },
    });

    if (!card) {
      return new Response(JSON.stringify({ error: "Card not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    // Filter variants if specific variant/finish requested
    let variants = card.variants;
    if (variantId) {
      variants = variants.filter((v) => v.id === variantId);
    }
    if (finish) {
      variants = variants.filter((v) => v.finish === finish);
    }

    // Build price data for each variant using tcgcsv price cache
    const prices = await Promise.all(
      variants.map(async (v) => {
        const priceData = await getPriceForCard(
          card.name,
          v.set.name,
          v.finish,
        );

        return {
          variantId: v.id,
          setName: v.set.name,
          finish: v.finish,
          marketPrice: priceData?.marketPrice ?? null,
          lowPrice: priceData?.lowPrice ?? null,
          midPrice: priceData?.midPrice ?? null,
          highPrice: priceData?.highPrice ?? null,
          currency: "USD" as const,
          source: "tcgplayer" as const,
          lastUpdated: priceData?.lastUpdated ?? new Date().toISOString(),
        };
      }),
    );

    if (prices.length === 0) {
      return new Response(
        JSON.stringify({
          cardId,
          cardName: card.name,
          prices: [],
          message: "No pricing data available",
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        cardId,
        cardName: card.name,
        prices,
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
