/**
 * Sorcerers Summit League Adapter
 *
 * Builds the API payload for reporting matches to Sorcerers Summit.
 * API: POST https://sorcererssummit.com/api/report-external-match
 */

import type { Prisma } from "@prisma/client";
import type { LeagueAdapter, MatchReportData } from "@/lib/leagues/reporter";

export const sorcerersSummitAdapter: LeagueAdapter = {
  slug: "sorcerers-summit",

  buildPayload(data: MatchReportData): Record<string, Prisma.JsonValue> {
    const payload: Record<string, Prisma.JsonValue> = {
      winner_id: data.winnerDiscordId,
      loser_id: data.loserDiscordId,
      winner_deck_url: data.winnerDeckUrl || "",
      loser_deck_url: data.loserDeckUrl || "",
      source: "Realms",
    };

    // Optional fields
    if (data.winnerName) {
      payload.winner_name = data.winnerName;
    }
    if (data.loserName) {
      payload.loser_name = data.loserName;
    }
    if (typeof data.winnerWentFirst === "boolean") {
      payload.winner_went_first = data.winnerWentFirst;
    }
    if (typeof data.durationMinutes === "number" && data.durationMinutes > 0) {
      payload.match_time = data.durationMinutes;
    }

    return payload;
  },
};
