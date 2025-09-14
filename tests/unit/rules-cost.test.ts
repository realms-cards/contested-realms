import { describe, it, expect } from 'vitest';
import { ensureCosts, applyTurnStart } from '../../server/rules/index.js';

describe('rules.ensureCosts (per-turn spend model)', () => {
  const match = { id: 'm1', playerIds: ['alice','bob'] };

  it('increments spentThisTurn when enough sites are available', () => {
    const game = {
      board: { sites: {
        '0,0': { owner: 1, card: { name: 'Spire', type: 'Site' } },
        '1,0': { owner: 1, card: { name: 'Spire', type: 'Site' } },
      }},
      resources: { p1: { spentThisTurn: 0 } },
    };
    const action = { permanents: { '0,0': [ { owner: 1, tapped: false, card: { name: 'Minion A', type: 'Minion', cost: 2 } } ] } };
    const res = ensureCosts(game, action, 'alice', { match });
    expect(res.ok).toBe(true);
    expect(res.autoPatch?.resources?.p1?.spentThisTurn).toBe(2);
  });

  it('rejects when cost exceeds available sites after prior spend', () => {
    const game = {
      board: { sites: {
        '0,0': { owner: 1, card: { name: 'Spire', type: 'Site' } },
        '1,0': { owner: 1, card: { name: 'Spire', type: 'Site' } },
      }},
      resources: { p1: { spentThisTurn: 1 } },
    };
    const action = { permanents: { '0,0': [ { owner: 1, tapped: false, card: { name: 'Minion A', type: 'Minion', cost: 2 } } ] } };
    const res = ensureCosts(game, action, 'alice', { match });
    expect(res.ok).toBe(false);
    expect(String(res.error)).toMatch(/Insufficient/);
  });

  it('resets spentThisTurn at turn start', () => {
    const game = {
      currentPlayer: 1,
      board: { sites: {
        '0,0': { owner: 1, card: { name: 'Spire', type: 'Site' } }
      }},
      resources: { p1: { spentThisTurn: 3 } },
    };
    const patch = applyTurnStart(game);
    expect(patch).toBeTruthy();
    expect(patch!.resources?.p1?.spentThisTurn).toBe(0);
  });
});
