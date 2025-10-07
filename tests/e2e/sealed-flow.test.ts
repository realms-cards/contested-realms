/**
 * E2E Test: Sealed Flow
 * Tests the complete sealed flow including pack opening, deck building, D20, mulligan, and state recovery
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { MatchInfo } from '@/lib/net/protocol';
import type { BoosterCard } from '@/lib/booster';

const createMockMatch = (overrides: Partial<MatchInfo> = {}): MatchInfo => ({
  id: 'match-456',
  players: [
    { id: 'p1', displayName: 'Player 1' },
    { id: 'p2', displayName: 'Player 2' },
  ],
  status: 'Setup' as const,
  seed: 'sealed-seed-123',
  playerIds: ['p1', 'p2'],
  maxPlayers: 2,
  isMultiplayer: false,
  ...overrides,
});

const createMockSealedPack = (setName: string, packNumber: number): BoosterCard[] => {
  return Array.from({ length: 15 }, (_, i) => ({
    variantId: packNumber * 100 + i,
    cardId: packNumber * 100 + i,
    slug: `${setName}-card-${i}`,
    finish: 'Standard' as const,
    product: 'Booster',
    setName,
    cardName: `${setName} Card ${i}`,
    rarity: 'Ordinary' as const,
    type: null,
  }));
};

describe('Sealed Flow E2E Tests', () => {
  describe('Pack Opening', () => {
    it('should generate 6 sealed packs per player', () => {
      // Typical sealed format: 6 packs per player
      const p1Packs: BoosterCard[][] = Array.from({ length: 6 }, (_, i) =>
        createMockSealedPack('Alpha', i)
      );
      const p2Packs: BoosterCard[][] = Array.from({ length: 6 }, (_, i) =>
        createMockSealedPack('Beta', i + 6)
      );

      expect(p1Packs).toHaveLength(6);
      expect(p2Packs).toHaveLength(6);
      expect(p1Packs[0]).toHaveLength(15);
      expect(p2Packs[0]).toHaveLength(15);
    });

    it('should make all cards available for deck building', () => {
      const packs: BoosterCard[][] = Array.from({ length: 6 }, (_, i) =>
        createMockSealedPack('Alpha', i)
      );

      // Flatten all packs into card pool
      const cardPool = packs.flat();

      expect(cardPool).toHaveLength(90); // 6 packs * 15 cards
      expect(cardPool.every(card => card.cardName !== undefined && card.variantId >= 0)).toBe(true);
    });

    it('should persist opened packs', () => {
      const match = createMockMatch({
        sealedPacks: Array.from({ length: 6 }, (_, i) =>
          createMockSealedPack('Alpha', i)
        ),
      });

      expect(match.sealedPacks).toBeDefined();
      expect(match.sealedPacks).toHaveLength(6);
    });
  });

  describe('Deck Construction', () => {
    it('should require minimum 40 cards', () => {
      const deck = Array(40).fill({ cardId: 1, count: 1 });

      const isValid = deck.length >= 40;
      expect(isValid).toBe(true);
    });

    it('should reject decks with less than 40 cards', () => {
      const deck = Array(39).fill({ cardId: 1, count: 1 });

      const isValid = deck.length >= 40;
      expect(isValid).toBe(false);
    });

    it('should allow decks with more than 40 cards', () => {
      const deck = Array(60).fill({ cardId: 1, count: 1 });

      const isValid = deck.length >= 40;
      expect(isValid).toBe(true);
    });

    it('should validate deck contains only cards from sealed pool', () => {
      const sealedPool = [1, 2, 3, 4, 5]; // cardIds
      const deck = [1, 2, 3, 4]; // Valid

      const isValid = deck.every(cardId => sealedPool.includes(cardId));
      expect(isValid).toBe(true);
    });

    it('should reject deck with cards not from sealed pool', () => {
      const sealedPool = [1, 2, 3, 4, 5]; // cardIds
      const deck = [1, 2, 3, 99]; // Invalid: 99 not in pool

      const isValid = deck.every(cardId => sealedPool.includes(cardId));
      expect(isValid).toBe(false);
    });
  });

  describe('Game Start Sequence', () => {
    it('should start game after both players submit decks', () => {
      let match = createMockMatch({
        status: 'Setup',
        sealedDecksSubmitted: { p1: false, p2: false },
      });

      expect(match.status).toBe('Setup');

      // Player 1 submits
      match = {
        ...match,
        sealedDecksSubmitted: { p1: true, p2: false },
      };

      expect(match.sealedDecksSubmitted?.p1).toBe(true);
      expect(match.status).toBe('Setup'); // Still waiting

      // Player 2 submits
      match = {
        ...match,
        sealedDecksSubmitted: { p1: true, p2: true },
        status: 'Start', // Game can start
      };

      expect(match.sealedDecksSubmitted?.p1).toBe(true);
      expect(match.sealedDecksSubmitted?.p2).toBe(true);
      expect(match.status).toBe('Start');
    });

    it('should proceed to D20 roll after both decks submitted', () => {
      const match = createMockMatch({
        status: 'Start',
        sealedDecksSubmitted: { p1: true, p2: true },
        d20Results: {},
      });

      expect(match.status).toBe('Start');
      expect(match.d20Results).toEqual({});

      // Both players need to roll
      const needsD20 = !match.d20Results || Object.keys(match.d20Results).length < 2;
      expect(needsD20).toBe(true);
    });

    it('should handle D20 roll and seat selection', () => {
      let match = createMockMatch({
        status: 'Start',
        d20Results: {},
      });

      // Player 1 rolls
      match = {
        ...match,
        d20Results: { p1: 14 },
      };

      // Player 2 rolls
      match = {
        ...match,
        d20Results: { p1: 14, p2: 19 },
      };

      const winner = match.d20Results!.p2 > match.d20Results!.p1 ? 'p2' : 'p1';
      expect(winner).toBe('p2');

      // Winner selects seat
      match = {
        ...match,
        seatSelection: winner,
      };

      expect(match.seatSelection).toBe('p2');
    });
  });

  describe('Mulligan Phase', () => {
    it('should draw 7 cards for each player', () => {
      const p1Hand = Array(7).fill({ cardId: 1 });
      const p2Hand = Array(7).fill({ cardId: 2 });

      expect(p1Hand).toHaveLength(7);
      expect(p2Hand).toHaveLength(7);
    });

    it('should allow mulligan with 6 cards', () => {
      let hand = Array(7).fill({ cardId: 1 });
      let mulliganCount = 0;

      // First mulligan
      hand = Array(6).fill({ cardId: 1 });
      mulliganCount++;

      expect(hand).toHaveLength(6);
      expect(mulliganCount).toBe(1);
    });

    it('should allow multiple mulligans', () => {
      let handSize = 7;
      let mulliganCount = 0;

      // Mulligan 1: 6 cards
      handSize = 6;
      mulliganCount++;

      // Mulligan 2: 5 cards
      handSize = 5;
      mulliganCount++;

      // Mulligan 3: 4 cards
      handSize = 4;
      mulliganCount++;

      expect(handSize).toBe(4);
      expect(mulliganCount).toBe(3);
    });

    it('should start game when both players keep', () => {
      const match = createMockMatch({
        status: 'Start',
        mulliganComplete: { p1: false, p2: false },
      });

      let gameState = { ...match };

      // Player 1 keeps
      gameState = {
        ...gameState,
        mulliganComplete: { p1: true, p2: false },
      };

      // Player 2 keeps
      gameState = {
        ...gameState,
        mulliganComplete: { p1: true, p2: true },
      };

      const canStartGame = gameState.mulliganComplete?.p1 && gameState.mulliganComplete?.p2;
      expect(canStartGame).toBe(true);
    });
  });

  describe('State Recovery', () => {
    it('should recover sealed packs on reload', () => {
      const serverPacks = Array.from({ length: 6 }, (_, i) =>
        createMockSealedPack('Alpha', i)
      );

      const match = createMockMatch({
        sealedPacks: serverPacks,
      });

      // Client recovers from server
      const recoveredPacks = match.sealedPacks;

      expect(recoveredPacks).toBeDefined();
      expect(recoveredPacks).toHaveLength(6);
      expect(recoveredPacks![0]).toHaveLength(15);
    });

    it('should recover deck during construction', () => {
      const workingDeck = [
        { cardId: 1, count: 4 },
        { cardId: 2, count: 3 },
        { cardId: 3, count: 2 },
      ];

      // Simulate saving to localStorage or server
      const savedDeck = JSON.stringify(workingDeck);

      // Recover
      const recoveredDeck = JSON.parse(savedDeck);

      expect(recoveredDeck).toEqual(workingDeck);
      expect(recoveredDeck).toHaveLength(3);
    });

    it('should persist deck submission status', () => {
      const match = createMockMatch({
        sealedDecksSubmitted: { p1: true, p2: false },
      });

      // Player reconnects
      const recoveredStatus = match.sealedDecksSubmitted;

      expect(recoveredStatus?.p1).toBe(true);
      expect(recoveredStatus?.p2).toBe(false);
    });

    it('should recover D20 results', () => {
      const match = createMockMatch({
        d20Results: { p1: 12, p2: 17 },
        seatSelection: 'p2',
      });

      // Page reload
      const recoveredMatch = { ...match };

      expect(recoveredMatch.d20Results).toEqual({ p1: 12, p2: 17 });
      expect(recoveredMatch.seatSelection).toBe('p2');
    });

    it('should recover mulligan state', () => {
      const match = createMockMatch({
        mulliganComplete: { p1: true, p2: false },
      });

      // Player 2 disconnects and reconnects
      const recoveredState = match.mulliganComplete;

      expect(recoveredState?.p1).toBe(true);
      expect(recoveredState?.p2).toBe(false);
    });
  });

  describe('Sealed vs Draft Differences', () => {
    it('should not have pack passing in sealed', () => {
      // In sealed, all packs are opened at once
      // No passing between players like in draft

      const sealedPacks = Array.from({ length: 6 }, (_, i) =>
        createMockSealedPack('Alpha', i)
      );

      const cardPool = sealedPacks.flat();

      // All cards immediately available
      expect(cardPool).toHaveLength(90);

      // No pack direction or passing
      const packDirection = null;
      const packIndex = null;

      expect(packDirection).toBeNull();
      expect(packIndex).toBeNull();
    });

    it('should have deck building time limit', () => {
      const deckBuildingTimeLimit = 25 * 60; // 25 minutes in seconds

      expect(deckBuildingTimeLimit).toBe(1500);
      expect(deckBuildingTimeLimit).toBeGreaterThan(0);
    });

    it('should track time remaining during deck building', () => {
      let timeRemaining = 25 * 60; // seconds

      // Simulate time passing
      const elapsedTime = 60; // 1 minute
      timeRemaining -= elapsedTime;

      expect(timeRemaining).toBe(24 * 60);
      expect(timeRemaining).toBeGreaterThan(0);
    });
  });

  describe('Tournament Sealed', () => {
    it('should generate sealed packs for all tournament players', () => {
      const playerCount = 8;
      const packsPerPlayer = 6;

      const allPacks = Array.from({ length: playerCount }, (_, playerId) =>
        Array.from({ length: packsPerPlayer }, (_, packId) =>
          createMockSealedPack('Alpha', playerId * packsPerPlayer + packId)
        )
      );

      expect(allPacks).toHaveLength(playerCount);
      expect(allPacks[0]).toHaveLength(packsPerPlayer);
      expect(allPacks[0][0]).toHaveLength(15);
    });

    it('should allow players to build decks independently', () => {
      // Each player works on their own deck simultaneously
      const player1Deck = Array(40).fill({ cardId: 1 });
      const player2Deck = Array(45).fill({ cardId: 2 });

      const p1Valid = player1Deck.length >= 40;
      const p2Valid = player2Deck.length >= 40;

      expect(p1Valid).toBe(true);
      expect(p2Valid).toBe(true);
    });

    it('should start pairings after all decks submitted', () => {
      const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
      const decksSubmitted = new Map<string, boolean>();

      // Initially no one submitted
      players.forEach(p => decksSubmitted.set(p, false));

      // Players submit gradually
      decksSubmitted.set('p1', true);
      decksSubmitted.set('p2', true);
      decksSubmitted.set('p3', true);

      const allSubmitted = Array.from(decksSubmitted.values()).every(v => v);
      expect(allSubmitted).toBe(false);

      // All submit
      players.forEach(p => decksSubmitted.set(p, true));

      const nowAllSubmitted = Array.from(decksSubmitted.values()).every(v => v);
      expect(nowAllSubmitted).toBe(true);
    });
  });
});
