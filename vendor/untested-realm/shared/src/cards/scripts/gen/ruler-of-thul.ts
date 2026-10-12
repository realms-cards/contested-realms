import { registerScript } from '../registry'
import { GRID_H, siteAt } from '../../../engine/grid'
import type { GameState, Step } from '../../../engine/types'

// 'Charge / Allies can move as if the top and bottom edges of the realm were
//  connected. Other allies occupying sites there have +1 power.'

// the edge-wrap step available from `from` (top row ↔ bottom row of the same column, if a site awaits).
function edgeStep(state: GameState, from: Step): Step[] {
  if (from.region !== 'surface') return []
  const out: Step[] = []
  if (from.y === 0 && siteAt(state, from.x, GRID_H - 1)) out.push({ x: from.x, y: GRID_H - 1, region: 'surface' })
  if (from.y === GRID_H - 1 && siteAt(state, from.x, 0)) out.push({ x: from.x, y: 0, region: 'surface' })
  return out
}

registerScript('Ruler of Thul', {
  // "Allies can move…" — allies INCLUDES the Ruler itself, so it also gets the edge-wrap step (its own
  // moves use the `extraSteps` self-hook; other allies use `grantsExtraSteps` below).
  extraSteps: (state, _unit, from) => edgeStep(state, from),
  grantsExtraSteps: (state, selfId, unit, from) => {
    const self = state.units[selfId]
    if (!self || unit.controller !== self.controller) return []
    return edgeStep(state, from)
  },
  // "Other allies occupying sites THERE (the connected top/bottom edge rows) have +1 power." An allied
  // AVATAR is an ally too, so it gets the buff — only the Ruler itself is excluded ("other").
  grantsPower: (state, self, other) => {
    if (other.id === self.id || other.controller !== self.controller) return 0
    if (other.region !== 'surface' || !siteAt(state, other.x, other.y)) return 0
    return other.y === 0 || other.y === GRID_H - 1 ? 1 : 0
  },
})
