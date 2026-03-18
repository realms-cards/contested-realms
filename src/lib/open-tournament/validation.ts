/**
 * Open Tournament Validation Schemas
 * Lighter validation than standard tournaments
 */

import { z } from "zod";
import { OPEN_TOURNAMENT_LIMITS, OPEN_TOURNAMENT_VALIDATION } from "./constants";

// --- Creation ---

export const CreateOpenTournamentSchema = z.object({
  name: z
    .string()
    .min(OPEN_TOURNAMENT_VALIDATION.NAME_MIN_LENGTH)
    .max(OPEN_TOURNAMENT_VALIDATION.NAME_MAX_LENGTH)
    .regex(OPEN_TOURNAMENT_VALIDATION.NAME_PATTERN, "Invalid tournament name"),
  maxPlayers: z
    .number()
    .int()
    .min(OPEN_TOURNAMENT_LIMITS.MIN_PLAYERS)
    .max(OPEN_TOURNAMENT_LIMITS.MAX_PLAYERS)
    .default(OPEN_TOURNAMENT_LIMITS.DEFAULT_MAX_PLAYERS),
  isPrivate: z.boolean().default(false),
  /** The game format players will use (for display/organization, not enforced) */
  gameFormat: z.enum(["constructed", "sealed", "draft"]).default("constructed"),
  playNetworkUrl: z.string().url().optional(),
  matchResolution: z
    .object({
      allowRealms: z.boolean().default(true),
      allowManualReport: z.boolean().default(true),
      requireHostApproval: z.boolean().default(true),
    })
    .optional(),
  pairing: z
    .object({
      source: z.enum(["swiss", "manual"]).default("swiss"),
      totalRounds: z.number().int().min(1).max(20).optional(),
    })
    .optional(),
});

export type CreateOpenTournamentInput = z.infer<
  typeof CreateOpenTournamentSchema
>;

// --- Update ---

export const UpdateOpenTournamentSchema = z.object({
  name: z
    .string()
    .min(OPEN_TOURNAMENT_VALIDATION.NAME_MIN_LENGTH)
    .max(OPEN_TOURNAMENT_VALIDATION.NAME_MAX_LENGTH)
    .regex(OPEN_TOURNAMENT_VALIDATION.NAME_PATTERN)
    .optional(),
  maxPlayers: z
    .number()
    .int()
    .min(OPEN_TOURNAMENT_LIMITS.MIN_PLAYERS)
    .max(OPEN_TOURNAMENT_LIMITS.MAX_PLAYERS)
    .optional(),
  isPrivate: z.boolean().optional(),
  playNetworkUrl: z.string().url().nullable().optional(),
  matchResolution: z
    .object({
      allowRealms: z.boolean().optional(),
      allowManualReport: z.boolean().optional(),
      requireHostApproval: z.boolean().optional(),
    })
    .optional(),
  pairing: z
    .object({
      source: z.enum(["swiss", "manual"]).optional(),
      totalRounds: z.number().int().min(1).max(20).nullable().optional(),
    })
    .optional(),
});

export type UpdateOpenTournamentInput = z.infer<
  typeof UpdateOpenTournamentSchema
>;

// --- Player management ---

export const AddPlayerSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export type AddPlayerInput = z.infer<typeof AddPlayerSchema>;

export const UpdatePlayerDeckSchema = z.object({
  deckId: z.string().optional(),
  curiosaUrl: z.string().url().optional(),
});

export type UpdatePlayerDeckInput = z.infer<typeof UpdatePlayerDeckSchema>;

// --- Pairing ---

export const ManualPairingSchema = z.object({
  player1Id: z.string().min(1),
  player2Id: z.string().min(1),
});

export const PairingRequestSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("swiss"),
  }),
  z.object({
    source: z.literal("manual"),
    pairings: z.array(ManualPairingSchema).min(1),
  }),
]);

export type PairingRequestInput = z.infer<typeof PairingRequestSchema>;

// --- Match result ---

export const MatchResultSchema = z.object({
  winnerId: z.string().min(1),
  loserId: z.string().min(1),
  isDraw: z.boolean().default(false),
  source: z.enum(["realms", "manual", "tts"]),
});

export type MatchResultInput = z.infer<typeof MatchResultSchema>;

export const MatchApprovalSchema = z.object({
  approved: z.boolean(),
});

export type MatchApprovalInput = z.infer<typeof MatchApprovalSchema>;
