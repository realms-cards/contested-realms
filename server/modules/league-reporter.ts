"use strict";

/**
 * League Reporter - Server Module
 *
 * Reports match results to external league APIs when both players
 * share a league membership. Called from finalizeMatch() as fire-and-forget.
 */

import type { PrismaClient } from "@prisma/client";

/** JSON-compatible value type (mirrors JsonValue) */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface LeagueReporterDeps {
  prisma: PrismaClient;
}

interface MatchLike {
  id: string;
  matchType?: string;
  playerIds?: string[];
  playerDecks?: Map<string, { deckId?: string }> | null;
  startedAt?: number;
  game?: { firstPlayer?: string } | null;
}

interface ReportOptions {
  winnerId: string;
  loserId: string;
  isDraw: boolean;
  format: string;
  winnerSeat?: string;
}

// League adapter interface
interface LeagueAdapter {
  slug: string;
  buildPayload(data: MatchReportData): Record<string, JsonValue>;
}

/** Curiosa-compatible card entry for inline deck lists */
interface CuriosaCompatEntry {
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

/** Curiosa-compatible deck list */
interface CuriosaCompatDeckList {
  deckList: CuriosaCompatEntry[];
  sideboardList: CuriosaCompatEntry[];
  avatarName: string | null;
  deckName: string | null;
  format: string;
  source: "realms.cards";
}

interface MatchReportData {
  matchId: string;
  winnerDiscordId: string;
  loserDiscordId: string;
  winnerName: string;
  loserName: string;
  winnerDeckUrl: string;
  loserDeckUrl: string;
  winnerDeckList: CuriosaCompatDeckList | null;
  loserDeckList: CuriosaCompatDeckList | null;
  isDraw: boolean;
  format: string;
  durationMinutes: number | null;
  winnerWentFirst?: boolean;
}

// Sorcerers Summit adapter
const sorcerersSummitAdapter: LeagueAdapter = {
  slug: "sorcerers-summit",
  buildPayload(data: MatchReportData): Record<string, JsonValue> {
    const payload: Record<string, JsonValue> = {
      winner_id: data.winnerDiscordId,
      loser_id: data.loserDiscordId,
      winner_deck_url: data.winnerDeckUrl || "",
      loser_deck_url: data.loserDeckUrl || "",
      source: "Realms",
    };
    if (data.winnerName) payload.winner_name = data.winnerName;
    if (data.loserName) payload.loser_name = data.loserName;
    if (typeof data.winnerWentFirst === "boolean") {
      payload.winner_went_first = data.winnerWentFirst;
    }
    if (typeof data.durationMinutes === "number" && data.durationMinutes > 0) {
      payload.match_time = data.durationMinutes;
    }
    // Inline deck lists (Curiosa-compatible format)
    if (data.winnerDeckList) {
      payload.winner_deck_list = data.winnerDeckList as unknown as JsonValue;
    }
    if (data.loserDeckList) {
      payload.loser_deck_list = data.loserDeckList as unknown as JsonValue;
    }
    return payload;
  },
};

const adapterRegistry: Record<string, LeagueAdapter> = {
  "sorcerers-summit": sorcerersSummitAdapter,
};

export function createLeagueReporter({ prisma }: LeagueReporterDeps) {
  /**
   * Resolve a deck URL: curiosa.io if available, else realms.cards.
   */
  async function resolveDeckUrl(
    deckId: string | null | undefined,
  ): Promise<string> {
    if (!deckId) return "";
    try {
      const deck = await prisma.deck.findUnique({
        where: { id: deckId },
        select: { id: true, curiosaSourceId: true },
      });
      if (!deck) return "";
      if (deck.curiosaSourceId) {
        return `https://curiosa.io/decks/${deck.curiosaSourceId}`;
      }
      return `https://realms.cards/decks/${deck.id}`;
    } catch {
      return "";
    }
  }

  /** Map card types to Curiosa-style categories */
  function typeToCategory(type: string): string {
    const lower = type.toLowerCase();
    if (lower.includes("avatar")) return "avatar";
    if (lower.includes("site")) return "site";
    if (lower.includes("minion")) return "creature";
    if (lower.includes("magic")) return "spell";
    if (lower.includes("artifact")) return "artifact";
    if (lower.includes("aura")) return "aura";
    return "spell";
  }

  /**
   * Build a Curiosa-compatible deck list from a deck ID.
   */
  async function resolveDeckList(
    deckId: string | null | undefined,
  ): Promise<CuriosaCompatDeckList | null> {
    if (!deckId) return null;
    try {
      const deck = await prisma.deck.findUnique({
        where: { id: deckId },
        select: {
          name: true,
          format: true,
          cards: {
            select: {
              cardId: true,
              setId: true,
              zone: true,
              count: true,
              variantId: true,
              card: {
                select: {
                  name: true,
                  variants: {
                    select: {
                      id: true,
                      slug: true,
                      set: { select: { name: true } },
                    },
                  },
                },
              },
              variant: {
                select: {
                  id: true,
                  slug: true,
                  set: { select: { name: true } },
                },
              },
              set: { select: { name: true } },
            },
          },
        },
      });

      if (!deck) return null;

      // Fetch card type metadata
      const pairs = deck.cards
        .filter((dc: { setId: number | null }) => dc.setId != null)
        .map((dc: { cardId: number; setId: number | null }) => ({
          cardId: dc.cardId,
          setId: dc.setId as number,
        }));

      const metaMap = new Map<string, string>();
      if (pairs.length > 0) {
        const metas = await prisma.cardSetMetadata.findMany({
          where: { OR: pairs },
          select: { cardId: true, setId: true, type: true },
        });
        for (const m of metas as Array<{ cardId: number; setId: number; type: string }>) {
          metaMap.set(`${m.cardId}:${m.setId}`, m.type);
        }
      }

      // Aggregate cards by (cardId, variantId, zone)
      interface AggEntry {
        quantity: number;
        cardId: number;
        variantId: number | null;
        zone: string;
        cardName: string;
        cardSlug: string;
        type: string;
        variants: Array<{ id: number; slug: string; setName: string | null }>;
      }

      const agg = new Map<string, AggEntry>();

      for (const dc of deck.cards) {
        const count = (dc as { count: number | null }).count ?? 1;
        if (count <= 0) continue;

        const variantId = (dc as { variantId: number | null }).variantId;
        const zone = (dc as { zone: string | null }).zone ?? "Spellbook";
        const key = `${dc.cardId}:${variantId ?? "x"}:${zone}`;
        const existing = agg.get(key);

        if (existing) {
          existing.quantity += count;
          continue;
        }

        const metaKey = dc.setId != null ? `${dc.cardId}:${dc.setId}` : null;
        const metaType = metaKey ? metaMap.get(metaKey) ?? null : null;
        const variant = dc.variant as { id: number; slug: string; set: { name: string } | null } | null;
        const type = metaType
          ?? (variant?.slug?.toLowerCase().includes("avatar") ? "Avatar" : "");
        const resolvedType = type || (zone === "Atlas" ? "Site" : "Spell");

        const card = dc.card as {
          name: string;
          variants: Array<{ id: number; slug: string; set: { name: string } | null }>;
        };
        const variants = (card.variants ?? []).map((v) => ({
          id: v.id,
          slug: v.slug,
          setName: v.set?.name ?? null,
        }));

        agg.set(key, {
          quantity: count,
          cardId: dc.cardId,
          variantId,
          zone,
          cardName: card.name,
          cardSlug: variant?.slug ?? variants[0]?.slug ?? "",
          type: resolvedType,
          variants,
        });
      }

      const deckList: CuriosaCompatEntry[] = [];
      const sideboardList: CuriosaCompatEntry[] = [];
      let avatarName: string | null = null;

      for (const entry of agg.values()) {
        const curiosaEntry: CuriosaCompatEntry = {
          quantity: entry.quantity,
          variantId: String(entry.variantId ?? entry.cardId),
          card: {
            id: String(entry.cardId),
            slug: entry.cardSlug,
            name: entry.cardName,
            type: entry.type,
            category: typeToCategory(entry.type),
            variants: entry.variants.map((v) => ({
              id: String(v.id),
              slug: v.slug,
              ...(v.setName ? { setCard: { set: { name: v.setName } } } : {}),
            })),
          },
        };

        const isAvatar = entry.type.toLowerCase().includes("avatar");
        const isCollection = entry.zone === "Collection" || entry.zone === "Sideboard";

        if (isAvatar && !isCollection) {
          avatarName = entry.cardName;
          continue;
        }

        if (isCollection) {
          sideboardList.push(curiosaEntry);
        } else {
          deckList.push(curiosaEntry);
        }
      }

      return {
        deckList,
        sideboardList,
        avatarName,
        deckName: deck.name,
        format: deck.format,
        source: "realms.cards",
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract deck ID from match's playerDecks map for a given player ID.
   */
  function getDeckIdForPlayer(
    match: MatchLike,
    playerId: string,
  ): string | null {
    if (!match.playerDecks) return null;

    // playerDecks can be a Map or a plain object depending on context
    if (match.playerDecks instanceof Map) {
      const entry = match.playerDecks.get(playerId);
      return (entry as Record<string, unknown>)?.deckId as string || null;
    }

    const asRecord = match.playerDecks as unknown as Record<
      string,
      { deckId?: string }
    >;
    return asRecord[playerId]?.deckId || null;
  }

  /**
   * Report a completed match to all shared leagues.
   * Fire-and-forget — errors are logged, never thrown.
   */
  async function reportMatch(
    match: MatchLike,
    options: ReportOptions,
  ): Promise<void> {
    const { winnerId, loserId, isDraw, format, winnerSeat } = options;

    // Skip draws (Sorcerers Summit requires winner/loser)
    if (isDraw) return;

    try {
      // Look up both players' Discord IDs and names
      const [winner, loser] = await Promise.all([
        prisma.user.findUnique({
          where: { id: winnerId },
          select: { discordId: true, name: true },
        }),
        prisma.user.findUnique({
          where: { id: loserId },
          select: { discordId: true, name: true },
        }),
      ]);

      // Both players must have Discord linked
      if (!winner?.discordId || !loser?.discordId) return;

      // Find shared leagues with API endpoints
      const winnerLeagues = await prisma.leagueMembership.findMany({
        where: { userId: winnerId },
        select: { leagueId: true },
      });
      const winnerLeagueIds = winnerLeagues.map(
        (m: { leagueId: string }) => m.leagueId,
      );
      if (winnerLeagueIds.length === 0) return;

      const sharedLeagues = await prisma.league.findMany({
        where: {
          id: { in: winnerLeagueIds },
          enabled: true,
          apiEndpoint: { not: null },
        },
      });

      const loserMemberships = await prisma.leagueMembership.findMany({
        where: {
          userId: loserId,
          leagueId: { in: sharedLeagues.map((l: { id: string }) => l.id) },
        },
        select: { leagueId: true },
      });
      const loserLeagueIds = new Set(
        loserMemberships.map((m: { leagueId: string }) => m.leagueId),
      );
      const leaguesToReport = sharedLeagues.filter(
        (l: { id: string }) => loserLeagueIds.has(l.id),
      );

      if (leaguesToReport.length === 0) return;

      // Resolve deck URLs and inline deck lists
      const winnerDeckId = getDeckIdForPlayer(match, winnerId);
      const loserDeckId = getDeckIdForPlayer(match, loserId);
      const [winnerDeckUrl, loserDeckUrl, winnerDeckList, loserDeckList] =
        await Promise.all([
          resolveDeckUrl(winnerDeckId),
          resolveDeckUrl(loserDeckId),
          resolveDeckList(winnerDeckId),
          resolveDeckList(loserDeckId),
        ]);

      // Determine who went first
      const gameRaw = match.game as Record<string, unknown> | null;
      const firstPlayerSeat = gameRaw?.firstPlayer;
      const winnerWentFirst =
        typeof firstPlayerSeat === "string"
          ? firstPlayerSeat === winnerSeat
          : undefined;

      // Calculate duration
      const durationMinutes = match.startedAt
        ? Math.round((Date.now() - match.startedAt) / 60000)
        : null;

      const reportData: MatchReportData = {
        matchId: match.id,
        winnerDiscordId: winner.discordId,
        loserDiscordId: loser.discordId,
        winnerName: winner.name || "Unknown",
        loserName: loser.name || "Unknown",
        winnerDeckUrl,
        loserDeckUrl,
        winnerDeckList,
        loserDeckList,
        isDraw,
        format,
        durationMinutes,
        winnerWentFirst,
      };

      // Report to each league
      for (const league of leaguesToReport) {
        await reportToSingleLeague(league, reportData);
      }
    } catch (err) {
      console.error("[league-report] Error:", err);
    }
  }

  async function reportToSingleLeague(
    league: {
      id: string;
      slug: string;
      apiEndpoint: string | null;
      apiKeyEnvVar: string | null;
    },
    data: MatchReportData,
  ): Promise<void> {
    const adapter = adapterRegistry[league.slug];
    if (!adapter || !league.apiEndpoint) return;

    const apiKey = league.apiKeyEnvVar
      ? process.env[league.apiKeyEnvVar]
      : null;

    if (!apiKey) {
      console.warn(
        `[league-report] No API key for ${league.slug} (env: ${league.apiKeyEnvVar})`,
      );
      return;
    }

    const payload = adapter.buildPayload(data);

    try {
      const response = await fetch(league.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const responseBody = await response.text().catch(() => "");

      await prisma.leagueMatchReport.upsert({
        where: {
          matchId_leagueId: {
            matchId: data.matchId,
            leagueId: league.id,
          },
        },
        create: {
          matchId: data.matchId,
          leagueId: league.id,
          winnerId: data.winnerDiscordId,
          loserId: data.loserDiscordId,
          isDraw: data.isDraw,
          reportPayload: payload,
          reportStatus: response.ok ? "sent" : "failed",
          responseCode: response.status,
          responseBody: responseBody.slice(0, 1000),
          reportedAt: response.ok ? new Date() : null,
        },
        update: {
          reportPayload: payload,
          reportStatus: response.ok ? "sent" : "failed",
          responseCode: response.status,
          responseBody: responseBody.slice(0, 1000),
          reportedAt: response.ok ? new Date() : null,
        },
      });

      if (response.ok) {
        console.log(
          `[league-report] Reported match ${data.matchId} to ${league.slug} (${response.status})`,
        );
      } else {
        console.error(
          `[league-report] Failed: ${data.matchId} → ${league.slug}: ${response.status} ${responseBody}`,
        );
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";

      try {
        await prisma.leagueMatchReport.upsert({
          where: {
            matchId_leagueId: {
              matchId: data.matchId,
              leagueId: league.id,
            },
          },
          create: {
            matchId: data.matchId,
            leagueId: league.id,
            winnerId: data.winnerDiscordId,
            loserId: data.loserDiscordId,
            isDraw: data.isDraw,
            reportPayload: payload,
            reportStatus: "failed",
            errorMessage,
          },
          update: {
            reportPayload: payload,
            reportStatus: "failed",
            errorMessage,
          },
        });
      } catch {
        // Don't let logging failures propagate
      }

      console.error(`[league-report] Error → ${league.slug}:`, errorMessage);
    }
  }

  return { reportMatch };
}
