import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Minimal JSON typing helpers to avoid any
type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
type JSONArray = JSONValue[];
interface JSONObject { [key: string]: JSONValue }

// POST /api/decks/import/curiosa
// Body: { url: string, name?: string }
// - Fetches Curiosa TTS JSON, extracts card names+counts, maps to variants, creates a Constructed deck
// - Validates avatar/site/spellbook counts similar to game loader expectations
export async function POST(req: NextRequest) {
  const session = await getServerAuthSession();
  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  try {
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
      return new Response(JSON.stringify({ error: "Provide a Curiosa deck URL or paste TTS JSON" }), { status: 400 });
    }

    // 1) Get TTS JSON either from pasted body or by fetching from Curiosa URL candidates
    let tts: JSONValue | null = null;
    if (rawTts != null) {
      if (typeof rawTts === "string") {
        try {
          tts = JSON.parse(rawTts) as JSONValue;
        } catch {
          return new Response(JSON.stringify({ error: "Invalid TTS JSON string" }), { status: 400 });
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
          if (!tried.has(withTts)) { candidates.push(withTts); tried.add(withTts); }
        }
      } catch {}

      const origins = Array.from(new Set([
        pastedOrigin || undefined,
        "https://curiosa.io",
        "https://www.curiosa.io",
      ].filter(Boolean))) as string[];

      if (deckId) {
        for (const origin of origins) {
          const apiPath = `${origin}/api/decks/${encodeURIComponent(deckId)}/tts`;
          if (!tried.has(apiPath)) { candidates.push(apiPath); tried.add(apiPath); }
          const webPath = `${origin}/decks/${encodeURIComponent(deckId)}/tts`;
          if (!tried.has(webPath)) { candidates.push(webPath); tried.add(webPath); }
          // Also try deck JSON endpoints (non-TTS) as a fallback
          const deckJson1 = `${origin}/api/decks/${encodeURIComponent(deckId)}`;
          if (!tried.has(deckJson1)) { candidates.push(deckJson1); tried.add(deckJson1); }
          const deckJson2 = `${origin}/decks/${encodeURIComponent(deckId)}.json`;
          if (!tried.has(deckJson2)) { candidates.push(deckJson2); tried.add(deckJson2); }
        }
      }

      tts = await fetchFirstJson(candidates);
      if (!tts) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch Curiosa TTS export. If the deck is private or requires login, paste the TTS JSON instead." }),
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
        JSON.stringify({ error: "No cards found in Curiosa TTS export. The deck might be private or an unknown format." }),
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

    for (const { name, count } of entries) {
      const found = await findBestVariantForName(name, preferredSets);
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
    const allowedZones = new Set(["Spellbook", "Atlas", "Sideboard"]);
    type ZoneItem = { cardId: number; variantId: number | null; setId: number | null; zone: string; count: number };
    const zoneItems: ZoneItem[] = mapped.map((m) => {
      const t = (m.typeText || "").toLowerCase();
      const isSite = t.includes("site");
      const zone = isSite ? "Atlas" : "Spellbook";
      return { cardId: m.cardId, variantId: m.variantId, setId: m.setId, zone, count: m.count };
    });

    // 6) Validate avatar count and minimums, using variant type text if available
    const avatars = mapped.filter((m) => (m.typeText || "").toLowerCase().includes("avatar"));
    if (avatars.length !== 1) {
      return new Response(
        JSON.stringify({ error: avatars.length === 0 ? "Deck requires exactly 1 Avatar" : "Deck has multiple Avatars. Keep only one." }),
        { status: 400 }
      );
    }

    const atlasCount = zoneItems.filter((z) => z.zone === "Atlas").reduce((a, b) => a + b.count, 0);
    const spellbookCount = zoneItems
      .filter((z) => z.zone === "Spellbook")
      .reduce((a, b) => a + b.count, 0) - avatars.reduce((a, b) => a + b.count, 0);

    if (atlasCount < 12) {
      return new Response(JSON.stringify({ error: "Atlas needs at least 12 sites" }), { status: 400 });
    }
    if (spellbookCount < 24) {
      return new Response(JSON.stringify({ error: "Spellbook needs at least 24 cards (excluding Avatar)" }), { status: 400 });
    }

    // 7) Aggregate by (cardId, zone, variantId)
    const agg = new Map<string, ZoneItem>();
    for (const it of zoneItems) {
      if (!allowedZones.has(it.zone)) continue;
      const key = `${it.cardId}:${it.zone}:${it.variantId ?? "x"}`;
      const prev = agg.get(key);
      if (prev) prev.count += it.count; else agg.set(key, { ...it });
    }

    // 8) Create the deck
    const deckName = overrideName || `Curiosa Import ${extractDeckId(rawUrl) || "Deck"}`;
    const deck = await prisma.deck.create({ data: { name: deckName, format: "Constructed", imported: true, user: { connect: { id: session.user.id } } } });

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
    const message = e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown error";
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
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") return;
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
    if (typeof cardName === "string") push(cardName, typeof quantity === "number" ? quantity : 1);

    // Generic deck JSON fields (fallback): name + count variants
    const nameFields = ["name", "Name", "card_name", "title"] as const;
    const countFields = ["count", "Count", "qty", "Qty", "quantity", "Quantity", "copies", "Copies", "amount", "Amount"] as const;
    for (const nf of nameFields) {
      const n = obj[nf as keyof JSONObject];
      if (typeof n === "string") {
        // prefer a matching count field if present
        let qtyNum: number | undefined;
        for (const cf of countFields) {
          const q = obj[cf as keyof JSONObject];
          if (typeof q === "number") { qtyNum = q; break; }
        }
        push(n, typeof qtyNum === "number" ? qtyNum : 1);
        break;
      }
    }

    // Walk typical containers
    const objectStates = obj["ObjectStates"];
    if (Array.isArray(objectStates)) for (const child of objectStates) visit(child);
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
        k === "name" || k === "Name" || k === "card_name" || k === "title" ||
        k === "count" || k === "Count" || k === "qty" || k === "Qty" || k === "quantity" || k === "Quantity" || k === "copies" || k === "Copies" || k === "amount" || k === "Amount" ||
        k === "ObjectStates" ||
        k === "ContainedObjects" ||
        k === "Children" ||
        k === "DeckIDs"
      ) continue;
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

async function findBestVariantForName(name: string, setPreference: string[]) {
  // First pass: find candidate cards containing the name
  const candidates = await prisma.card.findMany({
    where: { name: { contains: name } },
    select: {
      id: true,
      name: true,
      variants: { select: { id: true, setId: true, typeText: true, set: { select: { name: true } } } },
    },
    take: 50,
  });

  if (!candidates.length) return null;

  const canon = canonicalize(name);
  const exact = candidates.filter((c) => canonicalize(c.name) === canon);
  const pool = exact.length ? exact : candidates;

  // Flatten variants, score by set preference
  type Flat = { cardId: number; variantId: number | null; setId: number | null; typeText: string | null; setName: string | null };
  const flats: Flat[] = [];
  for (const c of pool) {
    if (!c.variants.length) {
      flats.push({ cardId: c.id, variantId: null, setId: null, typeText: null, setName: null });
      continue;
    }
    for (const v of c.variants) {
      flats.push({ cardId: c.id, variantId: v.id, setId: v.setId, typeText: v.typeText, setName: v.set?.name ?? null });
    }
  }

  if (!flats.length) return null;

  const score = (setName: string | null) => {
    if (!setName) return -1;
    const idx = setPreference.indexOf(setName);
    return idx < 0 ? 0 : setPreference.length - idx; // higher is better
  };

  flats.sort((a, b) => score(b.setName) - score(a.setName));
  let top = flats[0];

  // Fallback: if typeText is missing, try CardSetMetadata to infer type
  if ((top.typeText == null || top.typeText === "") && top.setId != null) {
    try {
      const meta = await prisma.cardSetMetadata.findFirst({
        where: { cardId: top.cardId, setId: top.setId },
        select: { type: true },
      });
      if (meta && meta.type) {
        top = { ...top, typeText: meta.type };
      }
    } catch {}
  }

  return top;
}

function canonicalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-–—_,:;.!?()/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}
