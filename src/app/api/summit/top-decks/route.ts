import { NextRequest } from "next/server";
import { getCachedSummitTopDecks, refreshSummitTopDecks } from "@/lib/summit/top-decks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET  — the cached top decks of the last Sorcerers Summit season (null until first refresh).
 * POST — rebuild the list. Protected by CRON_SECRET; Vercel Cron calls it on Mondays.
 *
 * Only public sorcerytcg.com deck links are stored, never Summit's own deck contents or any
 * player's match history. See lib/summit/top-decks.ts.
 */
export async function GET() {
  const decks = await getCachedSummitTopDecks();
  return Response.json(decks ?? { decks: [] }, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SORCERERS_SUMMIT_API_KEY) {
    return Response.json({ error: "SORCERERS_SUMMIT_API_KEY is not configured." }, { status: 503 });
  }
  const started = performance.now();
  const force = new URL(req.url).searchParams.get("force") === "1";
  const { status, decks } = await refreshSummitTopDecks(force);
  if (status === "empty" && !decks) {
    return Response.json({ error: "Could not build the list from Sorcerers Summit." }, { status: 502 });
  }
  return Response.json({
    success: true,
    status,
    bracket: decks?.bracketName ?? null,
    decks: decks?.decks.length ?? 0,
    durationMs: Math.round(performance.now() - started),
  });
}
