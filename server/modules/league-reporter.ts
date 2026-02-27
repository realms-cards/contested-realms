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

interface MatchReportData {
  matchId: string;
  winnerDiscordId: string;
  loserDiscordId: string;
  winnerName: string;
  loserName: string;
  winnerDeckUrl: string;
  loserDeckUrl: string;
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

      // Resolve deck URLs
      const winnerDeckId = getDeckIdForPlayer(match, winnerId);
      const loserDeckId = getDeckIdForPlayer(match, loserId);
      const [winnerDeckUrl, loserDeckUrl] = await Promise.all([
        resolveDeckUrl(winnerDeckId),
        resolveDeckUrl(loserDeckId),
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
