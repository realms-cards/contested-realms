/**
 * Integration Test: Draft Compatibility
 * Ensures existing draft events (makeDraftPick, startDraft, chooseDraftPack) preserve functionality
 * when enhanced with draft-3d improvements
 * 
 * This test MUST PASS to ensure backward compatibility with existing online draft functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DraftState } from '@/lib/net/transport';
import { 
  MockSocketTransport, 
  createMockDraftSession, 
  simulateNetworkLatency 
} from '../setup-draft-3d';

describe('Draft Event Compatibility', () => {
  let transport: MockSocketTransport;
  let mockSession: any;

  beforeEach(() => {
    transport = new MockSocketTransport();
    mockSession = createMockDraftSession();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Existing draft functionality preservation', () => {
    it('should maintain makeDraftPick functionality with enhanced UI', async () => {
      // Arrange - Simulate existing draft pick flow
      const pickConfig = {
        matchId: 'test-match-001',
        cardId: 'card-to-pick-001',
        packIndex: 0,
        pickNumber: 1,
      };

      const draftUpdates: DraftState[] = [];
      transport.on('draftUpdate', (state: unknown) => {
        draftUpdates.push(state as DraftState);
      });

      // Act - Use existing makeDraftPick method
      if (transport.makeDraftPick) {
        transport.makeDraftPick(pickConfig);
      }

      // Simulate existing server response
      await simulateNetworkLatency(30);
      transport.simulateEvent('draftUpdate', {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 2, // Advanced to next pick
        currentPacks: [['remaining-card-001', 'remaining-card-002']],
        picks: [['card-to-pick-001']], // Card added to picks
        packDirection: 'left',
        packChoice: [null],
        waitingFor: [],
      });

      // Assert - Existing functionality still works
      expect(draftUpdates).toHaveLength(1);
      expect(draftUpdates[0].phase).toBe('picking');
      expect(draftUpdates[0].pickNumber).toBe(2);
      expect(draftUpdates[0].picks[0]).toContain('card-to-pick-001');

      // Verify Socket.io call maintains existing format
      expect(transport.mockSocket.emit).toHaveBeenCalledWith('makeDraftPick', pickConfig);
    });

    it('should maintain startDraft functionality with enhanced session management', async () => {
      // Arrange
      const draftConfig = {
        matchId: 'test-match-001',
        draftConfig: {
          sets: ['SET1', 'SET2', 'SET3'],
          packCount: 3,
          playerCount: 4,
        },
      };

      const draftUpdates: DraftState[] = [];
      transport.on('draftUpdate', (state: unknown) => {
        draftUpdates.push(state as DraftState);
      });

      // Act
      if (transport.startDraft) {
        await transport.startDraft(draftConfig);
      }

      // Simulate server starting draft
      await simulateNetworkLatency(50);
      transport.simulateEvent('draftUpdate', {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 1,
        currentPacks: [
          ['card-001', 'card-002', 'card-003'],
          ['card-004', 'card-005', 'card-006'],
          ['card-007', 'card-008', 'card-009'],
          ['card-010', 'card-011', 'card-012'],
        ],
        picks: [[], [], [], []],
        packDirection: 'left',
        packChoice: [null, null, null, null],
        waitingFor: ['player-1', 'player-2', 'player-3', 'player-4'],
      });

      // Assert
      expect(draftUpdates).toHaveLength(1);
      expect(draftUpdates[0].phase).toBe('picking');
      expect(draftUpdates[0].packIndex).toBe(0);
      expect(draftUpdates[0].pickNumber).toBe(1);
      expect(draftUpdates[0].currentPacks).toHaveLength(4); // 4 players
      expect(transport.mockSocket.emit).toHaveBeenCalledWith('startDraft', draftConfig);
    });

    it('should maintain chooseDraftPack functionality with UI improvements', async () => {
      // Arrange
      const packChoice = {
        matchId: 'test-match-001',
        setChoice: 'SET2',
        packIndex: 1,
      };

      const draftUpdates: DraftState[] = [];
      transport.on('draftUpdate', (state: unknown) => {
        draftUpdates.push(state as DraftState);
      });

      // Act
      if (transport.chooseDraftPack) {
        transport.chooseDraftPack(packChoice);
      }

      // Simulate server updating pack choices
      await simulateNetworkLatency(25);
      transport.simulateEvent('draftUpdate', {
        phase: 'picking',
        packIndex: 1,
        pickNumber: 1,
        currentPacks: [['set2-card-001', 'set2-card-002', 'set2-card-003']],
        picks: [['previous-pick-001']],
        packDirection: 'right',
        packChoice: ['SET2'], // Choice recorded
        waitingFor: ['player-1'],
      });

      // Assert
      expect(draftUpdates).toHaveLength(1);
      expect(draftUpdates[0].packChoice[0]).toBe('SET2');
      expect(draftUpdates[0].packIndex).toBe(1);
      expect(transport.mockSocket.emit).toHaveBeenCalledWith('chooseDraftPack', packChoice);
    });

    it('should maintain submitDeck functionality for deck building phase', async () => {
      // Arrange
      const testDeck = {
        mainboard: [
          { cardId: 'card-001', quantity: 1 },
          { cardId: 'card-002', quantity: 1 },
          { cardId: 'card-003', quantity: 1 },
        ],
        sideboard: [
          { cardId: 'card-004', quantity: 1 },
        ],
      };

      // Act
      if (transport.submitDeck) {
        transport.submitDeck({ deckData: testDeck, playerId: 'player-1' });
      }

      // Assert
      expect(transport.mockSocket.emit).toHaveBeenCalledWith('submitDeck', { deck: testDeck });
    });
  });

  describe('Enhanced draft events integration', () => {
    it('should combine existing draft events with new card preview events', async () => {
      // Arrange - Simulate draft pick with enhanced preview
      const pickConfig = {
        matchId: 'test-match-001',
        cardId: 'enhanced-card-001',
        packIndex: 0,
        pickNumber: 1,
      };

      const draftUpdates: DraftState[] = [];
      const previewUpdates: any[] = [];

      transport.on('draftUpdate', (state: DraftState) => {
        draftUpdates.push(state);
      });
      transport.on('draft:card:preview_update', (event: any) => {
        previewUpdates.push(event);
      });

      // Act - Make pick with enhanced preview
      if (transport.makeDraftPick) {
        transport.makeDraftPick(pickConfig);
      }

      // Simulate enhanced card preview during pick
      if (transport.sendCardPreview) {
        transport.sendCardPreview({
          sessionId: 'test-session-001',
          playerId: 'player-1',
          cardId: 'enhanced-card-001',
          previewType: 'focus',
          position: { x: 0, y: 0.25, z: 0 },
          isActive: true,
          priority: 'high',
          timestamp: Date.now(),
        });
      }

      // Simulate server responses
      await simulateNetworkLatency(20);
      
      // Traditional draft update
      transport.simulateEvent('draftUpdate', {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 2,
        currentPacks: [['remaining-card']],
        picks: [['enhanced-card-001']],
        packDirection: 'left',
        packChoice: [null],
        waitingFor: [],
      });

      // Enhanced preview update
      transport.simulateEvent('draft:card:preview_update', {
        previewId: 'preview-001',
        playerId: 'player-1',
        cardId: 'enhanced-card-001',
        previewType: 'focus',
        position: { x: 0, y: 0.25, z: 0 },
        isActive: false, // Preview ends after pick
        timestamp: Date.now(),
      });

      // Assert - Both systems work together
      expect(draftUpdates).toHaveLength(1);
      expect(previewUpdates).toHaveLength(1);
      expect(draftUpdates[0].picks[0]).toContain('enhanced-card-001');
      expect(previewUpdates[0].cardId).toBe('enhanced-card-001');
      expect(previewUpdates[0].isActive).toBe(false); // Preview cleared after pick
    });

    it('should handle pack passing with enhanced stack mechanics', async () => {
      // Arrange - Simulate pack passing with stack interactions
      const pickConfig = {
        matchId: 'test-match-001',
        cardId: 'passed-card-001',
        packIndex: 0,
        pickNumber: 1,
      };

      const draftUpdates: DraftState[] = [];
      const stackUpdates: any[] = [];

      transport.on('draftUpdate', (state: DraftState) => {
        draftUpdates.push(state);
      });
      transport.on('draft:stack:state_sync', (event: any) => {
        stackUpdates.push(event);
      });

      // Act - Make pick that triggers pack passing
      if (transport.makeDraftPick) {
        transport.makeDraftPick(pickConfig);
      }

      // Simulate enhanced stack interaction for pack passing
      if (transport.sendStackInteraction) {
        transport.sendStackInteraction({
          sessionId: 'test-session-001',
          playerId: 'player-1',
          interactionType: 'pass',
          cardIds: ['remaining-card-001', 'remaining-card-002'],
          fromStackId: 'player-1-pack',
          toStackId: 'player-2-pack',
          operationData: {
            destinationPlayerId: 'player-2',
            userInitiated: false, // Automatic pack passing
            hasAnimation: true,
          },
          clientTimestamp: Date.now(),
        });
      }

      // Simulate server responses
      await simulateNetworkLatency(40);
      
      // Traditional draft update
      transport.simulateEvent('draftUpdate', {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 2,
        currentPacks: [
          [], // Player 1's pack is now empty
          ['remaining-card-001', 'remaining-card-002'], // Passed to player 2
        ],
        picks: [['passed-card-001'], []],
        packDirection: 'left',
        packChoice: [null, null],
        waitingFor: ['player-2'],
      });

      // Enhanced stack synchronization
      transport.simulateEvent('draft:stack:state_sync', {
        sessionId: 'test-session-001',
        stackUpdates: [
          {
            stackId: 'player-2-pack',
            cardIds: ['remaining-card-001', 'remaining-card-002'],
            positions: [
              { x: 2, y: 0.25, z: 0 },
              { x: 3, y: 0.25, z: 0 },
            ],
            lastModified: Date.now(),
          },
        ],
        batchId: 'pack-pass-001',
      });

      // Assert - Both traditional and enhanced systems work together
      expect(draftUpdates).toHaveLength(1);
      expect(stackUpdates).toHaveLength(1);
      expect(draftUpdates[0].waitingFor).toContain('player-2');
      expect(stackUpdates[0].stackUpdates[0].cardIds).toHaveLength(2);
    });
  });

  describe('Backward compatibility validation', () => {
    it('should work with clients that do not support enhanced events', async () => {
      // Arrange - Simulate legacy client (only supports basic events)
      const legacyTransport = new MockSocketTransport();
      
      // Legacy client only listens to traditional events
      const legacyUpdates: DraftState[] = [];
      legacyTransport.on('draftUpdate', (state: DraftState) => {
        legacyUpdates.push(state);
      });

      const pickConfig = {
        matchId: 'test-match-001',
        cardId: 'legacy-card-001',
        packIndex: 0,
        pickNumber: 1,
      };

      // Act - Legacy client makes draft pick
      if (legacyTransport.makeDraftPick) {
        legacyTransport.makeDraftPick(pickConfig);
      }

      // Server responds with traditional draft update only
      await simulateNetworkLatency(30);
      legacyTransport.simulateEvent('draftUpdate', {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 2,
        currentPacks: [['remaining-legacy-card']],
        picks: [['legacy-card-001']],
        packDirection: 'left',
        packChoice: [null],
        waitingFor: [],
      });

      // Assert - Legacy functionality still works perfectly
      expect(legacyUpdates).toHaveLength(1);
      expect(legacyUpdates[0].picks[0]).toContain('legacy-card-001');
      expect(legacyTransport.mockSocket.emit).toHaveBeenCalledWith('makeDraftPick', pickConfig);
    });

    it('should gracefully handle mixed client versions in same session', async () => {
      // Arrange - Enhanced client and legacy client in same session
      const enhancedTransport = new MockSocketTransport();
      const legacyTransport = new MockSocketTransport();

      const enhancedUpdates: any[] = [];
      const legacyUpdates: DraftState[] = [];

      // Enhanced client listens to both traditional and enhanced events
      enhancedTransport.on('draftUpdate', (state: DraftState) => {
        enhancedUpdates.push({ type: 'draft', data: state });
      });
      enhancedTransport.on('draft:card:preview_update', (event: any) => {
        enhancedUpdates.push({ type: 'preview', data: event });
      });

      // Legacy client only listens to traditional events
      legacyTransport.on('draftUpdate', (state: DraftState) => {
        legacyUpdates.push(state);
      });

      // Act - Both clients participate in same session
      const pickConfig = {
        matchId: 'test-match-001',
        cardId: 'mixed-session-card-001',
        packIndex: 0,
        pickNumber: 1,
      };

      if (enhancedTransport.makeDraftPick) {
        enhancedTransport.makeDraftPick(pickConfig);
      }

      // Simulate server broadcasting to both client types
      await simulateNetworkLatency(25);

      const draftState: DraftState = {
        phase: 'picking',
        packIndex: 0,
        pickNumber: 2,
        currentPacks: [['remaining-card']],
        picks: [['mixed-session-card-001']],
        packDirection: 'left',
        packChoice: [null],
        waitingFor: [],
      };

      // Both clients receive traditional update
      enhancedTransport.simulateEvent('draftUpdate', draftState);
      legacyTransport.simulateEvent('draftUpdate', draftState);

      // Only enhanced client receives enhanced events
      enhancedTransport.simulateEvent('draft:card:preview_update', {
        previewId: 'mixed-preview-001',
        playerId: 'enhanced-player',
        cardId: 'mixed-session-card-001',
        previewType: 'hover',
        position: { x: 0, y: 0.25, z: 0 },
        isActive: false,
        timestamp: Date.now(),
      });

      // Assert
      expect(legacyUpdates).toHaveLength(1);
      expect(enhancedUpdates).toHaveLength(2); // draft + preview
      expect(legacyUpdates[0].picks[0]).toContain('mixed-session-card-001');
      expect(enhancedUpdates.find(u => u.type === 'draft')?.data.picks[0]).toContain('mixed-session-card-001');
      expect(enhancedUpdates.find(u => u.type === 'preview')?.data.cardId).toBe('mixed-session-card-001');
    });
  });

  describe('Performance impact assessment', () => {
    it('should not degrade existing draft performance with enhancements', async () => {
      // Arrange - Measure performance of traditional draft operations
      const rapidPicks = Array.from({ length: 15 }, (_, i) => ({
        matchId: 'test-match-001',
        cardId: `rapid-pick-${i}`,
        packIndex: 0,
        pickNumber: i + 1,
      }));

      const draftUpdates: DraftState[] = [];
      transport.on('draftUpdate', (state: unknown) => {
        draftUpdates.push(state as DraftState);
      });

      // Act - Perform rapid draft picks (simulate full pack)
      const startTime = performance.now();
      
      for (const pick of rapidPicks) {
        if (transport.makeDraftPick) {
          transport.makeDraftPick(pick);
        }
      }

      // Simulate server processing all picks
      for (let i = 0; i < rapidPicks.length; i++) {
        await simulateNetworkLatency(10); // 10ms per pick
        transport.simulateEvent('draftUpdate', {
          phase: i < 14 ? 'picking' : 'passing',
          packIndex: 0,
          pickNumber: i + 2,
          currentPacks: [[]],
          picks: [rapidPicks.slice(0, i + 1).map(p => p.cardId)],
          packDirection: 'left',
          packChoice: [null],
          waitingFor: [],
        });
      }

      const totalTime = performance.now() - startTime;

      // Assert - Performance should remain acceptable
      expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
      expect(draftUpdates).toHaveLength(15);
      expect(draftUpdates[14].picks[0]).toHaveLength(15); // All picks recorded
      expect(draftUpdates[14].phase).toBe('passing'); // Moved to pack passing
    });
  });
});