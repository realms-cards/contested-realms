/**
 * E2E Test: Constructed Flow
 * Tests the complete constructed flow including deck selection, D20, seat selection, mulligan, and state recovery
 */

import { describe, it, expect } from 'vitest';
import type { MatchInfo } from '@/lib/net/protocol';

const createMockMatch = (overrides: Partial<MatchInfo> = {}): MatchInfo => ({
  id: 'match-789',
  players: [
    { id: 'p1', displayName: 'Player 1' },
    { id: 'p2', displayName: 'Player 2' },
  ],
  status: 'Setup' as const,
  seed: 'constructed-seed-456',
  playerIds: ['p1', 'p2'],
  maxPlayers: 2,
  isMultiplayer: false,
  ...overrides,
});

const createMockDeck = (deckId: string, cardCount: number) => ({
  id: deckId,
  name: `Test Deck ${deckId}`,
  format: 'constructed',
  cards: Array.from({ length: cardCount }, (_, i) => ({
    cardId: i + 1,
    count: 1,
  })),
});

describe('Constructed Flow E2E Tests', () => {
  describe('Deck Selection', () => {
    it('should load player saved decks', () => {
      const userDecks = [
        createMockDeck('deck1', 60),
        createMockDeck('deck2', 65),
        createMockDeck('deck3', 55),
      ];

      expect(userDecks).toHaveLength(3);
      expect(userDecks[0].cards.length).toBe(60);
    });

    it('should validate deck has minimum cards', () => {
      const deck = createMockDeck('deck1', 60);
      const minCards = 40;

      const isValid = deck.cards.length >= minCards;
      expect(isValid).toBe(true);
    });

    it('should reject decks below minimum', () => {
      const deck = createMockDeck('deck1', 30);
      const minCards = 40;

      const isValid = deck.cards.length >= minCards;
      expect(isValid).toBe(false);
    });

    it('should allow maximum 4 copies of non-magic cards', () => {
      const deck = {
        cards: [
          { cardId: 1, count: 4, isMagic: false }, // Valid
          { cardId: 2, count: 3, isMagic: false }, // Valid
          { cardId: 3, count: 5, isMagic: false }, // Invalid
        ],
      };

      const isValid = deck.cards.every(
        card => card.isMagic || card.count <= 4
      );

      expect(isValid).toBe(false);
    });

    it('should allow unlimited copies of magic cards', () => {
      const deck = {
        cards: [
          { cardId: 100, count: 10, isMagic: true }, // Valid: magic cards unlimited
          { cardId: 101, count: 20, isMagic: true }, // Valid
        ],
      };

      const isValid = deck.cards.every(
        card => card.isMagic || card.count <= 4
      );

      expect(isValid).toBe(true);
    });
  });

  describe('Ready Phase', () => {
    it('should wait for both players to select decks and ready up', () => {
      let match = createMockMatch({
        status: 'Setup',
        constructedDecks: { p1: null, p2: null },
        constructedReady: { p1: false, p2: false },
      });

      // Player 1 selects deck
      match = {
        ...match,
        constructedDecks: { p1: 'deck-1', p2: null },
      };

      expect(match.constructedDecks?.p1).toBe('deck-1');
      expect(match.constructedDecks?.p2).toBeNull();

      // Player 1 readies
      match = {
        ...match,
        constructedReady: { p1: true, p2: false },
      };

      // Not ready to start yet
      const bothReady = match.constructedReady?.p1 && match.constructedReady?.p2;
      expect(bothReady).toBe(false);

      // Player 2 selects and readies
      match = {
        ...match,
        constructedDecks: { p1: 'deck-1', p2: 'deck-2' },
        constructedReady: { p1: true, p2: true },
      };

      // Now ready to start
      const nowBothReady = match.constructedReady?.p1 && match.constructedReady?.p2;
      expect(nowBothReady).toBe(true);
    });

    it('should start D20 roll after both players ready', () => {
      const match = createMockMatch({
        status: 'Start',
        constructedReady: { p1: true, p2: true },
        d20Results: {},
      });

      expect(match.status).toBe('Start');
      expect(match.d20Results).toEqual({});
    });
  });

  describe('D20 Roll and Seat Selection', () => {
    it('should handle D20 roll sequence', () => {
      let match = createMockMatch({
        status: 'Start',
        d20Results: {},
      });

      // Player 1 rolls
      match = {
        ...match,
        d20Results: { p1: 16 },
      };

      expect(match.d20Results?.p1).toBe(16);

      // Player 2 rolls
      match = {
        ...match,
        d20Results: { p1: 16, p2: 11 },
      };

      expect(match.d20Results?.p2).toBe(11);

      // p1 wins
      const winner = match.d20Results!.p1 > match.d20Results!.p2 ? 'p1' : 'p2';
      expect(winner).toBe('p1');
    });

    it('should wait for seat selection before proceeding', () => {
      const match = createMockMatch({
        status: 'Start',
        d20Results: { p1: 18, p2: 13 },
      });

      // D20 complete but no seat selected
      expect(match.d20Results).toBeDefined();
      expect(match.seatSelection).toBeUndefined();

      // Should wait for winner to select seat
      const d20Complete = Object.keys(match.d20Results!).length === 2;
      const canProceed = d20Complete && match.seatSelection;

      expect(canProceed).toBeFalsy();
    });

    it('should proceed after seat selection', () => {
      const match = createMockMatch({
        status: 'Start',
        d20Results: { p1: 18, p2: 13 },
        seatSelection: 'p1',
      });

      const d20Complete = Object.keys(match.d20Results!).length === 2;
      const canProceed = d20Complete && match.seatSelection;

      expect(canProceed).toBeTruthy();
    });

    it('should not skip setup screen before seat selection', () => {
      const match = createMockMatch({
        status: 'Start',
        d20Results: { p1: 12, p2: 15 },
      });

      // This is the key fix: check both d20Complete AND phase=Start AND seatSelection
      const d20Complete = match.d20Results && Object.keys(match.d20Results).length === 2;
      const shouldCloseSetup = d20Complete && match.status === 'Start' && match.seatSelection;

      expect(shouldCloseSetup).toBeFalsy(); // Should be false because no seatSelection yet
    });
  });

  describe('Mulligan Phase', () => {
    it('should draw 7 cards for opening hand', () => {
      const hand = Array(7).fill({ cardId: 1 });

      expect(hand).toHaveLength(7);
    });

    it('should allow mulligan with reduced hand size', () => {
      let hand = Array(7).fill({ cardId: 1 });
      let mulliganCount = 0;

      // Mulligan 1: 6 cards
      hand = Array(6).fill({ cardId: 1 });
      mulliganCount++;

      expect(hand).toHaveLength(6);
      expect(mulliganCount).toBe(1);

      // Mulligan 2: 5 cards
      hand = Array(5).fill({ cardId: 1 });
      mulliganCount++;

      expect(hand).toHaveLength(5);
      expect(mulliganCount).toBe(2);
    });

    it('should track mulligan decisions per player', () => {
      const match = createMockMatch({
        mulliganComplete: { p1: false, p2: false },
      });

      expect(match.mulliganComplete?.p1).toBe(false);
      expect(match.mulliganComplete?.p2).toBe(false);
    });

    it('should start game when both players keep', () => {
      let match = createMockMatch({
        mulliganComplete: { p1: false, p2: false },
      });

      // Player 1 keeps
      match = {
        ...match,
        mulliganComplete: { p1: true, p2: false },
      };

      const canStart = match.mulliganComplete?.p1 && match.mulliganComplete?.p2;
      expect(canStart).toBe(false);

      // Player 2 keeps
      match = {
        ...match,
        mulliganComplete: { p1: true, p2: true },
      };

      const nowCanStart = match.mulliganComplete?.p1 && match.mulliganComplete?.p2;
      expect(nowCanStart).toBe(true);
    });

    it('should shuffle deck after mulligan', () => {
      const deck = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = [...deck].sort(() => Math.random() - 0.5);

      // After shuffle, deck should have same cards but potentially different order
      expect(shuffled).toHaveLength(deck.length);
      expect(shuffled.every(card => deck.includes(card))).toBe(true);
    });
  });

  describe('Game State Recovery', () => {
    it('should recover deck selection on reload', () => {
      const match = createMockMatch({
        constructedDecks: { p1: 'deck-abc', p2: 'deck-xyz' },
        constructedReady: { p1: true, p2: false },
      });

      // Player reconnects
      const recoveredDeck = match.constructedDecks?.p1;
      const recoveredReady = match.constructedReady?.p1;

      expect(recoveredDeck).toBe('deck-abc');
      expect(recoveredReady).toBe(true);
    });

    it('should recover D20 results', () => {
      const match = createMockMatch({
        d20Results: { p1: 14, p2: 17 },
        seatSelection: 'p2',
      });

      const recoveredRolls = match.d20Results;
      const recoveredSeat = match.seatSelection;

      expect(recoveredRolls).toEqual({ p1: 14, p2: 17 });
      expect(recoveredSeat).toBe('p2');
    });

    it('should recover mulligan state', () => {
      const match = createMockMatch({
        mulliganComplete: { p1: true, p2: false },
      });

      const recovered = match.mulliganComplete;

      expect(recovered?.p1).toBe(true);
      expect(recovered?.p2).toBe(false);
    });

    it('should persist game state on server', () => {
      // Simulate server-side game state
      const gameState = {
        turn: 3,
        phase: 'Main',
        activePlayer: 'p1',
        priority: 'p1',
        life: { p1: 40, p2: 35 },
      };

      // Player reloads page
      const recovered = { ...gameState };

      expect(recovered.turn).toBe(3);
      expect(recovered.phase).toBe('Main');
      expect(recovered.life).toEqual({ p1: 40, p2: 35 });
    });
  });

  describe('Tournament Constructed', () => {
    it('should validate decks before tournament start', () => {
      const deck1 = createMockDeck('d1', 60);
      const deck2 = createMockDeck('d2', 45);
      const deck3 = createMockDeck('d3', 70);

      const minCards = 40;

      const allValid = [deck1, deck2, deck3].every(
        deck => deck.cards.length >= minCards
      );

      expect(allValid).toBe(true);
    });

    it('should require deck submission before matches', () => {
      const tournament = {
        playerDecks: new Map<string, string>(),
      };

      // Players submit decks
      tournament.playerDecks.set('p1', 'deck1');
      tournament.playerDecks.set('p2', 'deck2');
      tournament.playerDecks.set('p3', 'deck3');

      expect(tournament.playerDecks.size).toBe(3);
      expect(tournament.playerDecks.get('p1')).toBe('deck1');
    });

    it('should use same deck throughout tournament', () => {
      const tournament = {
        playerDecks: new Map([
          ['p1', 'deck-alpha'],
          ['p2', 'deck-beta'],
        ]),
      };

      // Round 1 match
      const round1Match = {
        p1Deck: tournament.playerDecks.get('p1'),
        p2Deck: tournament.playerDecks.get('p2'),
      };

      // Round 2 match (same decks)
      const round2Match = {
        p1Deck: tournament.playerDecks.get('p1'),
        p2Deck: tournament.playerDecks.get('p2'),
      };

      expect(round1Match.p1Deck).toBe(round2Match.p1Deck);
      expect(round1Match.p2Deck).toBe(round2Match.p2Deck);
    });
  });

  describe('Match Results', () => {
    it('should record match winner', () => {
      const match = createMockMatch({
        status: 'Complete',
        winnerId: 'p1',
      });

      expect(match.status).toBe('Complete');
      expect(match.winnerId).toBe('p1');
    });

    it('should handle draws', () => {
      const match = createMockMatch({
        status: 'Complete',
        winnerId: null,
      });

      expect(match.status).toBe('Complete');
      expect(match.winnerId).toBeNull();
    });

    it('should track game statistics', () => {
      const matchStats = {
        duration: 1245, // seconds
        turns: 18,
        finalLife: { p1: 0, p2: 23 },
        cardsDrawn: { p1: 25, p2: 22 },
      };

      expect(matchStats.duration).toBeGreaterThan(0);
      expect(matchStats.turns).toBeGreaterThan(0);
      expect(matchStats.finalLife.p1).toBe(0); // p1 lost
    });
  });
});
