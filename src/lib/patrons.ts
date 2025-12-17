// Patron tier types
export type PatronTier = "apprentice" | "grandmaster" | "kingofthe";

// Color styles for patron tiers
// Full glow for marquee, minimal glow for chat/player lists
export const PATRON_COLORS = {
  apprentice: {
    text: "text-blue-400",
    // Full glow for marquee
    textShadow:
      "0 0 10px #3b82f6, 0 0 20px #3b82f6, 0 0 30px #1d4ed8, 0 0 40px #1e3a8a",
    // Minimal glow for chat/player lists
    textShadowMinimal: "0 0 6px rgba(59,130,246,0.6)",
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    glow: "shadow-[0_0_10px_rgba(59,130,246,0.5)]",
  },
  grandmaster: {
    text: "text-amber-400",
    // Full glow for marquee
    textShadow:
      "0 0 10px #f59e0b, 0 0 20px #f59e0b, 0 0 30px #d97706, 0 0 40px #b45309",
    // Minimal glow for chat/player lists
    textShadowMinimal: "0 0 6px rgba(245,158,11,0.6)",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    glow: "shadow-[0_0_10px_rgba(245,158,11,0.5)]",
  },
  kingofthe: {
    text: "text-emerald-400",
    // Full glow for marquee
    textShadow:
      "0 0 10px #34d399, 0 0 20px #34d399, 0 0 30px #10b981, 0 0 40px #059669",
    // Minimal glow for chat/player lists
    textShadowMinimal: "0 0 6px rgba(52,211,153,0.6)",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    glow: "shadow-[0_0_10px_rgba(52,211,153,0.5)]",
  },
} as const;

// Patron info from API
export type PatronInfo = {
  id: string;
  name: string;
};

// Patron data type from API
export type PatronData = {
  apprentice: PatronInfo[];
  grandmaster: PatronInfo[];
  kingofthe?: PatronInfo[];
  all: PatronInfo[];
};

// Cache for patron data (client-side)
let patronCache: PatronData | null = null;
let patronCachePromise: Promise<PatronData> | null = null;

// Fetch patrons from API (with caching)
export async function fetchPatrons(): Promise<PatronData> {
  if (patronCache) return patronCache;
  if (patronCachePromise) return patronCachePromise;

  patronCachePromise = fetch("/api/patrons")
    .then((res) => res.json())
    .then((data: PatronData) => {
      patronCache = data;
      return data;
    })
    .catch(() => {
      // Return empty on error
      return { apprentice: [], grandmaster: [], all: [] };
    })
    .finally(() => {
      patronCachePromise = null;
    });

  return patronCachePromise;
}

// Clear patron cache (call after admin updates)
export function clearPatronCache(): void {
  patronCache = null;
}

// Synchronous helpers that use cached data (return null if not loaded)
export function getPatronTier(userId: string): PatronTier | null {
  if (!patronCache) return null;
  if (patronCache.kingofthe?.some((p) => p.id === userId)) return "kingofthe";
  if (patronCache.grandmaster.some((p) => p.id === userId))
    return "grandmaster";
  if (patronCache.apprentice.some((p) => p.id === userId)) return "apprentice";
  return null;
}

export function isPatron(userId: string): boolean {
  if (!patronCache) return false;
  return patronCache.all.some((p) => p.id === userId);
}

// Get all patron IDs (from cache)
export function getPatronIds(): PatronData {
  return patronCache ?? { apprentice: [], grandmaster: [], all: [] };
}
