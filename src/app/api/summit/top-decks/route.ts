import { NextRequest } from "next/server";
import { getCachedSummitTopDecks, refreshSummitTopDecks } from "@/lib/summit/top-decks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The top 8 of the most recent offline tournament collected on sorcererssummit.com/top-8.
 *
 * GET  — serves the cache. When the caller is Vercel Cron it ALSO refreshes first: Vercel Cron
 *        only ever issues a GET, so the Monday job (vercel.json) was hitting a read-only handler
 *        and the list could never update on its own. The refresh still asks the cheap question
 *        first and does nothing unless a new event has been collected.
 * POST — a manual refresh, with `?force=1` to skip the new-event check.
 *
 * Only public sorcerytcg.com deck links are stored. See lib/summit/top-decks.ts.
 */

/** Is this the scheduler, rather than a visitor? */
function isCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  // Vercel marks its own cron invocations; only trust it when no secret is configured to check.
  return !secret && req.headers.get("x-vercel-cron") === "1";
}

/**
 * Who may trigger a refresh. With CRON_SECRET set it is the only key. Without one we allow it
 * in development only — an unset secret used to mean "no check at all", which left a public
 * endpoint that makes outbound requests on demand.
 */
function mayRefresh(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  return process.env.NODE_ENV !== "production" || req.headers.get("x-vercel-cron") === "1";
}

async function refresh(req: NextRequest) {
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
    event: decks?.eventName ?? null,
    decks: decks?.decks.length ?? 0,
    durationMs: Math.round(performance.now() - started),
  });
}

export async function GET(req: NextRequest) {
  if (isCron(req)) return refresh(req);
  const decks = await getCachedSummitTopDecks();
  return Response.json(decks ?? { decks: [] }, {
    headers: { "cache-control": "public, max-age=3600" },
  });
}

export async function POST(req: NextRequest) {
  if (!mayRefresh(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return refresh(req);
}
