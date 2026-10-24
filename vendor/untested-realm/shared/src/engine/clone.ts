import type { GameState } from './types'

/** Fast state clone for hypothetical moves. GameState is pure JSON (no Map/Set/Date/functions — scripts
 *  are looked up by name, never stored), so a hand-rolled structural clone is ~3.25x faster than a
 *  JSON round-trip (and ~3.5x faster than structuredClone) while producing byte-identical data. This is
 *  the single hottest operation in the search — the whole tree's throughput scales with it. */
function deepClone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) {
    const n = new Array(v.length)
    for (let i = 0; i < v.length; i++) n[i] = deepClone(v[i])
    return n as unknown as T
  }
  const o: Record<string, unknown> = {}
  for (const k in v) o[k] = deepClone((v as Record<string, unknown>)[k])
  return o as T
}
/** Deep clone, except the two parts that dominate the state's size and are never edited in place: the
 *  log (append-only; entries are fresh objects, never changed after the push) and the card instances
 *  (only the editor's avatar/art ops touch one, and those never run on a search copy). Those get a new
 *  array / record of the SAME entries, so pushes and new tokens stay local to the clone. Key order — and
 *  so JSON.stringify output — is identical to a full deep clone. */
export const cloneState = (s: GameState): GameState => {
  const out = {} as Record<string, unknown>
  const src = s as unknown as Record<string, unknown>
  for (const k in src) out[k] = k === 'log' ? s.log.slice() : k === 'cards' ? { ...s.cards } : deepClone(src[k])
  return out as unknown as GameState
}
