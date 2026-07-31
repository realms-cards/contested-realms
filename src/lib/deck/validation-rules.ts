/**
 * Deck Validation Rules for Sorcery TCG
 *
 * Single source of truth for deck legality on the Next.js side (imports, deck
 * save/publish, deck editor, collection decks, tournament deck selection).
 *
 * Two things vary the requirements:
 *  1. Format — limited (sealed/draft) vs constructed.
 *  2. The avatar — some avatars change deckbuilding entirely (Magician).
 *
 * Always validate through `validateDeck()` rather than re-implementing the
 * count checks inline; avatar rules are easy to forget and were historically
 * duplicated across five call sites.
 *
 * NOTE: the Socket.IO server has a parallel implementation in
 * `server/modules/deck-utils.ts` (it cannot import from `src/` because its
 * tsconfig rootDir is `server/`). Keep the two in sync.
 */

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

/**
 * Normalize a stored/user-supplied format string to a DeckFormat.
 * Deck.format holds display values like "Constructed", "Sealed", "Draft".
 * Anything that isn't explicitly constructed is treated as limited.
 */
export function normalizeFormat(
  value: string | null | undefined
): DeckFormat {
  return String(value ?? "").toLowerCase() === "constructed"
    ? "constructed"
    : "limited";
}

// ============================================================================
// Avatar-specific deckbuilding rules
// ============================================================================

/**
 * Magician has no atlas — its sites are shuffled into the spellbook, so the
 * only size requirement is the combined spellbook + sites total.
 * Matched by name (case-insensitive) to mirror `isMagician()` in
 * `src/lib/game/avatarAbilities.ts`.
 */
export function isMagicianAvatar(
  avatarName: string | null | undefined
): boolean {
  if (!avatarName) return false;
  return avatarName.toLowerCase().includes("magician");
}

export interface EffectiveRequirements extends DeckRequirements {
  /**
   * Sites live in the spellbook: atlas cards count toward the spellbook
   * minimum and there is no separate atlas minimum.
   */
  sitesInSpellbook: boolean;
}

/**
 * Requirements for a format, adjusted for the deck's avatar.
 */
export function getRequirements(
  format: DeckFormat,
  avatarName?: string | null
): EffectiveRequirements {
  const base =
    format === "constructed" ? CONSTRUCTED_REQUIREMENTS : LIMITED_REQUIREMENTS;

  if (isMagicianAvatar(avatarName)) {
    return { ...base, minAtlas: 0, maxAtlas: null, sitesInSpellbook: true };
  }

  return { ...base, sitesInSpellbook: false };
}

// ============================================================================
// Validation Types
// ============================================================================

export interface DeckStats {
  /** Spellbook cards EXCLUDING the avatar, even though both live in the Spellbook zone. */
  spellbookCount: number;
  atlasCount: number;
  collectionCount: number;
  sideboardCount: number;
  avatarCount: number;
}

/** Callers that only track deck zones can omit collection/sideboard. */
export type DeckStatsInput = Pick<
  DeckStats,
  "spellbookCount" | "atlasCount" | "avatarCount"
> &
  Partial<DeckStats>;

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
 * Validate deck counts against format + avatar requirements.
 *
 * `stats.spellbookCount` must exclude the avatar — callers that count the
 * Spellbook zone directly need to subtract it first.
 */
export function validateDeck(
  stats: DeckStatsInput,
  format: DeckFormat,
  avatarName?: string | null
): ValidationResult {
  const reqs = getRequirements(format, avatarName);
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  const normalized: DeckStats = {
    spellbookCount: stats.spellbookCount,
    atlasCount: stats.atlasCount,
    avatarCount: stats.avatarCount,
    collectionCount: stats.collectionCount ?? 0,
    sideboardCount: stats.sideboardCount ?? 0,
  };

  // Avatar validation
  if (normalized.avatarCount !== reqs.avatarCount) {
    errors.push({
      code: "AVATAR_COUNT",
      message: `Deck must have exactly ${reqs.avatarCount} avatar (has ${normalized.avatarCount})`,
    });
  }

  // Spellbook validation — Magician counts its sites toward the spellbook
  const effectiveSpellbook = reqs.sitesInSpellbook
    ? normalized.spellbookCount + normalized.atlasCount
    : normalized.spellbookCount;
  const spellbookLabel = reqs.sitesInSpellbook
    ? "cards including sites"
    : "cards";

  if (effectiveSpellbook < reqs.minSpellbook) {
    errors.push({
      code: "SPELLBOOK_MIN",
      message: `Spellbook needs at least ${reqs.minSpellbook} ${spellbookLabel} (has ${effectiveSpellbook})`,
    });
  }
  if (reqs.maxSpellbook !== null && effectiveSpellbook > reqs.maxSpellbook) {
    errors.push({
      code: "SPELLBOOK_MAX",
      message: `Spellbook cannot exceed ${reqs.maxSpellbook} ${spellbookLabel} (has ${effectiveSpellbook})`,
    });
  }

  // Atlas validation (skipped for avatars with no atlas)
  if (!reqs.sitesInSpellbook) {
    if (normalized.atlasCount < reqs.minAtlas) {
      errors.push({
        code: "ATLAS_MIN",
        message: `Atlas needs at least ${reqs.minAtlas} sites (has ${normalized.atlasCount})`,
      });
    }
    if (reqs.maxAtlas !== null && normalized.atlasCount > reqs.maxAtlas) {
      errors.push({
        code: "ATLAS_MAX",
        message: `Atlas cannot exceed ${reqs.maxAtlas} sites (has ${normalized.atlasCount})`,
      });
    }
  }

  // Collection validation
  if (
    reqs.maxCollection !== null &&
    normalized.collectionCount > reqs.maxCollection
  ) {
    errors.push({
      code: "COLLECTION_MAX",
      message: `Collection cannot exceed ${reqs.maxCollection} cards (has ${normalized.collectionCount})`,
    });
  }

  // Warnings for suboptimal builds
  if (format === "limited" && effectiveSpellbook > 45) {
    // In limited, 40 spellbook is standard
    warnings.push(
      `Large spellbook (${effectiveSpellbook}) may reduce consistency`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: normalized,
  };
}

export interface ImportFormatResolution {
  format: DeckFormat;
  /** Value to persist in Deck.format */
  label: string;
  validation: ValidationResult;
}

/** Errors about deck size and avatar count, as opposed to collection capacity. */
const SIZE_ERROR_CODES = new Set([
  "AVATAR_COUNT",
  "SPELLBOOK_MIN",
  "SPELLBOOK_MAX",
  "ATLAS_MIN",
  "ATLAS_MAX",
]);

/**
 * Imports are gated on deck size only. Curiosa sideboards routinely exceed the
 * 10-card collection cap, and rejecting the whole import over that helps nobody
 * — the deck editor and tournament deck selection still enforce it.
 */
function sizeErrorsOnly(result: ValidationResult): ValidationResult {
  const errors = result.errors.filter((e) => SIZE_ERROR_CODES.has(e.code));
  return { ...result, errors, isValid: errors.length === 0 };
}

/**
 * Decide which format an imported decklist should be stored as.
 *
 * Importers (Curiosa, pasted text) used to hard-code `format: "Constructed"`
 * while validating against limited minimums. A draft-sized list therefore got
 * imported as Constructed and then failed the 60/30 gate on the next save or
 * publish. When the caller doesn't state a format we infer it instead: a list
 * that meets constructed size requirements is stored as Constructed, anything
 * else that is a legal limited deck is stored as Limited.
 */
export function resolveImportFormat(
  stats: DeckStatsInput,
  avatarName?: string | null,
  requestedFormat?: string | null
): ImportFormatResolution {
  if (requestedFormat) {
    const format = normalizeFormat(requestedFormat);
    return {
      format,
      label: format === "constructed" ? "Constructed" : "Limited",
      validation: sizeErrorsOnly(validateDeck(stats, format, avatarName)),
    };
  }

  const asConstructed = sizeErrorsOnly(
    validateDeck(stats, "constructed", avatarName)
  );
  if (asConstructed.isValid) {
    return {
      format: "constructed",
      label: "Constructed",
      validation: asConstructed,
    };
  }

  return {
    format: "limited",
    label: "Limited",
    validation: sizeErrorsOnly(validateDeck(stats, "limited", avatarName)),
  };
}

/**
 * Flatten validation errors into a single sentence for API error responses.
 */
export function formatValidationErrors(result: ValidationResult): string {
  return result.errors.map((e) => e.message).join(". ");
}

/**
 * Get human-readable format requirements string
 */
export function getRequirementsDescription(
  format: DeckFormat,
  avatarName?: string | null
): string {
  const reqs = getRequirements(format, avatarName);
  const parts: string[] = [];

  parts.push(`${reqs.avatarCount} Avatar`);

  if (reqs.sitesInSpellbook) {
    parts.push(`${reqs.minSpellbook}+ Spellbook (sites included, no Atlas)`);
  } else {
    parts.push(`${reqs.minSpellbook}+ Spellbook`);
    parts.push(`${reqs.minAtlas}+ Atlas (Sites)`);
  }

  if (reqs.maxCollection !== null && reqs.maxCollection > 0) {
    parts.push(`Up to ${reqs.maxCollection} Collection`);
  }

  return parts.join(", ");
}
