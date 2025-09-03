import { describe, it, expect } from 'vitest';
import { Protocol } from '@/lib/net/protocol';

describe('Protocol schemas', () => {
  it('HelloPayload trims and enforces length', () => {
    const ok = Protocol.HelloPayload.parse({ displayName: '  Alice  ' });
    expect(ok.displayName).toBe('Alice');

    // Too long after trim
    const long = 'x'.repeat(41);
    expect(() => Protocol.HelloPayload.parse({ displayName: long })).toThrow();

    // Empty after trim
    expect(() => Protocol.HelloPayload.parse({ displayName: '   ' })).toThrow();
  });

  it('SealedConfig has sane bounds', () => {
    Protocol.SealedConfigSchema.parse({ packCount: 6, setMix: ['Alpha', 'Beta'], timeLimit: 30 });
    expect(() => Protocol.SealedConfigSchema.parse({ packCount: 2, setMix: [], timeLimit: 30 })).toThrow();
    expect(() => Protocol.SealedConfigSchema.parse({ packCount: 9, setMix: [], timeLimit: 30 })).toThrow();
    expect(() => Protocol.SealedConfigSchema.parse({ packCount: 6, setMix: [], timeLimit: 10 })).toThrow();
  });

  it('MatchInfo optional fields parse correctly', () => {
    const res = Protocol.MatchInfoSchema.parse({
      id: 'm1',
      players: [{ id: 'p1', displayName: 'P1' }],
      status: 'waiting',
      seed: 's',
      deckSubmissions: [],
      matchType: 'sealed',
      sealedConfig: { packCount: 6, setMix: ['Alpha'], timeLimit: 30 },
    });
    expect(res.matchType).toBe('sealed');
    expect(res.sealedConfig?.packCount).toBe(6);
  });
});

