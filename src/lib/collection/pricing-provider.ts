/**
 * Pricing Provider for Collection Tracker
 *
 * Currently implements TCGPlayer affiliate link generation.
 * Real-time pricing to be added when API access becomes available.
 */

import type { Finish } from "@prisma/client";
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
 * TCGPlayer Affiliate Provider
 *
 * Generates affiliate links for TCGPlayer searches.
 * Does not provide real-time pricing (API access required).
 */
export class TCGPlayerAffiliateProvider implements PriceProvider {
  name = "tcgplayer";

  async getPrice(
    cardId: number,
    variantId: number | null,
    finish: Finish
  ): Promise<PriceData | null> {
    void cardId;
    void variantId;
    void finish;
    // Real-time pricing not available without API access
    // Return null to indicate no pricing data
    return null;
  }

  async getBulkPrices(
    cards: Array<{
      cardId: number;
      variantId?: number | null;
      finish?: Finish;
    }>
  ): Promise<Map<string, PriceData>> {
    void cards;
    // Real-time pricing not available without API access
    return new Map();
  }

  getAffiliateLink(
    cardName: string,
    setName?: string,
    finish?: Finish
  ): string {
    return generateTCGPlayerSearchUrl(cardName, setName, finish);
  }

  async refreshPrices(_cardIds: number[]): Promise<void> {
    void _cardIds;
    // No-op without API access
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
