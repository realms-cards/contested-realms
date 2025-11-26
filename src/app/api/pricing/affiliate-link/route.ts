import { NextRequest } from "next/server";
import { getAffiliateLink } from "@/lib/collection/pricing-provider";
import type { Finish } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/pricing/affiliate-link
// Generate TCGPlayer affiliate link for a card name
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cardName = searchParams.get("cardName");
    const setName = searchParams.get("setName") || undefined;
    const finish = searchParams.get("finish") as Finish | undefined;

    if (!cardName) {
      return new Response(JSON.stringify({ error: "cardName is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const url = getAffiliateLink(cardName, setName, finish);
    const affiliateId = process.env.TCGPLAYER_AFFILIATE_ID || null;

    return new Response(
      JSON.stringify({
        url,
        affiliateId,
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
