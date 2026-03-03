/**
 * League Match Reporter
 *
 * Reports match results to external league APIs when both players
 * share a league membership. Results are logged to LeagueMatchReport.
 */

import type { Prisma } from "@prisma/client";
import type { CuriosaCompatDeckList } from "@/lib/decks/curiosa-compat";
import { buildCuriosaCompatDeckList } from "@/lib/decks/curiosa-compat";
import { getLeagueAdapter } from "@/lib/leagues/adapters";
import { prisma } from "@/lib/prisma";

export interface LeagueAdapter {
  slug: string;
  buildPayload(data: MatchReportData): Record<string, Prisma.JsonValue>;
}

export interface MatchReportData {
  matchId: string;
  winnerDiscordId: string;
  loserDiscordId: string;
  winnerName: string;
  loserName: string;
  winnerDeckUrl: string | null;
  loserDeckUrl: string | null;
  winnerDeckList: CuriosaCompatDeckList | null;
  loserDeckList: CuriosaCompatDeckList | null;
  isDraw: boolean;
  format: string;
  durationMinutes: number | null;
  winnerWentFirst?: boolean;
}

interface ReportMatchOptions {
  matchId: string;
  winnerId: string;
  loserId: string;
  isDraw: boolean;
  format: string;
  durationMinutes: number | null;
  winnerWentFirst?: boolean;
  winnerDeckId?: string | null;
  loserDeckId?: string | null;
}

/**
 * Build a deck URL for the Sorcerers Summit API.
 * Prefers curiosa.io link, falls back to Realms deck URL.
 */
async function resolveDeckUrl(deckId: string | null | undefined): Promise<string> {
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
 * Build a Curiosa-compatible deck list for the Sorcerers Summit API.
 * Returns null if the deck doesn't exist or on error.
 */
async function resolveDeckList(
  deckId: string | null | undefined,
): Promise<CuriosaCompatDeckList | null> {
  if (!deckId) return null;
  try {
    return await buildCuriosaCompatDeckList(deckId);
  } catch {
    return null;
  }
}

/**
 * Main entry point: report a completed match to all shared leagues.
 * Non-blocking — errors are logged but never thrown to the caller.
 */
export async function reportMatchToLeagues(
  options: ReportMatchOptions,
): Promise<void> {
  const {
    matchId,
    winnerId,
    loserId,
    isDraw,
    format,
    durationMinutes,
    winnerWentFirst,
    winnerDeckId,
    loserDeckId,
  } = options;

  // Skip draws for now (Sorcerers Summit requires winner/loser)
  if (isDraw) return;

  try {
    // Look up both players' Discord IDs and display names
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
    if (!winner?.discordId || !loser?.discordId) {
      return;
    }

    // Find shared leagues
    const winnerLeagues = await prisma.leagueMembership.findMany({
      where: { userId: winnerId },
      select: { leagueId: true },
    });
    const winnerLeagueIds = winnerLeagues.map((m) => m.leagueId);

    if (winnerLeagueIds.length === 0) return;

    const sharedLeagues = await prisma.league.findMany({
      where: {
        id: { in: winnerLeagueIds },
        enabled: true,
        apiEndpoint: { not: null },
      },
    });

    // Check which of these the loser is also in
    const loserMemberships = await prisma.leagueMembership.findMany({
      where: {
        userId: loserId,
        leagueId: { in: sharedLeagues.map((l) => l.id) },
      },
      select: { leagueId: true },
    });
    const loserLeagueIds = new Set(loserMemberships.map((m) => m.leagueId));
    const leaguesToReport = sharedLeagues.filter((l) =>
      loserLeagueIds.has(l.id),
    );

    if (leaguesToReport.length === 0) return;

    // Resolve deck URLs and deck lists in parallel
    const [winnerDeckUrl, loserDeckUrl, winnerDeckList, loserDeckList] =
      await Promise.all([
        resolveDeckUrl(winnerDeckId),
        resolveDeckUrl(loserDeckId),
        resolveDeckList(winnerDeckId),
        resolveDeckList(loserDeckId),
      ]);

    const reportData: MatchReportData = {
      matchId,
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
    console.error("[league-report] Error reporting match:", err);
  }
}

interface LeagueRecord {
  id: string;
  slug: string;
  apiEndpoint: string | null;
  apiKeyEnvVar: string | null;
}

async function reportToSingleLeague(
  league: LeagueRecord,
  data: MatchReportData,
): Promise<void> {
  const adapter = getLeagueAdapter(league.slug);
  if (!adapter || !league.apiEndpoint) return;

  // Resolve API key from environment variable
  const apiKey = league.apiKeyEnvVar
    ? process.env[league.apiKeyEnvVar]
    : null;

  if (!apiKey) {
    console.warn(
      `[league-report] No API key found for ${league.slug} (env: ${league.apiKeyEnvVar})`,
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
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const responseBody = await response.text().catch(() => "");

    // Record the report
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
        `[league-report] Failed to report match ${data.matchId} to ${league.slug}: ${response.status} ${responseBody}`,
      );
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    // Record the failure
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

    console.error(
      `[league-report] Error reporting to ${league.slug}:`,
      errorMessage,
    );
  }
}
