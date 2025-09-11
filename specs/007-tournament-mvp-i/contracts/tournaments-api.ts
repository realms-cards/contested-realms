/**
 * Tournament API Contracts - Type-safe API definitions
 * Generated from tournament MVP functional requirements
 */

import { z } from 'zod';

// Base schemas for type validation
export const TournamentFormatSchema = z.enum(['sealed', 'draft', 'constructed']);
export const TournamentStatusSchema = z.enum(['registering', 'preparing', 'active', 'completed', 'cancelled']);
export const PreparationStatusSchema = z.enum(['notStarted', 'inProgress', 'completed']);
export const RoundStatusSchema = z.enum(['pending', 'active', 'completed']);
export const MatchStatusSchema = z.enum(['pending', 'active', 'completed', 'cancelled']);

// Tournament Settings Schema
export const TournamentSettingsSchema = z.object({
  roundTimeLimit: z.number().min(5).max(120).optional(), // 5-120 minutes
  matchTimeLimit: z.number().min(10).max(180).optional(), // 10-180 minutes
  sealed: z.object({
    packConfiguration: z.array(z.object({
      setId: z.string(),
      packCount: z.number().min(1).max(10)
    })),
    deckBuildingTimeLimit: z.number().min(15).max(60) // 15-60 minutes
  }).optional(),
  draft: z.object({
    packConfiguration: z.array(z.object({
      setId: z.string(), 
      packCount: z.number().min(1).max(5)
    })),
    draftTimeLimit: z.number().min(30).max(300), // 30-300 seconds per pick
    deckBuildingTimeLimit: z.number().min(15).max(60) // 15-60 minutes
  }).optional(),
  constructed: z.object({
    allowedFormats: z.array(z.string()),
    deckValidationRules: z.record(z.string(), z.unknown())
  }).optional()
});

// Request/Response schemas
export const CreateTournamentRequestSchema = z.object({
  name: z.string().min(3).max(100),
  format: TournamentFormatSchema,
  maxPlayers: z.number().min(8).max(32),
  settings: TournamentSettingsSchema
});

export const UpdateTournamentRequestSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  settings: TournamentSettingsSchema.optional()
});

export const JoinTournamentRequestSchema = z.object({
  // No additional fields required - playerId from auth context
});

export const SubmitPreparationRequestSchema = z.object({
  preparationData: z.object({
    sealed: z.object({
      packsOpened: z.boolean(),
      deckBuilt: z.boolean(),
      deckList: z.array(z.object({
        cardId: z.string(),
        quantity: z.number().min(1).max(4)
      }))
    }).optional(),
    draft: z.object({
      draftCompleted: z.boolean(),
      deckBuilt: z.boolean(),
      deckList: z.array(z.object({
        cardId: z.string(),
        quantity: z.number().min(1).max(4)
      }))
    }).optional(),
    constructed: z.object({
      deckSelected: z.boolean(),
      deckId: z.string(),
      deckValidated: z.boolean()
    }).optional()
  })
});

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

export const TournamentRoundResponseSchema = z.object({
  id: z.string().uuid(),
  tournamentId: z.string().uuid(),
  roundNumber: z.number().min(1),
  status: RoundStatusSchema,
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  matches: z.array(z.object({
    id: z.string().uuid(),
    player1Id: z.string().uuid(),
    player1Name: z.string(),
    player2Id: z.string().uuid(),
    player2Name: z.string(),
    status: MatchStatusSchema,
    result: z.object({
      winnerId: z.string().uuid().nullable(),
      player1Wins: z.number().min(0),
      player2Wins: z.number().min(0)
    }).nullable()
  }))
});

export const TournamentStatisticsResponseSchema = z.object({
  tournamentId: z.string().uuid(),
  standings: z.array(z.object({
    playerId: z.string().uuid(),
    playerName: z.string(),
    wins: z.number().min(0),
    losses: z.number().min(0),
    draws: z.number().min(0),
    matchPoints: z.number().min(0),
    tiebreakers: z.record(z.string(), z.number()),
    finalRanking: z.number().min(1).nullable()
  })),
  rounds: z.array(TournamentRoundResponseSchema),
  overallStats: z.object({
    totalMatches: z.number().min(0),
    completedMatches: z.number().min(0),
    averageMatchDuration: z.number().min(0).nullable(),
    tournamentDuration: z.number().min(0).nullable()
  })
});

// API Endpoint Types
export type CreateTournamentRequest = z.infer<typeof CreateTournamentRequestSchema>;
export type UpdateTournamentRequest = z.infer<typeof UpdateTournamentRequestSchema>;
export type JoinTournamentRequest = z.infer<typeof JoinTournamentRequestSchema>;
export type SubmitPreparationRequest = z.infer<typeof SubmitPreparationRequestSchema>;

export type TournamentResponse = z.infer<typeof TournamentResponseSchema>;
export type TournamentRegistrationResponse = z.infer<typeof TournamentRegistrationResponseSchema>;
export type TournamentRoundResponse = z.infer<typeof TournamentRoundResponseSchema>;
export type TournamentStatisticsResponse = z.infer<typeof TournamentStatisticsResponseSchema>;

export type TournamentFormat = z.infer<typeof TournamentFormatSchema>;
export type TournamentStatus = z.infer<typeof TournamentStatusSchema>;
export type PreparationStatus = z.infer<typeof PreparationStatusSchema>;
export type RoundStatus = z.infer<typeof RoundStatusSchema>;
export type MatchStatus = z.infer<typeof MatchStatusSchema>;