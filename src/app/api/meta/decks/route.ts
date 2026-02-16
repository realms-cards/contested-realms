import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deck composition analysis: correlates avatar choice + element spread with match outcomes.
 *
 * Approach:
 * 1. Fetch OnlineMatchSession records that have playerDecks, joined with MatchResult
 * 2. For each player in each match, extract avatar name and all card names
 * 3. Look up card elements via Card table
 * 4. Aggregate: avatar + element distribution → win rate
 */

type DeckCard = {
  type?: string | null;
  name?: string | null;
  zone?: string | null;
};

type SessionRow = {
  id: string;
  playerDecks: Record<string, DeckCard[]> | null;
  playerIds: string[];
  winnerId: string | null;
  loserId: string | null;
  isDraw: boolean;
  format: string;
};

type AvatarElementCombo = {
  avatarName: string;
  avatarSlug: string | null;
  avatarCardId: number;
  elements: Record<string, number>; // element → count of cards with that element
  totalCards: number;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

function isAvatarType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.toLowerCase().includes("avatar");
}

function isSiteType(type: string | null | undefined): boolean {
  return typeof type === "string" && type.toLowerCase().includes("site");
}

function isCollectionZone(card: DeckCard): boolean {
  return typeof card?.zone === "string" && card.zone.toLowerCase() === "collection";
}

type AvatarSitePairing = {
  siteName: string;
  siteSlug: string | null;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

type AvatarSpellEntry = {
  spellName: string;
  spellSlug: string | null;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

type AvatarElementComboEntry = {
  combo: string;
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "all";
    const avatarFilter = url.searchParams.get("avatar");

    // Try serving from pre-computed cache
    const snapshot = await prisma.metaStatsSnapshot.findUnique({
      where: { key: `decks:${format}` },
    });
    if (snapshot) {
      const cached = snapshot.data as Record<string, unknown>;

      // Per-avatar drill-down: return avatar details + sites + spells
      if (avatarFilter) {
        const archetypes = (cached.archetypes as AvatarElementCombo[]) || [];
        const avatar = archetypes.find((a) => a.avatarName === avatarFilter);
        const avatarSites = (cached.avatarSites as Record<string, AvatarSitePairing[]> | undefined) || {};
        const sites = avatarSites[avatarFilter] || [];
        const avatarSpells = (cached.avatarSpells as Record<string, AvatarSpellEntry[]> | undefined) || {};
        const spells = avatarSpells[avatarFilter] || [];
        const avatarElementCombos = (cached.avatarElementCombos as Record<string, AvatarElementComboEntry[]> | undefined) || {};
        const elementCombos = avatarElementCombos[avatarFilter] || [];
        const avatarComboSites = (cached.avatarComboSites as Record<string, Record<string, AvatarSitePairing[]>> | undefined) || {};
        const comboSites = avatarComboSites[avatarFilter] || {};
        const avatarComboSpells = (cached.avatarComboSpells as Record<string, Record<string, AvatarSpellEntry[]>> | undefined) || {};
        const comboSpells = avatarComboSpells[avatarFilter] || {};

        return NextResponse.json({
          avatar: avatar || null,
          sites,
          spells,
          elementCombos,
          comboSites,
          comboSpells,
          format,
          generatedAt: snapshot.computedAt.toISOString(),
        });
      }

      // Overview: omit avatarSites/avatarSpells from response to save bandwidth
      const { avatarSites: _unusedSites, avatarSpells: _unusedSpells, avatarElementCombos: _unusedCombos, avatarComboSites: _unusedComboSites, avatarComboSpells: _unusedComboSpells, ...rest } = cached;
      void _unusedSites;
      void _unusedSpells;
      void _unusedCombos;
      void _unusedComboSites;
      void _unusedComboSpells;
      return NextResponse.json({
        ...rest,
        generatedAt: snapshot.computedAt.toISOString(),
      });
    }

    // Fallback: compute on-the-fly
    const sessions = format === "all"
      ? await prisma.$queryRaw<SessionRow[]>`
          SELECT
            oms.id,
            oms."playerDecks",
            oms."playerIds",
            mr."winnerId",
            mr."loserId",
            mr."isDraw",
            mr.format::text as format
          FROM "OnlineMatchSession" oms
          JOIN "MatchResult" mr ON oms.id = mr."matchId"
          WHERE oms."playerDecks" IS NOT NULL
          ORDER BY mr."completedAt" DESC
          LIMIT 500
        `
      : await prisma.$queryRaw<SessionRow[]>`
          SELECT
            oms.id,
            oms."playerDecks",
            oms."playerIds",
            mr."winnerId",
            mr."loserId",
            mr."isDraw",
            mr.format::text as format
          FROM "OnlineMatchSession" oms
          JOIN "MatchResult" mr ON oms.id = mr."matchId"
          WHERE mr.format = ${format}::"GameFormat"
            AND oms."playerDecks" IS NOT NULL
          ORDER BY mr."completedAt" DESC
          LIMIT 500
        `;

    if (sessions.length === 0) {
      if (avatarFilter) {
        return NextResponse.json({
          avatar: null,
          sites: [],
          spells: [],
          elementCombos: [],
          comboSites: {},
          comboSpells: {},
          format,
          generatedAt: new Date().toISOString(),
        });
      }
      return NextResponse.json({
        archetypes: [],
        format,
        totalDecks: 0,
        generatedAt: new Date().toISOString(),
      });
    }

    // Collect all unique card names from all decks
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

    // Batch lookup card elements and slugs by name
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

    // Lookup variant slugs for avatar cards
    const avatarCardIds = new Set<number>();
    // First pass: identify avatar card IDs
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
      if (!avatarSlugMap.has(v.cardId)) {
        avatarSlugMap.set(v.cardId, v.slug);
      }
    }

    // Aggregate: per avatar, accumulate element distributions and outcomes
    // Key: avatarName
    const avatarAgg = new Map<string, {
      avatarName: string;
      avatarCardId: number;
      avatarSlug: string | null;
      elementCounts: Record<string, number>; // total across all decks
      totalSpellCards: number; // total spellbook cards across all decks
      matches: number;
      wins: number;
      losses: number;
      draws: number;
    }>();

    for (const session of sessions) {
      if (!session.playerDecks) continue;

      for (const [playerId, cards] of Object.entries(session.playerDecks)) {
        if (!Array.isArray(cards)) continue;

        // Find avatar
        let avatarName: string | null = null;
        const elementCounts: Record<string, number> = {};
        let spellCardCount = 0;

        for (const card of cards) {
          if (!card?.name) continue;
          if (isCollectionZone(card)) continue;

          if (isAvatarType(card.type)) {
            avatarName = card.name;
            continue;
          }

          // Skip sites - we only want spellbook element distribution
          if (isSiteType(card.type)) continue;

          // Count element for spellbook cards
          const element = elementByName.get(card.name) || "None";
          // Handle multi-element cards (e.g. "Fire" or "Water" - single element per card in Sorcery)
          elementCounts[element] = (elementCounts[element] || 0) + 1;
          spellCardCount++;
        }

        if (!avatarName) continue;

        // Determine outcome for this player
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
        } else {
          const cid = cardIdByName.get(avatarName) || 0;
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
          });
        }
      }
    }

    // Build final archetypes sorted by play count
    const archetypes: AvatarElementCombo[] = [...avatarAgg.values()]
      .map((agg) => {
        const denom = agg.wins + agg.losses;
        // Compute average element distribution as percentages
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

    // On-the-fly path: avatar drill-down without cache returns avatar only (no site/spell data)
    if (avatarFilter) {
      const avatar = archetypes.find((a) => a.avatarName === avatarFilter);
      return NextResponse.json({
        avatar: avatar || null,
        sites: [],
        spells: [],
        elementCombos: [],
        comboSites: {},
        comboSpells: {},
        format,
        generatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      archetypes,
      format,
      totalDecks: archetypes.reduce((sum, a) => sum + a.matches, 0),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to load deck stats:", error);
    return NextResponse.json(
      { error: "Failed to load deck stats" },
      { status: 500 }
    );
  }
}
