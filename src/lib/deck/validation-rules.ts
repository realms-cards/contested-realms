/**
 * Deck Validation Rules for Sorcery TCG
 *
 * Supports both Limited (Sealed/Draft) and Constructed formats.
 *
 * NOTE: Constructed rules are changing in December 2024:
 * - Current: 50 spellbook, 30 atlas
 * - New (Dec 2024): 60 spellbook, 30 atlas, up to 10 collection
 *
 * Set CONSTRUCTED_V2_ENABLED to true when the new rules go live.
 */

// Feature flag for new constructed rules (Dec 2024)
export const CONSTRUCTED_V2_ENABLED = false;

// ============================================================================
// Format Definitions
// ============================================================================

export type DeckFormat = "limited" | "constructed";

export interface DeckRequirements {
  minSpellbook: number;
  maxSpellbook: number | null;
  minAtlas: number;
  maxAtlas: number | null;
  minCollection: number;
  maxCollection: number | null;
  avatarCount: number;
  sideboardAllowed: boolean;
}

// ============================================================================
// Limited Format (Sealed/Draft)
// ============================================================================

// Limited (sealed / draft) rules:
// - Exactly 1 avatar
// - At least 24 cards in spellbook
// - At least 12 sites in atlas
// - All unused cards go to collection (no cap per official rules)
export const LIMITED_REQUIREMENTS: DeckRequirements = {
  minSpellbook: 24,
  maxSpellbook: null, // No max
  minAtlas: 12,
  maxAtlas: null, // No max
  minCollection: 0,
  maxCollection: null, // No cap in limited — all unused cards are collection
  avatarCount: 1,
  sideboardAllowed: true,
};

// ============================================================================
// Constructed Format
// ============================================================================

// Constructed rules:
// - Exactly 1 avatar
// - At least 60 cards in spellbook
// - At least 30 sites in atlas
// - 0–10 cards allowed in collection (optional)
export const CONSTRUCTED_REQUIREMENTS: DeckRequirements = {
  minSpellbook: 60,
  maxSpellbook: null,
  minAtlas: 30,
  maxAtlas: null,
  minCollection: 0,
  maxCollection: 10,
  avatarCount: 1,
  sideboardAllowed: true,
};

// ============================================================================
// Validation Types
// ============================================================================

export interface DeckStats {
  spellbookCount: number;
  atlasCount: number;
  collectionCount: number;
  sideboardCount: number;
  avatarCount: number;
}

export interface ValidationError {
  code: string;
  message: string;
  cardId?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  stats: DeckStats;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Get requirements for a specific format
 */
export function getRequirements(format: DeckFormat): DeckRequirements {
  return format === "constructed"
    ? CONSTRUCTED_REQUIREMENTS
    : LIMITED_REQUIREMENTS;
}

/**
 * Validate deck stats against format requirements
 */
export function validateDeck(
  stats: DeckStats,
  format: DeckFormat
): ValidationResult {
  const reqs = getRequirements(format);
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // Avatar validation
  if (stats.avatarCount !== reqs.avatarCount) {
    errors.push({
      code: "AVATAR_COUNT",
      message: `Deck must have exactly ${reqs.avatarCount} avatar (has ${stats.avatarCount})`,
    });
  }

  // Spellbook validation
  if (stats.spellbookCount < reqs.minSpellbook) {
    errors.push({
      code: "SPELLBOOK_MIN",
      message: `Spellbook needs at least ${reqs.minSpellbook} cards (has ${stats.spellbookCount})`,
    });
  }
  if (reqs.maxSpellbook !== null && stats.spellbookCount > reqs.maxSpellbook) {
    errors.push({
      code: "SPELLBOOK_MAX",
      message: `Spellbook cannot exceed ${reqs.maxSpellbook} cards (has ${stats.spellbookCount})`,
    });
  }

  // Atlas validation
  if (stats.atlasCount < reqs.minAtlas) {
    errors.push({
      code: "ATLAS_MIN",
      message: `Atlas needs at least ${reqs.minAtlas} sites (has ${stats.atlasCount})`,
    });
  }
  if (reqs.maxAtlas !== null && stats.atlasCount > reqs.maxAtlas) {
    errors.push({
      code: "ATLAS_MAX",
      message: `Atlas cannot exceed ${reqs.maxAtlas} sites (has ${stats.atlasCount})`,
    });
  }

  // Collection validation
  if (reqs.maxCollection !== null && stats.collectionCount > reqs.maxCollection) {
    errors.push({
      code: "COLLECTION_MAX",
      message: `Collection cannot exceed ${reqs.maxCollection} cards (has ${stats.collectionCount})`,
    });
  }

  // Warnings for suboptimal builds
  if (format === "limited") {
    // In limited, 40 spellbook is standard
    if (stats.spellbookCount > 45) {
      warnings.push(
        `Large spellbook (${stats.spellbookCount}) may reduce consistency`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

/**
 * Get human-readable format requirements string
 */
export function getRequirementsDescription(format: DeckFormat): string {
  const reqs = getRequirements(format);
  const parts: string[] = [];

  parts.push(`${reqs.avatarCount} Avatar`);
  parts.push(`${reqs.minSpellbook}+ Spellbook`);
  parts.push(`${reqs.minAtlas}+ Atlas (Sites)`);

  if (reqs.maxCollection !== null && reqs.maxCollection > 0) {
    parts.push(`Up to ${reqs.maxCollection} Collection`);
  }

  return parts.join(", ");
}
