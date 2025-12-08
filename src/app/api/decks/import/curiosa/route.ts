import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
          finalName
        );
        if (importResult.error) {
          return new Response(
            JSON.stringify({
              error: importResult.error,
              unresolved: importResult.unresolved,
            }),
            { status: 400 }
          );
        }
        return new Response(
          JSON.stringify({
            id: importResult.deck!.id,
            name: importResult.deck!.name,
            format: importResult.deck!.format,
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
      const t = (m.typeText || "").toLowerCase();
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

    // 6) Validate avatar count and minimums, using variant type text if available
    const avatars = mapped.filter((m) =>
      (m.typeText || "").toLowerCase().includes("avatar")
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
    const deckName =
      overrideName || `Curiosa Import ${extractDeckId(rawUrl) || "Deck"}`;
    const deck = await prisma.deck.create({
      data: {
        name: deckName,
        format: "Constructed",
        imported: true,
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

function extractDeckId(urlOrId: string): string | null {
  try {
    const u = new URL(urlOrId);
    const parts = u.pathname.split("/").filter(Boolean);
    // find last non-empty path segment
    const last = parts[parts.length - 1] || "";
    return last || null;
  } catch {
    // not a URL, treat as id-ish
    const trimmed = urlOrId.trim().replace(/^[#/]+|[?#].*$/g, "");
    return trimmed || null;
  }
}

async function fetchFirstJson(urls: string[]): Promise<JSONValue | null> {
  const tried = new Set<string>();
  for (const url of urls) {
    const u = String(url);
    if (!u || tried.has(u)) continue;
    tried.add(u);
    try {
      const res = await fetch(u, {
        cache: "no-store",
        headers: {
          Accept: "application/json, text/plain, */*",
        },
      });
      if (!res.ok) continue;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) {
        // Try to parse anyway
        const txt = await res.text();
        try {
          return JSON.parse(txt) as JSONValue;
        } catch {
          continue;
        }
      } else {
        return (await res.json()) as JSONValue;
      }
    } catch {
      // try next
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
    });

    // Track if we need metadata fallback
    if ((top.typeText == null || top.typeText === "") && top.setId != null) {
      needsMetadata.push({ name, cardId: card.id, setId: top.setId });
    }
  }

  // Batch fetch metadata for cards missing typeText
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
          result.set(name, { ...existing, typeText: type });
        }
      }
    }
  }

  return result;
}

// Fetch deck data from Curiosa tRPC endpoint using Origin spoofing
interface CuriosatrpcResult {
  deckList: CuriosatrpcDeck[];
  sideboardList: CuriosatrpcDeck[]; // Collection zone (up to 10 cards)
  avatarName: string | null;
  deckName: string | null;
}

async function fetchCuriosatrpc(
  deckId: string | null
): Promise<CuriosatrpcResult | null> {
  if (!deckId) return null;

  const input = JSON.stringify({ json: { id: deckId } });
  const headers = {
    Origin: "https://curiosa.io",
    Referer: "https://curiosa.io/",
    Accept: "application/json",
  };

  try {
    // Fetch deck list, sideboard, and deck metadata in parallel
    const [listRes, sideboardRes, metaRes] = await Promise.all([
      fetch(
        `https://curiosa.io/api/trpc/deck.getDecklistById?input=${encodeURIComponent(
          input
        )}`,
        { cache: "no-store", headers }
      ),
      fetch(
        `https://curiosa.io/api/trpc/deck.getSideboardById?input=${encodeURIComponent(
          input
        )}`,
        { cache: "no-store", headers }
      ),
      fetch(
        `https://curiosa.io/api/trpc/deck.getById?input=${encodeURIComponent(
          input
        )}`,
        { cache: "no-store", headers }
      ),
    ]);

    if (!listRes.ok) return null;

    const listData = await listRes.json();
    const deckList = listData?.result?.data?.json;
    if (!Array.isArray(deckList)) return null;

    // Parse sideboard (Collection zone) - avatar is also stored here
    let sideboardList: CuriosatrpcDeck[] = [];
    if (sideboardRes.ok) {
      const sideboardData = await sideboardRes.json();
      const sbList = sideboardData?.result?.data?.json;
      if (Array.isArray(sbList)) {
        sideboardList = sbList as CuriosatrpcDeck[];
      }
    }

    // Extract avatar from sideboard (first Avatar type card)
    let avatarName: string | null = null;
    for (const entry of sideboardList) {
      if (entry.card?.type?.toLowerCase() === "avatar") {
        avatarName = entry.card.name;
        break;
      }
    }

    // Fallback: try metadata avatars array
    let deckName: string | null = null;
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      const meta = metaData?.result?.data?.json;
      if (meta) {
        deckName = meta.name || null;
        // Avatar fallback from avatars array
        if (!avatarName) {
          const avatars = meta.avatars;
          if (Array.isArray(avatars) && avatars.length > 0) {
            avatarName = avatars[0]?.card?.name || null;
          }
        }
      }
    }

    return {
      deckList: deckList as CuriosatrpcDeck[],
      sideboardList,
      avatarName,
      deckName,
    };
  } catch {
    return null;
  }
}

// Type for Curiosa tRPC deck entry
interface CuriosatrpcDeck {
  quantity: number;
  variantId: string;
  card: {
    id: string;
    slug: string;
    name: string;
    type: string;
    category: string;
    variants: Array<{
      id: string;
      slug: string;
      setCard?: { set?: { name?: string } };
    }>;
  };
}

// Import directly from Curiosa tRPC response
async function importFromTrpcData(
  deckList: CuriosatrpcDeck[],
  sideboardList: CuriosatrpcDeck[],
  avatarName: string | null,
  userId: string,
  deckName: string
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

  // Build a map of collection card quantities by variantId to subtract from main deck
  // (Curiosa's getDecklistById may include collection cards, so we need to dedupe)
  const collectionByVariantId = new Map<string, number>();
  for (const entry of sideboardList) {
    const { card, variantId, quantity } = entry;
    // Skip avatars - they're handled separately
    if (card.type?.toLowerCase() === "avatar") continue;
    const key = variantId || card.id;
    collectionByVariantId.set(
      String(key),
      (collectionByVariantId.get(String(key)) || 0) + quantity
    );
  }

  // Process main deck, subtracting any collection quantities
  for (const entry of deckList) {
    const { card, variantId, quantity } = entry;
    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || `${card.slug}`;

    // Subtract collection quantity if this card also appears in collection
    const key = variantId || card.id;
    const collectionQty = collectionByVariantId.get(String(key)) || 0;
    const mainDeckQty = Math.max(0, quantity - collectionQty);

    // Clear the collection entry so we don't double-subtract
    if (collectionQty > 0) {
      collectionByVariantId.delete(String(key));
    }

    if (mainDeckQty > 0) {
      entries.push({
        name: card.name,
        slug,
        quantity: mainDeckQty,
        category: card.category,
        type: card.type,
        zone: "main",
      });
    }
  }

  // Process sideboard (Collection zone) - skip avatars as they're handled separately
  for (const entry of sideboardList) {
    const { card, variantId, quantity } = entry;
    // Skip avatars - they go in Spellbook, not Sideboard
    if (card.type?.toLowerCase() === "avatar") continue;

    const variant =
      card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || `${card.slug}`;

    entries.push({
      name: card.name,
      slug,
      quantity,
      category: card.category,
      type: card.type,
      zone: "sideboard",
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
