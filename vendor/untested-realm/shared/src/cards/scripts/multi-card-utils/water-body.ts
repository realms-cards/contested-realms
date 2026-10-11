import { getCard } from '../../db'
import { orthAdjacentWrapped, siteAt } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

/** contiguous body of water (flooded or water-threshold sites) containing (x,y), Magellan-aware */
export function waterBody(state: GameState, x: number, y: number): { x: number; y: number }[] {
  const isWater = (sx: number, sy: number) => {
    const s = siteAt(state, sx, sy)
    return !!s && (s.flooded || getCard(s.name).thresholds.water > 0)
  }
  if (!isWater(x, y)) return []
  const seen = new Set([`${x},${y}`])
  const queue = [{ x, y }]
  const out: { x: number; y: number }[] = []
  while (queue.length) {
    const cur = queue.shift()!
    out.push(cur)
    for (const n of orthAdjacentWrapped(state, cur.x, cur.y)) {
      const key = `${n.x},${n.y}`
      if (!seen.has(key) && isWater(n.x, n.y)) {
        seen.add(key)
        queue.push(n)
      }
    }
  }
  return out
}
