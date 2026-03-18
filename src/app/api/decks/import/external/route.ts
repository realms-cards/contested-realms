import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { invalidateCache, CacheKeys } from "@/lib/cache/redis-cache";
import { resolveCardNames } from "@/lib/decks/card-resolver";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/decks/import/external
// Body: { text: string, name?: string, source?: string }
//
// Accepts a flat card list (one "count name" per line, no section headers).
// Auto-detects zones from DB card types (Avatar → Spellbook, Site → Atlas, else → Spellbook).
// Creates the deck with minimal validation so the user can refine in the editor.
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
    if (!user) {
      return new Response(
        JSON.stringify({
          error:
            "Your account could not be found in the database. If you already have a user account, please sign out, clear your browser cookies and sign back in",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawText = String(body?.text || "").trim();
    const overrideName = body?.name ? String(body.name).trim() : "";
    const source = body?.source ? String(body.source).trim() : "";

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "Provide a card list" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Enforce a reasonable size limit (10 KB)
    if (rawText.length > 10_000) {
      return new Response(
        JSON.stringify({ error: "Card list is too large (max 10 KB)" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // 1) Parse flat card list: "count name" per line
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const entries: { name: string; count: number }[] = [];
    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) continue; // skip unparseable lines
      const count = parseInt(match[1], 10);
      const name = match[2].trim();
      if (count > 0 && name) {
        entries.push({ name, count });
      }
    }

    if (entries.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No cards found. Expected format: one \"count name\" per line.",
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // 2) Resolve card names using shared resolver
    const uniqueNames = [...new Set(entries.map((e) => e.name))];
    const { resolved, unresolved: unresolvedNames } =
      await resolveCardNames(uniqueNames);

    // Build warnings for fuzzy matches
    const fuzzyMatches: { original: string; matched: string; count: number }[] =
      [];
    const unresolvedEntries: { name: string; count: number }[] = [];

    type ZoneItem = {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      zone: string;
      count: number;
    };
    const zoneItems: ZoneItem[] = [];

    for (const entry of entries) {
      const card = resolved.get(entry.name);
      if (!card) {
        unresolvedEntries.push(entry);
        continue;
      }

      if (card.wasFuzzy && card.matchedName !== entry.name) {
        fuzzyMatches.push({
          original: entry.name,
          matched: card.matchedName,
          count: entry.count,
        });
      }

      // Auto-detect zone from card type
      const t = (card.type || card.typeText || "").toLowerCase();
      let zone: string;
      if (t.includes("avatar")) {
        zone = "Spellbook";
      } else if (t.includes("site")) {
        zone = "Atlas";
      } else {
        zone = "Spellbook";
      }

      zoneItems.push({
        cardId: card.cardId,
        variantId: card.variantId,
        setId: card.setId,
        zone,
        count: entry.count,
      });
    }

    // Also flag resolver-level unresolved names
    for (const name of unresolvedNames) {
      if (!unresolvedEntries.some((u) => u.name === name)) {
        const entry = entries.find((e) => e.name === name);
        if (entry) unresolvedEntries.push(entry);
      }
    }

    // Don't block on unresolved — return them as warnings so user can still
    // import the rest and fix in editor. But if ALL cards are unresolved, fail.
    if (unresolvedEntries.length === entries.length) {
      return new Response(
        JSON.stringify({
          error: "Could not resolve any cards by name",
          unresolved: unresolvedEntries,
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // 3) Aggregate by (cardId, zone, variantId)
    const allowedZones = new Set(["Spellbook", "Atlas", "Collection", "Sideboard"]);
    const agg = new Map<string, ZoneItem>();
    for (const it of zoneItems) {
      if (!allowedZones.has(it.zone)) continue;
      const key = `${it.cardId}:${it.zone}:${it.variantId ?? "x"}`;
      const prev = agg.get(key);
      if (prev) prev.count += it.count;
      else agg.set(key, { ...it });
    }

    // 4) Auto-detect format based on total card count
    const totalCards = zoneItems.reduce((s, it) => s + it.count, 0);
    const format = totalCards <= 55 ? "Sealed" : "Constructed";

    // 5) Create the deck
    const deckName =
      overrideName ||
      (source
        ? `${source} Import ${new Date().toLocaleDateString()}`
        : `External Import ${new Date().toLocaleDateString()}`);

    const deck = await prisma.deck.create({
      data: {
        name: deckName,
        format,
        imported: true,
        user: { connect: { id: session.user.id } },
      },
    });

    const createRows = Array.from(agg.values()).map((v) => ({
      deckId: deck.id,
      cardId: v.cardId,
      setId: v.setId,
      variantId: v.variantId,
      zone: v.zone,
      count: v.count,
    }));

    if (createRows.length) {
      await prisma.deckCard.createMany({ data: createRows });
    }

    // Invalidate deck list cache for this user
    await invalidateCache(CacheKeys.decks.list(session.user.id));

    // Build response
    const warnings: Record<string, unknown> = {};
    if (fuzzyMatches.length > 0) {
      warnings.fuzzyMatches = fuzzyMatches;
    }
    if (unresolvedEntries.length > 0) {
      warnings.unresolved = unresolvedEntries;
    }

    const response: Record<string, unknown> = {
      id: deck.id,
      name: deck.name,
      format: deck.format,
    };
    if (Object.keys(warnings).length > 0) {
      response.warnings = warnings;
    }

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  } catch (e: unknown) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "string"
        ? e
        : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
