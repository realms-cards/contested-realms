/**
 * SOATC League API Service
 * Handles communication with the Sorcerers at the Core ranking API
 * with in-memory caching to minimize API requests
 */

import type {
  SoatcTournament,
  SoatcTournamentsResponse,
  SoatcTournamentDetailsResponse,
  TournamentParticipationResult,
} from "./types";

const SOATC_API_BASE = "https://ranking.sorcerersatthecore.com/api";
// Cache ongoing tournaments list for 1 hour (they don't change often)
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
// Cache tournament details for 1 week (or until tournament ends)
const TOURNAMENT_DETAILS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week for tournament details
// Cache participation results per user for 1 week
const PARTICIPATION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

interface TournamentCache {
  data: SoatcTournament[];
  fetchedAt: number;
}

interface TournamentDetailsCache {
  [tournamentId: string]: {
    data: SoatcTournamentDetailsResponse;
    fetchedAt: number;
    endsAt?: number; // Tournament end date for smarter caching
  };
}

let tournamentCache: TournamentCache | null = null;
const tournamentDetailsCache: TournamentDetailsCache = {};

// Cache participation results per user UUID
interface ParticipationCache {
  [soatcUuid: string]: {
    result: TournamentParticipationResult;
    fetchedAt: number;
  };
}
const participationCache: ParticipationCache = {};

/**
 * Check if SOATC league features are enabled (server-side)
 */
export function isSoatcEnabled(): boolean {
  return process.env.SOATC_LEAGUE_ENABLED === "true";
}

/**
 * Check if SOATC league features are enabled (client-side)
 * Uses NEXT_PUBLIC_ prefix so it's available in browser
 */
export function isSoatcEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_SOATC_ENABLED === "true";
}

/**
 * Get the API token for SOATC requests
 */
function getApiToken(): string | undefined {
  return process.env.SORCERERS_AT_THE_CORE_APITOKEN;
}

/**
 * Make an authenticated request to the SOATC API
 */
async function soatcFetch<T>(endpoint: string): Promise<T> {
  const token = getApiToken();
  if (!token) {
    throw new Error("SOATC API token not configured");
  }

  const response = await fetch(`${SOATC_API_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `SOATC API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Fetch ongoing tournaments where Realms.cards is allowed
 * Uses caching to minimize API requests
 */
export async function getOngoingTournaments(
  forceRefresh = false
): Promise<SoatcTournament[]> {
  if (!isSoatcEnabled()) {
    return [];
  }

  const now = Date.now();

  // Return cached data if valid
  if (
    !forceRefresh &&
    tournamentCache &&
    now - tournamentCache.fetchedAt < CACHE_TTL_MS
  ) {
    return tournamentCache.data;
  }

  try {
    // Fetch ongoing tournaments (removed realms_cards_allowed filter as it may not be set)
    const response = await soatcFetch<SoatcTournamentsResponse>(
      "/tournaments?state=ongoing"
    );

    // Cache the result
    tournamentCache = {
      data: response.data,
      fetchedAt: now,
    };

    return response.data;
  } catch (error) {
    console.error("Failed to fetch SOATC tournaments:", error);

    // Return stale cache if available
    if (tournamentCache) {
      console.warn("Using stale SOATC tournament cache");
      return tournamentCache.data;
    }

    return [];
  }
}

/**
 * Fetch detailed tournament info including participants
 * Uses caching with smart TTL based on tournament end date
 */
export async function getTournamentDetails(
  tournamentId: string,
  forceRefresh = false
): Promise<SoatcTournamentDetailsResponse | null> {
  if (!isSoatcEnabled()) {
    return null;
  }

  const now = Date.now();
  const cached = tournamentDetailsCache[tournamentId];

  // Return cached data if valid
  if (!forceRefresh && cached) {
    const cacheAge = now - cached.fetchedAt;

    // If tournament has ended, cache indefinitely (unless force refresh)
    if (cached.endsAt && now > cached.endsAt) {
      return cached.data;
    }

    // If tournament is ongoing, use standard TTL
    if (cacheAge < TOURNAMENT_DETAILS_CACHE_TTL_MS) {
      return cached.data;
    }
  }

  try {
    const data = await soatcFetch<SoatcTournamentDetailsResponse>(
      `/tournaments/${tournamentId}`
    );

    // Parse tournament end date if available
    let endsAt: number | undefined;
    if (data.end_date) {
      try {
        endsAt = new Date(data.end_date).getTime();
      } catch {
        // Invalid date, ignore
      }
    }

    // Cache the result
    tournamentDetailsCache[tournamentId] = {
      data,
      fetchedAt: now,
      endsAt,
    };

    return data;
  } catch (error) {
    console.error(`Failed to fetch SOATC tournament ${tournamentId}:`, error);

    // Return stale cache if available
    if (cached) {
      console.warn(`Using stale SOATC tournament cache for ${tournamentId}`);
      return cached.data;
    }

    return null;
  }
}

/**
 * Check if a user (by SOATC UUID) is participating in any ongoing tournament
 * Returns ALL tournaments the player is registered for
 * Results are cached for 1 week per user to minimize API calls
 */
export async function checkTournamentParticipation(
  soatcUuid: string | null | undefined,
  forceRefresh = false
): Promise<TournamentParticipationResult> {
  if (!soatcUuid) {
    return { isParticipant: false, noUuid: true };
  }

  if (!isSoatcEnabled()) {
    return { isParticipant: false, error: "SOATC league features disabled" };
  }

  const now = Date.now();
  const cached = participationCache[soatcUuid];

  // Return cached result if valid (1 week TTL)
  if (!forceRefresh && cached) {
    const cacheAge = now - cached.fetchedAt;
    if (cacheAge < PARTICIPATION_CACHE_TTL_MS) {
      return cached.result;
    }
  }

  try {
    const ongoingTournaments = await getOngoingTournaments();
    const participatingTournaments: TournamentParticipationResult["tournaments"] =
      [];

    // Check each tournament for participation
    for (const tournament of ongoingTournaments) {
      let isParticipant = false;

      // If participants are included in the list response, check directly
      if (tournament.participants) {
        isParticipant = tournament.participants.some((p) => p.id === soatcUuid);
      } else {
        // Fetch full tournament details to get participant list
        const details = await getTournamentDetails(tournament.id);
        if (details?.participants) {
          isParticipant = details.participants.some((p) => p.id === soatcUuid);
        }
      }

      if (isParticipant) {
        participatingTournaments.push({
          id: tournament.id,
          name: tournament.name,
          gameType: tournament.game_type,
          playersCount: tournament.players_count,
          startDate: tournament.start_date,
          endDate: tournament.end_date,
        });
      }
    }

    let result: TournamentParticipationResult;
    if (participatingTournaments.length === 0) {
      result = { isParticipant: false };
    } else {
      // Return first tournament as primary (for backward compatibility) and all tournaments
      result = {
        isParticipant: true,
        tournament: participatingTournaments[0],
        tournaments: participatingTournaments,
      };
    }

    // Cache the result
    participationCache[soatcUuid] = {
      result,
      fetchedAt: now,
    };

    return result;
  } catch (error) {
    console.error("Failed to check SOATC tournament participation:", error);

    // Return stale cache if available
    if (cached) {
      console.warn(`Using stale participation cache for ${soatcUuid}`);
      return cached.result;
    }

    return {
      isParticipant: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if two users are both participating in the same tournament
 * Returns the shared tournament if both are participants
 */
export async function checkSharedTournament(
  soatcUuid1: string | null | undefined,
  soatcUuid2: string | null | undefined
): Promise<{ shared: boolean; tournament?: SoatcTournament }> {
  if (!soatcUuid1 || !soatcUuid2) {
    return { shared: false };
  }

  if (!isSoatcEnabled()) {
    return { shared: false };
  }

  try {
    const tournaments = await getOngoingTournaments();

    for (const tournament of tournaments) {
      let participants = tournament.participants;

      // Fetch details if participants not included
      if (!participants) {
        const details = await getTournamentDetails(tournament.id);
        participants = details?.participants;
      }

      if (participants) {
        const user1In = participants.some((p) => p.id === soatcUuid1);
        const user2In = participants.some((p) => p.id === soatcUuid2);

        if (user1In && user2In) {
          return { shared: true, tournament };
        }
      }
    }

    return { shared: false };
  } catch (error) {
    console.error("Failed to check shared SOATC tournament:", error);
    return { shared: false };
  }
}

/**
 * Clear the tournament cache (useful for testing or forced refresh)
 */
export function clearTournamentCache(): void {
  tournamentCache = null;
}

/**
 * Get cache status for debugging
 */
export function getCacheStatus(): {
  isCached: boolean;
  age: number | null;
  tournamentCount: number;
} {
  if (!tournamentCache) {
    return { isCached: false, age: null, tournamentCount: 0 };
  }

  return {
    isCached: true,
    age: Date.now() - tournamentCache.fetchedAt,
    tournamentCount: tournamentCache.data.length,
  };
}
