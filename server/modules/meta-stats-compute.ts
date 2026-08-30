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

type ElementRow = { elements: string | null; plays: bigint; wins: bigint; losses: bigint };
type TypeRow = { type: string | null; plays: bigint; wins: bigint; losses: bigint };
type CostRow = { cost: number | null; plays: bigint; wins: bigint; losses: bigint };
type RarityRow = { rarity: string | null; plays: bigint; wins: bigint; losses: bigint };
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

/** Time windows every card/aggregate snapshot is computed for */
type MetaWindow = "all" | "month" | "3m";
const WINDOWS: readonly MetaWindow[] = ["all", "month", "3m"];

/** Deck/synergy stats read recent sessions rather than a fixed row cap */
const SESSION_WINDOW_DAYS = 90;
const SESSION_LIMIT = 5000;

// --- Mirrors of src/lib/meta/stats.ts -------------------------------------
// The server build (server/tsconfig.json, rootDir ".") cannot import from src/,
// so these pure helpers are duplicated here. Keep both copies in sync.

/**
 * Lower bound of the Wilson score interval (95%). Orders win rates so that a
 * 2-0 card (~0.34) ranks below a 58%-over-300 card (~0.52).
 */
function wilsonLowerBound(wins: number, losses: number, z = 1.96): number {
  const n = wins + losses;
  if (n <= 0) return 0;
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

/** Upper bound of the same interval - used to rank anti-synergies fairly */
function wilsonUpperBound(wins: number, losses: number, z = 1.96): number {
  const n = wins + losses;
  if (n <= 0) return 1;
  const p = wins / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.min(1, (center + margin) / denom);
}

/** The `months` most recent "YYYY-MM" keys (UTC), current month first */
function periodsBack(months: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 0; i < months; i++) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}
// ---------------------------------------------------------------------------

/**
 * Which table a window reads and which month buckets it spans. All-time reads
 * the cumulative HumanCardStats; windows sum HumanCardStatsPeriod buckets.
 * Table names come from this fixed set, never from input, so they are safe to
 * splice into SQL; everything else is bound as a parameter.
 */
function statsSource(window: MetaWindow): {
  table: string;
  periods: string[] | null;
} {
  if (window === "month") return { table: '"HumanCardStatsPeriod"', periods: periodsBack(1) };
  if (window === "3m") return { table: '"HumanCardStatsPeriod"', periods: periodsBack(3) };
  return { table: '"HumanCardStats"', periods: null };
}

/** All-time snapshots keep their historical keys; windows get a suffix */
function snapshotKey(base: string, window: MetaWindow): string {
  return window === "all" ? base : `${base}:${window}`;
}

/** Run a stats query with format bound as $1 and, for windows, periods as $2 */
async function runStatsQuery<T>(
  prisma: AnyPrisma,
  sql: string,
  format: string,
  periods: string[] | null,
): Promise<T[]> {
  return periods
    ? ((await prisma.$queryRawUnsafe(sql, format, periods)) as T[])
    : ((await prisma.$queryRawUnsafe(sql, format)) as T[]);
}

function periodFilter(periods: string[] | null): string {
  return periods ? 'AND h.period = ANY($2::text[])' : "";
}

/** wins / (wins + losses): draws are excluded from win rate throughout */
function winRateOf(wins: number, losses: number): number {
  const denom = wins + losses;
  return denom > 0 ? wins / denom : 0;
}

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

async function computeElements(
  prisma: AnyPrisma,
  format: string,
  window: MetaWindow,
): Promise<unknown> {
  const { table, periods } = statsSource(window);
  const rows = await runStatsQuery<ElementRow>(
    prisma,
    `SELECT c.elements,
            SUM(h.plays)::bigint AS plays,
            SUM(h.wins)::bigint AS wins,
            SUM(h.losses)::bigint AS losses
     FROM ${table} h
     JOIN "Card" c ON c.id = h."cardId"
     WHERE h.format = $1::"GameFormat" ${periodFilter(periods)}
     GROUP BY c.elements
     ORDER BY SUM(h.plays) DESC`,
    format,
    periods,
  );
  return {
    stats: rows.map((r: ElementRow) => {
      const plays = Number(r.plays);
      const wins = Number(r.wins);
      const losses = Number(r.losses);
      return {
        element: r.elements || "None",
        plays,
        wins,
        losses,
        winRate: winRateOf(wins, losses),
      };
    }),
    format,
    window,
  };
}

async function computeTypes(
  prisma: AnyPrisma,
  format: string,
  window: MetaWindow,
): Promise<unknown> {
  const { table, periods } = statsSource(window);
  const rows = await runStatsQuery<TypeRow>(
    prisma,
    `SELECT m.type,
            SUM(h.plays)::bigint AS plays,
            SUM(h.wins)::bigint AS wins,
            SUM(h.losses)::bigint AS losses
     FROM ${table} h
     JOIN LATERAL (
       SELECT type FROM "CardSetMetadata"
       WHERE "cardId" = h."cardId"
       LIMIT 1
     ) m ON true
     WHERE h.format = $1::"GameFormat" ${periodFilter(periods)}
     GROUP BY m.type
     ORDER BY SUM(h.plays) DESC`,
    format,
    periods,
  );
  return {
    stats: rows.map((r: TypeRow) => {
      const plays = Number(r.plays);
      const wins = Number(r.wins);
      const losses = Number(r.losses);
      return {
        type: r.type || "Unknown",
        plays,
        wins,
        losses,
        winRate: winRateOf(wins, losses),
      };
    }),
    format,
    window,
  };
}

async function computeCosts(
  prisma: AnyPrisma,
  format: string,
  window: MetaWindow,
): Promise<unknown> {
  const { table, periods } = statsSource(window);
  const rows = await runStatsQuery<CostRow>(
    prisma,
    `SELECT m.cost,
            SUM(h.plays)::bigint AS plays,
            SUM(h.wins)::bigint AS wins,
            SUM(h.losses)::bigint AS losses
     FROM ${table} h
     JOIN LATERAL (
       SELECT cost FROM "CardSetMetadata"
       WHERE "cardId" = h."cardId"
       LIMIT 1
     ) m ON true
     WHERE h.format = $1::"GameFormat" ${periodFilter(periods)}
       AND m.cost IS NOT NULL
     GROUP BY m.cost
     ORDER BY m.cost ASC`,
    format,
    periods,
  );
  return {
    stats: rows.map((r: CostRow) => {
      const plays = Number(r.plays);
      const wins = Number(r.wins);
      const losses = Number(r.losses);
      return {
        cost: r.cost ?? 0,
        plays,
        wins,
        losses,
        winRate: winRateOf(wins, losses),
      };
    }),
    format,
    window,
  };
}

async function computeRarity(
  prisma: AnyPrisma,
  format: string,
  window: MetaWindow,
): Promise<unknown> {
  const { table, periods } = statsSource(window);
  const rows = await runStatsQuery<RarityRow>(
    prisma,
    `SELECT m.rarity::text AS rarity,
            SUM(h.plays)::bigint AS plays,
            SUM(h.wins)::bigint AS wins,
            SUM(h.losses)::bigint AS losses
     FROM ${table} h
     JOIN LATERAL (
       SELECT rarity FROM "CardSetMetadata"
       WHERE "cardId" = h."cardId"
       LIMIT 1
     ) m ON true
     WHERE h.format = $1::"GameFormat" ${periodFilter(periods)}
       AND m.rarity IS NOT NULL
     GROUP BY m.rarity
     ORDER BY SUM(h.plays) DESC`,
    format,
    periods,
  );
  return {
    stats: rows.map((r: RarityRow) => {
      const plays = Number(r.plays);
      const wins = Number(r.wins);
      const losses = Number(r.losses);
      return {
        rarity: r.rarity || "Unknown",
        plays,
        wins,
        losses,
        winRate: winRateOf(wins, losses),
      };
    }),
    format,
    window,
  };
}

async function computeMatches(prisma: AnyPrisma): Promise<unknown> {
  const rows = await prisma.$queryRaw<MatchRow[]>`
    SELECT
      format::text as format,
      COUNT(*)::bigint as count,
      AVG(duration)::float as "avgDuration"
    FROM "MatchResult"
    WHERE "isPrecon" = false
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
  window: MetaWindow,
): Promise<unknown> {
  const fetchLimit = category === "all" ? CARD_LIMIT : CARD_LIMIT * 2;
  const { table, periods } = statsSource(window);

  type CardRow = {
    cardId: number;
    plays: number;
    wins: number;
    losses: number;
    draws: number;
    inDeck: number;
    inDeckWins: number;
    inDeckLosses: number;
    inDeckDraws: number;
  };

  // Pre-filter by popularity (plays, or wins for that ordering) so the
  // leaderboard is drawn from cards with a real sample; the final ordering
  // for winRate uses the Wilson lower bound below.
  const fetchOrder = order === "wins" ? "SUM(h.wins)" : "SUM(h.plays)";
  const rows = await runStatsQuery<CardRow>(
    prisma,
    `SELECT h."cardId",
            SUM(h.plays)::int AS plays,
            SUM(h.wins)::int AS wins,
            SUM(h.losses)::int AS losses,
            SUM(h.draws)::int AS draws,
            SUM(h."inDeck")::int AS "inDeck",
            SUM(h."inDeckWins")::int AS "inDeckWins",
            SUM(h."inDeckLosses")::int AS "inDeckLosses",
            SUM(h."inDeckDraws")::int AS "inDeckDraws"
     FROM ${table} h
     WHERE h.format = $1::"GameFormat" ${periodFilter(periods)}
       AND h."cardId" > 0
     GROUP BY h."cardId"
     ORDER BY ${fetchOrder} DESC
     LIMIT ${fetchLimit}`,
    format,
    periods,
  );

  const ids = rows.map((r) => r.cardId);

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

  const stats = rows
    .filter((r) => matchesCategory(typeMap.get(r.cardId), category))
    .map((r) => {
      const deckDenom = r.inDeckWins + r.inDeckLosses;
      return {
        cardId: r.cardId,
        name: nameMap.get(r.cardId) || String(r.cardId),
        plays: r.plays,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        winRate: winRateOf(r.wins, r.losses),
        // Sort key for win-rate views: 95% Wilson lower bound
        winRateLB: wilsonLowerBound(r.wins, r.losses),
        inDeck: r.inDeck,
        inDeckWins: r.inDeckWins,
        inDeckLosses: r.inDeckLosses,
        inDeckDraws: r.inDeckDraws,
        // How often the card hits the board when brought (null before any
        // deck submissions carried inclusion data)
        playRate: r.inDeck > 0 ? Math.min(1, r.plays / r.inDeck) : null,
        // Win rate over matches where the card was in the maindeck at all
        winRateInDeck: deckDenom > 0 ? r.inDeckWins / deckDenom : null,
        slug: slugMap.get(r.cardId) || null,
        type: typeMap.get(r.cardId) || null,
      };
    })
    .sort((a, b) => {
      if (order === "winRate") return b.winRateLB - a.winRateLB || b.plays - a.plays;
      if (order === "wins") return b.wins - a.wins || b.plays - a.plays;
      return b.plays - a.plays;
    })
    .slice(0, CARD_LIMIT);

  return { stats, format, order, limit: CARD_LIMIT, category, window };
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
  type AggCounts = { matches: number; wins: number; losses: number; draws: number; totalCopies: number };
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
    siteAgg: Map<string, AggCounts>;
    spellAgg: Map<string, AggCounts>;
    elementComboAgg: Map<string, { matches: number; wins: number; losses: number; draws: number }>;
    comboSiteAgg: Map<string, Map<string, AggCounts>>;
    comboSpellAgg: Map<string, Map<string, AggCounts>>;
  };
  const avatarAgg = new Map<string, AvatarAggEntry>();

  for (const session of sessions) {
    if (!session.playerDecks) continue;
    for (const [playerId, cards] of Object.entries(session.playerDecks)) {
      if (!Array.isArray(cards)) continue;
      let avatarName: string | null = null;
      const elementCounts: Record<string, number> = {};
      let spellCardCount = 0;
      const siteCounts = new Map<string, number>();
      const spellCounts = new Map<string, number>();

      for (const card of cards) {
        if (!card?.name) continue;
        if (isCollectionZone(card)) continue;
        if (isAvatarType(card.type)) { avatarName = card.name; continue; }
        if (isSiteType(card.type)) {
          siteCounts.set(card.name, (siteCounts.get(card.name) || 0) + 1);
          continue;
        }
        const element = elementByName.get(card.name) || "None";
        elementCounts[element] = (elementCounts[element] || 0) + 1;
        spellCardCount++;
        spellCounts.set(card.name, (spellCounts.get(card.name) || 0) + 1);
      }

      if (!avatarName) continue;

      // Skip small decklists for constructed (filters precon decks with ~36 cards)
      let siteCardCount = 0;
      for (const c of siteCounts.values()) siteCardCount += c;
      const totalDeckCards = spellCardCount + siteCardCount;
      const sessionFormat = session.format || format;
      if (sessionFormat === "constructed" && totalDeckCards < 60) continue;

      const isWinner = session.winnerId === playerId;
      const isLoser = session.loserId === playerId;
      const isDraw = session.isDraw;

      // Determine element combo for this deck (elements >= 20% of spellbook)
      const elemEntries = Object.entries(elementCounts).sort((a, b) => b[1] - a[1]);
      const totalInDeck = elemEntries.reduce((s, [, c]) => s + c, 0);
      const significantElements = elemEntries
        .filter(([, c]) => totalInDeck > 0 && (c / totalInDeck) >= 0.2)
        .map(([el]) => el)
        .sort();
      const elementCombo = significantElements.length > 0 ? significantElements.join(", ") : "None";

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
        for (const [siteName, copies] of siteCounts.entries()) {
          const s = existing.siteAgg.get(siteName);
          if (s) {
            s.matches++;
            s.totalCopies += copies;
            if (isWinner) s.wins++;
            else if (isLoser) s.losses++;
            else if (isDraw) s.draws++;
          } else {
            existing.siteAgg.set(siteName, {
              matches: 1, totalCopies: copies,
              wins: isWinner ? 1 : 0,
              losses: isLoser ? 1 : 0,
              draws: isDraw ? 1 : 0,
            });
          }
        }
        for (const [spellName, copies] of spellCounts.entries()) {
          const sp = existing.spellAgg.get(spellName);
          if (sp) {
            sp.matches++;
            sp.totalCopies += copies;
            if (isWinner) sp.wins++;
            else if (isLoser) sp.losses++;
            else if (isDraw) sp.draws++;
          } else {
            existing.spellAgg.set(spellName, {
              matches: 1, totalCopies: copies,
              wins: isWinner ? 1 : 0,
              losses: isLoser ? 1 : 0,
              draws: isDraw ? 1 : 0,
            });
          }
        }
        const ec = existing.elementComboAgg.get(elementCombo);
        if (ec) {
          ec.matches++;
          if (isWinner) ec.wins++;
          else if (isLoser) ec.losses++;
          else if (isDraw) ec.draws++;
        } else {
          existing.elementComboAgg.set(elementCombo, {
            matches: 1,
            wins: isWinner ? 1 : 0,
            losses: isLoser ? 1 : 0,
            draws: isDraw ? 1 : 0,
          });
        }
        // Combo-specific site/spell aggregation
        let comboSiteMap = existing.comboSiteAgg.get(elementCombo);
        if (!comboSiteMap) {
          comboSiteMap = new Map<string, AggCounts>();
          existing.comboSiteAgg.set(elementCombo, comboSiteMap);
        }
        for (const [siteName, copies] of siteCounts.entries()) {
          const cs = comboSiteMap.get(siteName);
          if (cs) {
            cs.matches++;
            cs.totalCopies += copies;
            if (isWinner) cs.wins++;
            else if (isLoser) cs.losses++;
            else if (isDraw) cs.draws++;
          } else {
            comboSiteMap.set(siteName, {
              matches: 1, totalCopies: copies,
              wins: isWinner ? 1 : 0,
              losses: isLoser ? 1 : 0,
              draws: isDraw ? 1 : 0,
            });
          }
        }
        let comboSpellMap = existing.comboSpellAgg.get(elementCombo);
        if (!comboSpellMap) {
          comboSpellMap = new Map<string, AggCounts>();
          existing.comboSpellAgg.set(elementCombo, comboSpellMap);
        }
        for (const [spellName, copies] of spellCounts.entries()) {
          const cs = comboSpellMap.get(spellName);
          if (cs) {
            cs.matches++;
            cs.totalCopies += copies;
            if (isWinner) cs.wins++;
            else if (isLoser) cs.losses++;
            else if (isDraw) cs.draws++;
          } else {
            comboSpellMap.set(spellName, {
              matches: 1, totalCopies: copies,
              wins: isWinner ? 1 : 0,
              losses: isLoser ? 1 : 0,
              draws: isDraw ? 1 : 0,
            });
          }
        }
      } else {
        const cid = cardIdByName.get(avatarName) || 0;
        const siteAgg = new Map<string, AggCounts>();
        for (const [siteName, copies] of siteCounts.entries()) {
          siteAgg.set(siteName, {
            matches: 1, totalCopies: copies,
            wins: isWinner ? 1 : 0,
            losses: isLoser ? 1 : 0,
            draws: isDraw ? 1 : 0,
          });
        }
        const spellAgg = new Map<string, AggCounts>();
        for (const [spellName, copies] of spellCounts.entries()) {
          spellAgg.set(spellName, {
            matches: 1, totalCopies: copies,
            wins: isWinner ? 1 : 0,
            losses: isLoser ? 1 : 0,
            draws: isDraw ? 1 : 0,
          });
        }
        const elementComboAgg = new Map<string, { matches: number; wins: number; losses: number; draws: number }>();
        elementComboAgg.set(elementCombo, {
          matches: 1,
          wins: isWinner ? 1 : 0,
          losses: isLoser ? 1 : 0,
          draws: isDraw ? 1 : 0,
        });
        const comboSiteAgg = new Map<string, Map<string, AggCounts>>();
        const initComboSiteMap = new Map<string, AggCounts>();
        for (const [siteName, copies] of siteCounts.entries()) {
          initComboSiteMap.set(siteName, {
            matches: 1, totalCopies: copies,
            wins: isWinner ? 1 : 0, losses: isLoser ? 1 : 0, draws: isDraw ? 1 : 0,
          });
        }
        comboSiteAgg.set(elementCombo, initComboSiteMap);
        const comboSpellAgg = new Map<string, Map<string, AggCounts>>();
        const initComboSpellMap = new Map<string, AggCounts>();
        for (const [spellName, copies] of spellCounts.entries()) {
          initComboSpellMap.set(spellName, {
            matches: 1, totalCopies: copies,
            wins: isWinner ? 1 : 0, losses: isLoser ? 1 : 0, draws: isDraw ? 1 : 0,
          });
        }
        comboSpellAgg.set(elementCombo, initComboSpellMap);
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
          spellAgg,
          elementComboAgg,
          comboSiteAgg,
          comboSpellAgg,
        });
      }
    }
  }

  // Resolve slugs for sites and spells used in avatar decks
  const allSiteNames = new Set<string>();
  const allSpellNames = new Set<string>();
  for (const agg of avatarAgg.values()) {
    for (const siteName of agg.siteAgg.keys()) allSiteNames.add(siteName);
    for (const spellName of agg.spellAgg.keys()) allSpellNames.add(spellName);
  }
  const deckCardNames = new Set([...allSiteNames, ...allSpellNames]);
  const deckCardIds = [...deckCardNames]
    .map((name) => cardIdByName.get(name))
    .filter((id): id is number => id !== undefined);
  const deckVariants = deckCardIds.length > 0
    ? await prisma.variant.findMany({
        where: { cardId: { in: deckCardIds } },
        select: { cardId: true, slug: true },
        distinct: ["cardId"],
      })
    : [];
  const deckSlugMap = new Map<number, string>();
  for (const v of deckVariants) {
    if (!deckSlugMap.has(v.cardId)) deckSlugMap.set(v.cardId, v.slug);
  }

  // Build avatarSites lookup
  const avatarSites: Record<string, Array<{
    siteName: string; siteSlug: string | null;
    matches: number; wins: number; losses: number; draws: number; winRate: number; avgCopies: number;
  }>> = {};
  for (const agg of avatarAgg.values()) {
    if (agg.siteAgg.size === 0) continue;
    avatarSites[agg.avatarName] = [...agg.siteAgg.entries()]
      .map(([siteName, s]) => {
        const denom = s.wins + s.losses;
        const cid = cardIdByName.get(siteName);
        return {
          siteName,
          siteSlug: cid ? deckSlugMap.get(cid) || null : null,
          matches: s.matches,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          winRate: denom > 0 ? s.wins / denom : 0,
          avgCopies: s.matches > 0 ? Math.round((s.totalCopies / s.matches) * 10) / 10 : 0,
        };
      })
      .sort((a, b) => b.matches - a.matches);
  }

  // Build avatarSpells lookup
  const avatarSpells: Record<string, Array<{
    spellName: string; spellSlug: string | null;
    matches: number; wins: number; losses: number; draws: number; winRate: number; avgCopies: number;
  }>> = {};
  for (const agg of avatarAgg.values()) {
    if (agg.spellAgg.size === 0) continue;
    avatarSpells[agg.avatarName] = [...agg.spellAgg.entries()]
      .map(([spellName, s]) => {
        const denom = s.wins + s.losses;
        const cid = cardIdByName.get(spellName);
        return {
          spellName,
          spellSlug: cid ? deckSlugMap.get(cid) || null : null,
          matches: s.matches,
          wins: s.wins,
          losses: s.losses,
          draws: s.draws,
          winRate: denom > 0 ? s.wins / denom : 0,
          avgCopies: s.matches > 0 ? Math.round((s.totalCopies / s.matches) * 10) / 10 : 0,
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

  // Build avatarElementCombos lookup
  const avatarElementCombos: Record<string, Array<{
    combo: string;
    matches: number; wins: number; losses: number; draws: number; winRate: number;
  }>> = {};
  for (const agg of avatarAgg.values()) {
    if (agg.elementComboAgg.size === 0) continue;
    avatarElementCombos[agg.avatarName] = [...agg.elementComboAgg.entries()]
      .map(([combo, ec]) => {
        const denom = ec.wins + ec.losses;
        return {
          combo,
          matches: ec.matches,
          wins: ec.wins,
          losses: ec.losses,
          draws: ec.draws,
          winRate: denom > 0 ? ec.wins / denom : 0,
        };
      })
      .sort((a, b) => b.matches - a.matches);
  }

  // Build per-combo site and spell lookups
  type ComboSiteEntry = { siteName: string; siteSlug: string | null; matches: number; wins: number; losses: number; draws: number; winRate: number; avgCopies: number };
  type ComboSpellEntry = { spellName: string; spellSlug: string | null; matches: number; wins: number; losses: number; draws: number; winRate: number; avgCopies: number };
  const avatarComboSites: Record<string, Record<string, ComboSiteEntry[]>> = {};
  const avatarComboSpells: Record<string, Record<string, ComboSpellEntry[]>> = {};
  for (const agg of avatarAgg.values()) {
    if (agg.comboSiteAgg.size > 0) {
      const byCombo: Record<string, ComboSiteEntry[]> = {};
      for (const [combo, siteMap] of agg.comboSiteAgg.entries()) {
        byCombo[combo] = [...siteMap.entries()]
          .map(([siteName, s]) => {
            const denom = s.wins + s.losses;
            const cid = cardIdByName.get(siteName);
            return {
              siteName,
              siteSlug: cid ? deckSlugMap.get(cid) || null : null,
              matches: s.matches, wins: s.wins, losses: s.losses, draws: s.draws,
              winRate: denom > 0 ? s.wins / denom : 0,
              avgCopies: s.matches > 0 ? Math.round((s.totalCopies / s.matches) * 10) / 10 : 0,
            };
          })
          .sort((a, b) => b.matches - a.matches);
      }
      avatarComboSites[agg.avatarName] = byCombo;
    }
    if (agg.comboSpellAgg.size > 0) {
      const byCombo: Record<string, ComboSpellEntry[]> = {};
      for (const [combo, spellMap] of agg.comboSpellAgg.entries()) {
        byCombo[combo] = [...spellMap.entries()]
          .map(([spellName, s]) => {
            const denom = s.wins + s.losses;
            const cid = cardIdByName.get(spellName);
            return {
              spellName,
              spellSlug: cid ? deckSlugMap.get(cid) || null : null,
              matches: s.matches, wins: s.wins, losses: s.losses, draws: s.draws,
              winRate: denom > 0 ? s.wins / denom : 0,
              avgCopies: s.matches > 0 ? Math.round((s.totalCopies / s.matches) * 10) / 10 : 0,
            };
          })
          .sort((a, b) => b.matches - a.matches);
      }
      avatarComboSpells[agg.avatarName] = byCombo;
    }
  }

  return {
    archetypes,
    avatarSites,
    avatarSpells,
    avatarElementCombos,
    avatarComboSites,
    avatarComboSpells,
    format,
    totalDecks: archetypes.reduce((sum, a) => sum + a.matches, 0),
  };
}

const MIN_PAIR_OCCURRENCES = 3;
const SYNERGY_LIMIT = 200;

/**
 * Recent completed human sessions with their submitted decks. Bounded by a
 * time window rather than a fixed row cap so growth doesn't silently shrink
 * the sample; SESSION_LIMIT is only a safety ceiling.
 */
async function fetchSessions(prisma: AnyPrisma, format: string): Promise<SessionRow[]> {
  const since = new Date(Date.now() - SESSION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return format === "all"
    ? await prisma.$queryRaw<SessionRow[]>`
        SELECT oms.id, oms."playerDecks", oms."playerIds",
               mr."winnerId", mr."loserId", mr."isDraw",
               mr.format::text as format
        FROM "OnlineMatchSession" oms
        JOIN "MatchResult" mr ON oms.id = mr."matchId"
        WHERE oms."playerDecks" IS NOT NULL
          AND oms."isPrecon" = false
          AND mr."completedAt" >= ${since}
        ORDER BY mr."completedAt" DESC
        LIMIT ${SESSION_LIMIT}
      `
    : await prisma.$queryRaw<SessionRow[]>`
        SELECT oms.id, oms."playerDecks", oms."playerIds",
               mr."winnerId", mr."loserId", mr."isDraw",
               mr.format::text as format
        FROM "OnlineMatchSession" oms
        JOIN "MatchResult" mr ON oms.id = mr."matchId"
        WHERE mr.format = ${format}::"GameFormat"
          AND oms."playerDecks" IS NOT NULL
          AND oms."isPrecon" = false
          AND mr."completedAt" >= ${since}
        ORDER BY mr."completedAt" DESC
        LIMIT ${SESSION_LIMIT}
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

      // Extract spell card names only (exclude avatar, collection, sites)
      const deckCardNames = new Set<string>();
      let deckTotalCards = 0;
      for (const card of cards) {
        if (!card?.name) continue;
        if (isCollectionZone(card)) continue;
        if (isAvatarType(card.type)) continue;
        deckTotalCards++;
        if (isSiteType(card.type)) continue;
        deckCardNames.add(card.name);
        allCardNames.add(card.name);
      }

      // Skip small decklists for constructed (filters precon decks with ~36 cards)
      const sessionFormat = session.format || format;
      if (sessionFormat === "constructed" && deckTotalCards < 60) continue;

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
      return {
        cardA: p.cardA,
        cardB: p.cardB,
        slugA: getSlug(p.cardA),
        slugB: getSlug(p.cardB),
        coOccurrences: p.coOccurrences,
        wins: p.wins,
        losses: p.losses,
        draws: p.draws,
        winRate: winRateOf(p.wins, p.losses),
        winRateLB: wilsonLowerBound(p.wins, p.losses),
        winRateUB: wilsonUpperBound(p.wins, p.losses),
      };
    });

  // Top synergies: highest win rate we can be confident in (Wilson lower bound)
  const synergies = [...qualified]
    .sort((a, b) => b.winRateLB - a.winRateLB || b.coOccurrences - a.coOccurrences)
    .slice(0, SYNERGY_LIMIT);

  // Anti-synergies: mirror image - lowest Wilson upper bound
  const antiSynergies = [...qualified]
    .sort((a, b) => a.winRateUB - b.winRateUB || b.coOccurrences - a.coOccurrences)
    .slice(0, SYNERGY_LIMIT);

  // Most popular pairs: highest co-occurrence
  const popular = [...qualified]
    .sort((a, b) => b.coOccurrences - a.coOccurrences || b.winRate - a.winRate)
    .slice(0, SYNERGY_LIMIT);

  return {
    synergies,
    antiSynergies,
    popular,
    allPairs: qualified,
    format,
    totalDecks,
    windowDays: SESSION_WINDOW_DAYS,
  };
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

    // Per-format stats, for every time window
    for (const format of FORMATS) {
      for (const window of WINDOWS) {
        const [elemData, typeData, costData, rarityData] = await Promise.all([
          computeElements(p, format, window),
          computeTypes(p, format, window),
          computeCosts(p, format, window),
          computeRarity(p, format, window),
        ]);
        upserts.push({ key: snapshotKey(`elements:${format}`, window), data: elemData });
        upserts.push({ key: snapshotKey(`types:${format}`, window), data: typeData });
        upserts.push({ key: snapshotKey(`costs:${format}`, window), data: costData });
        upserts.push({ key: snapshotKey(`rarity:${format}`, window), data: rarityData });

        // Card stats per category per order
        for (const category of CARD_CATEGORIES) {
          for (const order of CARD_ORDERS) {
            const cardData = await computeCards(p, format, category, order, window);
            upserts.push({
              key: snapshotKey(`cards:${format}:${category}:${order}`, window),
              data: cardData,
            });
          }
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
