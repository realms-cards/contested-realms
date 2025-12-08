import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
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

    // 2) Map names to variants/cards - BATCH LOOKUP for better performance
    const preferredSets = ["Alpha", "Beta", "Arthurian Legends"]; // preference order

    type Mapped = {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      typeText: string | null;
      count: number;
      name: string;
      zone: string; // "Spellbook" | "Atlas"
    };

    const mapped: Mapped[] = [];
    const unresolved: { name: string; count: number }[] = [];

    // Batch lookup all unique card names at once
    const uniqueNames = Array.from(new Set(zoneEntries.map((e) => e.name)));
    const nameToVariant = await batchFindVariants(uniqueNames, preferredSets);

    for (const e of zoneEntries) {
      const found = nameToVariant.get(e.name);
      if (!found) {
        unresolved.push({ name: e.name, count: e.count });
        continue;
      }
      mapped.push({
        cardId: found.cardId,
        variantId: found.variantId,
        setId: found.setId,
        typeText: found.typeText,
        count: e.count,
        name: e.name,
        zone: e.zone,
      });
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

    return new Response(
      JSON.stringify({ id: deck.id, name: deck.name, format: deck.format }),
      { status: 201, headers: { "content-type": "application/json" } }
    );
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

// Batch version for much better performance
async function batchFindVariants(names: string[], setPreference: string[]) {
  const result = new Map<
    string,
    {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      typeText: string | null;
    }
  >();

  if (!names.length) return result;

  // Single query to get all candidates for all names
  const candidates = await prisma.card.findMany({
    where: {
      name: {
        in: names.flatMap((name) => {
          const canon = canonicalize(name);
          // Include both exact matches and partial matches
          return [name, canon];
        }),
      },
    },
    select: {
      id: true,
      name: true,
      variants: {
        select: {
          id: true,
          setId: true,
          typeText: true,
          set: { select: { name: true } },
        },
      },
    },
  });

  // Group candidates by canonicalized name
  const candidatesByName = new Map<string, typeof candidates>();
  for (const name of names) {
    const canon = canonicalize(name);
    const matches = candidates.filter(
      (c) => canonicalize(c.name) === canon || c.name === name
    );
    candidatesByName.set(name, matches);
  }

  // Process each name
  for (const [originalName, cardCandidates] of candidatesByName) {
    if (!cardCandidates.length) continue;

    const canon = canonicalize(originalName);
    const exact = cardCandidates.filter((c) => canonicalize(c.name) === canon);
    const pool = exact.length ? exact : cardCandidates;

    // Flatten variants, score by set preference
    type Flat = {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      typeText: string | null;
      setName: string | null;
    };
    const flats: Flat[] = [];
    for (const c of pool) {
      if (!c.variants.length) {
        flats.push({
          cardId: c.id,
          variantId: null,
          setId: null,
          typeText: null,
          setName: null,
        });
        continue;
      }
      for (const v of c.variants) {
        flats.push({
          cardId: c.id,
          variantId: v.id,
          setId: v.setId,
          typeText: v.typeText,
          setName: v.set?.name ?? null,
        });
      }
    }

    if (!flats.length) continue;

    const score = (setName: string | null) => {
      if (!setName) return -1;
      const idx = setPreference.indexOf(setName);
      return idx < 0 ? 0 : setPreference.length - idx; // higher is better
    };

    flats.sort((a, b) => score(b.setName) - score(a.setName));
    const top = flats[0];

    result.set(originalName, {
      cardId: top.cardId,
      variantId: top.variantId,
      setId: top.setId,
      typeText: top.typeText,
    });
  }

  // Batch metadata lookup for cards missing typeText
  const needsMetadata = Array.from(result.entries())
    .filter(([, variant]) => !variant.typeText && variant.setId)
    .map(([, variant]) => ({
      cardId: variant.cardId,
      setId: variant.setId as number,
    }));

  if (needsMetadata.length > 0) {
    const metaMap = new Map<string, string>();
    const metas = await prisma.cardSetMetadata.findMany({
      where: { OR: needsMetadata },
      select: { cardId: true, setId: true, type: true },
    });
    for (const m of metas) metaMap.set(`${m.cardId}:${m.setId}`, m.type);

    // Update variants with metadata
    for (const [name, variant] of result.entries()) {
      if (!variant.typeText && variant.setId) {
        const type = metaMap.get(`${variant.cardId}:${variant.setId}`);
        if (type) {
          result.set(name, { ...variant, typeText: type });
        }
      }
    }
  }

  return result;
}

function canonicalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-–—_,:;.!?()/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}
