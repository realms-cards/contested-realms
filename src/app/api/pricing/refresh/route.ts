import { NextRequest } from "next/server";
import { fetchAllPrices, getCacheSize } from "@/lib/collection/price-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s for fetching all groups

/**
 * POST /api/pricing/refresh
 *
 * Refreshes the price cache from tcgcsv.com.
 * Protected by CRON_SECRET — called by Vercel Cron daily.
 */
export async function POST(req: NextRequest) {
  // Verify authorization
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const startTime = performance.now();
    const result = await fetchAllPrices();
    const duration = Math.round(performance.now() - startTime);

    return new Response(
      JSON.stringify({
        success: true,
        pricesLoaded: result.pricesLoaded,
        cacheSize: getCacheSize(),
        errors: result.errors,
        durationMs: duration,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[pricing/refresh] failed:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

/**
 * GET /api/pricing/refresh
 *
 * Vercel Cron sends GET requests by default.
 * Redirect to POST handler.
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
