/**
 * Resolve a Curiosa (sorcerytcg.com) or Four Cores deck into our card rows.
 *
 * Shared by the persistent import (`/api/decks/import/curiosa`, which stores a
 * Deck) and the ephemeral guest path (`/api/guest/deck`, which hands the card
 * refs straight to the game loader without touching the Deck table).
 */

import { codexIdForPrinting } from "@/lib/cards/registry";
import { prisma } from "@/lib/prisma";
import {
  extractDeckId,
  fetchCuriosatrpc,
  type CuriosatrpcDeck,
  type CuriosatrpcResult,
} from "@/lib/services/curiosa-deck";
import {
  extractFourCoresDeckId,
  fetchFourCoresDeck,
  isFourCoresUrl,
} from "@/lib/services/fourcores-deck";

export type ExternalDeckSource = "curiosa" | "fourcores";

export interface ExternalDeckFetch {
  source: ExternalDeckSource;
  sourceId: string | null;
  deck: CuriosatrpcResult;
}

/**
 * Fetch the structured decklist behind a deck URL. Four Cores decks are
 * normalized into the Curiosa shape by their service, so both share one path.
 */
export async function fetchExternalDeck(
  rawUrl: string,
): Promise<ExternalDeckFetch | null> {
  if (isFourCoresUrl(rawUrl)) {
    const deck = await fetchFourCoresDeck(rawUrl);
    if (!deck) return null;
    return {
      source: "fourcores",
      sourceId: extractFourCoresDeckId(rawUrl),
      deck,
    };
  }
  const sourceId = extractDeckId(rawUrl);
  const deck = await fetchCuriosatrpc(sourceId);
  if (!deck) return null;
  return { source: "curiosa", sourceId, deck };
}

export function externalDeckFetchError(rawUrl: string): string {
  return isFourCoresUrl(rawUrl)
    ? "Failed to fetch Four Cores deck. Make sure the deck is public and the URL is correct."
    : "Failed to fetch deck. Make sure the URL points to a deck on sorcerytcg.com and that the deck still exists.";
}

export type ResolvedDeckZone = "Spellbook" | "Atlas" | "Collection";

export interface ResolvedDeckRow {
  cardId: number;
  variantId: number | null;
  setId: number | null;
  zone: ResolvedDeckZone;
  count: number;
  name: string;
}

export interface ResolvedExternalDeck {
  rows: ResolvedDeckRow[];
  avatarName: string;
  /** Main-deck spell count, avatar excluded */
  spellbookCount: number;
  atlasCount: number;
  collectionCount: number;
}

export type UnresolvedCard = { name: string; count: number };

export type ResolveExternalDeckResult =
  | { ok: true; deck: ResolvedExternalDeck }
  | { ok: false; error: string; unresolved?: UnresolvedCard[] };

type DeckEntry = {
  name: string;
  slug: string;
  printingId: string | null;
  quantity: number;
  category: string;
  type: string;
  zone: "main" | "sideboard";
};

type ResolvedVariant = {
  id: number;
  cardId: number;
  setId: number | null;
  typeText: string | null;
};

function toEntry(
  entry: CuriosatrpcDeck,
  zone: DeckEntry["zone"],
): DeckEntry {
  const { card, variantId, quantity } = entry;
  const variant =
    card.variants.find((v) => v.id === variantId) || card.variants[0];
  return {
    name: card.name,
    slug: variant?.slug || `${card.slug}`,
    printingId: variant?.printingId ?? null,
    quantity,
    category: card.category,
    type: card.type,
    zone,
  };
}

/**
 * Map every decklist entry onto a card/variant in our database.
 *
 * Resolution order, most to least precise:
 *   1. registry printing id  - exact printing, survives upstream renames
 *   2. legacy slug           - printings the registry doesn't cover
 *   3. registry codex id     - a different printing of the same card, for
 *                              alternate art we hold no assets for
 *   4. card name             - last resort
 */
export async function resolveExternalDeckRows(
  deck: CuriosatrpcResult,
): Promise<ResolveExternalDeckResult> {
  const entries: DeckEntry[] = [];

  // Sideboard/collection cards are ADDITIONAL cards, not duplicates
  // (Imposter decks keep extra avatars in the collection to mask as)
  for (const entry of deck.deckList) entries.push(toEntry(entry, "main"));
  for (const entry of deck.sideboardList) {
    const isAvatar = entry.card.type?.toLowerCase() === "avatar";
    // The main avatar is added separately below; other avatars stay in Collection
    if (isAvatar && entry.card.name === deck.avatarName) continue;
    entries.push(toEntry(entry, "sideboard"));
  }

  if (entries.length === 0) {
    return { ok: false, error: "No cards found in the imported deck" };
  }

  // Group by slug+zone and sum quantities (sideboard cards stay separate)
  const grouped = new Map<string, DeckEntry>();
  for (const e of entries) {
    const key = `${e.slug}:${e.zone}`;
    const existing = grouped.get(key);
    if (existing) existing.quantity += e.quantity;
    else grouped.set(key, { ...e });
  }
  const groupedEntries = Array.from(grouped.values());

  const allSlugs = groupedEntries.map((e) => e.slug);
  const allPrintingIds = groupedEntries
    .map((e) => e.printingId)
    .filter((id): id is string => !!id);

  const variants = await prisma.variant.findMany({
    where: {
      OR: [
        { slug: { in: allSlugs } },
        ...(allPrintingIds.length
          ? [{ printingId: { in: allPrintingIds } }]
          : []),
      ],
    },
    select: {
      id: true,
      cardId: true,
      setId: true,
      typeText: true,
      slug: true,
      printingId: true,
    },
  });
  const variantBySlug = new Map(variants.map((v) => [v.slug, v]));
  const variantByPrintingId = new Map(
    variants
      .filter((v) => !!v.printingId)
      .map((v) => [v.printingId as string, v]),
  );

  const directHit = (entry: DeckEntry): ResolvedVariant | undefined =>
    (entry.printingId
      ? variantByPrintingId.get(entry.printingId)
      : undefined) ?? variantBySlug.get(entry.slug);

  const needsFallback = groupedEntries.filter((e) => !directHit(e));

  // A printing we don't carry still identifies its card, so fall back to any
  // printing of that card rather than failing the whole import
  const variantByCodexId = new Map<string, ResolvedVariant>();
  const codexIds = [
    ...new Set(
      needsFallback
        .map((e) => codexIdForPrinting(e.printingId ?? undefined))
        .filter((id): id is string => !!id),
    ),
  ];
  if (codexIds.length > 0) {
    const cards = await prisma.card.findMany({
      where: { codexId: { in: codexIds } },
      select: {
        id: true,
        codexId: true,
        variants: {
          select: { id: true, setId: true, typeText: true },
          take: 1,
        },
      },
    });
    for (const c of cards) {
      const v = c.variants[0];
      if (c.codexId && v) {
        variantByCodexId.set(c.codexId, {
          id: v.id,
          cardId: c.id,
          setId: v.setId,
          typeText: v.typeText,
        });
      }
    }
  }

  // Batch lookup cards by name for anything still unmatched
  let cardByNameLower = new Map<
    string,
    {
      id: number;
      variants: { id: number; setId: number | null; typeText: string | null }[];
    }
  >();
  const needsNameLookup = needsFallback.filter((e) => {
    const codexId = codexIdForPrinting(e.printingId ?? undefined);
    return !codexId || !variantByCodexId.has(codexId);
  });
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

  const rows: ResolvedDeckRow[] = [];
  const unresolved: UnresolvedCard[] = [];
  for (const entry of groupedEntries) {
    const codexId = codexIdForPrinting(entry.printingId ?? undefined);
    const nameMatch = cardByNameLower.get(entry.name.toLowerCase());
    const resolved: ResolvedVariant | undefined =
      directHit(entry) ??
      (codexId ? variantByCodexId.get(codexId) : undefined) ??
      (nameMatch && nameMatch.variants[0]
        ? {
            id: nameMatch.variants[0].id,
            cardId: nameMatch.id,
            setId: nameMatch.variants[0].setId,
            typeText: nameMatch.variants[0].typeText,
          }
        : undefined);

    if (!resolved) {
      unresolved.push({ name: entry.name, count: entry.quantity });
      continue;
    }

    // sideboard -> Collection, main deck sites -> Atlas, main deck spells -> Spellbook
    let zone: ResolvedDeckZone;
    if (entry.zone === "sideboard") {
      zone = "Collection";
    } else {
      const isSite =
        entry.type?.toLowerCase() === "site" ||
        entry.category?.toLowerCase() === "site";
      zone = isSite ? "Atlas" : "Spellbook";
    }
    rows.push({
      cardId: resolved.cardId,
      variantId: resolved.id,
      setId: resolved.setId,
      zone,
      count: entry.quantity,
      name: entry.name,
    });
  }

  if (unresolved.length > 0) {
    return {
      ok: false,
      error: "Could not map some cards by slug or name",
      unresolved,
    };
  }

  // The avatar comes from deck metadata, not the list
  const avatarName = deck.avatarName;
  if (!avatarName) {
    return {
      ok: false,
      error: "Deck requires exactly 1 Avatar (none found in the imported deck)",
    };
  }
  const avatarCard = await prisma.card.findFirst({
    where: { name: { equals: avatarName, mode: "insensitive" } },
    select: {
      id: true,
      variants: { select: { id: true, setId: true }, take: 1 },
    },
  });
  if (!avatarCard) {
    return { ok: false, error: `Avatar "${avatarName}" not found in database` };
  }
  const avatarVariant = avatarCard.variants[0];
  rows.push({
    cardId: avatarCard.id,
    variantId: avatarVariant?.id ?? null,
    setId: avatarVariant?.setId ?? null,
    zone: "Spellbook", // Avatars live in the spellbook
    count: 1,
    name: avatarName,
  });

  const sum = (zone: ResolvedDeckZone) =>
    rows.filter((r) => r.zone === zone).reduce((a, r) => a + r.count, 0);

  return {
    ok: true,
    deck: {
      rows,
      avatarName,
      spellbookCount: sum("Spellbook") - 1, // minus avatar
      atlasCount: sum("Atlas"),
      collectionCount: sum("Collection"),
    },
  };
}

/** Merge rows that resolved to the same card/variant/zone (e.g. two slugs of one printing). */
export function aggregateDeckRows(
  rows: ResolvedDeckRow[],
): Array<Omit<ResolvedDeckRow, "name">> {
  const agg = new Map<string, Omit<ResolvedDeckRow, "name">>();
  for (const r of rows) {
    const key = `${r.cardId}:${r.zone}:${r.variantId ?? "x"}`;
    const prev = agg.get(key);
    if (prev) prev.count += r.count;
    else {
      agg.set(key, {
        cardId: r.cardId,
        variantId: r.variantId,
        setId: r.setId,
        zone: r.zone,
        count: r.count,
      });
    }
  }
  return Array.from(agg.values());
}

/** Card shape the client game loader expects (mirrors GET /api/decks/[id]). */
export interface DeckCardRef {
  cardId: number;
  variantId: number | null;
  name: string;
  type: string | null;
  subTypes: string | null;
  slug: string;
  thresholds: Record<string, number> | null;
}

export interface DeckCardRefZones {
  spellbook: DeckCardRef[];
  atlas: DeckCardRef[];
  collection: DeckCardRef[];
}

/** Legacy slug for printings without a variant row: `<set>-<card_name>-b-s`. */
export function buildFallbackSlug(
  cardName: string,
  setName: string | null | undefined,
): string {
  const lower = (setName || "").toLowerCase();
  let prefix = "bet"; // default to beta
  if (lower.startsWith("alpha")) prefix = "alp";
  else if (lower.startsWith("beta")) prefix = "bet";
  else if (lower.startsWith("arthurian")) prefix = "art";
  else if (lower.startsWith("dragon")) prefix = "dra";
  else if (lower.startsWith("gothic")) prefix = "got";
  else if (lower.startsWith("promo") || lower.includes("organized"))
    prefix = "pro";
  const cardPart = cardName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return `${prefix}-${cardPart}-b-s`;
}

/**
 * Expand resolved rows into per-copy card refs with type/thresholds metadata,
 * exactly as the deck GET endpoint serves stored decks.
 */
export async function buildDeckCardRefs(
  rows: ResolvedDeckRow[],
): Promise<DeckCardRefZones> {
  const cardIds = [...new Set(rows.map((r) => r.cardId))];
  const variantIds = [
    ...new Set(
      rows.map((r) => r.variantId).filter((v): v is number => v != null),
    ),
  ];
  const pairs = rows
    .filter((r): r is ResolvedDeckRow & { setId: number } => r.setId != null)
    .map((r) => ({ cardId: r.cardId, setId: r.setId }));

  const [cards, variants, metas, sets] = await Promise.all([
    prisma.card.findMany({
      where: { id: { in: cardIds } },
      select: { id: true, name: true, subTypes: true },
    }),
    variantIds.length
      ? prisma.variant.findMany({
          where: { id: { in: variantIds } },
          select: { id: true, slug: true, typeText: true },
        })
      : Promise.resolve([]),
    pairs.length
      ? prisma.cardSetMetadata.findMany({
          where: { OR: pairs },
          select: { cardId: true, setId: true, type: true, thresholds: true },
        })
      : Promise.resolve([]),
    pairs.length
      ? prisma.set.findMany({
          where: { id: { in: [...new Set(pairs.map((p) => p.setId))] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const variantById = new Map(variants.map((v) => [v.id, v]));
  const setNameById = new Map(sets.map((s) => [s.id, s.name]));
  const metaByKey = new Map(
    metas.map((m) => [
      `${m.cardId}:${m.setId}`,
      {
        type: m.type,
        thresholds: m.thresholds as unknown as Record<string, number> | null,
      },
    ]),
  );

  const zones: DeckCardRefZones = { spellbook: [], atlas: [], collection: [] };
  for (const row of rows) {
    const card = cardById.get(row.cardId);
    const variant = row.variantId != null ? variantById.get(row.variantId) : null;
    const meta = row.setId != null ? metaByKey.get(`${row.cardId}:${row.setId}`) : undefined;
    const name = card?.name ?? row.name;
    const ref: DeckCardRef = {
      cardId: row.cardId,
      variantId: row.variantId,
      name,
      // Prefer metadata.type (authoritative) over variant.typeText (flavor text)
      type: meta?.type || variant?.typeText || null,
      subTypes: card?.subTypes || null,
      slug:
        variant?.slug ??
        buildFallbackSlug(
          name,
          row.setId != null ? setNameById.get(row.setId) : null,
        ),
      thresholds: meta?.thresholds ?? null,
    };
    const target =
      row.zone === "Atlas"
        ? zones.atlas
        : row.zone === "Collection"
          ? zones.collection
          : zones.spellbook;
    for (let i = 0; i < row.count; i++) target.push(ref);
  }
  return zones;
}
