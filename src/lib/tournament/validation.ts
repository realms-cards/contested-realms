/**
 * Tournament Validation Schemas
 * Zod schemas for type-safe tournament data validation
 * Based on contracts from `/specs/007-tournament-mvp-i/contracts/tournaments-api.ts`
 */

import { z } from 'zod';
import { 
  TOURNAMENT_PLAYER_LIMITS, 
  VALIDATION_PATTERNS,
  TOURNAMENT_TIMEOUTS
} from './constants';

// Base enum schemas matching Prisma enums
export const TournamentFormatSchema = z.enum(['sealed', 'draft', 'constructed']);
export const TournamentStatusSchema = z.enum(['registering', 'preparing', 'active', 'completed', 'cancelled']);
export const PreparationStatusSchema = z.enum(['notStarted', 'inProgress', 'completed']);
export const RoundStatusSchema = z.enum(['pending', 'active', 'completed']);
export const MatchStatusSchema = z.enum(['pending', 'active', 'completed', 'cancelled']);

// Tournament Settings Schema
export const TournamentSettingsSchema = z.object({
  // Common settings
  roundTimeLimit: z.number()
    .min(TOURNAMENT_TIMEOUTS.MATCH_PHASE.MIN_MATCH_TIME)
    .max(TOURNAMENT_TIMEOUTS.MATCH_PHASE.MAX_MATCH_TIME)
    .optional(),
  matchTimeLimit: z.number()
    .min(TOURNAMENT_TIMEOUTS.MATCH_PHASE.MIN_MATCH_TIME)
    .max(TOURNAMENT_TIMEOUTS.MATCH_PHASE.MAX_MATCH_TIME)
    .optional(),
  
  // Format-specific settings
  sealed: z.object({
    packConfiguration: z.array(z.object({
      setId: z.string().min(1),
      packCount: z.number().min(1).max(10)
    })).min(1).max(5),
    deckBuildingTimeLimit: z.number()
      .min(15)
      .max(60) // 15-60 minutes
  }).optional(),
  
  draft: z.object({
    packConfiguration: z.array(z.object({
      setId: z.string().min(1), 
      packCount: z.number().min(1).max(5)
    })).min(1).max(3),
    draftTimeLimit: z.number()
      .min(TOURNAMENT_TIMEOUTS.PREPARATION_PHASE.DRAFT.MIN_PICK_TIME)
      .max(TOURNAMENT_TIMEOUTS.PREPARATION_PHASE.DRAFT.MAX_PICK_TIME), // 30-300 seconds per pick
    deckBuildingTimeLimit: z.number()
      .min(15)
      .max(60) // 15-60 minutes
  }).optional(),
  
  constructed: z.object({
    allowedFormats: z.array(z.string()).min(1),
    deckValidationRules: z.record(z.string(), z.unknown())
  }).optional()
});

// Request schemas
export const CreateTournamentRequestSchema = z.object({
  name: z.string()
    .min(VALIDATION_PATTERNS.TOURNAMENT_NAME.MIN_LENGTH)
    .max(VALIDATION_PATTERNS.TOURNAMENT_NAME.MAX_LENGTH)
    .regex(VALIDATION_PATTERNS.TOURNAMENT_NAME.PATTERN, 'Invalid tournament name format'),
  format: TournamentFormatSchema,
  maxPlayers: z.number()
    .min(TOURNAMENT_PLAYER_LIMITS.MIN_PLAYERS)
    .max(TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS),
  settings: TournamentSettingsSchema
});

export const UpdateTournamentRequestSchema = z.object({
  name: z.string()
    .min(VALIDATION_PATTERNS.TOURNAMENT_NAME.MIN_LENGTH)
    .max(VALIDATION_PATTERNS.TOURNAMENT_NAME.MAX_LENGTH)
    .regex(VALIDATION_PATTERNS.TOURNAMENT_NAME.PATTERN, 'Invalid tournament name format')
    .optional(),
  settings: TournamentSettingsSchema.optional()
});

export const JoinTournamentRequestSchema = z.object({
  // No additional fields required - playerId from auth context
});

// Preparation data schemas
export const SealedPreparationDataSchema = z.object({
  packsOpened: z.boolean(),
  deckBuilt: z.boolean(),
  deckList: z.array(z.object({
    cardId: z.string().min(1),
    quantity: z.number().min(1).max(4)
  }))
});

export const DraftPreparationDataSchema = z.object({
  draftCompleted: z.boolean(),
  picksData: z.array(z.object({
    pickNumber: z.number().min(1),
    packNumber: z.number().min(1),
    cardId: z.string(),
    timestamp: z.string().datetime()
  })).optional(),
  deckBuilt: z.boolean(),
  deckList: z.array(z.object({
    cardId: z.string().min(1),
    quantity: z.number().min(1).max(4)
  }))
});

export const ConstructedPreparationDataSchema = z.object({
  deckSelected: z.boolean(),
  deckId: z.string().min(1),
  deckValidated: z.boolean()
});

export const SubmitPreparationRequestSchema = z.object({
  preparationData: z.object({
    sealed: SealedPreparationDataSchema.optional(),
    draft: DraftPreparationDataSchema.optional(),
    constructed: ConstructedPreparationDataSchema.optional()
  })
});

// Response schemas
export const TournamentResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  format: TournamentFormatSchema,
  status: TournamentStatusSchema,
  maxPlayers: z.number(),
  currentPlayers: z.number(),
  creatorId: z.string().uuid(),
  settings: TournamentSettingsSchema,
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable()
});

export const TournamentRegistrationResponseSchema = z.object({
  id: z.string().uuid(),
  tournamentId: z.string().uuid(),
  playerId: z.string().uuid(),
  playerName: z.string(),
  registeredAt: z.string().datetime(),
  preparationStatus: PreparationStatusSchema,
  deckSubmitted: z.boolean()
});

export const TournamentMatchResponseSchema = z.object({
  id: z.string().uuid(),
  player1Id: z.string().uuid(),
  player1Name: z.string(),
  player2Id: z.string().uuid(),
  player2Name: z.string(),
  status: MatchStatusSchema,
  result: z.object({
    winnerId: z.string().uuid().nullable(),
    player1Wins: z.number().min(0),
    player2Wins: z.number().min(0),
    draws: z.number().min(0).optional()
  }).nullable()
});

export const TournamentRoundResponseSchema = z.object({
  id: z.string().uuid(),
  tournamentId: z.string().uuid(),
  roundNumber: z.number().min(1),
  status: RoundStatusSchema,
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  matches: z.array(TournamentMatchResponseSchema)
});

export const TournamentStandingSchema = z.object({
  playerId: z.string().uuid(),
  playerName: z.string(),
  wins: z.number().min(0),
  losses: z.number().min(0),
  draws: z.number().min(0),
  matchPoints: z.number().min(0),
  tiebreakers: z.record(z.string(), z.number()),
  finalRanking: z.number().min(1).nullable()
});

export const TournamentStatisticsResponseSchema = z.object({
  tournamentId: z.string().uuid(),
  standings: z.array(TournamentStandingSchema),
  rounds: z.array(TournamentRoundResponseSchema),
  overallStats: z.object({
    totalMatches: z.number().min(0),
    completedMatches: z.number().min(0),
    averageMatchDuration: z.number().min(0).nullable(),
    tournamentDuration: z.number().min(0).nullable(),
    totalPlayers: z.number().min(0),
    roundsCompleted: z.number().min(0)
  })
});

// Feature configuration schema
export const TournamentFeatureConfigSchema = z.object({
  enabled: z.boolean(),
  maxConcurrentTournaments: z.number().min(1).max(100).optional(),
  supportedFormats: z.array(TournamentFormatSchema).optional()
});

// Database model validation schemas (for internal use)
export const TournamentModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  creatorId: z.string(),
  format: TournamentFormatSchema,
  status: TournamentStatusSchema,
  maxPlayers: z.number().min(TOURNAMENT_PLAYER_LIMITS.MIN_PLAYERS).max(TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS),
  settings: z.record(z.string(), z.unknown()), // JSON field
  featureFlags: z.record(z.string(), z.unknown()).nullable(), // JSON field
  createdAt: z.date(),
  updatedAt: z.date(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable()
});

export const TournamentRegistrationModelSchema = z.object({
  id: z.string(),
  tournamentId: z.string(),
  playerId: z.string(),
  registeredAt: z.date(),
  preparationStatus: PreparationStatusSchema,
  deckSubmitted: z.boolean(),
  preparationData: z.record(z.string(), z.unknown()).nullable() // JSON field
});

export const TournamentRoundModelSchema = z.object({
  id: z.string(),
  tournamentId: z.string(),
  roundNumber: z.number().min(1),
  status: RoundStatusSchema,
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  pairingData: z.record(z.string(), z.unknown()).nullable() // JSON field
});

export const TournamentStatisticsModelSchema = z.object({
  id: z.string(),
  tournamentId: z.string(),
  playerId: z.string(),
  wins: z.number().min(0),
  losses: z.number().min(0),
  draws: z.number().min(0),
  matchPoints: z.number().min(0),
  tiebreakers: z.record(z.string(), z.unknown()), // JSON field
  finalRanking: z.number().min(1).nullable()
});

// Type exports for use throughout the application
export type CreateTournamentRequest = z.infer<typeof CreateTournamentRequestSchema>;
export type UpdateTournamentRequest = z.infer<typeof UpdateTournamentRequestSchema>;
export type JoinTournamentRequest = z.infer<typeof JoinTournamentRequestSchema>;
export type SubmitPreparationRequest = z.infer<typeof SubmitPreparationRequestSchema>;

export type TournamentResponse = z.infer<typeof TournamentResponseSchema>;
export type TournamentRegistrationResponse = z.infer<typeof TournamentRegistrationResponseSchema>;
export type TournamentRoundResponse = z.infer<typeof TournamentRoundResponseSchema>;
export type TournamentStatisticsResponse = z.infer<typeof TournamentStatisticsResponseSchema>;
export type TournamentStanding = z.infer<typeof TournamentStandingSchema>;

export type TournamentFormat = z.infer<typeof TournamentFormatSchema>;
export type TournamentStatus = z.infer<typeof TournamentStatusSchema>;
export type PreparationStatus = z.infer<typeof PreparationStatusSchema>;
export type RoundStatus = z.infer<typeof RoundStatusSchema>;
export type MatchStatus = z.infer<typeof MatchStatusSchema>;

// Internal model types
export type TournamentModel = z.infer<typeof TournamentModelSchema>;
export type TournamentRegistrationModel = z.infer<typeof TournamentRegistrationModelSchema>;
export type TournamentRoundModel = z.infer<typeof TournamentRoundModelSchema>;
export type TournamentStatisticsModel = z.infer<typeof TournamentStatisticsModelSchema>;

// Validation helper functions
export function validateTournamentName(name: string): { isValid: boolean; error?: string } {
  try {
    z.string()
      .min(VALIDATION_PATTERNS.TOURNAMENT_NAME.MIN_LENGTH)
      .max(VALIDATION_PATTERNS.TOURNAMENT_NAME.MAX_LENGTH)
      .regex(VALIDATION_PATTERNS.TOURNAMENT_NAME.PATTERN)
      .parse(name);
    return { isValid: true };
  } catch (error) {
    return { 
      isValid: false, 
      error: error instanceof z.ZodError ? error.issues[0]?.message : 'Invalid tournament name'
    };
  }
}

export function validatePlayerCount(count: number, format: TournamentFormat): { isValid: boolean; error?: string } {
  if (count < TOURNAMENT_PLAYER_LIMITS.MIN_PLAYERS) {
    return { 
      isValid: false, 
      error: `Minimum ${TOURNAMENT_PLAYER_LIMITS.MIN_PLAYERS} players required` 
    };
  }
  
  if (count > TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS) {
    return { 
      isValid: false, 
      error: `Maximum ${TOURNAMENT_PLAYER_LIMITS.MAX_PLAYERS} players allowed` 
    };
  }

  // Format-specific validation
  if (format === 'draft' && count < 4) {
    return { 
      isValid: false, 
      error: 'Draft tournaments require at least 4 players for proper pack rotation' 
    };
  }

  return { isValid: true };
}

export function validateTournamentSettings(format: TournamentFormat, settings: unknown): { isValid: boolean; error?: string } {
  try {
    const validatedSettings = TournamentSettingsSchema.parse(settings);
    
    // Format-specific validation
    if (format === 'sealed' && !validatedSettings.sealed) {
      return { isValid: false, error: 'Sealed tournament requires sealed configuration' };
    }
    
    if (format === 'draft' && !validatedSettings.draft) {
      return { isValid: false, error: 'Draft tournament requires draft configuration' };
    }
    
    if (format === 'constructed' && !validatedSettings.constructed) {
      return { isValid: false, error: 'Constructed tournament requires constructed configuration' };
    }
    
    return { isValid: true };
  } catch (error) {
    return { 
      isValid: false, 
      error: error instanceof z.ZodError ? error.issues[0]?.message : 'Invalid tournament settings'
    };
  }
}