/**
 * Tournament Validation Service
 * Format-specific validation logic for sealed, draft, and constructed tournaments
 */

import { 
  FORMAT_REQUIREMENTS,
  TOURNAMENT_PLAYER_LIMITS 
} from '@/lib/tournament/constants';
import type { TournamentFormat } from '@/lib/tournament/validation';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

export interface SealedSettings {
  packConfiguration: Array<{
    setId: string;
    packCount: number;
  }>;
  deckBuildingTimeLimit: number;
}

export interface DraftSettings {
  packConfiguration: Array<{
    setId: string;
    packCount: number;
  }>;
  draftTimeLimit: number;
  deckBuildingTimeLimit: number;
}

export interface ConstructedSettings {
  allowedFormats: string[];
  deckValidationRules: Record<string, unknown>;
}

export interface DeckList {
  cardId: string;
  quantity: number;
}

export interface CardDefinition {
  id: string;
  name: string;
  type: string;
  rarity: string;
  setId: string;
}

export class TournamentValidationService {
  /**
   * Validate sealed tournament settings
   */
  validateSealedSettings(settings: SealedSettings): ValidationResult {
    const warnings: string[] = [];

    // Validate pack configuration
    if (!settings.packConfiguration || settings.packConfiguration.length === 0) {
      return {
        isValid: false,
        error: 'Sealed tournament requires at least one pack configuration'
      };
    }

    const totalPacks = settings.packConfiguration.reduce((sum, config) => sum + config.packCount, 0);
    
    if (totalPacks < FORMAT_REQUIREMENTS.SEALED.MIN_PACKS) {
      return {
        isValid: false,
        error: `Sealed tournament requires at least ${FORMAT_REQUIREMENTS.SEALED.MIN_PACKS} packs`
      };
    }

    if (totalPacks > FORMAT_REQUIREMENTS.SEALED.MAX_PACKS) {
      return {
        isValid: false,
        error: `Sealed tournament cannot exceed ${FORMAT_REQUIREMENTS.SEALED.MAX_PACKS} packs`
      };
    }

    // Check for optimal pack count
    if (totalPacks !== FORMAT_REQUIREMENTS.SEALED.DEFAULT_PACKS) {
      warnings.push(`Recommended pack count is ${FORMAT_REQUIREMENTS.SEALED.DEFAULT_PACKS} for optimal sealed play`);
    }

    // Validate individual pack configurations
    for (const config of settings.packConfiguration) {
      if (config.packCount < 1) {
        return {
          isValid: false,
          error: 'Pack count must be at least 1'
        };
      }

      if (config.packCount > 10) {
        return {
          isValid: false,
          error: 'Pack count cannot exceed 10 per set'
        };
      }

      if (!config.setId || config.setId.trim() === '') {
        return {
          isValid: false,
          error: 'Set ID is required for pack configuration'
        };
      }
    }

    // Validate deck building time limit
    if (settings.deckBuildingTimeLimit < 15) {
      return {
        isValid: false,
        error: 'Deck building time limit must be at least 15 minutes'
      };
    }

    if (settings.deckBuildingTimeLimit > 60) {
      warnings.push('Deck building time limit over 60 minutes may be too long');
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate draft tournament settings
   */
  validateDraftSettings(settings: DraftSettings, playerCount: number): ValidationResult {
    const warnings: string[] = [];

    // Check minimum player count for draft
    if (playerCount < 4) {
      return {
        isValid: false,
        error: 'Draft tournaments require at least 4 players for proper pack rotation'
      };
    }

    // Validate pack configuration
    if (!settings.packConfiguration || settings.packConfiguration.length === 0) {
      return {
        isValid: false,
        error: 'Draft tournament requires at least one pack configuration'
      };
    }

    const totalPacksPerPlayer = settings.packConfiguration.reduce((sum, config) => sum + config.packCount, 0);
    
    if (totalPacksPerPlayer < FORMAT_REQUIREMENTS.DRAFT.MIN_PACKS) {
      return {
        isValid: false,
        error: `Draft tournament requires at least ${FORMAT_REQUIREMENTS.DRAFT.MIN_PACKS} packs per player`
      };
    }

    if (totalPacksPerPlayer > FORMAT_REQUIREMENTS.DRAFT.MAX_PACKS) {
      return {
        isValid: false,
        error: `Draft tournament cannot exceed ${FORMAT_REQUIREMENTS.DRAFT.MAX_PACKS} packs per player`
      };
    }

    // Check for standard 3-pack draft
    if (totalPacksPerPlayer !== FORMAT_REQUIREMENTS.DRAFT.DEFAULT_PACKS) {
      warnings.push(`Recommended pack count is ${FORMAT_REQUIREMENTS.DRAFT.DEFAULT_PACKS} packs per player`);
    }

    // Validate individual pack configurations
    for (const config of settings.packConfiguration) {
      if (config.packCount < 1) {
        return {
          isValid: false,
          error: 'Pack count must be at least 1'
        };
      }

      if (config.packCount > 5) {
        return {
          isValid: false,
          error: 'Pack count cannot exceed 5 per set in draft'
        };
      }
    }

    // Validate draft time limit
    if (settings.draftTimeLimit < 30) {
      return {
        isValid: false,
        error: 'Draft pick time limit must be at least 30 seconds'
      };
    }

    if (settings.draftTimeLimit > 300) {
      return {
        isValid: false,
        error: 'Draft pick time limit cannot exceed 5 minutes'
      };
    }

    // Optimal pick time is around 90 seconds
    if (settings.draftTimeLimit < 60) {
      warnings.push('Pick time under 60 seconds may be too fast for new players');
    } else if (settings.draftTimeLimit > 120) {
      warnings.push('Pick time over 2 minutes may slow down the draft significantly');
    }

    // Validate deck building time limit
    if (settings.deckBuildingTimeLimit < 15) {
      return {
        isValid: false,
        error: 'Deck building time limit must be at least 15 minutes'
      };
    }

    if (settings.deckBuildingTimeLimit > 60) {
      warnings.push('Deck building time limit over 60 minutes may be too long');
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate constructed tournament settings
   */
  validateConstructedSettings(settings: ConstructedSettings): ValidationResult {
    const warnings: string[] = [];

    // Validate allowed formats
    if (!settings.allowedFormats || settings.allowedFormats.length === 0) {
      return {
        isValid: false,
        error: 'Constructed tournament must specify at least one allowed format'
      };
    }

    // Check for recognized formats
    const recognizedFormats = FORMAT_REQUIREMENTS.CONSTRUCTED.ALLOWED_FORMATS;
    const unrecognizedFormats = settings.allowedFormats.filter(
      format => !recognizedFormats.includes(format as typeof recognizedFormats[number])
    );

    if (unrecognizedFormats.length > 0) {
      warnings.push(`Unrecognized formats: ${unrecognizedFormats.join(', ')}`);
    }

    // Validate deck validation rules
    if (!settings.deckValidationRules) {
      return {
        isValid: false,
        error: 'Constructed tournament must specify deck validation rules'
      };
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate sealed deck list
   */
  validateSealedDeck(
    deckList: DeckList[],
    cardPool: CardDefinition[]
  ): ValidationResult {
    const warnings: string[] = [];

    if (deckList.length === 0) {
      return {
        isValid: false,
        error: 'Deck list cannot be empty'
      };
    }

    // Calculate total card count
    const totalCards = deckList.reduce((sum, entry) => sum + entry.quantity, 0);

    if (totalCards < FORMAT_REQUIREMENTS.SEALED.MIN_DECK_SIZE) {
      return {
        isValid: false,
        error: `Sealed deck must contain at least ${FORMAT_REQUIREMENTS.SEALED.MIN_DECK_SIZE} cards`
      };
    }

    if (totalCards > FORMAT_REQUIREMENTS.SEALED.MAX_DECK_SIZE) {
      return {
        isValid: false,
        error: `Sealed deck cannot exceed ${FORMAT_REQUIREMENTS.SEALED.MAX_DECK_SIZE} cards`
      };
    }

    // Check if cards are from the available pool
    const cardPoolIds = new Set(cardPool.map(card => card.id));
    const unavailableCards = deckList.filter(entry => !cardPoolIds.has(entry.cardId));

    if (unavailableCards.length > 0) {
      return {
        isValid: false,
        error: 'Deck contains cards not available in the sealed pool'
      };
    }

    // Check quantities against available pool
    const poolQuantities = new Map<string, number>();
    for (const card of cardPool) {
      poolQuantities.set(card.id, (poolQuantities.get(card.id) || 0) + 1);
    }

    for (const entry of deckList) {
      const availableQuantity = poolQuantities.get(entry.cardId) || 0;
      if (entry.quantity > availableQuantity) {
        return {
          isValid: false,
          error: `Deck contains ${entry.quantity} copies of a card, but only ${availableQuantity} available in pool`
        };
      }
    }

    // Optimal deck size check
    if (totalCards !== 40) {
      warnings.push('Optimal sealed deck size is 40 cards');
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate draft deck list
   */
  validateDraftDeck(
    deckList: DeckList[],
    draftedCards: CardDefinition[]
  ): ValidationResult {
    const warnings: string[] = [];

    if (deckList.length === 0) {
      return {
        isValid: false,
        error: 'Deck list cannot be empty'
      };
    }

    // Calculate total card count
    const totalCards = deckList.reduce((sum, entry) => sum + entry.quantity, 0);

    if (totalCards < FORMAT_REQUIREMENTS.DRAFT.MIN_DECK_SIZE) {
      return {
        isValid: false,
        error: `Draft deck must contain at least ${FORMAT_REQUIREMENTS.DRAFT.MIN_DECK_SIZE} cards`
      };
    }

    if (totalCards > FORMAT_REQUIREMENTS.DRAFT.MAX_DECK_SIZE) {
      return {
        isValid: false,
        error: `Draft deck cannot exceed ${FORMAT_REQUIREMENTS.DRAFT.MAX_DECK_SIZE} cards`
      };
    }

    // Check if cards are from drafted pool
    const draftedCardIds = new Set(draftedCards.map(card => card.id));
    const unavailableCards = deckList.filter(entry => !draftedCardIds.has(entry.cardId));

    if (unavailableCards.length > 0) {
      return {
        isValid: false,
        error: 'Deck contains cards not drafted by the player'
      };
    }

    // Check quantities against drafted cards
    const draftedQuantities = new Map<string, number>();
    for (const card of draftedCards) {
      draftedQuantities.set(card.id, (draftedQuantities.get(card.id) || 0) + 1);
    }

    for (const entry of deckList) {
      const draftedQuantity = draftedQuantities.get(entry.cardId) || 0;
      if (entry.quantity > draftedQuantity) {
        return {
          isValid: false,
          error: `Deck contains ${entry.quantity} copies of a card, but only ${draftedQuantity} were drafted`
        };
      }
    }

    // Optimal deck size check
    if (totalCards !== 40) {
      warnings.push('Optimal draft deck size is 40 cards');
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate constructed deck list
   */
  validateConstructedDeck(
    deckList: DeckList[],
    formatRules: {
      minDeckSize?: number;
      maxDeckSize?: number;
      maxCopiesPerCard?: number;
      bannedCards?: string[];
      restrictedCards?: string[];
    }
  ): ValidationResult {
    const warnings: string[] = [];

    if (deckList.length === 0) {
      return {
        isValid: false,
        error: 'Deck list cannot be empty'
      };
    }

    // Calculate total card count
    const totalCards = deckList.reduce((sum, entry) => sum + entry.quantity, 0);

    const minSize = formatRules.minDeckSize || FORMAT_REQUIREMENTS.CONSTRUCTED.MIN_DECK_SIZE;
    const maxSize = formatRules.maxDeckSize || FORMAT_REQUIREMENTS.CONSTRUCTED.MAX_DECK_SIZE;

    if (totalCards < minSize) {
      return {
        isValid: false,
        error: `Constructed deck must contain at least ${minSize} cards`
      };
    }

    if (totalCards > maxSize) {
      return {
        isValid: false,
        error: `Constructed deck cannot exceed ${maxSize} cards`
      };
    }

    // Check copy limits
    const maxCopies = formatRules.maxCopiesPerCard || FORMAT_REQUIREMENTS.CONSTRUCTED.MAX_COPIES_PER_CARD;
    
    for (const entry of deckList) {
      if (entry.quantity > maxCopies) {
        return {
          isValid: false,
          error: `Cannot have more than ${maxCopies} copies of any card`
        };
      }

      if (entry.quantity < 1) {
        return {
          isValid: false,
          error: 'Card quantities must be at least 1'
        };
      }
    }

    // Check banned cards
    if (formatRules.bannedCards && formatRules.bannedCards.length > 0) {
      const bannedCardsInDeck = deckList.filter(entry => 
        formatRules.bannedCards?.includes(entry.cardId)
      );

      if (bannedCardsInDeck.length > 0) {
        return {
          isValid: false,
          error: 'Deck contains banned cards for this format'
        };
      }
    }

    // Check restricted cards
    if (formatRules.restrictedCards && formatRules.restrictedCards.length > 0) {
      const restrictedCardsInDeck = deckList.filter(entry => 
        formatRules.restrictedCards?.includes(entry.cardId) && entry.quantity > 1
      );

      if (restrictedCardsInDeck.length > 0) {
        return {
          isValid: false,
          error: 'Deck contains more than 1 copy of restricted cards'
        };
      }
    }

    // Optimal deck size check for constructed
    if (totalCards !== 60) {
      warnings.push('Standard constructed deck size is 60 cards');
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validate tournament format compatibility with player count
   */
  validateFormatPlayerCount(format: TournamentFormat, playerCount: number): ValidationResult {
    const warnings: string[] = [];

    if (playerCount < TOURNAMENT_PLAYER_LIMITS.MIN_PLAYERS) {
      return {
        isValid: false,
        error: `Tournament requires at least ${TOURNAMENT_PLAYER_LIMITS.MIN_PLAYERS} players`
      };
    }

    if (playerCount > TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS) {
      return {
        isValid: false,
        error: `Tournament cannot exceed ${TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS} players`
      };
    }

    // Format-specific validations
    switch (format) {
      case 'draft':
        if (playerCount < 4) {
          return {
            isValid: false,
            error: 'Draft tournaments require at least 4 players for proper pack rotation'
          };
        }

        // Draft works best with multiples of 8
        if (playerCount % 8 !== 0) {
          warnings.push('Draft tournaments work best with multiples of 8 players');
        }
        break;

      case 'sealed':
        // Sealed is more flexible with player counts
        if (playerCount < 4) {
          warnings.push('Sealed tournaments are more competitive with 4+ players');
        }
        break;

      case 'constructed':
        // Constructed has no specific player count requirements
        if (playerCount < 4) {
          warnings.push('Constructed tournaments are more competitive with 4+ players');
        }
        break;
    }

    return {
      isValid: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Estimate tournament duration based on format and player count
   */
  estimateTournamentDuration(
    format: TournamentFormat,
    playerCount: number,
    settings: Record<string, unknown>
  ): {
    preparationMinutes: number;
    matchMinutes: number;
    totalMinutes: number;
  } {
    let preparationMinutes = 0;
    let matchMinutes = 0;

    // Calculate preparation time
    switch (format) {
      case 'sealed': {
        const sealedSettings = settings.sealed as { deckBuildingTimeLimit?: number } | undefined;
        preparationMinutes = 5 + (sealedSettings?.deckBuildingTimeLimit || 30); // 5 min pack opening + deck building
        break;
      }
      case 'draft': {
        const draftSettings = settings.draft as { 
          packConfiguration?: Array<{ packCount: number }>;
          draftTimeLimit?: number;
          deckBuildingTimeLimit?: number;
        } | undefined;
        const packsPerPlayer = draftSettings?.packConfiguration?.reduce((sum, config) => sum + config.packCount, 0) || 3;
        const pickTime = (draftSettings?.draftTimeLimit || 90) / 60; // Convert to minutes
        preparationMinutes = (packsPerPlayer * 15 * pickTime / 60) + (draftSettings?.deckBuildingTimeLimit || 30);
        break;
      }
      case 'constructed': {
        const constructedSettings = settings.constructed as { deckSelectionTime?: number } | undefined;
        preparationMinutes = constructedSettings?.deckSelectionTime || 15;
        break;
      }
    }

    // Calculate match time (Swiss rounds)
    const rounds = this.calculateSwissRounds(playerCount);
    const avgMatchTime = 50; // minutes per match
    const breakTime = 5; // minutes between rounds

    matchMinutes = rounds * (avgMatchTime + breakTime);

    return {
      preparationMinutes: Math.ceil(preparationMinutes),
      matchMinutes: Math.ceil(matchMinutes),
      totalMinutes: Math.ceil(preparationMinutes + matchMinutes)
    };
  }

  /**
   * Calculate number of Swiss rounds for player count
   */
  private calculateSwissRounds(playerCount: number): number {
    if (playerCount <= 2) return 1;
    if (playerCount <= 4) return 2;
    if (playerCount <= 8) return 3;
    if (playerCount <= 16) return 4;
    return 5;
  }
}

// Export singleton instance
export const tournamentValidationService = new TournamentValidationService();