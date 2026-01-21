import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { invalidateCache, CacheKeys } from "@/lib/cache/redis-cache";
import { prisma } from "@/lib/prisma";
import {
  fetchCuriosatrpc,
  fetchWithTimeout,
  extractDeckId,
  type CuriosatrpcDeck,
} from "@/lib/services/curiosa-deck";

export const dynamic = "force-dynamic";

// Minimal JSON typing helpers to avoid any
type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
type JSONArray = JSONValue[];
interface JSONObject {
  [key: string]: JSONValue;
}

// POST /api/decks/import/curiosa
// Body: { url: string, name?: string }
// - Fetches Curiosa TTS JSON, extracts card names+counts, maps to variants, creates a Constructed deck
// - Validates avatar/site/spellbook counts similar to game loader expectations
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

    // Feature toggle: disable Curiosa import globally unless explicitly enabled
    if (process.env.NEXT_PUBLIC_ENABLE_CURIOSA_IMPORT !== "true") {
      return new Response(
        JSON.stringify({ error: "Curiosa import is disabled" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url || "").trim();
    const overrideName = body?.name ? String(body.name).trim() : "";
    const rawTts: unknown = body?.tts ?? body?.ttsJson ?? null;

    if (!rawUrl && rawTts == null) {
      return new Response(
        JSON.stringify({
          error: "Provide a Curiosa deck URL or paste TTS JSON",
        }),
        { status: 400 }
      );
    }

    // 1) Get TTS JSON either from pasted body or by fetching from Curiosa URL candidates
    let tts: JSONValue | null = null;
    if (rawTts != null) {
      if (typeof rawTts === "string") {
        try {
          tts = JSON.parse(rawTts) as JSONValue;
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid TTS JSON string" }),
            { status: 400 }
          );
        }
      } else if (typeof rawTts === "object") {
        tts = rawTts as JSONValue;
      }
    } else {
      const deckId = extractDeckId(rawUrl);
      const candidates: string[] = [];
      const tried = new Set<string>();

      // Try the provided URL directly first (in case it's already an API/JSON endpoint)
      if (rawUrl) candidates.push(rawUrl);

      // Derive origins to try
      let pastedOrigin: string | null = null;
      try {
        const u = new URL(rawUrl);
        pastedOrigin = u.origin;
        // If the pasted URL looks like a deck page and not already /tts, try appending /tts
        if (/\/decks\//.test(u.pathname) && !/\/tts\/?$/.test(u.pathname)) {
          const withTts = `${pastedOrigin}${u.pathname.replace(/\/$/, "")}/tts`;
          if (!tried.has(withTts)) {
            candidates.push(withTts);
            tried.add(withTts);
          }
        }
      } catch {}

      const origins = Array.from(
        new Set(
          [
            pastedOrigin || undefined,
            "https://curiosa.io",
            "https://www.curiosa.io",
          ].filter(Boolean)
        )
      ) as string[];

      if (deckId) {
        for (const origin of origins) {
          const apiPath = `${origin}/api/decks/${encodeURIComponent(
            deckId
          )}/tts`;
          if (!tried.has(apiPath)) {
            candidates.push(apiPath);
            tried.add(apiPath);
          }
          const webPath = `${origin}/decks/${encodeURIComponent(deckId)}/tts`;
          if (!tried.has(webPath)) {
            candidates.push(webPath);
            tried.add(webPath);
          }
          // Also try deck JSON endpoints (non-TTS) as a fallback
          const deckJson1 = `${origin}/api/decks/${encodeURIComponent(deckId)}`;
          if (!tried.has(deckJson1)) {
            candidates.push(deckJson1);
            tried.add(deckJson1);
          }
          const deckJson2 = `${origin}/decks/${encodeURIComponent(
            deckId
          )}.json`;
          if (!tried.has(deckJson2)) {
            candidates.push(deckJson2);
            tried.add(deckJson2);
          }
        }
      }

      // Try tRPC endpoint first (works with Origin spoofing)
      const trpcData = await fetchCuriosatrpc(deckId);
      if (trpcData) {
        // Direct import from tRPC response - has structured data with variants
        const finalName =
          overrideName || trpcData.deckName || `Curiosa Import ${deckId}`;
        const importResult = await importFromTrpcData(
          trpcData.deckList,
          trpcData.sideboardList,
          trpcData.avatarName,
          session.user.id,
          finalName,
          deckId // Pass curiosaSourceId for sync functionality
        );
        if (importResult.error || !importResult.deck) {
          return new Response(
            JSON.stringify({
              error: importResult.error ?? "Failed to create deck",
              unresolved: importResult.unresolved,
            }),
            { status: 400 }
          );
        }
        // Invalidate deck list cache for this user
        await invalidateCache(CacheKeys.decks.list(session.user.id));
        return new Response(
          JSON.stringify({
            id: importResult.deck.id,
            name: importResult.deck.name,
            format: importResult.deck.format,
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }

      // Fallback to TTS JSON endpoints
      tts = await fetchFirstJson(candidates);
      if (!tts) {
        return new Response(
          JSON.stringify({
            error:
              "Failed to fetch Curiosa deck. If the deck is private or requires login, paste the TTS JSON instead.",
          }),
          { status: 400 }
        );
      }
    }

    // 3) Extract card names and counts from TTS JSON (best-effort)
    const nameCounts = extractNamesAndCounts(tts);
    const entries = Array.from(nameCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .filter((e) => !!e.name && e.count > 0);

    if (entries.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            "No cards found in Curiosa TTS export. The deck might be private or an unknown format.",
        }),
        { status: 400 }
      );
    }

    // 4) Map names to variants/cards
    const preferredSets = ["Alpha", "Beta", "Arthurian Legends"]; // preference order

    type Mapped = {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      typeText: string | null;
      type: string | null;
      count: number;
      name: string;
    };

    const mapped: Mapped[] = [];
    const unresolved: { name: string; count: number }[] = [];

    // Batch lookup: fetch all cards and variants in one query
    const uniqueNames = [...new Set(entries.map((e) => e.name))];
    const resolvedByName = await findBestVariantsForNames(
      uniqueNames,
      preferredSets
    );

    for (const { name, count } of entries) {
      const found = resolvedByName.get(name);
      if (!found) {
        unresolved.push({ name, count });
        continue;
      }
      mapped.push({
        cardId: found.cardId,
        variantId: found.variantId,
        setId: found.setId,
        typeText: found.typeText,
        type: found.type,
        count,
        name,
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

    // 5) Bucket into zones based on type
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
    const zoneItems: ZoneItem[] = mapped.map((m) => {
      const t = (m.type || "").toLowerCase();
      const isSite = t.includes("site");
      const zone = isSite ? "Atlas" : "Spellbook";
      return {
        cardId: m.cardId,
        variantId: m.variantId,
        setId: m.setId,
        zone,
        count: m.count,
      };
    });

    // 6) Validate avatar count and minimums, using CardSetMetadata.type (not typeText which is flavor text)
    const avatars = mapped.filter((m) =>
      (m.type || "").toLowerCase().includes("avatar")
    );
    if (avatars.length !== 1) {
      return new Response(
        JSON.stringify({
          error:
            avatars.length === 0
              ? "Deck requires exactly 1 Avatar"
              : "Deck has multiple Avatars. Keep only one.",
        }),
        { status: 400 }
      );
    }

    const atlasCount = zoneItems
      .filter((z) => z.zone === "Atlas")
      .reduce((a, b) => a + b.count, 0);
    const spellbookCount =
      zoneItems
        .filter((z) => z.zone === "Spellbook")
        .reduce((a, b) => a + b.count, 0) -
      avatars.reduce((a, b) => a + b.count, 0);

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

    // 7) Aggregate by (cardId, zone, variantId)
    const agg = new Map<string, ZoneItem>();
    for (const it of zoneItems) {
      if (!allowedZones.has(it.zone)) continue;
      const key = `${it.cardId}:${it.zone}:${it.variantId ?? "x"}`;
      const prev = agg.get(key);
      if (prev) prev.count += it.count;
      else agg.set(key, { ...it });
    }

    // 8) Create the deck
    const curiosaSourceId = extractDeckId(rawUrl);
    const deckName =
      overrideName || `Curiosa Import ${curiosaSourceId || "Deck"}`;
    const deck = await prisma.deck.create({
      data: {
        name: deckName,
        format: "Constructed",
        imported: true,
        curiosaSourceId, // Store for sync functionality
        user: { connect: { id: session.user.id } },
      },
    });

    // createMany doesn't allow relation inference per row, so compute setId per variant
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

// Try multiple URLs in parallel, return first successful JSON response
async function fetchFirstJson(urls: string[]): Promise<JSONValue | null> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (uniqueUrls.length === 0) return null;

  // Try all URLs in parallel with individual timeouts
  const results = await Promise.allSettled(
    uniqueUrls.map(async (url) => {
      const res = await fetchWithTimeout(
        url,
        {
          cache: "no-store",
          headers: {
            Accept: "application/json, text/plain, */*",
          },
        },
        8000 // 8 second timeout per URL
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) {
        const txt = await res.text();
        return JSON.parse(txt) as JSONValue;
      }
      return (await res.json()) as JSONValue;
    })
  );

  // Return first successful result
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      return result.value;
    }
  }
  return null;
}

function extractNamesAndCounts(tts: JSONValue): Map<string, number> {
  const counts = new Map<string, number>();
  const push = (rawName: unknown, qty = 1) => {
    if (typeof rawName !== "string") return;
    const name = normalizeName(rawName);
    if (!name) return;
    counts.set(name, (counts.get(name) || 0) + Math.max(1, qty | 0));
  };

  const visit = (node: JSONValue) => {
    if (node === null) return;
    if (
      typeof node === "string" ||
      typeof node === "number" ||
      typeof node === "boolean"
    )
      return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }

    const obj = node as JSONObject;

    // Common TTS fields
    const nickname = obj["Nickname"];
    if (typeof nickname === "string") push(nickname, 1);

    // Some exports include a quantity field
    const cardName = obj["CardName"];
    const quantity = obj["Quantity"];
    if (typeof cardName === "string")
      push(cardName, typeof quantity === "number" ? quantity : 1);

    // Generic deck JSON fields (fallback): name + count variants
    const nameFields = ["name", "Name", "card_name", "title"] as const;
    const countFields = [
      "count",
      "Count",
      "qty",
      "Qty",
      "quantity",
      "Quantity",
      "copies",
      "Copies",
      "amount",
      "Amount",
    ] as const;
    for (const nf of nameFields) {
      const n = obj[nf as keyof JSONObject];
      if (typeof n === "string") {
        // prefer a matching count field if present
        let qtyNum: number | undefined;
        for (const cf of countFields) {
          const q = obj[cf as keyof JSONObject];
          if (typeof q === "number") {
            qtyNum = q;
            break;
          }
        }
        push(n, typeof qtyNum === "number" ? qtyNum : 1);
        break;
      }
    }

    // Walk typical containers
    const objectStates = obj["ObjectStates"];
    if (Array.isArray(objectStates))
      for (const child of objectStates) visit(child);
    const contained = obj["ContainedObjects"];
    if (Array.isArray(contained)) for (const child of contained) visit(child);
    const children = obj["Children"];
    if (Array.isArray(children)) for (const child of children) visit(child);
    const deckIDs = obj["DeckIDs"];
    if (Array.isArray(deckIDs) && typeof nickname === "string") {
      // Deck with repeated IDs: assume all entries are the same Nickname
      push(nickname, deckIDs.length);
    }

    // Fallback: walk any nested objects/arrays
    for (const [k, val] of Object.entries(obj)) {
      if (
        k === "Nickname" ||
        k === "CardName" ||
        k === "Quantity" ||
        k === "name" ||
        k === "Name" ||
        k === "card_name" ||
        k === "title" ||
        k === "count" ||
        k === "Count" ||
        k === "qty" ||
        k === "Qty" ||
        k === "quantity" ||
        k === "Quantity" ||
        k === "copies" ||
        k === "Copies" ||
        k === "amount" ||
        k === "Amount" ||
        k === "ObjectStates" ||
        k === "ContainedObjects" ||
        k === "Children" ||
        k === "DeckIDs"
      )
        continue;
      if (val && typeof val === "object") visit(val as JSONValue);
    }
  };

  visit(tts);
  return counts;
}

function normalizeName(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'") // curly apostrophes -> straight
    .replace(/[\u201C\u201D]/g, '"') // curly quotes -> straight
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-–—_,:;.!?()/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

// Batched version: find best variants for multiple names in minimal queries
async function findBestVariantsForNames(
  names: string[],
  setPreference: string[]
): Promise<
  Map<
    string,
    {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      typeText: string | null;
      type: string | null;
    }
  >
> {
  const result = new Map<
    string,
    {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      typeText: string | null;
      type: string | null;
    }
  >();

  if (names.length === 0) return result;

  // Fetch all cards that might match any of the names (case-insensitive)
  const cards = await prisma.card.findMany({
    where: { name: { in: names, mode: "insensitive" } },
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

  // Build a map from canonicalized name to card
  const cardByCanon = new Map<
    string,
    {
      id: number;
      name: string;
      variants: {
        id: number;
        setId: number | null;
        typeText: string | null;
        set: { name: string } | null;
      }[];
    }
  >();
  for (const c of cards) {
    cardByCanon.set(canonicalize(c.name), c);
  }

  // Score function for set preference
  const score = (setName: string | null) => {
    if (!setName) return -1;
    const idx = setPreference.indexOf(setName);
    return idx < 0 ? 0 : setPreference.length - idx;
  };

  // Collect cards that need metadata fallback
  const needsMetadata: { name: string; cardId: number; setId: number }[] = [];

  // Process each name
  for (const name of names) {
    const canon = canonicalize(name);
    const card = cardByCanon.get(canon);

    if (!card) continue;

    // Flatten variants and score by set preference
    type Flat = {
      variantId: number | null;
      setId: number | null;
      typeText: string | null;
      setName: string | null;
    };
    const flats: Flat[] = [];

    if (!card.variants.length) {
      flats.push({
        variantId: null,
        setId: null,
        typeText: null,
        setName: null,
      });
    } else {
      for (const v of card.variants) {
        flats.push({
          variantId: v.id,
          setId: v.setId,
          typeText: v.typeText,
          setName: v.set?.name ?? null,
        });
      }
    }

    if (!flats.length) continue;

    flats.sort((a, b) => score(b.setName) - score(a.setName));
    const top = flats[0];

    result.set(name, {
      cardId: card.id,
      variantId: top.variantId,
      setId: top.setId,
      typeText: top.typeText,
      type: null, // Will be populated from CardSetMetadata
    });

    // Track all cards that have a setId for metadata lookup
    if (top.setId != null) {
      needsMetadata.push({ name, cardId: card.id, setId: top.setId });
    }
  }

  // Batch fetch metadata to get proper card type (not flavor typeText)
  if (needsMetadata.length > 0) {
    const metaConditions = needsMetadata.map((m) => ({
      cardId: m.cardId,
      setId: m.setId,
    }));

    const metadata = await prisma.cardSetMetadata.findMany({
      where: { OR: metaConditions },
      select: { cardId: true, setId: true, type: true },
    });

    const metaByKey = new Map(
      metadata.map((m) => [`${m.cardId}:${m.setId}`, m.type])
    );

    for (const { name, cardId, setId } of needsMetadata) {
      const type = metaByKey.get(`${cardId}:${setId}`);
      if (type) {
        const existing = result.get(name);
        if (existing) {
          result.set(name, { ...existing, type });
        }
      }
    }
  }

  return result;
}

// Import directly from Curiosa tRPC response
async function importFromTrpcData(
  deckList: CuriosatrpcDeck[],
  sideboardList: CuriosatrpcDeck[],
  avatarName: string | null,
  userId: string,
  deckName: string,
  curiosaSourceId: string | null = null
): Promise<{
  error?: string;
  unresolved?: { name: string; count: number }[];
  deck?: { id: string; name: string; format: string };
}> {
  // Extract card entries with their variant slugs and zone
  const entries: {
    name: string;
    slug: string;
    quantity: number;
    category: string;
    type: string;
    zone: "main" | "sideboard";
  }[] = [];

  // Process main deck cards
  // Note: Sideboard/collection cards are treated as ADDITIONAL cards, not duplicates
  // (Important for Imposter decks where collection contains avatars to mask as)
  for (const entry of deckList) {
    const { card, variantId, quantity } = entry;
    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || `${card.slug}`;

    entries.push({
      name: card.name,
      slug,
      quantity,
      category: card.category,
      type: card.type,
      zone: "main",
    });
  }

  // Process sideboard (Collection zone)
  // The main avatar is handled separately (added to Spellbook later)
  // But additional avatars (for Imposter ability) should go to Collection
  for (const entry of sideboardList) {
    const { card, variantId, quantity } = entry;
    const isAvatar = card.type?.toLowerCase() === "avatar";

    // Skip the main avatar (it's added to Spellbook separately)
    // But keep additional avatars for Collection (Imposter ability)
    if (isAvatar && card.name === avatarName) continue;

    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || `${card.slug}`;

    entries.push({
      name: card.name,
      slug,
      quantity,
      category: card.category,
      type: card.type,
      zone: "sideboard", // Will become Collection zone
    });
  }

  if (entries.length === 0) {
    return { error: "No cards found in Curiosa deck" };
  }

  // Group by slug+zone and sum quantities (sideboard cards stay separate)
  const grouped = new Map<
    string,
    {
      name: string;
      slug: string;
      quantity: number;
      category: string;
      type: string;
      zone: "main" | "sideboard";
    }
  >();
  for (const e of entries) {
    const key = `${e.slug}:${e.zone}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += e.quantity;
    } else {
      grouped.set(key, { ...e });
    }
  }

  // Map to our DB variants by slug
  type Mapped = {
    cardId: number;
    variantId: number | null;
    setId: number | null;
    zone: string;
    count: number;
    name: string;
  };

  const mapped: Mapped[] = [];
  const unresolved: { name: string; count: number }[] = [];

  // Batch lookup: collect all slugs and fetch variants in one query
  const groupedEntries = Array.from(grouped.values());
  const allSlugs = groupedEntries.map((e) => e.slug);

  const variants = await prisma.variant.findMany({
    where: { slug: { in: allSlugs } },
    select: { id: true, cardId: true, setId: true, typeText: true, slug: true },
  });

  const variantBySlug = new Map(variants.map((v) => [v.slug, v]));

  // Find entries that didn't match by slug - need name fallback
  const needsNameLookup = groupedEntries.filter(
    (e) => !variantBySlug.has(e.slug)
  );

  // Batch lookup cards by name for unresolved slugs
  let cardByNameLower = new Map<
    string,
    {
      id: number;
      variants: { id: number; setId: number | null; typeText: string | null }[];
    }
  >();

  if (needsNameLookup.length > 0) {
    const names = [...new Set(needsNameLookup.map((e) => e.name))];
    const cards = await prisma.card.findMany({
      where: { name: { in: names, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        variants: {
          select: { id: true, setId: true, typeText: true },
          take: 1,
        },
      },
    });
    cardByNameLower = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
  }

  // Process all entries using the batched lookups
  for (const entry of groupedEntries) {
    const variant = variantBySlug.get(entry.slug);

    if (!variant) {
      // Fallback: try by card name from batch lookup
      const card = cardByNameLower.get(entry.name.toLowerCase());

      if (!card) {
        unresolved.push({ name: entry.name, count: entry.quantity });
        continue;
      }

      const v = card.variants[0];
      // Determine zone: sideboard -> Collection (for constructed), main deck sites -> Atlas, main deck spells -> Spellbook
      let zone: string;
      if (entry.zone === "sideboard") {
        zone = "Collection";
      } else {
        const isSite =
          entry.type?.toLowerCase() === "site" ||
          entry.category?.toLowerCase() === "site";
        zone = isSite ? "Atlas" : "Spellbook";
      }
      mapped.push({
        cardId: card.id,
        variantId: v?.id ?? null,
        setId: v?.setId ?? null,
        zone,
        count: entry.quantity,
        name: entry.name,
      });
    } else {
      // Determine zone: sideboard -> Collection (for constructed), main deck sites -> Atlas, main deck spells -> Spellbook
      let zone: string;
      if (entry.zone === "sideboard") {
        zone = "Collection";
      } else {
        const isSite =
          entry.type?.toLowerCase() === "site" ||
          entry.category?.toLowerCase() === "site";
        zone = isSite ? "Atlas" : "Spellbook";
      }
      mapped.push({
        cardId: variant.cardId,
        variantId: variant.id,
        setId: variant.setId,
        zone,
        count: entry.quantity,
        name: entry.name,
      });
    }
  }

  if (unresolved.length > 0) {
    return { error: `Could not map some cards by slug or name`, unresolved };
  }

  // Handle avatar (from metadata, not in deck list)
  if (!avatarName) {
    return {
      error: "Deck requires exactly 1 Avatar (none found in Curiosa deck)",
    };
  }

  // Look up avatar card by name and add to mapped
  const avatarCard = await prisma.card.findFirst({
    where: { name: { equals: avatarName, mode: "insensitive" } },
    select: {
      id: true,
      variants: { select: { id: true, setId: true }, take: 1 },
    },
  });

  if (!avatarCard) {
    return { error: `Avatar "${avatarName}" not found in database` };
  }

  const avatarVariant = avatarCard.variants[0];
  mapped.push({
    cardId: avatarCard.id,
    variantId: avatarVariant?.id ?? null,
    setId: avatarVariant?.setId ?? null,
    zone: "Spellbook", // Avatars go in Spellbook
    count: 1,
    name: avatarName,
  });

  // Validate counts
  const atlasCount = mapped
    .filter((m) => m.zone === "Atlas")
    .reduce((a, b) => a + b.count, 0);
  const spellbookCount =
    mapped
      .filter((m) => m.zone === "Spellbook")
      .reduce((a, b) => a + b.count, 0) - 1; // minus avatar

  if (atlasCount < 12) {
    return { error: `Atlas needs at least 12 sites (found ${atlasCount})` };
  }
  if (spellbookCount < 24) {
    return {
      error: `Spellbook needs at least 24 cards excluding Avatar (found ${spellbookCount})`,
    };
  }

  // Create deck
  const deck = await prisma.deck.create({
    data: {
      name: deckName,
      format: "Constructed",
      imported: true,
      curiosaSourceId, // Store for sync functionality
      user: { connect: { id: userId } },
    },
  });

  // Aggregate and create deck cards
  const allowedZones = new Set([
    "Spellbook",
    "Atlas",
    "Collection",
    "Sideboard",
  ]);
  const agg = new Map<
    string,
    {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      zone: string;
      count: number;
    }
  >();

  for (const m of mapped) {
    if (!allowedZones.has(m.zone)) continue;
    const key = `${m.cardId}:${m.zone}:${m.variantId ?? "x"}`;
    const prev = agg.get(key);
    if (prev) {
      prev.count += m.count;
    } else {
      agg.set(key, {
        cardId: m.cardId,
        variantId: m.variantId,
        setId: m.setId,
        zone: m.zone,
        count: m.count,
      });
    }
  }

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

  return { deck: { id: deck.id, name: deck.name, format: deck.format } };
}
