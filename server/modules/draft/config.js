/**
 * Draft Configuration Service
 *
 * Provides unified draft configuration loading for matches.
 * Eliminates DraftSession vs Match.draftConfig mismatch by hydrating
 * tournament drafts from database before pack generation.
 *
 * Extracted from server/index.js as part of T020 (module refactoring).
 */

/**
 * Get complete draft configuration for a match
 * Hydrates from DraftSession if tournament draft
 *
 * @param {object} prisma - Prisma client instance
 * @param {string} matchId - Match identifier
 * @param {object} match - In-memory match object
 * @returns {Promise<object>} Draft configuration with cube or set data
 */
async function getDraftConfig(prisma, matchId, match) {
  console.log('[DraftConfig] Getting config for match:', { matchId, matchType: match.matchType, tournamentId: match.tournamentId });

  // For tournament drafts, always hydrate from DraftSession first
  if (match.matchType === 'draft' && match.tournamentId) {
    console.log('[DraftConfig] Loading from DraftSession for tournament draft:', { matchId, tournamentId: match.tournamentId });
    try {
      const draftSession = await prisma.draftSession.findFirst({
        where: { tournamentId: match.tournamentId },
        select: { settings: true, packConfiguration: true },
      });

      if (draftSession) {
        // Extract cubeId from DraftSession settings
        const settings = draftSession.settings || {};
        const cubeId = settings.cubeId;

        // Build draftConfig from DraftSession
        const packConfig = draftSession.packConfiguration || [];
        const packCounts = {};
        for (const entry of packConfig) {
          const setId = entry.setId || 'Beta';
          packCounts[setId] = (packCounts[setId] || 0) + (entry.packCount || 0);
        }

        const config = {
          cubeId: cubeId || undefined,
          packCounts,
          packCount: Object.values(packCounts).reduce((a, b) => a + b, 0) || 3,
          packSize: 15,
        };

        console.log('[DraftConfig] Loaded from DraftSession:', { matchId, cubeId, packCount: config.packCount });
        return config;
      }

      console.warn('[DraftConfig] No DraftSession found for tournament:', { tournamentId: match.tournamentId });
    } catch (err) {
      console.error('[DraftConfig] Failed to load from DraftSession:', err?.message || err);
      throw new Error(`Failed to load draft config from DraftSession: ${err?.message || err}`);
    }
  }

  // Fall back to match.draftConfig for casual drafts or if DraftSession not found
  if (match.draftConfig) {
    console.log('[DraftConfig] Using existing match.draftConfig:', { matchId });
    return match.draftConfig;
  }

  // Default configuration if nothing found
  const defaultConfig = { setMix: ['Beta'], packCount: 3, packSize: 15 };
  console.log('[DraftConfig] Using default config:', { matchId, config: defaultConfig });
  return defaultConfig;
}

/**
 * Load cube configuration details including card list
 *
 * @param {object} prisma - Prisma client instance
 * @param {string} cubeId - Cube identifier
 * @returns {Promise<object>} Cube configuration with card IDs
 */
async function loadCubeConfiguration(prisma, cubeId) {
  console.log('[DraftConfig] Loading cube configuration:', { cubeId });

  try {
    const cube = await prisma.cube.findUnique({
      where: { id: cubeId },
      select: {
        id: true,
        name: true,
        description: true,
        cardIds: true,
        createdBy: true,
        isPublic: true,
      },
    });

    if (!cube) {
      throw new Error(`Cube not found: ${cubeId}`);
    }

    const config = {
      id: cube.id,
      name: cube.name,
      description: cube.description || undefined,
      cardIds: cube.cardIds || [],
      totalCards: (cube.cardIds || []).length,
      createdBy: cube.createdBy,
      isPublic: cube.isPublic || false,
    };

    console.log('[DraftConfig] Loaded cube:', { cubeId, name: cube.name, totalCards: config.totalCards });
    return config;
  } catch (err) {
    console.error('[DraftConfig] Failed to load cube:', { cubeId, error: err?.message || err });
    throw err;
  }
}

/**
 * Ensure match has complete draft configuration loaded
 * Forces hydration from DraftSession if needed
 *
 * @param {object} prisma - Prisma client instance
 * @param {string} matchId - Match identifier
 * @param {object} match - In-memory match object
 * @param {function} hydrateMatchFromDatabase - Hydration function from server/index.js
 */
async function ensureConfigLoaded(prisma, matchId, match, hydrateMatchFromDatabase) {
  console.log('[DraftConfig] Ensuring config loaded for match:', { matchId, tournamentId: match.tournamentId });

  // For tournament drafts, force hydration
  if (match.tournamentId && match.matchType === 'draft') {
    try {
      await hydrateMatchFromDatabase(matchId, match);
      console.log('[DraftConfig] Config hydrated from database:', {
        matchId,
        tournamentId: match.tournamentId,
        cubeId: match.draftConfig?.cubeId,
        packCount: match.draftConfig?.packCount
      });
    } catch (err) {
      console.error('[DraftConfig] Failed to hydrate config:', err?.message || err);
      throw new Error(`Failed to ensure config loaded: ${err?.message || err}`);
    }
  }

  // Verify configuration is present
  if (!match.draftConfig) {
    throw new Error(`No draft configuration available for match ${matchId}`);
  }
}

module.exports = {
  getDraftConfig,
  loadCubeConfiguration,
  ensureConfigLoaded,
};
