import type { GameState } from '../../../engine/types'
import { affinity } from '../../../engine/statics'

/** The four Cities: "(X) — Provides (2) instead but <drawback>." The whole sentence after the threshold
 *  symbol, drawback included, applies only while the City's controller has that threshold — without it
 *  the City is an ordinary site providing (1). */
export function cityActive(state: GameState, siteId: string, element: 'air' | 'earth' | 'fire' | 'water'): boolean {
  const site = state.sites[siteId]
  if (!site || site.isRubble || site.controller === null) return false
  return affinity(state, site.controller)[element] >= 1
}
