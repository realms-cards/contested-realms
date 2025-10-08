/**
 * Draft Configuration Service Contract
 *
 * Provides unified draft configuration loading, eliminating
 * the DraftSession vs Match.draftConfig mismatch.
 */

export interface DraftConfigService {
  /**
   * Get complete draft configuration for a match
   * Hydrates from DraftSession if tournament draft
   * @param matchId - Match identifier
   * @returns Draft configuration with cube or set data
   * @throws Error if match not found or config incomplete
   */
  getDraftConfig(matchId: string): Promise<DraftConfiguration>;

  /**
   * Load cube configuration details
   * @param cubeId - Cube identifier
   * @returns Cube configuration including card list
   * @throws Error if cube not found
   */
  loadCubeConfiguration(cubeId: string): Promise<CubeConfiguration>;

  /**
   * Ensure match has complete draft configuration loaded
   * Forces hydration from DraftSession if needed
   * @param matchId - Match identifier
   * @throws Error if configuration cannot be loaded
   */
  ensureConfigLoaded(matchId: string): Promise<void>;
}

/**
 * Draft Configuration Model
 */
export interface DraftConfiguration {
  matchId: string;
  tournamentId?: string;
  cubeId?: string;
  setMix?: string[];
  packCount: number;
  packSize: number;
  timePerPick?: number; // seconds
  deckBuildingTime?: number; // minutes
  loadedAt: string; // ISO 8601
}

/**
 * Cube Configuration Model
 */
export interface CubeConfiguration {
  id: string;
  name: string;
  description?: string;
  cardIds: string[]; // List of card IDs in cube
  totalCards: number;
  createdBy: string;
  isPublic: boolean;
}

/**
 * Validation Rules:
 *
 * 1. Exactly one of cubeId or setMix must be set
 * 2. packCount must be 1-10
 * 3. packSize must be 5-30
 * 4. If cubeId set, cube must exist in database
 * 5. If tournamentId set, must match Match.tournamentId
 */

/**
 * Expected Behavior:
 *
 * - Tournament drafts: Load from DraftSession first, fall back to Match.draftConfig
 * - Casual drafts: Load from Match.draftConfig only
 * - Configuration cached in memory after first load (per match)
 * - Hydration always runs before pack generation
 * - Missing configuration throws error (prevents silent failures)
 */

/**
 * Error Scenarios:
 *
 * - Match not found → Throw error immediately
 * - DraftSession not found for tournament draft → Throw error
 * - Cube not found when cubeId specified → Throw error
 * - Both cubeId and setMix empty → Throw error
 * - Both cubeId and setMix populated → Throw error (invalid state)
 */

/**
 * Performance Notes:
 *
 * - Configuration loaded once per match, cached in Match object
 * - Cube card lists loaded on-demand (not in every config fetch)
 * - Database queries use select projections (only fetch needed fields)
 */
