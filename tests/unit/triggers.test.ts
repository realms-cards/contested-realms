import { describe, it, expect } from 'vitest';
import { applyGenesis } from '../../server/rules/triggers.js';

describe('triggers.applyGenesis', () => {
  it('emits a trigger event when placing a permanent with Genesis', () => {
    const game = {};
    const action = {
      permanents: {
        '0,0': [ { owner: 1, tapped: false, card: { name: 'Apprentice Wizard', type: 'Minion', rulesText: 'Genesis → Draw a spell.' } } ]
      }
    };
    const out = applyGenesis(game, action, 'alice', { match: { id: 'm1', playerIds: ['alice','bob'] } });
    expect(out).toBeTruthy();
    expect(Array.isArray(out!.events)).toBe(true);
    expect(out!.events?.[0]?.type).toBe('trigger');
    expect(String(out!.events?.[0]?.name)).toMatch(/Genesis/);
  });

  it('does nothing for placements without Genesis', () => {
    const game = {};
    const action = { permanents: { '0,0': [ { owner: 1, tapped: false, card: { name: 'Vanilla Minion', type: 'Minion', rulesText: 'Just a unit.' } } ] } };
    const out = applyGenesis(game, action, 'alice', { match: { id: 'm1', playerIds: ['alice','bob'] } });
    expect(out).toBeFalsy();
  });
});
