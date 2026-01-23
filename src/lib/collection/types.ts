/**
 * Collection Tracker Types
 * @module lib/collection/types
 */

import type { Finish } from "@prisma/client";

// ============================================================================
// Input Types
// ============================================================================

/** Input for adding a card to collection */
export interface CollectionCardInput {
  cardId: number;
  variantId?: number | null;
  setId?: number | null;
  finish: Finish;
  quantity: number;
}

/** Input for updating a collection entry */
export interface CollectionCardUpdate {
  quantity: number;
}

/** Batch import input */
export interface CollectionImportInput {
  text: string;
  format: "sorcery" | "csv" | "curiosa";
}

// ============================================================================
// Response Types
// ============================================================================

/** Card metadata included in collection responses */
export interface CollectionCardMeta {
  type: string;
  rarity: string;
  cost: number | null;
  attack: number | null;
  defence: number | null;
}

/** Price data for a card */
export interface PriceData {
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  currency: "USD" | "EUR";
  source: "tcgplayer" | "manual" | "community";
  lastUpdated: Date | string;
  affiliateUrl: string;
}

/** Single collection card response */
export interface CollectionCardResponse {
  id: number;
  cardId: number;
  variantId: number | null;
  setId: number | null;
  finish: Finish;
  quantity: number;
  notes: string | null;
  card: {
    name: string;
    elements: string | null;
    subTypes: string | null;
  };
  variant: {
    slug: string;
    finish: Finish;
    product: string;
  } | null;
  set: {
    name: string;
  } | null;
  meta: CollectionCardMeta | null;
  price: PriceData | null;
}

/** Pagination info */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Collection list response */
export interface CollectionListResponse {
  cards: CollectionCardResponse[];
  pagination: PaginationInfo;
  stats: {
    totalCards: number;
    uniqueCards: number;
    totalValue: number | null;
    currency: "USD" | "EUR";
  };
}

/** Add card response */
export interface CollectionAddResponse {
  added: Array<{
    id: number;
    cardId: number;
    variantId: number | null;
    quantity: number;
    isNew: boolean;
  }>;
  updated: Array<{
    id: number;
    cardId: number;
    variantId: number | null;
    quantity: number;
  }>;
  errors: Array<{
    cardId: number;
    message: string;
  }>;
}

// ============================================================================
// Statistics Types
// ============================================================================

/** Set completion data */
export interface SetCompletion {
  setId: number;
  setName: string;
  owned: number;
  total: number;
  completion: number;
  value: number | null;
}

/** Full collection statistics */
export interface CollectionStats {
  summary: {
    totalCards: number;
    uniqueCards: number;
    totalValue: number | null;
    currency: "USD" | "EUR";
  };
  bySet: SetCompletion[];
  byElement: Record<string, number>;
  byRarity: Record<string, number>;
}

// ============================================================================
// Deck Building Types
// ============================================================================

/** Card availability for deck building */
export interface CardAvailability {
  cardId: number;
  name: string;
  inDeck: number;
  owned: number;
  available: number;
  status: "available" | "full" | "exceeded" | "unavailable";
}

/** Collection deck validation result */
export interface CollectionDeckValidation {
  isValid: boolean;
  errors: Array<{
    code: string;
    message: string;
    cardId?: number;
    cardName?: string;
  }>;
  warnings: string[];
}

/** Collection deck card entry */
export interface CollectionDeckCard {
  cardId: number;
  variantId: number | null;
  setId: number | null;
  zone: "Spellbook" | "Atlas" | "Sideboard";
  count: number;
}

// ============================================================================
// Pricing Provider Interface
// ============================================================================

/** Price provider abstraction for future extensibility */
export interface PriceProvider {
  name: string;

  /** Get price for a specific card variant */
  getPrice(
    cardId: number,
    variantId: number | null,
    finish: Finish,
  ): Promise<PriceData | null>;

  /** Get prices for multiple cards */
  getBulkPrices(
    cards: Array<{
      cardId: number;
      variantId?: number | null;
      finish?: Finish;
    }>,
  ): Promise<Map<string, PriceData>>;

  /** Generate affiliate link for purchasing */
  getAffiliateLink(cardName: string, setName?: string, finish?: Finish): string;

  /** Refresh cached prices */
  refreshPrices(cardIds: number[]): Promise<void>;
}

// ============================================================================
// Filter & Sort Types
// ============================================================================

/** Collection query filters */
export interface CollectionFilters {
  setId?: number;
  element?: string;
  type?: string;
  rarity?: string;
  search?: string;
}

/** Sort options */
export type CollectionSortField =
  | "name"
  | "quantity"
  | "recent"
  | "value"
  | "rarity";
export type SortOrder = "asc" | "desc";

/** Export format options */
export type ExportFormat = "csv" | "json" | "text" | "curiosa";
