#!/usr/bin/env node
// Test script to understand mana tracking behavior

const engine = require('../bots/engine');

// Mock game state with 3 sites, 2 cards in hand
const mockState = {
  board: {
    size: { w: 5, h: 5 },
    sites: {
      '2,4': { owner: 1, tapped: false, card: { name: 'Valley', type: 'Site', thresholds: { earth: 1 } } },
      '1,4': { owner: 1, tapped: false, card: { name: 'Stream', type: 'Site', thresholds: { water: 1 } } },
      '3,4': { owner: 1, tapped: false, card: { name: 'Spire', type: 'Site', thresholds: { air: 1 } } },
    }
  },
  zones: {
    p1: {
      hand: [
        { name: 'Pit Vipers', type: 'Minion', cost: 3, thresholds: { earth: 1 } },
        { name: 'Lucky Charm', type: 'Relic', cost: 0, thresholds: {} }
      ],
      spellbook: [],
      atlas: [],
      graveyard: [],
      banished: []
    },
    p2: { hand: [], spellbook: [], atlas: [], graveyard: [], banished: [] }
  },
  permanents: {},
  avatars: {
    p1: { pos: [2, 4], tapped: false },
    p2: { pos: [2, 0], tapped: false }
  },
  players: {
    p1: { life: 20 },
    p2: { life: 20 }
  },
  resources: {
    p1: { spentThisTurn: 0 }, // Start of turn - nothing spent yet
    p2: { spentThisTurn: 0 }
  },
  currentPlayer: 1,
  phase: 'Main',
  turnIndex: 7
};

console.log('=== Test 1: Fresh turn state (spentThisTurn = 0) ===');
console.log('State: 3 untapped sites, 0 mana spent');
console.log('Hand: Pit Vipers (cost 3), Lucky Charm (cost 0)');
console.log('');

const theta = engine.loadTheta();
const rng = engine.createRng('test');

// Run search with debug output
const result = engine.search(mockState, 'p1', theta, rng, {
  mode: 'evaluate',
  logger: (log) => {
    console.log('Filtered Candidates:', JSON.stringify(log.filteredCandidates, null, 2));
    console.log('');
    console.log('Candidate Actions:');
    if (log.candidateDetails) {
      log.candidateDetails.forEach(c => {
        console.log(`  ${c.action}: score=${c.score.toFixed(2)}, refined=${c.refined.toFixed(2)}`);
      });
    }
    console.log('');
    console.log('Chosen:', JSON.stringify(log.chosenCards, null, 2));
  }
});

console.log('\n=== Test 2: After spending 3 mana (spentThisTurn = 3) ===');
const stateAfterSpending = {
  ...mockState,
  resources: {
    p1: { spentThisTurn: 3 }, // Already spent 3 mana this turn
    p2: { spentThisTurn: 0 }
  }
};

console.log('State: 3 untapped sites, 3 mana spent');
console.log('Expected: Should NOT be able to play Pit Vipers (needs 3, only 0 available)');
console.log('');

const result2 = engine.search(stateAfterSpending, 'p1', theta, rng, {
  mode: 'evaluate',
  logger: (log) => {
    console.log('Filtered Candidates:', JSON.stringify(log.filteredCandidates, null, 2));
    console.log('');
    console.log('Candidate Actions:');
    if (log.candidateDetails) {
      log.candidateDetails.forEach(c => {
        console.log(`  ${c.action}: score=${c.score.toFixed(2)}, refined=${c.refined.toFixed(2)}`);
      });
    }
    console.log('');
    console.log('Chosen:', JSON.stringify(log.chosenCards, null, 2));
  }
});

console.log('\n=== Summary ===');
console.log('Test 1 should show Pit Vipers as playable');
console.log('Test 2 should NOT show Pit Vipers as playable (insufficient mana after spending)');
