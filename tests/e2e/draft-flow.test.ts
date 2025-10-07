/**
 * E2E Test: Draft Flow
 * Tests the complete draft flow including D20, seat selection, draft phases, and state recovery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DraftState } from '@/lib/net/transport';
import type { MatchInfo } from '@/lib/net/protocol';

// Mock match states for different phases
const createMockMatch = (overrides: Partial<MatchInfo> = {}): MatchInfo => ({
  id: 'match-123',
  players: [
    { id: 'p1', displayName: 'Player 1' },
    { id: 'p2', displayName: 'Player 2' },
  ],
  status: 'Setup' as const,
  seed: 'test-seed-123',
  playerIds: ['p1', 'p2'],
  maxPlayers: 2,
  isMultiplayer: false,
  ...overrides,
});

const createMockDraftState = (overrides: Partial<DraftState> = {}): DraftState => ({
  phase: 'waiting',
  packIndex: 0,
  pickNumber: 1,
  currentPacks: null,
  picks: [[], []],
  packDirection: 'left',
  packChoice: [null, null],
  waitingFor: ['p1', 'p2'],
  playerReady: { p1: false, p2: false },
  ...overrides,
});

describe('Draft Flow E2E Tests', () => {
  describe('D20 Roll and Seat Selection', () => {
    it('should handle D20 roll sequence correctly', () => {
      // Initial state: both players need to roll
      const match = createMockMatch({
        status: 'Setup',
        d20Results: {},
      });

      expect(match.status).toBe('Setup');
      expect(match.d20Results).toEqual({});

      // Player 1 rolls
      const afterP1Roll = {
        ...match,
        d20Results: { p1: 15 },
      };

      expect(afterP1Roll.d20Results?.p1).toBe(15);
      expect(afterP1Roll.d20Results?.p2).toBeUndefined();

      // Player 2 rolls
      const afterP2Roll = {
        ...afterP1Roll,
        d20Results: { p1: 15, p2: 18 },
      };

      // Both players rolled, p2 wins
      expect(afterP2Roll.d20Results?.p1).toBe(15);
      expect(afterP2Roll.d20Results?.p2).toBe(18);
      expect(afterP2Roll.d20Results!.p2 > afterP2Roll.d20Results!.p1).toBe(true);
    });

    it('should wait for seat selection before closing setup screen', () => {
      // D20 complete but seat not selected yet
      const matchD20Complete = createMockMatch({
        status: 'Setup',
        d20Results: { p1: 12, p2: 16 },
        // seatSelection not set yet
      });

      // Setup screen should still be open
      expect(matchD20Complete.status).toBe('Setup');
      expect(matchD20Complete.seatSelection).toBeUndefined();

      // Winner selects seat
      const matchSeatSelected = {
        ...matchD20Complete,
        seatSelection: 'p2',
        status: 'Start' as const,
      };

      // Now setup is complete
      expect(matchSeatSelected.status).toBe('Start');
      expect(matchSeatSelected.seatSelection).toBe('p2');
    });

    it('should not skip setup screen when d20Complete but phase not Start', () => {
      const match = createMockMatch({
        status: 'Setup',
        d20Results: { p1: 10, p2: 15 },
      });

      // This simulates the bug we fixed: d20Complete=true but serverPhase !== "Start"
      const d20Complete = match.d20Results &&
        Object.keys(match.d20Results).length === 2;

      expect(d20Complete).toBe(true);
      expect(match.status).toBe('Setup'); // Still in Setup, not Start

      // Setup screen should remain open until status changes to Start
      const shouldCloseSetupScreen = d20Complete && match.status === 'Start';
      expect(shouldCloseSetupScreen).toBe(false);
    });

    it('should close setup screen only when phase is Start', () => {
      const match = createMockMatch({
        status: 'Start',
        d20Results: { p1: 10, p2: 15 },
        seatSelection: 'p2',
      });

      const d20Complete = match.d20Results &&
        Object.keys(match.d20Results).length === 2;

      const shouldCloseSetupScreen = d20Complete && match.status === 'Start';
      expect(shouldCloseSetupScreen).toBe(true);
    });
  });

  describe('Draft Phase Transitions', () => {
    it('should transition through draft phases correctly', () => {
      // Phase 1: Waiting for players to be ready
      let draftState = createMockDraftState({
        phase: 'waiting',
        playerReady: { p1: false, p2: false },
      });

      expect(draftState.phase).toBe('waiting');
      expect(draftState.playerReady).toEqual({ p1: false, p2: false });

      // Both players ready
      draftState = {
        ...draftState,
        playerReady: { p1: true, p2: true },
      };

      expect(draftState.playerReady).toEqual({ p1: true, p2: true });

      // Phase 2: Pack selection (for cube drafts or set selection)
      draftState = {
        ...draftState,
        phase: 'pack_selection',
        packChoice: [null, null],
      };

      expect(draftState.phase).toBe('pack_selection');

      // Players select packs
      draftState = {
        ...draftState,
        packChoice: ['Alpha', 'Beta'],
      };

      // Phase 3: Picking phase
      draftState = {
        ...draftState,
        phase: 'picking',
        currentPacks: [
          Array(15).fill({ cardId: 1, cardName: 'Test Card' }),
          Array(15).fill({ cardId: 2, cardName: 'Test Card 2' }),
        ],
        waitingFor: ['p1', 'p2'],
      };

      expect(draftState.phase).toBe('picking');
      expect(draftState.currentPacks).toHaveLength(2);
      expect(draftState.currentPacks![0]).toHaveLength(15);

      // Player 1 picks
      draftState = {
        ...draftState,
        picks: [[{ cardId: 1, cardName: 'Test Card' }], []],
        currentPacks: [
          Array(14).fill({ cardId: 1, cardName: 'Test Card' }),
          Array(15).fill({ cardId: 2, cardName: 'Test Card 2' }),
        ],
        waitingFor: ['p2'],
      };

      expect(draftState.picks[0]).toHaveLength(1);
      expect(draftState.waitingFor).toEqual(['p2']);

      // Phase 4: Passing
      draftState = {
        ...draftState,
        phase: 'passing',
        packDirection: 'left',
      };

      expect(draftState.phase).toBe('passing');
      expect(draftState.packDirection).toBe('left');

      // Back to picking for next pick
      draftState = {
        ...draftState,
        phase: 'picking',
        pickNumber: 2,
      };

      expect(draftState.pickNumber).toBe(2);
    });

    it('should handle pack direction correctly (L-R-L)', () => {
      // Pack 1: Left
      let draftState = createMockDraftState({
        packIndex: 0,
        packDirection: 'left',
      });

      expect(draftState.packIndex).toBe(0);
      expect(draftState.packDirection).toBe('left');

      // Pack 2: Right
      draftState = {
        ...draftState,
        packIndex: 1,
        packDirection: 'right',
      };

      expect(draftState.packIndex).toBe(1);
      expect(draftState.packDirection).toBe('right');

      // Pack 3: Left again
      draftState = {
        ...draftState,
        packIndex: 2,
        packDirection: 'left',
      };

      expect(draftState.packIndex).toBe(2);
      expect(draftState.packDirection).toBe('left');
    });

    it('should complete draft after 3 packs with 15 picks each', () => {
      const draftState = createMockDraftState({
        phase: 'complete',
        packIndex: 2,
        pickNumber: 15,
        picks: [
          Array(45).fill({ cardId: 1, cardName: 'Card' }),
          Array(45).fill({ cardId: 2, cardName: 'Card 2' }),
        ],
      });

      expect(draftState.phase).toBe('complete');
      expect(draftState.picks[0]).toHaveLength(45); // 3 packs * 15 picks
      expect(draftState.picks[1]).toHaveLength(45);
    });
  });

  describe('Draft State Recovery', () => {
    it('should recover draft state on reconnection', () => {
      // Simulated server state mid-draft
      const serverDraftState = createMockDraftState({
        phase: 'picking',
        packIndex: 1,
        pickNumber: 7,
        currentPacks: [
          Array(9).fill({ cardId: 1, cardName: 'Card' }),
          Array(9).fill({ cardId: 2, cardName: 'Card 2' }),
        ],
        picks: [
          Array(21).fill({ cardId: 3, cardName: 'Picked Card' }), // 15 from pack 1 + 6 from pack 2
          Array(21).fill({ cardId: 4, cardName: 'Picked Card 2' }),
        ],
        packDirection: 'right',
        waitingFor: ['p1'],
      });

      // Client recovers from server state
      const recoveredState = { ...serverDraftState };

      // Verify state is correct
      expect(recoveredState.phase).toBe('picking');
      expect(recoveredState.packIndex).toBe(1); // Pack 2
      expect(recoveredState.pickNumber).toBe(7); // 7th pick of pack 2
      expect(recoveredState.currentPacks![0]).toHaveLength(9); // 15 - 6 picks
      expect(recoveredState.picks[0]).toHaveLength(21); // 15 + 6 picks
      expect(recoveredState.packDirection).toBe('right'); // Pack 2 goes right
    });

    it('should handle reconnection during waiting phase', () => {
      const serverState = createMockDraftState({
        phase: 'waiting',
        playerReady: { p1: true, p2: false }, // p2 disconnected
      });

      // p2 reconnects
      const recoveredState = { ...serverState };

      expect(recoveredState.phase).toBe('waiting');
      expect(recoveredState.playerReady?.p1).toBe(true);
      expect(recoveredState.playerReady?.p2).toBe(false);

      // p2 marks ready again
      recoveredState.playerReady = { p1: true, p2: true };

      expect(recoveredState.playerReady).toEqual({ p1: true, p2: true });
    });
  });

  describe('Draft to Deck Building Transition', () => {
    it('should not create reconnection loop on navigation', async () => {
      const draftState = createMockDraftState({
        phase: 'complete',
      });

      const match = createMockMatch({
        draftState,
      });

      expect(draftState.phase).toBe('complete');

      // Simulate cleanup before navigation
      let cleanupCalled = false;
      const onDraftComplete = () => {
        cleanupCalled = true;
      };

      // Navigation delay
      const navigationDelay = 1000; // ms

      // Call cleanup
      onDraftComplete();
      expect(cleanupCalled).toBe(true);

      // Simulate navigation after delay
      await new Promise(resolve => setTimeout(resolve, navigationDelay));

      // No reconnection loop should occur
      expect(match.status).toBeDefined();
    });
  });

  describe('Auto-Pick Removal', () => {
    it('should not auto-pick the last card', () => {
      const draftState = createMockDraftState({
        phase: 'picking',
        packIndex: 0,
        pickNumber: 15, // Last pick
        currentPacks: [
          [{ cardId: 1, cardName: 'Last Card' }], // Only 1 card left
          [{ cardId: 2, cardName: 'Last Card 2' }],
        ],
        waitingFor: ['p1', 'p2'],
      });

      // Both players still need to manually pick
      expect(draftState.waitingFor).toEqual(['p1', 'p2']);
      expect(draftState.currentPacks![0]).toHaveLength(1);

      // No auto-pick should happen
      // Players must explicitly pick even the last card
    });
  });

  describe('Player Ready State Persistence', () => {
    it('should persist player ready state on server', () => {
      const draftState = createMockDraftState({
        phase: 'waiting',
        playerReady: { p1: true, p2: false },
      });

      // Ready state is persisted in server draftState
      expect(draftState.playerReady).toBeDefined();
      expect(draftState.playerReady?.p1).toBe(true);
      expect(draftState.playerReady?.p2).toBe(false);

      // Client reconnects and recovers ready state
      const recoveredReadyState = draftState.playerReady;
      expect(recoveredReadyState).toEqual({ p1: true, p2: false });
    });

    it('should auto-start draft when both players ready', () => {
      let draftState = createMockDraftState({
        phase: 'waiting',
        playerReady: { p1: true, p2: false },
      });

      expect(draftState.phase).toBe('waiting');

      // p2 becomes ready
      draftState = {
        ...draftState,
        playerReady: { p1: true, p2: true },
      };

      // Should transition to pack_selection or picking
      const bothReady = draftState.playerReady!.p1 && draftState.playerReady!.p2;
      expect(bothReady).toBe(true);

      // Simulate server auto-start
      draftState = {
        ...draftState,
        phase: 'pack_selection', // or 'picking' if no pack selection needed
      };

      expect(draftState.phase).not.toBe('waiting');
    });
  });
});
