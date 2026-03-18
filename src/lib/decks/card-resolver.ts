/**
 * Shared card name → variant resolution utility.
 *
 * Used by all deck import routes (text, curiosa, external) to batch-resolve
 * card names to database variants with fuzzy matching, set preference scoring,
 * and CardSetMetadata type lookup.
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResolvedCard {
  cardId: number;
  variantId: number | null;
  setId: number | null;
  /** Flavor type text from Variant (e.g. "Legendary Minion — Undead") */
  typeText: string | null;
  /** Authoritative card type from CardSetMetadata (e.g. "Avatar", "Site") */
  type: string | null;
  /** The actual card name in the database */
  matchedName: string;
  /** True when the match was fuzzy (canonicalized, not exact) */
  wasFuzzy: boolean;
}

export interface ResolveOptions {
  /** Ordered set preference (first = highest priority fallback) */
  setPreference?: string[];
  /** Per-card set override, e.g. from CardNexus format */
  nameToPreferredSet?: Map<string, string>;
}

export interface ResolveResult {
  resolved: Map<string, ResolvedCard>;
  unresolved: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function canonicalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-–—_,:;.!?()/]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
}

export function normalizeName(s: string): string {
  return s
    .replace(/[\u00A0\t\r]+/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

const DEFAULT_SET_PREFERENCE = ["Alpha", "Beta", "Arthurian Legends"];

/**
 * Batch-resolve an array of card names to their best-matching database
 * variants.  Returns a map keyed by the *original* input name, plus a list
 * of names that could not be matched.
 */
export async function resolveCardNames(
  names: string[],
  options?: ResolveOptions
): Promise<ResolveResult> {
  const resolved = new Map<string, ResolvedCard>();
  const setPreference = options?.setPreference ?? DEFAULT_SET_PREFERENCE;
  const nameToPreferredSet = options?.nameToPreferredSet;

  if (names.length === 0) return { resolved, unresolved: [] };

  // ------------------------------------------------------------------
  // 1. Single query: fetch all candidate cards whose name matches any
  //    of the input names (case-insensitive via Prisma).  We also add
  //    the canonicalized forms to widen the net for fuzzy matches.
  // ------------------------------------------------------------------
  const lookupNames = names.flatMap((name) => {
    const canon = canonicalize(name);
    return canon === name.toLowerCase() ? [name] : [name, canon];
  });

  const candidates = await prisma.card.findMany({
    where: { name: { in: lookupNames, mode: "insensitive" } },
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

  // ------------------------------------------------------------------
  // 2. Group candidates by original input name
  // ------------------------------------------------------------------
  const candidatesByName = new Map<string, typeof candidates>();
  for (const name of names) {
    const canon = canonicalize(name);
    const matches = candidates.filter(
      (c) => canonicalize(c.name) === canon || c.name === name
    );
    candidatesByName.set(name, matches);
  }

  // ------------------------------------------------------------------
  // 3. For each name, pick the best variant using set preference scoring
  // ------------------------------------------------------------------
  const needsMetadata: { name: string; cardId: number; setId: number }[] = [];

  for (const [originalName, cardCandidates] of candidatesByName) {
    if (!cardCandidates.length) continue;

    const canon = canonicalize(originalName);
    const exact = cardCandidates.filter((c) => canonicalize(c.name) === canon);
    const pool = exact.length ? exact : cardCandidates;

    // Flatten all variants from the candidate pool
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

    // Per-card set override (e.g. CardNexus "Card Name (BETA)")
    const specificSet = nameToPreferredSet?.get(originalName);

    const score = (setName: string | null) => {
      if (!setName) return -1;
      if (specificSet && setName.toLowerCase() === specificSet.toLowerCase()) {
        return 1000;
      }
      const idx = setPreference.indexOf(setName);
      return idx < 0 ? 0 : setPreference.length - idx;
    };

    flats.sort((a, b) => score(b.setName) - score(a.setName));
    const top = flats[0];

    const exactNameMatch = pool.some((c) => c.name === originalName);
    const matchedCard = pool.find((c) => c.id === top.cardId);

    resolved.set(originalName, {
      cardId: top.cardId,
      variantId: top.variantId,
      setId: top.setId,
      typeText: top.typeText,
      type: null, // populated below from CardSetMetadata
      matchedName: matchedCard?.name ?? originalName,
      wasFuzzy: !exactNameMatch,
    });

    if (top.setId != null) {
      needsMetadata.push({
        name: originalName,
        cardId: top.cardId,
        setId: top.setId,
      });
    }
  }

  // ------------------------------------------------------------------
  // 4. Batch-fetch CardSetMetadata for authoritative type info
  // ------------------------------------------------------------------
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
      const existing = resolved.get(name);
      if (type && existing) {
        resolved.set(name, { ...existing, type });
      }
      // Fallback: if no metadata type, try to use typeText
      if (!type && existing && !existing.type && existing.typeText) {
        resolved.set(name, { ...existing, type: existing.typeText });
      }
    }
  }

  // ------------------------------------------------------------------
  // 5. Compute unresolved names
  // ------------------------------------------------------------------
  const unresolved = names.filter((n) => !resolved.has(n));

  return { resolved, unresolved };
}
