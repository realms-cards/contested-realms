import { getCard } from '../../db'
import { isWaterSite, siteAt } from '../../../engine/grid'
import { connected } from './connected'
import type { GameState } from '../../../engine/types'

/** contiguous body of water containing (x,y), as an array of cells. Magellan-aware (wraps the seam) and
 *  uses the canonical isWaterSite so Drought / rubble / per-instance water choices are honoured. Empty
 *  when (x,y) isn't a water site. This is THE "body of water" primitive — every card reads it so the
 *  concept (which sites count, how the seam wraps) stays identical everywhere. */
export function bodyOfWaterCells(state: GameState, x: number, y: number): { x: number; y: number }[] {
  const isWater = (sx: number, sy: number) => { const s = siteAt(state, sx, sy); return !!s && isWaterSite(state, s, getCard) }
  return connected(state, x, y, isWater)
}

/** the same body of water, as a set of "x,y" keys (for `.size` / `.has` readings). */
export function bodyOfWater(state: GameState, x: number, y: number): Set<string> {
  return new Set(bodyOfWaterCells(state, x, y).map((s) => `${s.x},${s.y}`))
}
