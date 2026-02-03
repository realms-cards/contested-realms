/**
 * Price Cache Service
 *
 * Fetches card pricing from tcgcsv.com (TCGPlayer mirror) and caches
 * in memory + Redis. Refreshed daily via Vercel Cron.
 */

import type { Finish } from "@prisma/client";
import { getCached, setCached } from "@/lib/cache/redis-cache";
import type { PriceData } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";
const TCGCSV_CATEGORY_ID = 77; // Sorcery: Contested Realm

/** Map our DB set names → tcgcsv groupId(s). Promotional maps to two groups. */
const SET_TO_GROUP_IDS: Record<string, number[]> = {
  Alpha: [23335],
  Beta: [23336],
  "Arthurian Legends": [23588],
  Gothic: [24471],
  Dragonlord: [24378],
  Promotional: [23514, 23778], // Dust Reward Promos + Arthurian Legends Promo
};

/** Reverse map: groupId → our set name */
const GROUP_ID_TO_SET: Record<number, string> = {};
for (const [setName, groupIds] of Object.entries(SET_TO_GROUP_IDS)) {
  for (const gid of groupIds) {
    GROUP_ID_TO_SET[gid] = setName;
  }
}

/** All group IDs we need to fetch */
const ALL_GROUP_IDS = Object.values(SET_TO_GROUP_IDS).flat();

const REDIS_PRICE_KEY = "prices:tcgcsv:all";
const REDIS_TTL_SECONDS = 60 * 60 * 24; // 24 hours

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TcgCsvProduct {
  productId: number;
  name: string;
  cleanName: string;
  groupId: number;
  url: string;
}

interface TcgCsvPrice {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string; // "Normal" | "Foil"
}

interface TcgCsvApiResponse<T> {
  success: boolean;
  errors: string[];
  results: T[];
}

interface PriceCacheEntry {
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
}

// ---------------------------------------------------------------------------
// In-memory singleton
// ---------------------------------------------------------------------------

let priceMap: Map<string, PriceCacheEntry> = new Map();
let lastFetchedAt: number | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a normalised lookup key */
function buildLookupKey(
  cardName: string,
  setName: string,
  finish: Finish | string,
): string {
  const normFinish = finish === "Foil" ? "Foil" : "Standard";
  return `${cardName.toLowerCase().trim()}:${setName.toLowerCase().trim()}:${normFinish}`;
}

/** Map tcgcsv subTypeName to our Finish */
function subTypeToFinish(subTypeName: string): Finish {
  return subTypeName === "Foil" ? "Foil" : "Standard";
}

/**
 * Strip foil/variant suffixes from tcgcsv product names to get the base card name.
 * E.g. "Abundance (Foil)" → "Abundance"
 */
function cleanProductName(name: string): string {
  return name
    .replace(/\s*\(Foil\)\s*$/i, "")
    .replace(/\s*\(Rainbow\)\s*$/i, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Affiliate links (inline to avoid circular dependency with pricing-provider)
// ---------------------------------------------------------------------------

const TCGPLAYER_BASE_URL = "https://www.tcgplayer.com";
const TCGPLAYER_CATEGORY = "sorcery-contested-realm";
const TCGPLAYER_AFFILIATE_ID = process.env.TCGPLAYER_AFFILIATE_ID || "";

function generateAffiliateUrl(
  cardName: string,
  setName?: string,
  finish?: Finish | string,
): string {
  const params = new URLSearchParams();
  let query = cardName;
  if (setName) query += ` ${setName}`;
  if (finish === "Foil") query += " Foil";
  params.set("q", query);
  params.set("view", "grid");
  params.set("ProductTypeName", "Cards");
  if (TCGPLAYER_AFFILIATE_ID) {
    params.set("utm_source", TCGPLAYER_AFFILIATE_ID);
    params.set("utm_medium", "affiliate");
    params.set("utm_campaign", "realms_cards");
  }
  return `${TCGPLAYER_BASE_URL}/search/${TCGPLAYER_CATEGORY}/product?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Fetch from tcgcsv
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 }, // no Next.js cache
  });
  if (!res.ok) {
    throw new Error(`tcgcsv fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return res.json() as Promise<T>;
}

async function fetchGroupProducts(
  groupId: number,
): Promise<TcgCsvProduct[]> {
  const url = `${TCGCSV_BASE}/${TCGCSV_CATEGORY_ID}/${groupId}/products`;
  const data = await fetchJson<TcgCsvApiResponse<TcgCsvProduct>>(url);
  if (!data.success) {
    console.warn(`[price-cache] products fetch error for group ${groupId}:`, data.errors);
    return [];
  }
  return data.results;
}

async function fetchGroupPrices(
  groupId: number,
): Promise<TcgCsvPrice[]> {
  const url = `${TCGCSV_BASE}/${TCGCSV_CATEGORY_ID}/${groupId}/prices`;
  const data = await fetchJson<TcgCsvApiResponse<TcgCsvPrice>>(url);
  if (!data.success) {
    console.warn(`[price-cache] prices fetch error for group ${groupId}:`, data.errors);
    return [];
  }
  return data.results;
}

// ---------------------------------------------------------------------------
// Core: fetch all prices and build the lookup map
// ---------------------------------------------------------------------------

export async function fetchAllPrices(): Promise<{
  pricesLoaded: number;
  errors: string[];
}> {
  const errors: string[] = [];
  const newMap = new Map<string, PriceCacheEntry>();

  // Fetch all groups in parallel
  const groupResults = await Promise.allSettled(
    ALL_GROUP_IDS.map(async (groupId) => {
      const [products, prices] = await Promise.all([
        fetchGroupProducts(groupId),
        fetchGroupPrices(groupId),
      ]);

      const setName = GROUP_ID_TO_SET[groupId];
      if (!setName) return;

      // Build productId → product lookup
      const productById = new Map<number, TcgCsvProduct>();
      for (const p of products) {
        productById.set(p.productId, p);
      }

      // Merge prices with product names
      for (const price of prices) {
        const product = productById.get(price.productId);
        if (!product) continue;

        const cardName = cleanProductName(product.cleanName);
        const finish = subTypeToFinish(price.subTypeName);
        const key = buildLookupKey(cardName, setName, finish);

        newMap.set(key, {
          marketPrice: price.marketPrice,
          lowPrice: price.lowPrice,
          midPrice: price.midPrice,
          highPrice: price.highPrice,
        });
      }
    }),
  );

  // Collect errors from rejected promises
  for (const result of groupResults) {
    if (result.status === "rejected") {
      const msg = result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
      errors.push(msg);
      console.error("[price-cache] group fetch failed:", msg);
    }
  }

  // Update in-memory cache
  priceMap = newMap;
  lastFetchedAt = Date.now();

  // Persist to Redis
  const serializable = Object.fromEntries(newMap.entries());
  await setCached(REDIS_PRICE_KEY, serializable, { ttl: REDIS_TTL_SECONDS });

  console.log(
    `[price-cache] loaded ${newMap.size} prices, ${errors.length} errors`,
  );

  return { pricesLoaded: newMap.size, errors };
}

// ---------------------------------------------------------------------------
// Ensure prices are available (lazy load)
// ---------------------------------------------------------------------------

async function loadFromRedis(): Promise<boolean> {
  const cached = await getCached<Record<string, PriceCacheEntry>>(
    REDIS_PRICE_KEY,
  );
  if (!cached) return false;

  priceMap = new Map(Object.entries(cached));
  lastFetchedAt = Date.now();
  console.log(`[price-cache] restored ${priceMap.size} prices from Redis`);
  return true;
}

export async function ensurePricesLoaded(): Promise<void> {
  // Already in memory
  if (priceMap.size > 0 && lastFetchedAt) return;

  // Try Redis first
  const fromRedis = await loadFromRedis();
  if (fromRedis) return;

  // Cold start — fetch from tcgcsv
  console.log("[price-cache] cold start, fetching from tcgcsv...");
  await fetchAllPrices();
}

// ---------------------------------------------------------------------------
// Public API: lookup prices
// ---------------------------------------------------------------------------

export async function getPriceForCard(
  cardName: string,
  setName: string,
  finish: Finish | string,
): Promise<PriceData | null> {
  await ensurePricesLoaded();

  const key = buildLookupKey(cardName, setName, finish);
  const entry = priceMap.get(key);
  if (!entry) return null;

  const affiliateUrl = generateAffiliateUrl(
    cardName,
    setName,
    finish as Finish,
  );

  return {
    marketPrice: entry.marketPrice,
    lowPrice: entry.lowPrice,
    midPrice: entry.midPrice,
    highPrice: entry.highPrice,
    currency: "USD",
    source: "tcgplayer",
    lastUpdated: lastFetchedAt
      ? new Date(lastFetchedAt).toISOString()
      : new Date().toISOString(),
    affiliateUrl,
  };
}

export interface BulkPriceInput {
  cardName: string;
  setName: string;
  finish: Finish | string;
}

/**
 * Look up prices for multiple cards at once.
 * Returns a Map keyed by "cardName:setName:finish" (normalised).
 */
export async function getBulkPrices(
  cards: BulkPriceInput[],
): Promise<Map<string, PriceData>> {
  await ensurePricesLoaded();

  const result = new Map<string, PriceData>();

  for (const card of cards) {
    const key = buildLookupKey(card.cardName, card.setName, card.finish);
    const entry = priceMap.get(key);
    if (!entry) continue;

    const affiliateUrl = generateAffiliateUrl(
      card.cardName,
      card.setName,
      card.finish as Finish,
    );

    result.set(key, {
      marketPrice: entry.marketPrice,
      lowPrice: entry.lowPrice,
      midPrice: entry.midPrice,
      highPrice: entry.highPrice,
      currency: "USD",
      source: "tcgplayer",
      lastUpdated: lastFetchedAt
        ? new Date(lastFetchedAt).toISOString()
        : new Date().toISOString(),
      affiliateUrl,
    });
  }

  return result;
}

/** Expose the lookup key builder for consumers */
export { buildLookupKey };

/** Check how many prices are currently cached */
export function getCacheSize(): number {
  return priceMap.size;
}

/** Check when the cache was last fetched */
export function getLastFetchedAt(): number | null {
  return lastFetchedAt;
}
