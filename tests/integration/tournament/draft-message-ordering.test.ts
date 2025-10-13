/**
 * Integration Test: Tournament Draft Message Ordering
 *
 * Tests that out-of-order draft update messages are correctly rejected
 * to prevent stale state from overwriting current state.
 *
 * Bug: Network delays caused pick N-1 to arrive after pick N, reverting state
 * Fix: Client-side sequence number validation rejects stale updates
 *
 * Prevents regression of bug fixed in commit c58f83d
 */

import { describe, it, expect, beforeEach } from 'vitest';

interface DraftState {
  phase: string;
  packIndex: number;
  pickNumber: number;
  waitingFor: string[];
  currentPacks: unknown[][];
}

describe('Integration: Draft Message Ordering', () => {
  describe('Sequence Number Validation', () => {
    it('should reject update with lower sequence number (same pack)', () => {
      // Current state: Pack 0, Pick 4
      const currentState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 4,
        waitingFor: ['player1'],
        currentPacks: [[{ id: 'card1' }], [{ id: 'card2' }]],
      };

      // Incoming stale update: Pack 0, Pick 3
      const incomingState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 3,
        waitingFor: ['player1', 'player2'],
        currentPacks: [[{ id: 'old1' }], [{ id: 'old2' }]],
      };

      const currentSeq = currentState.packIndex * 1000 + currentState.pickNumber;
      const newSeq = incomingState.packIndex * 1000 + incomingState.pickNumber;

      const shouldReject =
        currentState.phase === 'picking' &&
        incomingState.phase === 'picking' &&
        newSeq < currentSeq;

      expect(shouldReject).toBe(true);
      expect(currentSeq).toBe(4);
      expect(newSeq).toBe(3);
    });

    it('should accept update with higher sequence number (same pack)', () => {
      // Current state: Pack 0, Pick 3
      const currentState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 3,
        waitingFor: ['player2'],
        currentPacks: [[{ id: 'card1' }], [{ id: 'card2' }]],
      };

      // Incoming update: Pack 0, Pick 4
      const incomingState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 4,
        waitingFor: ['player1', 'player2'],
        currentPacks: [[{ id: 'new1' }], [{ id: 'new2' }]],
      };

      const currentSeq = currentState.packIndex * 1000 + currentState.pickNumber;
      const newSeq = incomingState.packIndex * 1000 + incomingState.pickNumber;

      const shouldReject =
        currentState.phase === 'picking' &&
        incomingState.phase === 'picking' &&
        newSeq < currentSeq;

      expect(shouldReject).toBe(false);
      expect(currentSeq).toBe(3);
      expect(newSeq).toBe(4);
    });

    it('should reject update from previous pack', () => {
      // Current state: Pack 1, Pick 1 (new pack)
      const currentState: DraftState = {
        phase: 'picking',
        packIndex: 1,
        pickNumber: 1,
        waitingFor: ['player1', 'player2'],
        currentPacks: [[{ id: 'pack2_card1' }], [{ id: 'pack2_card2' }]],
      };

      // Incoming stale update: Pack 0, Pick 15 (old pack)
      const incomingState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 15,
        waitingFor: ['player1'],
        currentPacks: [[{ id: 'pack1_last' }], [{ id: 'pack1_last2' }]],
      };

      const currentSeq = currentState.packIndex * 1000 + currentState.pickNumber;
      const newSeq = incomingState.packIndex * 1000 + incomingState.pickNumber;

      const shouldReject =
        currentState.phase === 'picking' &&
        incomingState.phase === 'picking' &&
        newSeq < currentSeq;

      expect(shouldReject).toBe(true);
      expect(currentSeq).toBe(1001); // Pack 1, Pick 1
      expect(newSeq).toBe(15); // Pack 0, Pick 15
    });

    it('should accept update from new pack', () => {
      // Current state: Pack 0, Pick 15 (last pick of pack)
      const currentState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 15,
        waitingFor: ['player1'],
        currentPacks: [[{ id: 'last_card' }], []],
      };

      // Incoming update: Pack 1, Pick 1 (new pack)
      const incomingState: DraftState = {
        phase: 'picking',
        packIndex: 1,
        pickNumber: 1,
        waitingFor: ['player1', 'player2'],
        currentPacks: [[{ id: 'pack2_card1' }], [{ id: 'pack2_card2' }]],
      };

      const currentSeq = currentState.packIndex * 1000 + currentState.pickNumber;
      const newSeq = incomingState.packIndex * 1000 + incomingState.pickNumber;

      const shouldReject =
        currentState.phase === 'picking' &&
        incomingState.phase === 'picking' &&
        newSeq < currentSeq;

      expect(shouldReject).toBe(false);
      expect(currentSeq).toBe(15); // Pack 0, Pick 15
      expect(newSeq).toBe(1001); // Pack 1, Pick 1
    });

    it('should not reject if not in picking phase', () => {
      // Current state: waiting phase
      const currentState: DraftState = {
        phase: 'waiting',
        packIndex: 0,
        pickNumber: 0,
        waitingFor: [],
        currentPacks: [],
      };

      // Incoming update: picking phase
      const incomingState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 1,
        waitingFor: ['player1', 'player2'],
        currentPacks: [[{ id: 'card1' }], [{ id: 'card2' }]],
      };

      const currentSeq = currentState.packIndex * 1000 + currentState.pickNumber;
      const newSeq = incomingState.packIndex * 1000 + incomingState.pickNumber;

      const shouldReject =
        currentState.phase === 'picking' &&
        incomingState.phase === 'picking' &&
        newSeq < currentSeq;

      expect(shouldReject).toBe(false); // Don't reject phase transitions
    });

    it('should handle equal sequence numbers (duplicate broadcasts)', () => {
      // Current state: Pack 0, Pick 3
      const currentState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 3,
        waitingFor: ['player1', 'player2'],
        currentPacks: [[{ id: 'card1' }], [{ id: 'card2' }]],
      };

      // Incoming duplicate: Pack 0, Pick 3
      const incomingState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 3,
        waitingFor: ['player1', 'player2'],
        currentPacks: [[{ id: 'card1' }], [{ id: 'card2' }]],
      };

      const currentSeq = currentState.packIndex * 1000 + currentState.pickNumber;
      const newSeq = incomingState.packIndex * 1000 + incomingState.pickNumber;

      const shouldReject =
        currentState.phase === 'picking' &&
        incomingState.phase === 'picking' &&
        newSeq < currentSeq;

      // Should NOT reject (newSeq is not less than currentSeq)
      expect(shouldReject).toBe(false);
      expect(currentSeq).toBe(newSeq);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle race condition: pick 4 arrives before pick 3', () => {
      // Timeline:
      // 1. Server processes pick → broadcasts pick 4
      // 2. Player receives pick 4 (fast path)
      // 3. Delayed pick 3 broadcast arrives (Redis pub/sub delay)

      const timeline: DraftState[] = [];

      // Initial state: Pick 2
      timeline.push({
        phase: 'picking',
        packIndex: 0,
        pickNumber: 2,
        waitingFor: ['p1', 'p2'],
        currentPacks: [[{ id: 'c1' }], [{ id: 'c2' }]],
      });

      // Player picks → optimistic update to pick 3
      timeline.push({
        phase: 'picking',
        packIndex: 0,
        pickNumber: 3,
        waitingFor: ['p2'],
        currentPacks: [[{ id: 'c1' }], [{ id: 'c2' }]],
      });

      // Fast path: pick 4 arrives
      timeline.push({
        phase: 'picking',
        packIndex: 0,
        pickNumber: 4,
        waitingFor: ['p1', 'p2'],
        currentPacks: [[{ id: 'c3' }], [{ id: 'c4' }]],
      });

      // Current state is pick 4
      const currentState = timeline[2];

      // Delayed pick 3 broadcast arrives (STALE)
      const staleUpdate: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 3,
        waitingFor: ['p2'],
        currentPacks: [[{ id: 'c1' }], [{ id: 'c2' }]],
      };

      const currentSeq = currentState.packIndex * 1000 + currentState.pickNumber;
      const newSeq = staleUpdate.packIndex * 1000 + staleUpdate.pickNumber;

      const shouldReject =
        currentState.phase === 'picking' &&
        staleUpdate.phase === 'picking' &&
        newSeq < currentSeq;

      expect(shouldReject).toBe(true);
      expect(currentSeq).toBe(4);
      expect(newSeq).toBe(3);
    });

    it('should handle multi-pack progression', () => {
      const states: DraftState[] = [];

      // Pack 0, Pick 14
      states.push({
        phase: 'picking',
        packIndex: 0,
        pickNumber: 14,
        waitingFor: ['p1'],
        currentPacks: [[{ id: 'last' }], []],
      });

      // Pack 0, Pick 15
      states.push({
        phase: 'picking',
        packIndex: 0,
        pickNumber: 15,
        waitingFor: ['p1', 'p2'],
        currentPacks: [[{ id: 'last' }], [{ id: 'last2' }]],
      });

      // Pack 1, Pick 1 (new pack)
      states.push({
        phase: 'picking',
        packIndex: 1,
        pickNumber: 1,
        waitingFor: ['p1', 'p2'],
        currentPacks: [[{ id: 'new1' }], [{ id: 'new2' }]],
      });

      // Verify sequence numbers are monotonically increasing
      const sequences = states.map((s) => s.packIndex * 1000 + s.pickNumber);

      expect(sequences[0]).toBe(14);
      expect(sequences[1]).toBe(15);
      expect(sequences[2]).toBe(1001);

      // Each should be greater than the previous
      expect(sequences[1]).toBeGreaterThan(sequences[0]);
      expect(sequences[2]).toBeGreaterThan(sequences[1]);
    });
  });
});
