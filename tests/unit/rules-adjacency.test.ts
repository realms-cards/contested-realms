import { describe, it, expect } from 'vitest';
import { validateAction } from '../../server/rules/index.js';

describe('rules.validateAction (adjacency and first site)', () => {
  const match = { id: 'm1', playerIds: ['alice','bob'] };

  it('allows first site anywhere for acting player', () => {
    const game = { board: { sites: {} } };
    const action = { board: { sites: { '5,5': { owner: 1, card: { name: 'Spire', type: 'Site' } } } } };
    const res = validateAction(game, action, 'alice', { match });
    expect(res.ok).toBe(true);
  });

  it('requires adjacency after first site (rejects non-adjacent)', () => {
    const game = { board: { sites: { '0,0': { owner: 1, card: { name: 'Spire', type: 'Site' } } } } };
    const action = { board: { sites: { '2,0': { owner: 1, card: { name: 'Spire', type: 'Site' } } } } };
    const res = validateAction(game, action, 'alice', { match });
    expect(res.ok).toBe(false);
    expect(String(res.error)).toMatch(/adjacent/);
  });

  it('accepts adjacent placement after first site', () => {
    const game = { board: { sites: { '0,0': { owner: 1, card: { name: 'Spire', type: 'Site' } } } } };
    const action = { board: { sites: { '1,0': { owner: 1, card: { name: 'Spire', type: 'Site' } } } } };
    const res = validateAction(game, action, 'alice', { match });
    expect(res.ok).toBe(true);
  });
});
