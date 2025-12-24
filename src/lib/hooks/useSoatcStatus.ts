/**
 * React hook for SOATC league status
 * Fetches the current user's SOATC tournament participation status
 * Includes local caching to avoid repeated API calls
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { isSoatcEnabledClient } from "@/lib/soatc/api";

// Cache configuration
// Tournament participation is cached for 1 week (fetched ~4x per month)
// This is a long-running cache since tournament registrations don't change often
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week cache TTL for participation
const SHARED_TOURNAMENT_CACHE_TTL_MS = 30_000; // 30 seconds for shared tournament checks

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Module-level caches to persist across hook instances
const statusCache: { entry: CacheEntry<SoatcStatus> | null } = { entry: null };
const settingsCache: {
  entry: CacheEntry<{
    soatcUuid: string | null;
    soatcAutoDetect: boolean;
  }> | null;
} = { entry: null };
const sharedTournamentCache = new Map<
  string,
  CacheEntry<SharedTournamentStatus>
>();
const playersCache = new Map<
  string,
  CacheEntry<Record<string, SoatcPlayerStatus>>
>();

function isCacheValid<T>(
  entry: CacheEntry<T> | null | undefined,
  ttl: number
): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttl;
}

export interface SoatcTournamentInfo {
  id: string;
  name: string;
  gameType: string;
  playersCount?: number;
  startDate?: string;
  endDate?: string;
}

export interface SoatcStatus {
  soatcUuid: string | null;
  soatcAutoDetect: boolean;
  isParticipant: boolean;
  noUuid?: boolean;
  tournament?: SoatcTournamentInfo;
  /** All tournaments the player is registered for */
  tournaments?: SoatcTournamentInfo[];
  error?: string;
}

interface UseSoatcStatusResult {
  status: SoatcStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSoatcStatus(): UseSoatcStatusResult {
  const [status, setStatus] = useState<SoatcStatus | null>(() =>
    isCacheValid(statusCache.entry, CACHE_TTL_MS)
      ? statusCache.entry.data
      : null
  );
  const [loading, setLoading] = useState(
    () => !isCacheValid(statusCache.entry, CACHE_TTL_MS)
  );
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchStatus = useCallback(async (force = false) => {
    // Skip if SOATC is disabled
    if (!isSoatcEnabledClient()) {
      setStatus(null);
      setLoading(false);
      return;
    }

    // Use cache if valid and not forcing refresh
    if (!force && isCacheValid(statusCache.entry, CACHE_TTL_MS)) {
      setStatus(statusCache.entry.data);
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/soatc/status");

      if (response.status === 404) {
        setStatus(null);
        statusCache.entry = null;
        setLoading(false);
        return;
      }

      if (response.status === 401) {
        setStatus(null);
        statusCache.entry = null;
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch SOATC status");
      }

      const data = await response.json();
      statusCache.entry = { data, timestamp: Date.now() };
      setStatus(data);
    } catch (err) {
      console.error("Error fetching SOATC status:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus(null);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    refresh: () => fetchStatus(true),
  };
}

interface UseSoatcSettingsResult {
  soatcUuid: string | null;
  soatcAutoDetect: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  updateSettings: (settings: {
    soatcUuid?: string | null;
    soatcAutoDetect?: boolean;
  }) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useSoatcSettings(): UseSoatcSettingsResult {
  const [soatcUuid, setSoatcUuid] = useState<string | null>(() =>
    isCacheValid(settingsCache.entry, CACHE_TTL_MS)
      ? settingsCache.entry.data.soatcUuid
      : null
  );
  const [soatcAutoDetect, setSoatcAutoDetect] = useState(() =>
    isCacheValid(settingsCache.entry, CACHE_TTL_MS)
      ? settingsCache.entry.data.soatcAutoDetect
      : false
  );
  const [loading, setLoading] = useState(
    () => !isCacheValid(settingsCache.entry, CACHE_TTL_MS)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchSettings = useCallback(async (force = false) => {
    // Skip if SOATC is disabled
    if (!isSoatcEnabledClient()) {
      setLoading(false);
      return;
    }

    // Use cache if valid and not forcing refresh
    if (!force && isCacheValid(settingsCache.entry, CACHE_TTL_MS)) {
      setSoatcUuid(settingsCache.entry.data.soatcUuid);
      setSoatcAutoDetect(settingsCache.entry.data.soatcAutoDetect);
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/users/me/soatc");

      if (response.status === 404 || response.status === 401) {
        settingsCache.entry = null;
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch SOATC settings");
      }

      const data = await response.json();
      settingsCache.entry = {
        data: {
          soatcUuid: data.soatcUuid,
          soatcAutoDetect: data.soatcAutoDetect,
        },
        timestamp: Date.now(),
      };
      setSoatcUuid(data.soatcUuid);
      setSoatcAutoDetect(data.soatcAutoDetect);
    } catch (err) {
      console.error("Error fetching SOATC settings:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  const updateSettings = useCallback(
    async (settings: {
      soatcUuid?: string | null;
      soatcAutoDetect?: boolean;
    }): Promise<boolean> => {
      setSaving(true);
      setError(null);

      try {
        const response = await fetch("/api/users/me/soatc", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update SOATC settings");
        }

        const data = await response.json();
        // Update cache on successful save
        settingsCache.entry = {
          data: {
            soatcUuid: data.soatcUuid,
            soatcAutoDetect: data.soatcAutoDetect,
          },
          timestamp: Date.now(),
        };
        // Also invalidate status cache since settings changed
        statusCache.entry = null;
        setSoatcUuid(data.soatcUuid);
        setSoatcAutoDetect(data.soatcAutoDetect);
        return true;
      } catch (err) {
        console.error("Error updating SOATC settings:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    soatcUuid,
    soatcAutoDetect,
    loading,
    saving,
    error,
    updateSettings,
    refresh: () => fetchSettings(true),
  };
}

export interface SharedTournamentStatus {
  shared: boolean;
  tournament: {
    id: string;
    name: string;
    gameType: string;
  } | null;
  currentUserAutoDetect: boolean;
  opponentAutoDetect: boolean;
  bothAutoDetect: boolean;
}

interface UseSharedTournamentResult {
  status: SharedTournamentStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export interface SoatcPlayerStatus {
  soatcUuid: string | null;
  isParticipant: boolean;
  tournamentName?: string;
}

interface UseSoatcPlayersResult {
  players: Record<string, SoatcPlayerStatus>;
  loading: boolean;
  error: string | null;
}

export function useSoatcPlayers(userIds: string[]): UseSoatcPlayersResult {
  const cacheKey = userIds.sort().join(",");
  const [players, setPlayers] = useState<Record<string, SoatcPlayerStatus>>(
    () => {
      const cached = playersCache.get(cacheKey);
      return isCacheValid(cached, CACHE_TTL_MS) ? cached.data : {};
    }
  );
  const [loading, setLoading] = useState(() => {
    const cached = playersCache.get(cacheKey);
    return userIds.length > 0 && !isCacheValid(cached, CACHE_TTL_MS);
  });
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    // Skip if SOATC is disabled
    if (!isSoatcEnabledClient()) {
      setPlayers({});
      setLoading(false);
      return;
    }

    if (userIds.length === 0) {
      setPlayers({});
      return;
    }

    const cached = playersCache.get(cacheKey);
    if (isCacheValid(cached, CACHE_TTL_MS)) {
      setPlayers(cached.data);
      setLoading(false);
      return;
    }

    // Prevent concurrent fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const fetchStatus = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/soatc/players?userIds=${encodeURIComponent(userIds.join(","))}`
        );

        if (response.status === 404) {
          setPlayers({});
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch SOATC player status");
        }

        const data = await response.json();
        const playersData = data.players || {};
        playersCache.set(cacheKey, {
          data: playersData,
          timestamp: Date.now(),
        });
        setPlayers(playersData);
      } catch (err) {
        console.error("Error fetching SOATC player status:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setPlayers({});
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    };

    fetchStatus();
  }, [cacheKey, userIds]);

  return { players, loading, error };
}

export function useSharedTournament(
  opponentId: string | null
): UseSharedTournamentResult {
  const cacheKey = opponentId || "";
  const [status, setStatus] = useState<SharedTournamentStatus | null>(() => {
    if (!opponentId) return null;
    const cached = sharedTournamentCache.get(cacheKey);
    return isCacheValid(cached, SHARED_TOURNAMENT_CACHE_TTL_MS)
      ? cached.data
      : null;
  });
  const [loading, setLoading] = useState(() => {
    if (!opponentId) return false;
    const cached = sharedTournamentCache.get(cacheKey);
    return !isCacheValid(cached, SHARED_TOURNAMENT_CACHE_TTL_MS);
  });
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const fetchStatus = useCallback(
    async (force = false) => {
      // Skip if SOATC is disabled
      if (!isSoatcEnabledClient()) {
        setStatus(null);
        setLoading(false);
        return;
      }

      if (!opponentId) {
        setStatus(null);
        return;
      }

      // Use cache if valid and not forcing refresh
      const cached = sharedTournamentCache.get(cacheKey);
      if (!force && isCacheValid(cached, SHARED_TOURNAMENT_CACHE_TTL_MS)) {
        setStatus(cached.data);
        setLoading(false);
        return;
      }

      // Prevent concurrent fetches
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/soatc/shared?opponentId=${encodeURIComponent(opponentId)}`
        );

        if (response.status === 404) {
          setStatus(null);
          sharedTournamentCache.delete(cacheKey);
          setLoading(false);
          return;
        }

        if (response.status === 401) {
          setStatus(null);
          sharedTournamentCache.delete(cacheKey);
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch shared tournament status");
        }

        const data = await response.json();
        sharedTournamentCache.set(cacheKey, { data, timestamp: Date.now() });
        setStatus(data);
      } catch (err) {
        console.error("Error fetching shared tournament status:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus(null);
      } finally {
        setLoading(false);
        fetchingRef.current = false;
      }
    },
    [opponentId, cacheKey]
  );

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    refresh: () => fetchStatus(true),
  };
}
