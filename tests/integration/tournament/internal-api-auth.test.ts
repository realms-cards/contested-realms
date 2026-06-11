import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { isTrustedInternalRequest } from '@/lib/auth';

// NOTE: We intentionally do NOT mock '@/lib/auth'. The internal-call path is
// fully deterministic (no session needed) and the session-fallback path returns
// null in the test environment (no auth cookies), so the real security logic is
// exercised end-to-end.

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

const INTERNAL_KEY = 'test-internal-key';

describe('Tournament Draft API internal-auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.INTERNAL_API_KEY = INTERNAL_KEY;
  });

  it('pick accepts internal headers (x-internal-call, x-internal-key, x-user-id) without NextAuth session', async () => {
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
      'x-internal-key': INTERNAL_KEY,
      'x-user-id': 'player_A',
      'content-type': 'application/json',
    });

    const res = await pickPOST(req, makeParams('session_1'));
    expect(res.status).toBe(200);
    expect(makePick).toHaveBeenCalledWith('player_A', 'card_X');
    expect(broadcastStateUpdate).toHaveBeenCalled();
  });

  it('pick rejects x-user-id impersonation when x-internal-key is missing/wrong', async () => {
    const { POST: pickPOST } = await import('@/app/api/draft-sessions/[sessionId]/pick/route');

    // No key — presence of x-user-id alone must NOT authenticate
    const reqNoKey = makeReq({ cardId: 'card_X' }, {
      'x-internal-call': 'true',
      'x-user-id': 'victim',
      'content-type': 'application/json',
    });
    expect((await pickPOST(reqNoKey, makeParams('session_1'))).status).toBe(401);

    // Wrong key
    const reqBadKey = makeReq({ cardId: 'card_X' }, {
      'x-internal-call': 'true',
      'x-internal-key': 'wrong',
      'x-user-id': 'victim',
      'content-type': 'application/json',
    });
    expect((await pickPOST(reqBadKey, makeParams('session_1'))).status).toBe(401);

    expect(makePick).not.toHaveBeenCalled();
  });

  it('choose-pack accepts internal headers (x-internal-call, x-internal-key, x-user-id) without NextAuth session', async () => {
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
      'x-internal-key': INTERNAL_KEY,
      'x-user-id': 'player_A',
      'content-type': 'application/json',
    });

    const res = await choosePOST(req, makeParams('session_2'));
    expect(res.status).toBe(200);
    expect(choosePack).toHaveBeenCalledWith('player_A', { packIndex: 0, setChoice: 'Beta' });
    expect(broadcastStateUpdate).toHaveBeenCalled();
  });

  it('pick returns 401 without internal headers and without NextAuth session', async () => {
    const { POST: pickPOST } = await import('@/app/api/draft-sessions/[sessionId]/pick/route');
    const req = makeReq({ cardId: 'card_Y' }, { 'content-type': 'application/json' });

    const res = await pickPOST(req, makeParams('session_3'));
    expect(res.status).toBe(401);
  });
});

describe('isTrustedInternalRequest', () => {
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = INTERNAL_KEY;
  });

  function headers(h: Record<string, string>): Headers {
    return new Headers(h);
  }

  it('accepts a request with a valid flag + matching key', () => {
    expect(
      isTrustedInternalRequest(headers({ 'x-internal-call': 'true', 'x-internal-key': INTERNAL_KEY })),
    ).toBe(true);
  });

  it('rejects when the key is missing', () => {
    expect(isTrustedInternalRequest(headers({ 'x-internal-call': 'true' }))).toBe(false);
  });

  it('rejects when the key is wrong', () => {
    expect(
      isTrustedInternalRequest(headers({ 'x-internal-call': 'true', 'x-internal-key': 'nope' })),
    ).toBe(false);
  });

  it('rejects when the flag is absent even if a key is provided', () => {
    expect(isTrustedInternalRequest(headers({ 'x-internal-key': INTERNAL_KEY }))).toBe(false);
  });

  it('rejects when no server key is configured (empty env)', () => {
    process.env.INTERNAL_API_KEY = '';
    expect(
      isTrustedInternalRequest(headers({ 'x-internal-call': 'true', 'x-internal-key': '' })),
    ).toBe(false);
  });
});
