import { GRID_H } from '../../../engine/grid'
import type { GameState, PlayerId } from '../../../engine/types'

// 'Only provides mana and threshold while in your back row.'
export const backRowOnly = {
  siteProvides: (_state: GameState, site: { id: string; x: number; y: number; controller: PlayerId | null }) => {
    if (site.controller === null) return false
    const backRow = site.controller === 0 ? 0 : GRID_H - 1
    return site.y === backRow
  },
}
