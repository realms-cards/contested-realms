import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { resolveCardNames } from "@/lib/decks/card-resolver";
import {
  parseSorceryDeckText,
  toZones,
} from "@/lib/decks/parsers/sorcery-decktext";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Minimal JSON typing helpers to avoid any
type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
type JSONArray = JSONValue[];
interface JSONObject {
  [key: string]: JSONValue;
}

// POST /api/decks/import/text
// Body: { text: string, name?: string }
// - Parses pasted text decklist, maps names to variants, creates a Constructed deck
// - If some names cannot be resolved, responds 400 with an `unresolved` array (and does not create a deck)
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    // Ensure the authenticated user exists in the database (useful after local DB resets)
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

    // Feature toggle (consistent with Curiosa import)
    if (process.env.NEXT_PUBLIC_ENABLE_TEXT_IMPORT !== "true") {
      return new Response(
        JSON.stringify({ error: "Text import is disabled" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({} as JSONObject));
    const rawText = String(body?.text || "");
    const overrideName = body?.name ? String(body.name).trim() : "";

    if (!rawText.trim()) {
      return new Response(JSON.stringify({ error: "Provide deck text" }), {
        status: 400,
      });
    }

    // 1) Parse text -> categories and zones
    const parsed = parseSorceryDeckText(rawText);
    const zoneEntries = toZones(parsed);

    // Basic validation from parsed categories
    if (parsed.totalByCategory.Avatar !== 1) {
      return new Response(
        JSON.stringify({
          error:
            parsed.totalByCategory.Avatar === 0
              ? "Deck requires exactly 1 Avatar"
              : "Deck has multiple Avatars. Keep only one.",
        }),
        { status: 400 }
      );
    }

    const atlasCount = zoneEntries
      .filter((z) => z.zone === "Atlas")
      .reduce((a, b) => a + b.count, 0);
    const spellbookCount =
      zoneEntries
        .filter((z) => z.zone === "Spellbook")
        .reduce((a, b) => a + b.count, 0) - parsed.totalByCategory.Avatar;

    if (atlasCount < 12) {
      return new Response(
        JSON.stringify({ error: "Atlas needs at least 12 sites" }),
        { status: 400 }
      );
    }
    if (spellbookCount < 24) {
      return new Response(
        JSON.stringify({
          error: "Spellbook needs at least 24 cards (excluding Avatar)",
        }),
        { status: 400 }
      );
    }

    // 2) Map names to variants/cards using shared resolver
    const uniqueNames = Array.from(new Set(zoneEntries.map((e) => e.name)));
    // Build a map of name -> preferred set (from CardNexus format)
    const nameToPreferredSet = new Map<string, string>();
    for (const e of zoneEntries) {
      if (e.set) {
        nameToPreferredSet.set(e.name, e.set);
      }
    }
    const { resolved, unresolved: unresolvedNames } = await resolveCardNames(
      uniqueNames,
      { nameToPreferredSet }
    );

    // Track fuzzy matches for warnings
    const fuzzyMatches: { original: string; matched: string; count: number }[] =
      [];

    type Mapped = {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      count: number;
      zone: string;
    };
    const mapped: Mapped[] = [];
    const unresolved: { name: string; count: number }[] = [];

    for (const e of zoneEntries) {
      const found = resolved.get(e.name);
      if (!found) {
        unresolved.push({ name: e.name, count: e.count });
        continue;
      }
      // Track fuzzy matches
      if (found.wasFuzzy && found.matchedName !== e.name) {
        fuzzyMatches.push({
          original: e.name,
          matched: found.matchedName,
          count: e.count,
        });
      }
      mapped.push({
        cardId: found.cardId,
        variantId: found.variantId,
        setId: found.setId,
        count: e.count,
        zone: e.zone,
      });
    }

    // Also add any names the resolver couldn't find
    for (const name of unresolvedNames) {
      const entry = zoneEntries.find((e) => e.name === name);
      if (entry && !unresolved.some((u) => u.name === name)) {
        unresolved.push({ name, count: entry.count });
      }
    }

    if (unresolved.length) {
      return new Response(
        JSON.stringify({
          error: `Could not map some cards by name`,
          unresolved,
        }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // 3) Aggregate by (cardId, zone, variantId)
    const allowedZones = new Set([
      "Spellbook",
      "Atlas",
      "Collection",
      "Sideboard",
    ]);
    type ZoneItem = {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      zone: string;
      count: number;
    };
    const agg = new Map<string, ZoneItem>();
    for (const it of mapped) {
      if (!allowedZones.has(it.zone)) continue;
      const key = `${it.cardId}:${it.zone}:${it.variantId ?? "x"}`;
      const prev = agg.get(key);
      if (prev) prev.count += it.count;
      else
        agg.set(key, {
          cardId: it.cardId,
          variantId: it.variantId,
          setId: it.setId,
          zone: it.zone,
          count: it.count,
        });
    }

    // 4) Create the deck
    const deckName =
      overrideName || `Text Import ${new Date().toLocaleDateString()}`;
    const deck = await prisma.deck.create({
      data: {
        name: deckName,
        format: "Constructed",
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

    // Build response with optional warnings
    const response: {
      id: string;
      name: string;
      format: string | null;
      warnings?: { fuzzyMatches: typeof fuzzyMatches };
    } = {
      id: deck.id,
      name: deck.name,
      format: deck.format,
    };

    if (fuzzyMatches.length > 0) {
      response.warnings = { fuzzyMatches };
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
