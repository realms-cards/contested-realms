/**
 * Open Tournament Constants
 * Lighter constraints than standard tournaments — focused on organizing
 */

export const OPEN_TOURNAMENT_LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 128,
  DEFAULT_MAX_PLAYERS: 16,
} as const;

export const OPEN_TOURNAMENT_VALIDATION = {
  NAME_MIN_LENGTH: 3,
  NAME_MAX_LENGTH: 100,
  NAME_PATTERN: /^[a-zA-Z0-9\s\-_().]+$/,
} as const;

/** Match result approval states */
export const MATCH_APPROVAL_STATUS = {
  APPROVED: "approved",
  PENDING: "pending_approval",
  REJECTED: "rejected",
} as const;

export type MatchApprovalStatus =
  (typeof MATCH_APPROVAL_STATUS)[keyof typeof MATCH_APPROVAL_STATUS];
