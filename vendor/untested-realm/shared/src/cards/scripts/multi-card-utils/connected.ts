import { orthAdjacentWrapped } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

/** the orthogonally-connected region of squares containing (x,y) whose members all pass `member`.
 *  Magellan-aware: neighbours wrap across the joined edges when a Magellan Globe is in play, so a body
 *  of water / span of land (a contiguous cluster of adjacent sites) spans the seam like the rulebook says. */
export function connected(state: GameState, x: number, y: number, member: (sx: number, sy: number) => boolean): { x: number; y: number }[] {
  if (!member(x, y)) return []
  const seen = new Set([`${x},${y}`])
  const queue = [{ x, y }]
  const out: { x: number; y: number }[] = []
  while (queue.length) {
    const cur = queue.shift()!
    out.push(cur)
    for (const n of orthAdjacentWrapped(state, cur.x, cur.y)) {
      const k = `${n.x},${n.y}`
      if (!seen.has(k) && member(n.x, n.y)) {
        seen.add(k)
        queue.push(n)
      }
    }
  }
  return out
}
