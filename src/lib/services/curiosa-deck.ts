/**
 * Curiosa Deck Service
 *
 * Shared utilities for fetching deck data from Curiosa.io
 * Used by both import and sync endpoints.
 */

// Type for Curiosa tRPC deck entry
export interface CuriosatrpcDeck {
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

// Result from fetching Curiosa tRPC endpoints
export interface CuriosatrpcResult {
  deckList: CuriosatrpcDeck[];
  sideboardList: CuriosatrpcDeck[]; // Collection zone (up to 10 cards)
  avatarName: string | null;
  deckName: string | null;
}

/**
 * Extract Curiosa deck ID from URL or raw string
 */
export function extractDeckId(urlOrId: string): string | null {
  try {
    const u = new URL(urlOrId);
    const parts = u.pathname.split("/").filter(Boolean);
    // Find the deck ID - usually after /decks/ in the path
    const decksIndex = parts.indexOf("decks");
    if (decksIndex !== -1 && parts[decksIndex + 1]) {
      // Get the ID part (before any suffix like /tts)
      return parts[decksIndex + 1] || null;
    }
    // Fallback: last non-empty path segment
    const last = parts[parts.length - 1] || "";
    return last || null;
  } catch {
    // Not a URL, treat as id-ish
    const trimmed = urlOrId.trim().replace(/^[#/]+|[?#].*$/g, "");
    return trimmed || null;
  }
}

/**
 * Fetch with timeout helper
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch deck data from Curiosa tRPC endpoint using Origin spoofing
 */
export async function fetchCuriosatrpc(
  deckId: string | null
): Promise<CuriosatrpcResult | null> {
  if (!deckId) return null;

  const input = JSON.stringify({ json: { id: deckId } });
  const headers = {
    Origin: "https://curiosa.io",
    Referer: "https://curiosa.io/",
    Accept: "application/json",
  };

  try {
    // Fetch deck list, sideboard, and deck metadata in parallel with timeout
    const [listRes, sideboardRes, metaRes] = await Promise.all([
      fetchWithTimeout(
        `https://curiosa.io/api/trpc/deck.getDecklistById?input=${encodeURIComponent(
          input
        )}`,
        { cache: "no-store", headers },
        10000 // 10 second timeout
      ),
      fetchWithTimeout(
        `https://curiosa.io/api/trpc/deck.getSideboardById?input=${encodeURIComponent(
          input
        )}`,
        { cache: "no-store", headers },
        10000
      ),
      fetchWithTimeout(
        `https://curiosa.io/api/trpc/deck.getById?input=${encodeURIComponent(
          input
        )}`,
        { cache: "no-store", headers },
        10000
      ),
    ]);

    if (!listRes.ok) return null;

    const listData = (await listRes.json()) as {
      result?: { data?: { json?: unknown } };
    };
    const deckList = listData?.result?.data?.json;
    if (!Array.isArray(deckList)) return null;

    // Parse sideboard (Collection zone) - may contain avatars for Imposter ability
    let sideboardList: CuriosatrpcDeck[] = [];
    if (sideboardRes.ok) {
      const sideboardData = (await sideboardRes.json()) as {
        result?: { data?: { json?: unknown } };
      };
      const sbList = sideboardData?.result?.data?.json;
      if (Array.isArray(sbList)) {
        sideboardList = sbList as CuriosatrpcDeck[];
      }
    }

    // Get main avatar from deck metadata first (this is the authoritative source)
    // The sideboard may contain additional avatars for Imposter ability
    let avatarName: string | null = null;
    let deckName: string | null = null;
    if (metaRes.ok) {
      const metaData = (await metaRes.json()) as {
        result?: {
          data?: {
            json?: {
              name?: string;
              avatars?: Array<{ card?: { name?: string } }>;
            };
          };
        };
      };
      const meta = metaData?.result?.data?.json;
      if (meta) {
        deckName = meta.name || null;
        // Primary source: avatars array from deck metadata
        const avatars = meta.avatars;
        if (Array.isArray(avatars) && avatars.length > 0) {
          avatarName = avatars[0]?.card?.name || null;
        }
      }
    }

    // Fallback: if no avatar in metadata, try first avatar in sideboard
    if (!avatarName) {
      for (const entry of sideboardList) {
        if (entry.card?.type?.toLowerCase() === "avatar") {
          avatarName = entry.card.name;
          break;
        }
      }
    }

    return {
      deckList: deckList as CuriosatrpcDeck[],
      sideboardList,
      avatarName,
      deckName,
    };
  } catch {
    return null;
  }
}
