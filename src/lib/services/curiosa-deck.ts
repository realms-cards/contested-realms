/**
 * Curiosa Deck Service
 *
 * Shared utilities for fetching deck data from Curiosa, which now lives at
 * sorcerytcg.com. Used by both import and sync endpoints.
 */

import { printingIdForSlug } from "@/lib/cards/registry";

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
      /** Stable sorcery-registry printing id, when the printing is known to it */
      printingId?: string;
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
 * Shape of a single decklist row returned by the sorcerytcg.com tRPC API.
 * Curiosa's deck pages moved to sorcerytcg.com/decks/<id>; the old
 * curiosa.io/api/trpc/* routes now 308 to the new site's home page.
 */
interface SorceryPrintingMeta {
  finish?: string;
  product?: string;
  image?: string;
}

interface SorceryPrinting {
  id: string;
  slug?: string;
  set?: { name?: string; code?: string };
  meta?: SorceryPrintingMeta;
}

interface SorceryDeckEntry {
  board?: string;
  quantity?: number;
  cardId?: string;
  printingId?: string;
  printing?: SorceryPrinting;
  card?: {
    id?: string;
    name?: string;
    slug?: string;
    engine?: { type?: string; category?: string };
    printings?: SorceryPrinting[];
  };
}

interface SorceryDeckResponse {
  result?: {
    data?: {
      json?: {
        name?: string;
        decklist?: SorceryDeckEntry[];
      };
    };
  };
}

/**
 * Set-name prefix overrides for cases where the first three letters of the
 * upstream set name don't match our variant slug prefix.
 */
const SET_PREFIX_OVERRIDES: Record<string, string> = {
  promo: "pro",
  promotional: "pro",
};

/** Fallback for printings that arrive without a set name, keyed by set code */
const SET_CODE_PREFIXES: Record<string, string> = {
  "001": "alp",
  "002": "bet",
  "004": "art",
  "005": "dra",
  "006": "got",
  "999": "pro",
};

/**
 * Our variant slugs are `<3-letter set>-<card>-<product>-<finish>` (e.g.
 * `got-detonate-b-s`), while sorcerytcg.com uses a numeric set code
 * (`006-detonate-b-s`). Rewrite the leading set segment so slug lookups hit.
 * Returns null when the set can't be identified, in which case callers fall
 * back to resolving the card by name.
 */
function toLocalVariantSlug(
  upstreamSlug: string | undefined,
  set: { name?: string; code?: string } | undefined
): string | null {
  if (!upstreamSlug) return null;
  const dash = upstreamSlug.indexOf("-");
  if (dash <= 0) return null;

  const name = set?.name?.trim().toLowerCase();
  // The upstream slug is itself prefixed with the set code, so it stands in
  // when the printing carries no nested set object
  const code = set?.code ?? upstreamSlug.slice(0, dash);
  const prefix = name
    ? SET_PREFIX_OVERRIDES[name] ?? name.slice(0, 3)
    : SET_CODE_PREFIXES[code];
  if (!prefix) return null;
  return `${prefix}${upstreamSlug.slice(dash)}`;
}

/**
 * Printings carry their slug either directly or as the basename of the card
 * image URL, depending on which query returned them.
 */
function printingSlug(printing: SorceryPrinting): string | undefined {
  if (printing.slug) return printing.slug;
  const image = printing.meta?.image;
  if (!image) return undefined;
  const base = image.split("/").pop();
  if (!base) return undefined;
  return base.replace(/\.[a-z0-9]+$/i, "");
}

/** Normalize a sorcerytcg decklist row into the shared Curiosa-compatible shape */
function toCuriosaEntry(entry: SorceryDeckEntry): CuriosatrpcDeck | null {
  const card = entry.card;
  if (!card?.name) return null;

  // The two sources are complementary: rows under `card.printings` carry the
  // set, while the selected `printing` carries the slug. Merge them by id so
  // the chosen variant has both, and so `variants.find(v => v.id === variantId)`
  // still matches even if the selected printing isn't in the card's list.
  const byId = new Map<string, SorceryPrinting>();
  for (const p of card.printings ?? []) {
    if (p?.id) byId.set(p.id, p);
  }
  const selected = entry.printing;
  if (selected?.id) {
    const existing = byId.get(selected.id);
    byId.set(
      selected.id,
      existing
        ? {
            ...existing,
            ...selected,
            set: selected.set ?? existing.set,
            meta: { ...existing.meta, ...selected.meta },
          }
        : selected
    );
  }

  const variants = Array.from(byId.values()).map((p) => {
    const upstreamSlug = printingSlug(p);
    return {
      id: p.id,
      slug: toLocalVariantSlug(upstreamSlug, p.set) ?? card.slug ?? "",
      // Resolved from the upstream slug, which the registry keys directly
      printingId: printingIdForSlug(upstreamSlug) ?? undefined,
      setCard: { set: { name: p.set?.name } },
    };
  });

  return {
    quantity: typeof entry.quantity === "number" ? entry.quantity : 1,
    variantId: entry.printingId ?? entry.printing?.id ?? "",
    card: {
      id: card.id ?? "",
      slug: card.slug ?? "",
      name: card.name,
      type: card.engine?.type ?? "",
      category: card.engine?.category ?? "",
      variants,
    },
  };
}

/**
 * Fetch deck data from the sorcerytcg.com tRPC endpoint.
 *
 * A single `deck.get` call returns the deck name plus one flat `decklist`
 * whose rows are tagged with a `board` of `Main`, `Collection` or `Avatar`,
 * replacing the three separate curiosa.io calls this used to make.
 */
export async function fetchCuriosatrpc(
  deckId: string | null
): Promise<CuriosatrpcResult | null> {
  if (!deckId) return null;

  const input = JSON.stringify({ json: { id: deckId } });
  const headers = {
    Origin: "https://sorcerytcg.com",
    Referer: "https://sorcerytcg.com/",
    Accept: "application/json",
  };

  try {
    const res = await fetchWithTimeout(
      `https://sorcerytcg.com/api/trpc/deck.get?input=${encodeURIComponent(
        input
      )}`,
      { cache: "no-store", headers },
      10000 // 10 second timeout
    );
    if (!res.ok) return null;

    const data = (await res.json()) as SorceryDeckResponse;
    const deck = data?.result?.data?.json;
    const rows = deck?.decklist;
    if (!Array.isArray(rows)) return null;

    const deckList: CuriosatrpcDeck[] = [];
    const sideboardList: CuriosatrpcDeck[] = [];
    let avatarName: string | null = null;

    for (const row of rows) {
      const board = (row.board || "").toLowerCase();
      // The avatar is its own board upstream; importers add it separately, so
      // it must not also land in the main list or it would be counted twice
      if (board === "avatar") {
        if (!avatarName && row.card?.name) avatarName = row.card.name;
        continue;
      }
      const normalized = toCuriosaEntry(row);
      if (!normalized) continue;
      if (board === "main") deckList.push(normalized);
      else sideboardList.push(normalized); // Collection / Sideboard
    }

    if (deckList.length === 0 && sideboardList.length === 0) return null;

    // Fallback: some decks carry extra avatars only in the Collection zone
    if (!avatarName) {
      for (const entry of sideboardList) {
        if (entry.card?.type?.toLowerCase() === "avatar") {
          avatarName = entry.card.name;
          break;
        }
      }
    }

    return {
      deckList,
      sideboardList,
      avatarName,
      deckName: deck?.name || null,
    };
  } catch {
    return null;
  }
}
