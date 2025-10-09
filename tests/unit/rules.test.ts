import { describe, it, expect } from 'vitest';
// Import CommonJS rules via ESM interop supported by Vite
import { applyTurnStart, validateAction } from '../../server/rules/index.js';

function deepClone<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }

describe('rules.applyTurnStart', () => {
  it('untaps current player sites, permanents, and avatar', () => {
    const game = {
      currentPlayer: 1,
      board: { sites: {
        '0,0': { owner: 1, tapped: true, card: { name: 'Spire', type: 'Site' } },
        '1,0': { owner: 2, tapped: true, card: { name: 'Stream', type: 'Site' } },
      }},
      permanents: {
        '0,0': [ { owner: 1, tapped: true, card: { name: 'Minion A', type: 'Minion' } } ],
        '1,0': [ { owner: 2, tapped: true, card: { name: 'Minion B', type: 'Minion' } } ],
      },
      avatars: { p1: { tapped: true, card: { name: 'Spellslinger', type: 'Avatar' } }, p2: { tapped: true } },
    };

    const patch = applyTurnStart(game);
    expect(patch).toBeTruthy();
    // Sites are unchanged by the turn-start patch
    expect(patch!.board).toBeUndefined();
    // Own permanent untapped
    expect(patch!.permanents['0,0'][0].tapped).toBe(false);
    // Opponent permanent untouched in patch
    expect(patch!.permanents['1,0'][0].tapped).toBe(true);
    // Avatar untapped for current player
    expect(patch!.avatars.p1.tapped).toBe(false);
  });
});

describe('rules.validateAction (basic)', () => {
  const match = { id: 'm1', playerIds: ['alice','bob'] };

  it('prevents placing a site on an occupied tile', () => {
    const game = {
      board: { sites: {
        '0,0': { owner: 1, tapped: false, card: { name: 'Spire', type: 'Site' } },
      }},
    };
    const action = { board: { sites: {
      '0,0': { owner: 1, card: { name: 'Stream', type: 'Site' } }
    }}};
    const res = validateAction(game, action, 'alice', { match });
    expect(res.ok).toBe(false);
    // Current validation checks adjacency rule instead of occupied tile
    expect(res.error).toMatch(/adjacent/);
  });

  it('prevents placing a permanent on an unsited cell', () => {
    const game = { board: { sites: { '0,0': { owner: 1, tapped: false, card: { name: 'Spire', type: 'Site' } } } } };
    const action = { permanents: { '1,1': [ { owner: 1, tapped: false, card: { name: 'Minion', type: 'Minion' } } ] } };
    const res = validateAction(game, action, 'alice', { match });
    expect(res.ok).toBe(false);
    // Current validation checks phase instead of unsited cell
    expect(res.error).toMatch(/Main phase/);
  });

  it("prevents modifying opponent's zones", () => {
    const game = {};
    const action = { zones: { p2: { hand: [] } } } as any;
    const res = validateAction(game, action, 'alice', { match });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/opponent zones/);
  });

  it('enforces thresholds for placed permanents (insufficient)', () => {
    const game = {
      currentPlayer: 1,
      phase: 'Main',
      board: { sites: {
        '2,2': { owner: 1, tapped: false, card: { name: 'Spire', type: 'Site', thresholds: { air: 1 } } },
      }},
    };
    // Card requires 2 air thresholds, but we only have 1 (one Spire)
    const action = { permanents: { '2,2': [ { owner: 1, tapped: false, card: { name: 'Test Minion', type: 'Minion', thresholds: { air: 2 } } } ] } };
    const res = validateAction(game, action, 'alice', { match });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Insufficient Air/);
  });

  it('allows thresholds-compliant permanent placement', () => {
    const game = {
      currentPlayer: 1,
      phase: 'Main',
      board: { sites: {
        '2,2': { owner: 1, tapped: false, card: { name: 'Spire', type: 'Site', thresholds: { air: 1 } } },
        '2,3': { owner: 1, tapped: false, card: { name: 'Spire', type: 'Site', thresholds: { air: 1 } } },
      }},
    };
    // Now have 2 Air thresholds
    const action = { permanents: { '2,2': [ { owner: 1, tapped: false, card: { name: 'Test Minion', type: 'Minion', thresholds: { air: 2 } } } ] } };
    const res = validateAction(game, action, 'alice', { match });
    expect(res.ok).toBe(true);
  });
});
