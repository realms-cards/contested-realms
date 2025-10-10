import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

// Shared mocks configured before importing route modules
vi.mock('@/lib/auth', () => ({
  getServerAuthSession: vi.fn(),
}));

// Mutable fns we can reconfigure per test
const makePick = vi.fn();
const choosePack = vi.fn();
const broadcastStateUpdate = vi.fn();

vi.mock('@/lib/services/tournament-draft-engine', () => ({
  TournamentDraftEngine: vi.fn().mockImplementation(() => ({
    makePick,
    choosePack,
    broadcastStateUpdate,
  })),
}));

function makeReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  // Cast a minimal shape to NextRequest for our route handlers
  return {
    headers: h,
    json: async () => body,
  } as unknown as NextRequest;
}

function makeParams(sessionId: string) {
  return { params: Promise.resolve({ sessionId }) } as { params: Promise<{ sessionId: string }> };
}

describe('Tournament Draft API internal-auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('pick accepts internal headers (x-internal-call, x-user-id) without NextAuth session', async () => {
    const { getServerAuthSession } = await import('@/lib/auth');
    (getServerAuthSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    // Arrange mock engine behavior
    makePick.mockResolvedValue({
      phase: 'picking',
      packIndex: 0,
      pickNumber: 1,
      currentPacks: [],
      picks: [],
      packDirection: 'left',
      packChoice: [],
      waitingFor: [],
    });

    const { POST: pickPOST } = await import('@/app/api/draft-sessions/[sessionId]/pick/route');

    const req = makeReq({ cardId: 'card_X' }, {
      'x-internal-call': 'true',
      'x-user-id': 'player_A',
      'content-type': 'application/json',
    });

    const res = await pickPOST(req, makeParams('session_1'));
    expect(res.status).toBe(200);
    expect(makePick).toHaveBeenCalledWith('player_A', 'card_X');
    expect(broadcastStateUpdate).toHaveBeenCalled();
  });

  it('choose-pack accepts internal headers (x-internal-call, x-user-id) without NextAuth session', async () => {
    const { getServerAuthSession } = await import('@/lib/auth');
    (getServerAuthSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    choosePack.mockResolvedValue({
      phase: 'pack_selection',
      packIndex: 0,
      pickNumber: 1,
      currentPacks: [],
      picks: [],
      packDirection: 'left',
      packChoice: ['Beta', 'Beta'],
      waitingFor: ['player_A'],
    });

    const { POST: choosePOST } = await import('@/app/api/draft-sessions/[sessionId]/choose-pack/route');

    const req = makeReq({ packIndex: 0, setChoice: 'Beta' }, {
      'x-internal-call': 'true',
      'x-user-id': 'player_A',
      'content-type': 'application/json',
    });

    const res = await choosePOST(req, makeParams('session_2'));
    expect(res.status).toBe(200);
    expect(choosePack).toHaveBeenCalledWith('player_A', { packIndex: 0, setChoice: 'Beta' });
    expect(broadcastStateUpdate).toHaveBeenCalled();
  });

  it('pick returns 401 without internal headers and without NextAuth session', async () => {
    const { getServerAuthSession } = await import('@/lib/auth');
    (getServerAuthSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const { POST: pickPOST } = await import('@/app/api/draft-sessions/[sessionId]/pick/route');
    const req = makeReq({ cardId: 'card_Y' }, { 'content-type': 'application/json' });

    const res = await pickPOST(req, makeParams('session_3'));
    expect(res.status).toBe(401);
  });
});
