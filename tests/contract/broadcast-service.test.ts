/**
 * Contract Test: BroadcastService
 *
 * Tests the tournament broadcast service module.
 * Verifies that broadcasts:
 * 1. Only emit to tournament room (not globally)
 * 2. Deduplicate events within 5-second window
 * 3. Include proper payload structure
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Socket.IO server
const createMockIo = () => {
  const emitSpy = vi.fn();
  const toSpy = vi.fn(() => ({ emit: emitSpy }));

  return {
    to: toSpy,
    _emitSpy: emitSpy,
    _toSpy: toSpy,
  };
};

describe('BroadcastService Contract Tests', () => {
  let mockIo: ReturnType<typeof createMockIo>;
  let broadcast: typeof import('../../server/modules/tournament/broadcast');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIo = createMockIo();

    // Dynamically import the module
    broadcast = await import('../../server/modules/tournament/broadcast');
  });

  describe('emitPhaseChanged', () => {
    it('should emit PHASE_CHANGED only to tournament room (not globally)', () => {
      const tournamentId = 'tournament_123';
      const newPhase = 'active';
      const additionalData = { roundNumber: 1 };

      broadcast.emitPhaseChanged(mockIo as any, tournamentId, newPhase, additionalData);

      // Verify: Should call io.to() with correct room
      expect(mockIo._toSpy).toHaveBeenCalledWith(`tournament:${tournamentId}`);

      // Verify: Should emit with correct event name and payload
      expect(mockIo._emitSpy).toHaveBeenCalledWith('PHASE_CHANGED', expect.objectContaining({
        tournamentId,
        newPhase,
        newStatus: newPhase,
        roundNumber: 1,
        timestamp: expect.any(String),
      }));
    });

    it('should include timestamp in event payload', () => {
      const tournamentId = 'tournament_456';
      const newPhase = 'preparing';

      broadcast.emitPhaseChanged(mockIo as any, tournamentId, newPhase, {});

      expect(mockIo._emitSpy).toHaveBeenCalledWith('PHASE_CHANGED', expect.objectContaining({
        timestamp: expect.any(String),
      }));
    });
  });

  describe('Event Deduplication', () => {
    it('should deduplicate identical events within 5 seconds', () => {
      vi.useFakeTimers();

      const tournamentId = 'tournament_789';
      const newPhase = 'active';
      const payload = { roundNumber: 1 };

      // First emission should go through
      broadcast.emitPhaseChanged(mockIo as any, tournamentId, newPhase, payload);
      expect(mockIo._emitSpy).toHaveBeenCalledTimes(1);

      // Immediate duplicate should be skipped (deduplication)
      broadcast.emitPhaseChanged(mockIo as any, tournamentId, newPhase, payload);
      expect(mockIo._emitSpy).toHaveBeenCalledTimes(1); // Still only 1

      // After 5+ seconds, should allow duplicate
      vi.advanceTimersByTime(5001);
      broadcast.emitPhaseChanged(mockIo as any, tournamentId, newPhase, payload);
      expect(mockIo._emitSpy).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('should allow different events to same tournament', () => {
      const tournamentId = 'tournament_abc';

      // Different events should not be deduplicated
      broadcast.emitPhaseChanged(mockIo as any, tournamentId, 'preparing', {});
      expect(mockIo._emitSpy).toHaveBeenCalledTimes(1);

      broadcast.emitRoundStarted(mockIo as any, tournamentId, 1, []);
      expect(mockIo._emitSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('emitTournamentUpdate', () => {
    it('should emit TOURNAMENT_UPDATED only to tournament room', () => {
      const tournamentId = 'tournament_def';
      const tournamentData = {
        id: tournamentId,
        name: 'Test Tournament',
        status: 'active',
        playerCount: 8,
      };

      broadcast.emitTournamentUpdate(mockIo as any, tournamentId, tournamentData);

      expect(mockIo._toSpy).toHaveBeenCalledWith(`tournament:${tournamentId}`);
      expect(mockIo._emitSpy).toHaveBeenCalledWith('TOURNAMENT_UPDATED', tournamentData);
    });
  });

  describe('emitDraftReady', () => {
    it('should emit DRAFT_READY only to tournament room', () => {
      const tournamentId = 'tournament_ghi';
      const payload = {
        draftSessionId: 'draft_123',
        totalPlayers: 8,
      };

      broadcast.emitDraftReady(mockIo as any, tournamentId, payload);

      expect(mockIo._toSpy).toHaveBeenCalledWith(`tournament:${tournamentId}`);
      expect(mockIo._emitSpy).toHaveBeenCalledWith('DRAFT_READY', expect.objectContaining({
        tournamentId,
        draftSessionId: 'draft_123',
        totalPlayers: 8,
      }));
    });
  });

  describe('emitRoundStarted', () => {
    it('should emit ROUND_STARTED only to tournament room', () => {
      const tournamentId = 'tournament_jkl';
      const roundNumber = 1;
      const matches = [
        { id: 'match_1', player1: 'p1', player2: 'p2' },
        { id: 'match_2', player1: 'p3', player2: 'p4' },
      ];

      broadcast.emitRoundStarted(mockIo as any, tournamentId, roundNumber, matches);

      expect(mockIo._toSpy).toHaveBeenCalledWith(`tournament:${tournamentId}`);
      expect(mockIo._emitSpy).toHaveBeenCalledWith('ROUND_STARTED', expect.objectContaining({
        tournamentId,
        roundNumber,
        matches,
      }));
    });
  });

  describe('emitMatchesReady', () => {
    it('should emit MATCHES_READY only to tournament room', () => {
      const tournamentId = 'tournament_mno';
      const roundNumber = 2;
      const matches = [{ id: 'match_1' }, { id: 'match_2' }];

      broadcast.emitMatchesReady(mockIo as any, tournamentId, roundNumber, matches);

      expect(mockIo._toSpy).toHaveBeenCalledWith(`tournament:${tournamentId}`);
      expect(mockIo._emitSpy).toHaveBeenCalled();
    });
  });

  describe('setPrismaClient', () => {
    it('should accept Prisma client for audit logging', () => {
      const mockPrisma = {} as any;

      // Should not throw
      expect(() => {
        broadcast.setPrismaClient(mockPrisma);
      }).not.toThrow();
    });
  });
});
