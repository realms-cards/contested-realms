/**
 * Hooks for league membership display and detection.
 */

import { useCallback, useEffect, useState } from "react";

export interface LeagueDisplayInfo {
  slug: string;
  name: string;
  badgeColor: string | null;
}

interface DiscordStatusResponse {
  discordId: string | null;
  discordUsername: string | null;
  leagues: Array<{
    id: string;
    slug: string;
    name: string;
    badgeColor: string | null;
    iconUrl: string | null;
    joinedAt: string;
  }>;
}

interface PlayersLeaguesResponse {
  players: Record<
    string,
    Array<{
      id: string;
      slug: string;
      name: string;
      badgeColor: string | null;
      iconUrl: string | null;
    }>
  >;
}

/**
 * Returns the current user's league memberships.
 */
export function useLeagueStatus() {
  const [leagues, setLeagues] = useState<LeagueDisplayInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchLeagues() {
      try {
        const res = await fetch("/api/users/me/discord");
        if (!res.ok) return;
        const data = (await res.json()) as DiscordStatusResponse;
        if (cancelled) return;
        setLeagues(
          data.leagues.map((l) => ({
            slug: l.slug,
            name: l.name,
            badgeColor: l.badgeColor,
          })),
        );
      } catch {
        // Ignore fetch errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLeagues();
    return () => {
      cancelled = true;
    };
  }, []);

  return { leagues, loading };
}

// Cache for player league lookups to avoid redundant API calls
const playerLeagueCache = new Map<string, LeagueDisplayInfo[]>();
const pendingLookups = new Map<string, Promise<void>>();

/**
 * Batch fetch league memberships for multiple players (for badge display).
 * Uses caching to avoid redundant API calls.
 */
export function useLeaguePlayers(
  userIds: string[],
): Record<string, LeagueDisplayInfo[]> {
  const [result, setResult] = useState<Record<string, LeagueDisplayInfo[]>>({});

  const fetchPlayers = useCallback(async (ids: string[]) => {
    // Filter to IDs not already cached
    const uncached = ids.filter((id) => !playerLeagueCache.has(id));

    if (uncached.length > 0) {
      // Avoid duplicate in-flight requests
      const key = uncached.sort().join(",");
      if (!pendingLookups.has(key)) {
        const promise = (async () => {
          try {
            const res = await fetch(
              `/api/leagues/players?userIds=${uncached.join(",")}`,
            );
            if (res.ok) {
              const data = (await res.json()) as PlayersLeaguesResponse;
              for (const [userId, leagues] of Object.entries(data.players)) {
                playerLeagueCache.set(
                  userId,
                  leagues.map((l) => ({
                    slug: l.slug,
                    name: l.name,
                    badgeColor: l.badgeColor,
                  })),
                );
              }
              // Set empty arrays for IDs with no leagues
              for (const id of uncached) {
                if (!playerLeagueCache.has(id)) {
                  playerLeagueCache.set(id, []);
                }
              }
            }
          } catch {
            // Ignore errors, will retry on next render
          } finally {
            pendingLookups.delete(key);
          }
        })();
        pendingLookups.set(key, promise);
      }
      await pendingLookups.get(key);
    }

    // Build result from cache
    const out: Record<string, LeagueDisplayInfo[]> = {};
    for (const id of ids) {
      out[id] = playerLeagueCache.get(id) || [];
    }
    return out;
  }, []);

  useEffect(() => {
    if (userIds.length === 0) return;

    let cancelled = false;
    fetchPlayers(userIds).then((data) => {
      if (!cancelled) setResult(data);
    });

    return () => {
      cancelled = true;
    };
  }, [userIds.join(","), fetchPlayers]); // eslint-disable-line react-hooks/exhaustive-deps

  return result;
}
