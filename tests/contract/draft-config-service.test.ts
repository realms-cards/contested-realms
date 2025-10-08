/**
 * Contract Test: DraftConfigService
 *
 * Tests the draft configuration service module.
 * Verifies that draft config:
 * 1. Loads from DraftSession for tournament drafts
 * 2. Falls back to match config for casual drafts
 * 3. Returns default config when needed
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Prisma client
const createMockPrisma = () => ({
  draftSession: {
    findFirst: vi.fn(),
  },
  cube: {
    findUnique: vi.fn(),
  },
});

describe('DraftConfigService Contract Tests', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let draftConfig: typeof import('../../server/modules/draft/config');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPrisma = createMockPrisma();

    // Dynamically import the module
    draftConfig = await import('../../server/modules/draft/config');
  });

  describe('getDraftConfig', () => {
    it('should load configuration from DraftSession when tournamentId exists', async () => {
      const matchId = 'match_123';
      const tournamentId = 'tournament_456';
      const cubeId = 'cube_789';

      // Mock DraftSession with cubeId
      mockPrisma.draftSession.findFirst.mockResolvedValue({
        id: 'draft_session_1',
        tournamentId,
        settings: { cubeId, timePerPick: 90 },
        packConfiguration: [
          { setId: 'Beta', packCount: 2 },
          { setId: 'Unlimited', packCount: 1 },
        ],
      });

      const mockMatch = {
        id: matchId,
        tournamentId,
        matchType: 'draft',
        draftConfig: {},
      };

      const config = await draftConfig.getDraftConfig(mockPrisma as any, matchId, mockMatch);

      expect(config).toMatchObject({
        cubeId,
        packCount: 3, // 2 + 1
        packSize: 15,
      });

      expect(mockPrisma.draftSession.findFirst).toHaveBeenCalledWith({
        where: { tournamentId },
        select: { settings: true, packConfiguration: true },
      });
    });

    it('should return match config when no tournamentId (casual draft)', async () => {
      const matchId = 'match_abc';

      const mockMatch = {
        id: matchId,
        tournamentId: null,
        matchType: 'draft',
        draftConfig: {
          setMix: ['Beta', 'Unlimited'],
          packCount: 3,
          packSize: 15,
        },
      };

      const config = await draftConfig.getDraftConfig(mockPrisma as any, matchId, mockMatch);

      expect(config.setMix).toEqual(['Beta', 'Unlimited']);
      expect(config.cubeId).toBeUndefined();
      expect(config.packCount).toBe(3);

      // Should not query DraftSession for casual drafts
      expect(mockPrisma.draftSession.findFirst).not.toHaveBeenCalled();
    });

    it('should return default config when match.draftConfig is missing', async () => {
      const matchId = 'match_def';

      const mockMatch = {
        id: matchId,
        tournamentId: null,
        matchType: 'draft',
        draftConfig: null,
      };

      const config = await draftConfig.getDraftConfig(mockPrisma as any, matchId, mockMatch);

      // Default config
      expect(config).toMatchObject({
        setMix: ['Beta'],
        packCount: 3,
        packSize: 15,
      });
    });
  });

  describe('loadCubeConfiguration', () => {
    it('should load cube details from database', async () => {
      const cubeId = 'cube_123';

      mockPrisma.cube.findUnique.mockResolvedValue({
        id: cubeId,
        name: 'Test Cube',
        description: 'A test cube',
        cardIds: ['card1', 'card2', 'card3'],
        createdBy: 'user_1',
        isPublic: true,
      });

      const cube = await draftConfig.loadCubeConfiguration(mockPrisma as any, cubeId);

      expect(cube).toMatchObject({
        id: cubeId,
        name: 'Test Cube',
        description: 'A test cube',
        totalCards: 3,
        createdBy: 'user_1',
        isPublic: true,
      });

      expect(mockPrisma.cube.findUnique).toHaveBeenCalledWith({
        where: { id: cubeId },
        select: expect.any(Object),
      });
    });

    it('should throw error when cube not found', async () => {
      const cubeId = 'nonexistent_cube';

      mockPrisma.cube.findUnique.mockResolvedValue(null);

      await expect(
        draftConfig.loadCubeConfiguration(mockPrisma as any, cubeId)
      ).rejects.toThrow('Cube not found');
    });
  });

  describe('ensureConfigLoaded', () => {
    it('should call hydrateMatchFromDatabase for tournament drafts', async () => {
      const matchId = 'match_789';
      const mockMatch = {
        id: matchId,
        tournamentId: 'tournament_123',
        matchType: 'draft',
        draftConfig: null,
      };

      const mockHydrate = vi.fn().mockImplementation((id, match) => {
        // Simulate hydration setting draftConfig
        match.draftConfig = { setMix: ['Beta'], packCount: 3, packSize: 15 };
      });

      await draftConfig.ensureConfigLoaded(
        mockPrisma as any,
        matchId,
        mockMatch,
        mockHydrate
      );

      expect(mockHydrate).toHaveBeenCalledWith(matchId, mockMatch);
      expect(mockMatch.draftConfig).toBeDefined();
    });

    it('should not hydrate for casual drafts', async () => {
      const matchId = 'match_456';
      const mockMatch = {
        id: matchId,
        tournamentId: null, // Casual draft
        matchType: 'draft',
        draftConfig: { setMix: ['Beta'], packCount: 3, packSize: 15 },
      };

      const mockHydrate = vi.fn();

      await draftConfig.ensureConfigLoaded(
        mockPrisma as any,
        matchId,
        mockMatch,
        mockHydrate
      );

      // Should not call hydration for casual drafts
      expect(mockHydrate).not.toHaveBeenCalled();
    });

    it('should throw error when draftConfig is missing after hydration', async () => {
      const matchId = 'match_999';
      const mockMatch = {
        id: matchId,
        tournamentId: 'tournament_123',
        matchType: 'draft',
        draftConfig: null, // Still null after hydration
      };

      const mockHydrate = vi.fn().mockResolvedValue(undefined);

      await expect(
        draftConfig.ensureConfigLoaded(
          mockPrisma as any,
          matchId,
          mockMatch,
          mockHydrate
        )
      ).rejects.toThrow('No draft configuration available');
    });
  });
});
