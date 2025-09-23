import { describe, it, expect } from 'vitest'

function appBase(): string {
  const exp = (process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_ORIGIN || '').trim()
  return exp || 'http://localhost:3000'
}

describe('POST /api/invites (contract)', () => {
  it('requires authentication', async () => {
    const res = await fetch(`${appBase()}/api/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: 'someone' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 202 Accepted when target is available (auth required; status only)', async () => {
    const res = await fetch(`${appBase()}/api/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' /*, 'Authorization': 'Bearer <token>'*/ },
      body: JSON.stringify({ targetUserId: 'target-user-id' }),
    })
    expect([202]).toContain(res.status)
  })

  it('returns 409 Conflict when target is unavailable (auth required; status only)', async () => {
    const res = await fetch(`${appBase()}/api/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' /*, 'Authorization': 'Bearer <token>'*/ },
      body: JSON.stringify({ targetUserId: 'target-user-id' }),
    })
    expect([409]).toContain(res.status)
  })
})
