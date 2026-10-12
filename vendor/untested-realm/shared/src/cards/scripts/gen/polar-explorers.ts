import { registerScript } from '../registry'
import { GRID_H, siteAt } from '../../../engine/grid'
import type { GameState } from '../../../engine/types'

// 'Allied units here can move as if the top and bottom edges of the realm were
//  connected.' extraSteps only ever fires for the MOVER itself, so the wrap must be
//  GRANTED to allies sharing the site via grantsExtraSteps; the Explorers itself is
//  covered by its own extraSteps.
function polarWrap(state: GameState, from: { x: number; y: number; region: string }) {
  if (from.region !== 'surface') return []
  const wrapY = from.y === 0 ? GRID_H - 1 : from.y === GRID_H - 1 ? 0 : null
  if (wrapY === null || !siteAt(state, from.x, wrapY)) return []
  return [{ x: from.x, y: wrapY, region: 'surface' as const }]
}

registerScript('Polar Explorers', {
  extraSteps: (state, _unit, from) => polarWrap(state, from), // the Explorers itself
  grantsExtraSteps: (state, selfId, unit, from) => {
    const self = state.units[selfId]
    // only allied units standing at the Explorers' location ("here") get the wrap
    if (!self || unit.controller !== self.controller || from.x !== self.x || from.y !== self.y) return []
    return polarWrap(state, from)
  },
})
