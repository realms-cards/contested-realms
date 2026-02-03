/**
 * Pricing Provider for Collection Tracker
 *
 * Provides card pricing via tcgcsv.com price cache and
 * TCGPlayer affiliate link generation.
 */

import type { Finish } from "@prisma/client";
import {
  getBulkPrices as getBulkPricesFromCache,
  getPriceForCard,
  buildLookupKey,
} from "./price-cache";
import type { PriceData, PriceProvider } from "./types";

// TCGPlayer affiliate configuration
const TCGPLAYER_BASE_URL = "https://www.tcgplayer.com";
const TCGPLAYER_CATEGORY = "sorcery-contested-realm";
const TCGPLAYER_AFFILIATE_ID = process.env.TCGPLAYER_AFFILIATE_ID || "";

/**
 * Generate a TCGPlayer search URL for a card
 */
function generateTCGPlayerSearchUrl(
  cardName: string,
  setName?: string,
  finish?: Finish
): string {
  const params = new URLSearchParams();

  // Build search query
  let query = cardName;
  if (setName) {
    query += ` ${setName}`;
  }
  if (finish === "Foil") {
    query += " Foil";
  }

  params.set("q", query);
  params.set("view", "grid");
  params.set("ProductTypeName", "Cards");

  // Add affiliate ID if configured
  if (TCGPLAYER_AFFILIATE_ID) {
    params.set("utm_source", TCGPLAYER_AFFILIATE_ID);
    params.set("utm_medium", "affiliate");
    params.set("utm_campaign", "realms_cards");
  }

  return `${TCGPLAYER_BASE_URL}/search/${TCGPLAYER_CATEGORY}/product?${params.toString()}`;
}

/**
 * TCGPlayer Price Provider
 *
 * Uses tcgcsv.com cached pricing data + affiliate link generation.
 */
export class TCGPlayerAffiliateProvider implements PriceProvider {
  name = "tcgplayer";

  async getPrice(
    _cardId: number,
    _variantId: number | null,
    _finish: Finish,
    cardName?: string,
    setName?: string,
  ): Promise<PriceData | null> {
    if (!cardName || !setName) return null;
    return getPriceForCard(cardName, setName, _finish);
  }

  async getBulkPrices(
    cards: Array<{
      cardId: number;
      variantId?: number | null;
      finish?: Finish;
      cardName?: string;
      setName?: string;
    }>
  ): Promise<Map<string, PriceData>> {
    const inputs = cards
      .filter(
        (c): c is typeof c & { cardName: string; setName: string } =>
          Boolean(c.cardName) && Boolean(c.setName),
      )
      .map((c) => ({
        cardName: c.cardName,
        setName: c.setName,
        finish: c.finish ?? ("Standard" as Finish),
      }));

    if (inputs.length === 0) return new Map();

    const pricesByLookupKey = await getBulkPricesFromCache(inputs);

    // Re-key to the buildPriceCacheKey format consumers expect
    const result = new Map<string, PriceData>();
    for (const card of inputs) {
      const lookupKey = buildLookupKey(card.cardName, card.setName, card.finish);
      const price = pricesByLookupKey.get(lookupKey);
      if (price) {
        const cacheKey = `price:${card.cardName}:${card.setName}:${card.finish}`;
        result.set(cacheKey, price);
      }
    }

    return result;
  }

  getAffiliateLink(
    cardName: string,
    setName?: string,
    finish?: Finish
  ): string {
    return generateTCGPlayerSearchUrl(cardName, setName, finish);
  }

  async refreshPrices(_cardIds: number[]): Promise<void> {
    // Price refresh is handled by the /api/pricing/refresh cron endpoint
  }
}

/**
 * Get the default price provider
 */
export function getDefaultPriceProvider(): PriceProvider {
  return new TCGPlayerAffiliateProvider();
}

/**
 * Generate affiliate link for a card (convenience function)
 */
export function getAffiliateLink(
  cardName: string,
  setName?: string,
  finish?: Finish
): string {
  return generateTCGPlayerSearchUrl(cardName, setName, finish);
}

/**
 * Build a price cache key
 */
export function buildPriceCacheKey(
  cardId: number,
  variantId: number | null,
  finish: Finish
): string {
  return `price:${cardId}:${variantId ?? "any"}:${finish}`;
}

/**
 * Parse a price cache key
 */
export function parsePriceCacheKey(
  key: string
): { cardId: number; variantId: number | null; finish: Finish } | null {
  const match = key.match(/^price:(\d+):(\d+|any):(Standard|Foil)$/);
  if (!match) return null;

  return {
    cardId: parseInt(match[1], 10),
    variantId: match[2] === "any" ? null : parseInt(match[2], 10),
    finish: match[3] as Finish,
  };
}
