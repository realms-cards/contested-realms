import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const PlayerListItem = z.object({
  userId: z.string(),
  shortUserId: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  presence: z.object({
    online: z.boolean(),
    inMatch: z.boolean(),
  }),
  isFriend: z.boolean().optional(),
  lastPlayedAt: z.string().datetime().nullable().optional(),
  matchCountInLast10: z.number().int().min(0).max(10).nullable().optional(),
})

const AvailablePlayersResponse = z.object({
  items: z.array(PlayerListItem),
  nextCursor: z.string().nullable().optional(),
})

function baseUrl(): string {
  // Prefer explicit HTTP origin, else derive from WS URL or default localhost
  const exp = (process.env.NEXT_PUBLIC_WS_HTTP_ORIGIN || process.env.WS_HTTP_ORIGIN || '').trim()
  if (exp) return exp
  const ws = (process.env.NEXT_PUBLIC_WS_URL || '').trim()
  if (ws.startsWith('ws://')) return ws.replace(/^ws:\/\//, 'http://')
  if (ws.startsWith('wss://')) return ws.replace(/^wss:\/\//, 'https://')
  return 'http://localhost:3010'
}

describe('GET /players/available (contract)', () => {
  it('returns 200 and items of expected shape; players are online and not in a match', async () => {
    const url = `${baseUrl()}/players/available?limit=5`
    const res = await fetch(url)
    expect(res.status).toBe(200)
    const json = await res.json()
    const parsed = AvailablePlayersResponse.safeParse(json)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      const items = parsed.data.items
      // Eligibility: online and not in a match
      expect(items.every((p) => p.presence.online && !p.presence.inMatch)).toBe(true)
      // Limit respected (server default/max 100; here we used 5)
      expect(items.length).toBeLessThanOrEqual(5)
    }
  })

  it('supports search by displayName and returns up to 100 with an optional nextCursor', async () => {
    const url = `${baseUrl()}/players/available?q=zzz&limit=100`
    const res = await fetch(url)
    expect([200, 204]).toContain(res.status)
    if (res.status === 200) {
      const json = await res.json()
      const parsed = AvailablePlayersResponse.safeParse(json)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.items.length).toBeLessThanOrEqual(100)
      }
    }
  })

  it('prioritizes recent opponents within the first page when sort=recent (informational)', async () => {
    // NOTE: This is an informational contract expectation. Deterministic verification
    // requires seeded data; here we assert shape only and leave ordering checks for
    // integration tests under tests/integration/.
    const url = `${baseUrl()}/players/available?sort=recent&limit=10`
    const res = await fetch(url)
    expect(res.status).toBe(200)
    const json = await res.json()
    const parsed = AvailablePlayersResponse.safeParse(json)
    expect(parsed.success).toBe(true)
  })
})
