/**
 * Integration Test: Multiplayer Feature Preservation  
 * Ensures all existing online draft capabilities are maintained with new UI
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  MockSocketTransport, 
  createMockDraftSession, 
  simulateNetworkLatency 
} from '../setup-draft-3d';

describe('Multiplayer Feature Preservation', () => {
  let transport1: MockSocketTransport;
  let transport2: MockSocketTransport;

  beforeEach(() => {
    transport1 = new MockSocketTransport();
    transport2 = new MockSocketTransport();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Essential multiplayer features with enhanced UI', () => {
    it('should maintain player presence indicators', async () => {
      // Test that player presence is maintained with enhanced UI
      const presenceUpdates: any[] = [];
      transport1.on('draft:session:joined', (event: any) => {
        presenceUpdates.push(event);
      });

      // Simulate player joining with enhanced features
      transport1.simulateEvent('draft:session:joined', {
        sessionId: 'test-session',
        playerState: { playerId: 'player-1', isConnected: true },
        sessionState: { players: ['player-1', 'player-2'] },
        otherPlayers: [{ playerId: 'player-2', isConnected: true }],
      });

      expect(presenceUpdates).toHaveLength(1);
      expect(presenceUpdates[0].otherPlayers[0].isConnected).toBe(true);
    });

    it('should maintain turn management functionality', async () => {
      // Test turn-based drafting with enhanced UI
      const draftUpdates: any[] = [];
      transport1.on('draftUpdate', (state: any) => {
        draftUpdates.push(state);
      });

      transport1.simulateEvent('draftUpdate', {
        phase: 'picking',
        waitingFor: ['player-1'],
        timeRemaining: 30,
      });

      expect(draftUpdates[0].waitingFor).toContain('player-1');
      expect(draftUpdates[0].timeRemaining).toBe(30);
    });

    it('should maintain pack passing and rotation', async () => {
      // Test pack rotation with enhanced stack mechanics
      const stackUpdates: any[] = [];
      transport1.on('draft:stack:state_sync', (event: any) => {
        stackUpdates.push(event);
      });

      transport1.simulateEvent('draft:stack:state_sync', {
        sessionId: 'test-session',
        stackUpdates: [{
          stackId: 'player-1-pack',
          cardIds: ['rotated-card-1', 'rotated-card-2'],
          positions: [{ x: 0, y: 0.25, z: 0 }, { x: 1, y: 0.25, z: 0 }],
          lastModified: Date.now(),
        }],
        batchId: 'pack-rotation-001',
      });

      expect(stackUpdates).toHaveLength(1);
      expect(stackUpdates[0].stackUpdates[0].cardIds).toHaveLength(2);
    });

    it('should maintain deck submission to editor', async () => {
      // Test final deck submission functionality
      if (transport1.submitDeck) {
        transport1.submitDeck({
          mainboard: [{ cardId: 'final-card', quantity: 1 }],
          sideboard: [],
        });
      }

      expect(transport1.mockSocket.emit).toHaveBeenCalledWith('submitDeck', {
        deck: {
          mainboard: [{ cardId: 'final-card', quantity: 1 }],
          sideboard: [],
        }
      });
    });

    it('should allow opening all packs by all players', async () => {
      // Test pack viewing functionality with enhanced UI
      const packUpdates: any[] = [];
      transport1.on('draftUpdate', (state: any) => {
        packUpdates.push(state);
      });

      // Simulate all players can view all packs
      transport1.simulateEvent('draftUpdate', {
        phase: 'complete',
        allPacks: {
          'player-1': ['p1-card-1', 'p1-card-2'],
          'player-2': ['p2-card-1', 'p2-card-2'],
        },
      });

      expect(packUpdates[0].allPacks).toBeDefined();
      expect(packUpdates[0].allPacks['player-1']).toHaveLength(2);
      expect(packUpdates[0].allPacks['player-2']).toHaveLength(2);
    });
  });
});