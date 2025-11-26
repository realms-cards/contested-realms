/**
 * Collection Tracker Validation
 * @module lib/collection/validation
 */

import type { Finish } from "@prisma/client";
import type { CollectionDeckCard, CollectionDeckValidation } from "./types";

// ============================================================================
// Constants
// ============================================================================

export const MIN_QUANTITY = 1;
export const MAX_QUANTITY = 99;

export const MIN_SPELLBOOK_CARDS = 40;
export const MIN_ATLAS_SITES = 12;

// ============================================================================
// Quantity Validation
// ============================================================================

/**
 * Validate that quantity is within allowed bounds (1-99)
 */
export function validateQuantity(quantity: number): {
  valid: boolean;
  error?: string;
} {
  if (!Number.isInteger(quantity)) {
    return { valid: false, error: "Quantity must be an integer" };
  }

  if (quantity < MIN_QUANTITY) {
    return { valid: false, error: `Quantity must be at least ${MIN_QUANTITY}` };
  }

  if (quantity > MAX_QUANTITY) {
    return { valid: false, error: `Quantity cannot exceed ${MAX_QUANTITY}` };
  }

  return { valid: true };
}

/**
 * Validate quantity change (can result in 0 for deletion)
 */
export function validateQuantityChange(
  currentQuantity: number,
  delta: number
): {
  valid: boolean;
  newQuantity: number;
  shouldDelete: boolean;
  error?: string;
} {
  const newQuantity = currentQuantity + delta;

  if (newQuantity < 0) {
    return {
      valid: false,
      newQuantity: 0,
      shouldDelete: false,
      error: "Cannot reduce quantity below 0",
    };
  }

  if (newQuantity === 0) {
    return { valid: true, newQuantity: 0, shouldDelete: true };
  }

  if (newQuantity > MAX_QUANTITY) {
    return {
      valid: false,
      newQuantity: currentQuantity,
      shouldDelete: false,
      error: `Quantity cannot exceed ${MAX_QUANTITY}`,
    };
  }

  return { valid: true, newQuantity, shouldDelete: false };
}

// ============================================================================
// Card Validation
// ============================================================================

/**
 * Validate that a card ID exists
 * Note: This is a shape validator; actual DB check happens in API layer
 */
export function validateCardId(cardId: unknown): {
  valid: boolean;
  error?: string;
} {
  if (typeof cardId !== "number" || !Number.isInteger(cardId) || cardId < 1) {
    return { valid: false, error: "Invalid card ID" };
  }
  return { valid: true };
}

/**
 * Validate finish value
 */
export function validateFinish(finish: unknown): {
  valid: boolean;
  finish?: Finish;
  error?: string;
} {
  if (finish !== "Standard" && finish !== "Foil") {
    return { valid: false, error: 'Finish must be "Standard" or "Foil"' };
  }
  return { valid: true, finish: finish as Finish };
}

/**
 * Validate collection card input
 */
export function validateCollectionCardInput(input: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Invalid input"] };
  }

  const { cardId, quantity, finish } = input as Record<string, unknown>;

  const cardValidation = validateCardId(cardId);
  if (!cardValidation.valid) {
    errors.push(cardValidation.error!);
  }

  const quantityValidation = validateQuantity(quantity as number);
  if (!quantityValidation.valid) {
    errors.push(quantityValidation.error!);
  }

  const finishValidation = validateFinish(finish);
  if (!finishValidation.valid) {
    errors.push(finishValidation.error!);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Ownership Validation
// ============================================================================

/**
 * Validate that a user owns enough cards for a deck
 */
export function validateOwnership(
  ownedQuantity: number,
  requestedQuantity: number,
  cardName?: string
): { valid: boolean; error?: string } {
  if (requestedQuantity > ownedQuantity) {
    const name = cardName || "Card";
    return {
      valid: false,
      error: `${name}: need ${requestedQuantity}, own ${ownedQuantity}`,
    };
  }
  return { valid: true };
}

/**
 * Validate ownership for multiple cards
 */
export function validateBulkOwnership(
  cards: Array<{
    cardId: number;
    cardName: string;
    owned: number;
    requested: number;
  }>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const card of cards) {
    const validation = validateOwnership(
      card.owned,
      card.requested,
      card.cardName
    );
    if (!validation.valid) {
      errors.push(validation.error!);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Deck Validation
// ============================================================================

/**
 * Validate collection deck rules
 */
export function validateDeckRules(
  cards: CollectionDeckCard[],
  hasAvatar: boolean
): CollectionDeckValidation {
  const errors: CollectionDeckValidation["errors"] = [];
  const warnings: string[] = [];

  // Count cards by zone
  const spellbookCount = cards
    .filter((c) => c.zone === "Spellbook")
    .reduce((sum, c) => sum + c.count, 0);

  const atlasCount = cards
    .filter((c) => c.zone === "Atlas")
    .reduce((sum, c) => sum + c.count, 0);

  // Avatar check
  if (!hasAvatar) {
    errors.push({
      code: "MISSING_AVATAR",
      message: "Deck must have exactly 1 avatar",
    });
  }

  // Spellbook minimum
  if (spellbookCount < MIN_SPELLBOOK_CARDS) {
    errors.push({
      code: "SPELLBOOK_MIN",
      message: `Spellbook needs at least ${MIN_SPELLBOOK_CARDS} cards (has ${spellbookCount})`,
    });
  }

  // Atlas minimum
  if (atlasCount < MIN_ATLAS_SITES) {
    errors.push({
      code: "ATLAS_MIN",
      message: `Atlas needs at least ${MIN_ATLAS_SITES} sites (has ${atlasCount})`,
    });
  }

  // Check for duplicates (same card appearing twice)
  const cardCounts = new Map<string, number>();
  for (const card of cards) {
    const key = `${card.cardId}:${card.variantId ?? "any"}`;
    const existing = cardCounts.get(key) || 0;
    if (existing > 0) {
      errors.push({
        code: "DUPLICATE_ENTRY",
        message: "Same card appears multiple times in deck list",
        cardId: card.cardId,
      });
    }
    cardCounts.set(key, existing + card.count);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get deck statistics
 */
export function getDeckStats(cards: CollectionDeckCard[], hasAvatar: boolean) {
  return {
    spellbookCount: cards
      .filter((c) => c.zone === "Spellbook")
      .reduce((sum, c) => sum + c.count, 0),
    atlasCount: cards
      .filter((c) => c.zone === "Atlas")
      .reduce((sum, c) => sum + c.count, 0),
    sideboardCount: cards
      .filter((c) => c.zone === "Sideboard")
      .reduce((sum, c) => sum + c.count, 0),
    hasAvatar,
  };
}
