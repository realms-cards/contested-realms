"use strict";

import type { PrismaClient } from "@prisma/client";

/**
 * Pre-computes all meta statistics and stores them in the MetaStatsSnapshot table.
 * Called periodically by the maintenance timer and on server startup.
 */

type AnyPrisma = PrismaClient & Record<string, unknown>;

// Structurally compatible with Prisma.InputJsonValue (avoids direct Prisma namespace import
// which may not resolve in all build contexts e.g. Docker)
interface PrismaJsonObject { readonly [key: string]: PrismaJson | null }
type PrismaJson = string | number | boolean | PrismaJsonObject | ReadonlyArray<PrismaJson | null>;

type ElementRow = { elements: string | null; plays: bigint; wins: bigint };
type TypeRow = { type: string | null; plays: bigint; wins: bigint };
type CostRow = { cost: number | null; plays: bigint; wins: bigint };
type RarityRow = { rarity: string | null; plays: bigint; wins: bigint };
type MatchRow = { format: string; count: bigint; avgDuration: number | null };

type DeckCard = { type?: string | null; name?: string | null; zone?: string | null };
type SessionRow = {
  id: string;
  playerDecks: Record<string, DeckCard[]> | null;
  playerIds: string[];
  winnerId: string | null;
  loserId: string | null;
  isDraw: boolean;
  format: string;
};

const FORMATS = ["constructed", "sealed", "draft"] as const;
const CARD_CATEGORIES = ["avatar", "site", "spellbook", "all"] as const;
const CARD_ORDERS = ["plays", "wins", "winRate"] as const;
const CARD_LIMIT = 200; // Pre-compute a generous amount; clients can trim

function isAvatarType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.toLowerCase().includes("avatar");
}

function isSiteType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.toLowerCase().includes("site");
}

function isCollectionZone(card: DeckCard): boolean {
  return typeof card?.zone === "string" && card.zone.toLowerCase() === "collection";
}

function matchesCategory(type: string | undefined, category: string): boolean {
  if (category === "all") return true;
  const lower = (type || "").toLowerCase();
  if (category === "avatar") return lower === "avatar";
  if (category === "site") return lower.includes("site");
  return lower !== "avatar" && !lower.includes("site");
}

async function computeElements(prisma: AnyPrisma, format: string): Promise<unknown> {
  const rows = await prisma.$queryRaw<ElementRow[]>`
    SELECT c.elements,
           SUM(h.plays)::bigint as plays,
           SUM(h.wins)::bigint as wins
    FROM "HumanCardStats" h
    JOIN "Card" c ON c.id = h."cardId"
    WHERE h.format = ${format}::"GameFormat"
    GROUP BY c.elements
    ORDER BY SUM(h.plays) DESC
  `;
  return {
    stats: rows.map((r: ElementRow) => {
      const plays = Number(r.plays);
      const wins = Number(r.wins);
      return {
        element: r.elements || "None",
        plays,
        wins,
        winRate: plays > 0 ? wins / plays : 0,
      };
    }),
    format,
  };
}

async function computeTypes(prisma: AnyPrisma, format: string): Promise<unknown> {
  const rows = await prisma.$queryRaw<TypeRow[]>`
    SELECT m.type,
           SUM(h.plays)::bigint as plays,
           SUM(h.wins)::bigint as wins
    FROM "HumanCardStats" h
    JOIN LATERAL (
      SELECT type FROM "CardSetMetadata"
      WHERE "cardId" = h."cardId"
      LIMIT 1
    ) m ON true
    WHERE h.format = ${format}::"GameFormat"
    GROUP BY m.type
    ORDER BY SUM(h.plays) DESC
  `;
  return {
    stats: rows.map((r: TypeRow) => {
      const plays = Number(r.plays);
      const wins = Number(r.wins);
      return {
        type: r.type || "Unknown",
        plays,
        wins,
        winRate: plays > 0 ? wins / plays : 0,
      };
    }),
    format,
  };
}

async function computeCosts(prisma: AnyPrisma, format: string): Promise<unknown> {
  const rows = await prisma.$queryRaw<CostRow[]>`
    SELECT m.cost,
           SUM(h.plays)::bigint as plays,
           SUM(h.wins)::bigint as wins
    FROM "HumanCardStats" h
    JOIN LATERAL (
      SELECT cost FROM "CardSetMetadata"
      WHERE "cardId" = h."cardId"
      LIMIT 1
    ) m ON true
    WHERE h.format = ${format}::"GameFormat"
      AND m.cost IS NOT NULL
    GROUP BY m.cost
    ORDER BY m.cost ASC
  `;
  return {
    stats: rows.map((r: CostRow) => {
      const plays = Number(r.plays);
      const wins = Number(r.wins);
      return {
        cost: r.cost ?? 0,
        plays,
        wins,
        winRate: plays > 0 ? wins / plays : 0,
      };
    }),
    format,
  };
}

async function computeRarity(prisma: AnyPrisma, format: string): Promise<unknown> {
  const rows = await prisma.$queryRaw<RarityRow[]>`
    SELECT m.rarity::text as rarity,
           SUM(h.plays)::bigint as plays,
           SUM(h.wins)::bigint as wins
    FROM "HumanCardStats" h
    JOIN LATERAL (
      SELECT rarity FROM "CardSetMetadata"
      WHERE "cardId" = h."cardId"
      LIMIT 1
    ) m ON true
    WHERE h.format = ${format}::"GameFormat"
      AND m.rarity IS NOT NULL
    GROUP BY m.rarity
    ORDER BY SUM(h.plays) DESC
  `;
  return {
    stats: rows.map((r: RarityRow) => {
      const plays = Number(r.plays);
      const wins = Number(r.wins);
      return {
        rarity: r.rarity || "Unknown",
        plays,
        wins,
        winRate: plays > 0 ? wins / plays : 0,
      };
    }),
    format,
  };
}

async function computeMatches(prisma: AnyPrisma): Promise<unknown> {
  const rows = await prisma.$queryRaw<MatchRow[]>`
    SELECT
      format::text as format,
      COUNT(*)::bigint as count,
      AVG(duration)::float as "avgDuration"
    FROM "MatchResult"
    GROUP BY format
    ORDER BY COUNT(*) DESC
  `;
  return {
    stats: rows.map((r: MatchRow) => ({
      format: r.format,
      totalMatches: Number(r.count),
      avgDurationSec: r.avgDuration ?? null,
    })),
  };
}

async function computeCards(
  prisma: AnyPrisma,
  format: string,
  category: string,
  order: string,
): Promise<unknown> {
  const fetchLimit = category === "all" ? CARD_LIMIT : CARD_LIMIT * 2;

  type HumanCardStatRow = {
    cardId: number;
    plays: number;
    wins: number;
    losses: number;
    draws: number;
  };

  const model = (prisma as Record<string, unknown>)["humanCardStats"] as {
    findMany: (args: {
      where: { format: string };
      take: number;
      orderBy: Record<string, "asc" | "desc">;
      select: Record<string, boolean>;
    }) => Promise<HumanCardStatRow[]>;
  };

  const rows = await model.findMany({
    where: { format },
    take: fetchLimit,
    orderBy:
      order === "wins"
        ? { wins: "desc" }
        : { plays: "desc" },
    select: { cardId: true, plays: true, wins: true, losses: true, draws: true },
  });

  const validRows = rows.filter((r) => r.cardId > 0);
  const ids = validRows.map((r) => r.cardId);

  const [cards, variants, cardMeta] = ids.length
    ? await Promise.all([
        prisma.card.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        }),
        prisma.variant.findMany({
          where: { cardId: { in: ids } },
          select: { cardId: true, slug: true },
          distinct: ["cardId"],
        }),
        prisma.cardSetMetadata.findMany({
          where: { cardId: { in: ids } },
          select: { cardId: true, type: true },
          distinct: ["cardId"],
        }),
      ])
    : [[], [], []];

  const nameMap = new Map(cards.map((c: { id: number; name: string }) => [c.id, c.name] as const));
  const slugMap = new Map<number, string>();
  for (const v of variants) {
    if (!slugMap.has(v.cardId)) slugMap.set(v.cardId, v.slug);
  }
  const typeMap = new Map<number, string>();
  for (const m of cardMeta) {
    if (!typeMap.has(m.cardId) && m.type) typeMap.set(m.cardId, m.type);
  }

  const stats = validRows
    .filter((r) => matchesCategory(typeMap.get(r.cardId), category))
    .map((r) => {
      const denom = r.wins + r.losses;
      return {
        cardId: r.cardId,
        name: nameMap.get(r.cardId) || String(r.cardId),
        plays: r.plays,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        winRate: denom > 0 ? r.wins / denom : 0,
        slug: slugMap.get(r.cardId) || null,
        type: typeMap.get(r.cardId) || null,
      };
    })
    .sort((a, b) => {
      if (order === "winRate") return b.winRate - a.winRate || b.plays - a.plays;
      if (order === "wins") return b.wins - a.wins || b.plays - a.plays;
      return b.plays - a.plays;
    })
    .slice(0, CARD_LIMIT);

  return { stats, format, order, limit: CARD_LIMIT, category };
}

async function computeDecks(prisma: AnyPrisma, format: string): Promise<unknown> {
  const sessions = await fetchSessions(prisma, format);

  if (sessions.length === 0) {
    return { archetypes: [], format, totalDecks: 0 };
  }

  // Collect card names
  const allCardNames = new Set<string>();
  for (const session of sessions) {
    if (!session.playerDecks) continue;
    for (const cards of Object.values(session.playerDecks)) {
      if (!Array.isArray(cards)) continue;
      for (const card of cards) {
        if (card?.name) allCardNames.add(card.name);
      }
    }
  }

  // Batch lookup
  const cardNames = [...allCardNames];
  const cardRecords = cardNames.length > 0
    ? await prisma.card.findMany({
        where: { name: { in: cardNames } },
        select: { id: true, name: true, elements: true },
      })
    : [];
  const elementByName = new Map<string, string>();
  const cardIdByName = new Map<string, number>();
  for (const c of cardRecords) {
    elementByName.set(c.name, c.elements || "None");
    cardIdByName.set(c.name, c.id);
  }

  // Avatar slugs
  const avatarCardIds = new Set<number>();
  for (const session of sessions) {
    if (!session.playerDecks) continue;
    for (const cards of Object.values(session.playerDecks)) {
      if (!Array.isArray(cards)) continue;
      for (const card of cards) {
        if (isAvatarType(card?.type) && !isCollectionZone(card) && card.name) {
          const cid = cardIdByName.get(card.name);
          if (cid) avatarCardIds.add(cid);
        }
      }
    }
  }

  const avatarVariants = avatarCardIds.size > 0
    ? await prisma.variant.findMany({
        where: { cardId: { in: [...avatarCardIds] } },
        select: { cardId: true, slug: true },
        distinct: ["cardId"],
      })
    : [];
  const avatarSlugMap = new Map<number, string>();
  for (const v of avatarVariants) {
    if (!avatarSlugMap.has(v.cardId)) avatarSlugMap.set(v.cardId, v.slug);
  }

  // Aggregate per avatar
  type AvatarAggEntry = {
    avatarName: string;
    avatarCardId: number;
    avatarSlug: string | null;
    elementCounts: Record<string, number>;
    totalSpellCards: number;
    matches: number;
    wins: number;
    losses: number;
    draws: number;
    siteAgg: Map<string, { matches: number; wins: number; losses: number; draws: number }>;
  };
  const avatarAgg = new Map<string, AvatarAggEntry>();

  for (const session of sessions) {
    if (!session.playerDecks) continue;
    for (const [playerId, cards] of Object.entries(session.playerDecks)) {
      if (!Array.isArray(cards)) continue;
      let avatarName: string | null = null;
      const elementCounts: Record<string, number> = {};
      let spellCardCount = 0;
      const siteNames: string[] = [];

      for (const card of cards) {
        if (!card?.name) continue;
        if (isCollectionZone(card)) continue;
        if (isAvatarType(card.type)) { avatarName = card.name; continue; }
        if (isSiteType(card.type)) { siteNames.push(card.name); continue; }
        const element = elementByName.get(card.name) || "None";
        elementCounts[element] = (elementCounts[element] || 0) + 1;
        spellCardCount++;
      }

      if (!avatarName) continue;
      const isWinner = session.winnerId === playerId;
      const isLoser = session.loserId === playerId;
      const isDraw = session.isDraw;

      const existing = avatarAgg.get(avatarName);
      if (existing) {
        existing.matches++;
        if (isWinner) existing.wins++;
        else if (isLoser) existing.losses++;
        else if (isDraw) existing.draws++;
        for (const [el, count] of Object.entries(elementCounts)) {
          existing.elementCounts[el] = (existing.elementCounts[el] || 0) + count;
        }
        existing.totalSpellCards += spellCardCount;
        for (const siteName of siteNames) {
          const s = existing.siteAgg.get(siteName);
          if (s) {
            s.matches++;
            if (isWinner) s.wins++;
            else if (isLoser) s.losses++;
            else if (isDraw) s.draws++;
          } else {
            existing.siteAgg.set(siteName, {
              matches: 1,
              wins: isWinner ? 1 : 0,
              losses: isLoser ? 1 : 0,
              draws: isDraw ? 1 : 0,
            });
          }
        }
      } else {
        const cid = cardIdByName.get(avatarName) || 0;
        const siteAgg = new Map<string, { matches: number; wins: number; losses: number; draws: number }>();
        for (const siteName of siteNames) {
          siteAgg.set(siteName, {
            matches: 1,
            wins: isWinner ? 1 : 0,
            losses: isLoser ? 1 : 0,
            draws: isDraw ? 1 : 0,
          });
        }
        avatarAgg.set(avatarName, {
          avatarName,
          avatarCardId: cid,
          avatarSlug: avatarSlugMap.get(cid) || null,
          elementCounts: { ...elementCounts },
          totalSpellCards: spellCardCount,
          matches: 1,
          wins: isWinner ? 1 : 0,
          losses: isLoser ? 1 : 0,
          draws: isDraw ? 1 : 0,
          siteAgg,
        });
      }
    }
  }

  // Resolve site slugs for avatarSites output
  const allSiteNames = new Set<string>();
  for (const agg of avatarAgg.values()) {
    for (const siteName of agg.siteAgg.keys()) {
      allSiteNames.add(siteName);
    }
  }
  const siteCardIds = [...allSiteNames]
    .map((name) => cardIdByName.get(name))
    .filter((id): id is number => id !== undefined);
  const siteVariants = siteCardIds.length > 0
    ? await prisma.variant.findMany({
        where: { cardId: { in: siteCardIds } },
        select: { cardId: true, slug: true },
        distinct: ["cardId"],
      })
    : [];
  const siteSlugMap = new Map<number, string>();
  for (const v of siteVariants) {
    if (!siteSlugMap.has(v.cardId)) siteSlugMap.set(v.cardId, v.slug);
  }

  // Build avatarSites lookup
  const avatarSites: Record<string, Array<{
    siteName: string; siteSlug: string | null;
    matches: number; wins: number; losses: number; draws: number; winRate: number;
  }>> = {};
  for (const agg of avatarAgg.values()) {
    if (agg.siteAgg.size === 0) continue;
    avatarSites[agg.avatarName] = [...agg.siteAgg.entries()]
      .map(([siteName, s]) => {
        const denom = s.wins + s.losses;
        const cid = cardIdByName.get(siteName);
        return {
          siteName,
          siteSlug: cid ? siteSlugMap.get(cid) || null : null,
          matches: s.matches,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          winRate: denom > 0 ? s.wins / denom : 0,
        };
      })
      .sort((a, b) => b.matches - a.matches);
  }

  const archetypes = [...avatarAgg.values()]
    .map((agg) => {
      const denom = agg.wins + agg.losses;
      const elements: Record<string, number> = {};
      if (agg.totalSpellCards > 0) {
        for (const [el, count] of Object.entries(agg.elementCounts)) {
          const pct = Math.round((count / agg.totalSpellCards) * 100);
          if (pct > 0) elements[el] = pct;
        }
      }
      return {
        avatarName: agg.avatarName,
        avatarSlug: agg.avatarSlug,
        avatarCardId: agg.avatarCardId,
        elements,
        totalCards: agg.totalSpellCards > 0
          ? Math.round(agg.totalSpellCards / agg.matches)
          : 0,
        matches: agg.matches,
        wins: agg.wins,
        losses: agg.losses,
        draws: agg.draws,
        winRate: denom > 0 ? agg.wins / denom : 0,
      };
    })
    .sort((a, b) => b.matches - a.matches);

  return {
    archetypes,
    avatarSites,
    format,
    totalDecks: archetypes.reduce((sum, a) => sum + a.matches, 0),
  };
}

const MIN_PAIR_OCCURRENCES = 3;
const SYNERGY_LIMIT = 50;

async function fetchSessions(prisma: AnyPrisma, format: string): Promise<SessionRow[]> {
  return format === "all"
    ? await prisma.$queryRaw<SessionRow[]>`
        SELECT oms.id, oms."playerDecks", oms."playerIds",
               mr."winnerId", mr."loserId", mr."isDraw",
               mr.format::text as format
        FROM "OnlineMatchSession" oms
        JOIN "MatchResult" mr ON oms.id = mr."matchId"
        WHERE oms."playerDecks" IS NOT NULL
        ORDER BY mr."completedAt" DESC
        LIMIT 500
      `
    : await prisma.$queryRaw<SessionRow[]>`
        SELECT oms.id, oms."playerDecks", oms."playerIds",
               mr."winnerId", mr."loserId", mr."isDraw",
               mr.format::text as format
        FROM "OnlineMatchSession" oms
        JOIN "MatchResult" mr ON oms.id = mr."matchId"
        WHERE mr.format = ${format}::"GameFormat"
          AND oms."playerDecks" IS NOT NULL
        ORDER BY mr."completedAt" DESC
        LIMIT 500
      `;
}

async function computeSynergies(prisma: AnyPrisma, format: string): Promise<unknown> {
  const sessions = await fetchSessions(prisma, format);

  if (sessions.length === 0) {
    return { synergies: [], antiSynergies: [], popular: [], format, totalDecks: 0 };
  }

  // Collect all unique card names for slug lookup
  const allCardNames = new Set<string>();
  const pairAgg = new Map<string, {
    cardA: string;
    cardB: string;
    coOccurrences: number;
    wins: number;
    losses: number;
    draws: number;
  }>();

  let totalDecks = 0;

  for (const session of sessions) {
    if (!session.playerDecks) continue;

    for (const [playerId, cards] of Object.entries(session.playerDecks)) {
      if (!Array.isArray(cards)) continue;

      // Extract non-avatar card names (exclude avatar, collection; include sites + spells)
      const deckCardNames = new Set<string>();
      for (const card of cards) {
        if (!card?.name) continue;
        if (isCollectionZone(card)) continue;
        if (isAvatarType(card.type)) continue;
        deckCardNames.add(card.name);
        allCardNames.add(card.name);
      }

      const names = [...deckCardNames].sort();
      if (names.length < 2) continue;
      totalDecks++;

      const isWinner = session.winnerId === playerId;
      const isLoser = session.loserId === playerId;
      const isDraw = session.isDraw;

      // Generate all pairs
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const key = `${names[i]}||${names[j]}`;
          const existing = pairAgg.get(key);
          if (existing) {
            existing.coOccurrences++;
            if (isWinner) existing.wins++;
            else if (isLoser) existing.losses++;
            else if (isDraw) existing.draws++;
          } else {
            pairAgg.set(key, {
              cardA: names[i],
              cardB: names[j],
              coOccurrences: 1,
              wins: isWinner ? 1 : 0,
              losses: isLoser ? 1 : 0,
              draws: isDraw ? 1 : 0,
            });
          }
        }
      }
    }
  }

  // Resolve slugs for all card names
  const cardNames = [...allCardNames];
  const cardRecords = cardNames.length > 0
    ? await prisma.card.findMany({
        where: { name: { in: cardNames } },
        select: { id: true, name: true },
      })
    : [];
  const cardIdByName = new Map<string, number>();
  for (const c of cardRecords) {
    cardIdByName.set(c.name, c.id);
  }

  const allCardIds = [...cardIdByName.values()];
  const variants = allCardIds.length > 0
    ? await prisma.variant.findMany({
        where: { cardId: { in: allCardIds } },
        select: { cardId: true, slug: true },
        distinct: ["cardId"],
      })
    : [];
  const slugByCardId = new Map<number, string>();
  for (const v of variants) {
    if (!slugByCardId.has(v.cardId)) slugByCardId.set(v.cardId, v.slug);
  }

  const getSlug = (name: string): string | null => {
    const cid = cardIdByName.get(name);
    return cid ? slugByCardId.get(cid) || null : null;
  };

  // Filter to pairs with minimum co-occurrences and compute win rate
  const qualified = [...pairAgg.values()]
    .filter((p) => p.coOccurrences >= MIN_PAIR_OCCURRENCES)
    .map((p) => {
      const denom = p.wins + p.losses;
      return {
        cardA: p.cardA,
        cardB: p.cardB,
        slugA: getSlug(p.cardA),
        slugB: getSlug(p.cardB),
        coOccurrences: p.coOccurrences,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        winRate: denom > 0 ? p.wins / denom : 0,
      };
    });

  // Top synergies: highest win rate
  const synergies = [...qualified]
    .sort((a, b) => b.winRate - a.winRate || b.coOccurrences - a.coOccurrences)
    .slice(0, SYNERGY_LIMIT);

  // Anti-synergies: lowest win rate
  const antiSynergies = [...qualified]
    .sort((a, b) => a.winRate - b.winRate || b.coOccurrences - a.coOccurrences)
    .slice(0, SYNERGY_LIMIT);

  // Most popular pairs: highest co-occurrence
  const popular = [...qualified]
    .sort((a, b) => b.coOccurrences - a.coOccurrences || b.winRate - a.winRate)
    .slice(0, SYNERGY_LIMIT);

  return { synergies, antiSynergies, popular, allPairs: qualified, format, totalDecks };
}

/**
 * Compute all meta statistics and write snapshots to the database.
 * Called by the maintenance timer every 10 minutes.
 */
export async function computeAllMetaStats(prisma: PrismaClient): Promise<void> {
  const p = prisma as AnyPrisma;
  const now = new Date();
  const upserts: Array<{ key: string; data: unknown }> = [];

  try {
    // Matches (format-independent)
    const matchesData = await computeMatches(p);
    upserts.push({ key: "matches", data: matchesData });

    // Per-format stats
    for (const format of FORMATS) {
      const [elemData, typeData, costData, rarityData] = await Promise.all([
        computeElements(p, format),
        computeTypes(p, format),
        computeCosts(p, format),
        computeRarity(p, format),
      ]);
      upserts.push({ key: `elements:${format}`, data: elemData });
      upserts.push({ key: `types:${format}`, data: typeData });
      upserts.push({ key: `costs:${format}`, data: costData });
      upserts.push({ key: `rarity:${format}`, data: rarityData });

      // Card stats per category per order
      for (const category of CARD_CATEGORIES) {
        for (const order of CARD_ORDERS) {
          const cardData = await computeCards(p, format, category, order);
          upserts.push({ key: `cards:${format}:${category}:${order}`, data: cardData });
        }
      }
    }

    // Deck composition: all formats + per-format
    const deckAllData = await computeDecks(p, "all");
    upserts.push({ key: "decks:all", data: deckAllData });
    for (const format of FORMATS) {
      const deckData = await computeDecks(p, format);
      upserts.push({ key: `decks:${format}`, data: deckData });
    }

    // Card synergies: all formats + per-format
    const synAllData = await computeSynergies(p, "all");
    upserts.push({ key: "synergies:all", data: synAllData });
    for (const format of FORMATS) {
      const synData = await computeSynergies(p, format);
      upserts.push({ key: `synergies:${format}`, data: synData });
    }

    // Batch upsert all snapshots
    await Promise.all(
      upserts.map(({ key, data }) =>
        p.metaStatsSnapshot.upsert({
          where: { key },
          create: { key, data: data as PrismaJson, computedAt: now },
          update: { data: data as PrismaJson, computedAt: now },
        }),
      ),
    );

    console.log(
      `[MetaStats] Computed ${upserts.length} snapshots in ${Date.now() - now.getTime()}ms`,
    );
  } catch (err) {
    console.error("[MetaStats] Failed to compute meta stats:", err);
  }
}
