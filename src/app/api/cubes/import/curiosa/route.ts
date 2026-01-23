import { NextRequest } from "next/server";
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchCuriosatrpc,
  fetchWithTimeout,
  extractDeckId,
} from "@/lib/services/curiosa-deck";

export const dynamic = "force-dynamic";

// Minimal JSON typing helpers
type JSONValue = string | number | boolean | null | JSONObject | JSONArray;
type JSONArray = JSONValue[];
interface JSONObject {
  [key: string]: JSONValue;
}

// POST /api/cubes/import/curiosa
// Imports a Curiosa deck as a cube (all cards go into main zone, no validation)
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
            "Your account could not be found in the database. Please sign out, clear cookies, and sign back in.",
        }),
        { status: 401, headers: { "content-type": "application/json" } }
      );
    }

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

    // Get TTS JSON either from pasted body or by fetching from Curiosa
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

      // Try tRPC endpoint first
      const trpcData = await fetchCuriosatrpc(deckId);
      if (trpcData) {
        const finalName =
          overrideName || trpcData.deckName || `Curiosa Cube ${deckId}`;
        const importResult = await importFromTrpcData(
          trpcData.deckList,
          trpcData.sideboardList,
          session.user.id,
          finalName
        );
        if (importResult.error || !importResult.cube) {
          return new Response(
            JSON.stringify({
              error: importResult.error ?? "Failed to create cube",
              unresolved: importResult.unresolved,
            }),
            { status: 400 }
          );
        }
        return new Response(
          JSON.stringify({
            id: importResult.cube.id,
            name: importResult.cube.name,
            cardCount: importResult.cube.cardCount,
            sideboardCount: importResult.cube.sideboardCount,
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        );
      }

      // Fallback to TTS JSON
      const candidates = buildUrlCandidates(rawUrl, deckId);
      tts = await fetchFirstJson(candidates);
      if (!tts) {
        return new Response(
          JSON.stringify({
            error:
              "Failed to fetch Curiosa deck. If private, paste the TTS JSON instead.",
          }),
          { status: 400 }
        );
      }
    }

    // Extract card names and counts from TTS JSON
    const nameCounts = extractNamesAndCounts(tts);
    const entries = Array.from(nameCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .filter((e) => !!e.name && e.count > 0);

    if (entries.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No cards found in Curiosa TTS export.",
        }),
        { status: 400 }
      );
    }

    // Map names to variants/cards
    const uniqueNames = [...new Set(entries.map((e) => e.name))];
    const resolvedByName = await findBestVariantsForNames(uniqueNames);

    type Mapped = {
      cardId: number;
      variantId: number | null;
      setId: number | null;
      count: number;
      name: string;
    };

    const mapped: Mapped[] = [];
    const unresolved: { name: string; count: number }[] = [];

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

    // Create cube with all cards in main zone
    const curiosaSourceId = extractDeckId(rawUrl);
    const cubeName =
      overrideName || `Curiosa Cube ${curiosaSourceId || "Import"}`;

    const cube = await prisma.cube.create({
      data: {
        name: cubeName,
        imported: true,
        isPublic: false,
        user: { connect: { id: session.user.id } },
      },
    });

    // Aggregate by cardId+variantId
    const agg = new Map<
      string,
      { cardId: number; variantId: number | null; setId: number | null; count: number }
    >();
    for (const m of mapped) {
      const key = `${m.cardId}:${m.variantId ?? "x"}`;
      const prev = agg.get(key);
      if (prev) prev.count += m.count;
      else agg.set(key, { ...m });
    }

    const createRows = Array.from(agg.values()).map((v) => ({
      cubeId: cube.id,
      cardId: v.cardId,
      setId: v.setId,
      variantId: v.variantId,
      count: v.count,
      zone: "main",
    }));

    if (createRows.length) {
      await prisma.cubeCard.createMany({ data: createRows });
    }

    const totalCards = createRows.reduce((sum, r) => sum + r.count, 0);

    return new Response(
      JSON.stringify({
        id: cube.id,
        name: cube.name,
        cardCount: totalCards,
        sideboardCount: 0,
      }),
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

function buildUrlCandidates(rawUrl: string, deckId: string | null): string[] {
  const candidates: string[] = [];
  const tried = new Set<string>();

  if (rawUrl) candidates.push(rawUrl);

  let pastedOrigin: string | null = null;
  try {
    const u = new URL(rawUrl);
    pastedOrigin = u.origin;
    if (/\/decks\//.test(u.pathname) && !/\/tts\/?$/.test(u.pathname)) {
      const withTts = `${pastedOrigin}${u.pathname.replace(/\/$/, "")}/tts`;
      if (!tried.has(withTts)) {
        candidates.push(withTts);
        tried.add(withTts);
      }
    }
  } catch {
    // Invalid URL, skip
  }

  const origins = Array.from(
    new Set(
      [pastedOrigin, "https://curiosa.io", "https://www.curiosa.io"].filter(
        Boolean
      )
    )
  ) as string[];

  if (deckId) {
    for (const origin of origins) {
      const apiPath = `${origin}/api/decks/${encodeURIComponent(deckId)}/tts`;
      if (!tried.has(apiPath)) {
        candidates.push(apiPath);
        tried.add(apiPath);
      }
      const webPath = `${origin}/decks/${encodeURIComponent(deckId)}/tts`;
      if (!tried.has(webPath)) {
        candidates.push(webPath);
        tried.add(webPath);
      }
    }
  }

  return candidates;
}

async function fetchFirstJson(urls: string[]): Promise<JSONValue | null> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (uniqueUrls.length === 0) return null;

  const results = await Promise.allSettled(
    uniqueUrls.map(async (url) => {
      const res = await fetchWithTimeout(
        url,
        {
          cache: "no-store",
          headers: { Accept: "application/json, text/plain, */*" },
        },
        8000
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
    if (typeof node === "string" || typeof node === "number" || typeof node === "boolean")
      return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }

    const obj = node as JSONObject;
    const nickname = obj["Nickname"];
    if (typeof nickname === "string") push(nickname, 1);

    const cardName = obj["CardName"];
    const quantity = obj["Quantity"];
    if (typeof cardName === "string")
      push(cardName, typeof quantity === "number" ? quantity : 1);

    const nameFields = ["name", "Name", "card_name", "title"] as const;
    const countFields = ["count", "Count", "qty", "Qty", "quantity", "Quantity", "copies", "Copies"] as const;
    for (const nf of nameFields) {
      const n = obj[nf as keyof JSONObject];
      if (typeof n === "string") {
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

    const objectStates = obj["ObjectStates"];
    if (Array.isArray(objectStates)) for (const child of objectStates) visit(child);
    const contained = obj["ContainedObjects"];
    if (Array.isArray(contained)) for (const child of contained) visit(child);
    const children = obj["Children"];
    if (Array.isArray(children)) for (const child of children) visit(child);
  };

  visit(tts);
  return counts;
}

function normalizeName(s: string): string {
  return s
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
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

async function findBestVariantsForNames(
  names: string[]
): Promise<
  Map<string, { cardId: number; variantId: number | null; setId: number | null }>
> {
  const result = new Map<
    string,
    { cardId: number; variantId: number | null; setId: number | null }
  >();

  if (names.length === 0) return result;

  const cards = await prisma.card.findMany({
    where: { name: { in: names, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      variants: {
        select: { id: true, setId: true },
        take: 1,
      },
    },
  });

  const cardByCanon = new Map<
    string,
    { id: number; name: string; variants: { id: number; setId: number | null }[] }
  >();
  for (const c of cards) {
    cardByCanon.set(canonicalize(c.name), c);
  }

  for (const name of names) {
    const canon = canonicalize(name);
    const card = cardByCanon.get(canon);
    if (!card) continue;

    const v = card.variants[0];
    result.set(name, {
      cardId: card.id,
      variantId: v?.id ?? null,
      setId: v?.setId ?? null,
    });
  }

  return result;
}

// Import from tRPC data (using CuriosatrpcDeck type - variant ids are strings)
async function importFromTrpcData(
  deckList: Array<{
    card: { name: string; slug: string; variants: { id: string; slug: string }[] };
    variantId: string;
    quantity: number;
  }>,
  sideboardList: Array<{
    card: { name: string; slug: string; variants: { id: string; slug: string }[] };
    variantId: string;
    quantity: number;
  }>,
  userId: string,
  cubeName: string
): Promise<{
  error?: string;
  unresolved?: { name: string; count: number }[];
  cube?: { id: string; name: string; cardCount: number; sideboardCount: number };
}> {
  // Combine main deck and sideboard as cube cards
  const entries: { name: string; slug: string; quantity: number; zone: "main" | "sideboard" }[] = [];

  for (const entry of deckList) {
    const { card, variantId, quantity } = entry;
    const variant = card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || card.slug;
    entries.push({ name: card.name, slug, quantity, zone: "main" });
  }

  for (const entry of sideboardList) {
    const { card, variantId, quantity } = entry;
    const variant = card.variants.find((v) => v.id === variantId) || card.variants[0];
    const slug = variant?.slug || card.slug;
    entries.push({ name: card.name, slug, quantity, zone: "sideboard" });
  }

  if (entries.length === 0) {
    return { error: "No cards found in Curiosa deck" };
  }

  // Batch lookup variants by slug
  const allSlugs = entries.map((e) => e.slug);
  const variants = await prisma.variant.findMany({
    where: { slug: { in: allSlugs } },
    select: { id: true, cardId: true, setId: true, slug: true },
  });
  const variantBySlug = new Map(variants.map((v) => [v.slug, v]));

  // Fallback for unresolved slugs
  const needsNameLookup = entries.filter((e) => !variantBySlug.has(e.slug));
  let cardByNameLower = new Map<
    string,
    { id: number; variants: { id: number; setId: number | null }[] }
  >();

  if (needsNameLookup.length > 0) {
    const names = [...new Set(needsNameLookup.map((e) => e.name))];
    const cards = await prisma.card.findMany({
      where: { name: { in: names, mode: "insensitive" } },
      select: {
        id: true,
        name: true,
        variants: { select: { id: true, setId: true }, take: 1 },
      },
    });
    cardByNameLower = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
  }

  type Mapped = {
    cardId: number;
    variantId: number | null;
    setId: number | null;
    count: number;
    zone: "main" | "sideboard";
  };

  const mapped: Mapped[] = [];
  const unresolved: { name: string; count: number }[] = [];

  for (const entry of entries) {
    const variant = variantBySlug.get(entry.slug);
    if (!variant) {
      const card = cardByNameLower.get(entry.name.toLowerCase());
      if (!card) {
        unresolved.push({ name: entry.name, count: entry.quantity });
        continue;
      }
      const v = card.variants[0];
      mapped.push({
        cardId: card.id,
        variantId: v?.id ?? null,
        setId: v?.setId ?? null,
        count: entry.quantity,
        zone: entry.zone,
      });
    } else {
      mapped.push({
        cardId: variant.cardId,
        variantId: variant.id,
        setId: variant.setId,
        count: entry.quantity,
        zone: entry.zone,
      });
    }
  }

  if (unresolved.length > 0) {
    return { error: `Could not map some cards`, unresolved };
  }

  // Create cube
  const cube = await prisma.cube.create({
    data: {
      name: cubeName,
      imported: true,
      isPublic: false,
      user: { connect: { id: userId } },
    },
  });

  // Aggregate by cardId+variantId+zone
  const agg = new Map<
    string,
    { cardId: number; variantId: number | null; setId: number | null; count: number; zone: string }
  >();
  for (const m of mapped) {
    const key = `${m.cardId}:${m.variantId ?? "x"}:${m.zone}`;
    const prev = agg.get(key);
    if (prev) prev.count += m.count;
    else agg.set(key, { ...m });
  }

  const createRows = Array.from(agg.values()).map((v) => ({
    cubeId: cube.id,
    cardId: v.cardId,
    setId: v.setId,
    variantId: v.variantId,
    count: v.count,
    zone: v.zone,
  }));

  if (createRows.length) {
    await prisma.cubeCard.createMany({ data: createRows });
  }

  const mainCount = createRows
    .filter((r) => r.zone === "main")
    .reduce((sum, r) => sum + r.count, 0);
  const sideboardCount = createRows
    .filter((r) => r.zone === "sideboard")
    .reduce((sum, r) => sum + r.count, 0);

  return {
    cube: {
      id: cube.id,
      name: cube.name,
      cardCount: mainCount,
      sideboardCount,
    },
  };
}
