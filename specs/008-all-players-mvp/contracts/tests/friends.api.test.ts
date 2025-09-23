import { describe, it, expect } from 'vitest'

function appBase(): string {
  const exp = (process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || '').trim()
  return exp || 'http://localhost:3000'
}

describe('POST /api/friends (contract)', () => {
  it('requires authentication', async () => {
    const res = await fetch(`${appBase()}/api/friends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: 'someone' }),
    })
    // Unauthenticated requests must be rejected
    expect(res.status).toBe(401)
  })

  it('adds a friend when not already a friend (expects 201 on first add)', async () => {
    // NOTE: Auth header and a valid targetUserId are required in real usage.
    // This contract test asserts the status code; actual execution requires
    // an authenticated context which is handled in integration/e2e.
    const res = await fetch(`${appBase()}/api/friends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' /*, 'Authorization': 'Bearer <token>'*/ },
      body: JSON.stringify({ targetUserId: 'target-user-id' }),
    })
    expect([201]).toContain(res.status)
  })

  it('prevents duplicate friend entries (expects 200 or 409 on duplicate)', async () => {
    const res = await fetch(`${appBase()}/api/friends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' /*, 'Authorization': 'Bearer <token>'*/ },
      body: JSON.stringify({ targetUserId: 'target-user-id' }),
    })
    expect([200, 409]).toContain(res.status)
  })
})
