import { registerScript } from '../registry'
import { edgesConnected, GRID_H } from '../../../engine/grid'

// ---------- area disable statics ----------

// 'Other minions at rest here or one step in front of Hillock Basilisk are disabled.'
registerScript('Hillock Basilisk', {
  disablesOnlyAtRest: true,
  disablesOther: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || unit.isAvatar || unit.id === selfId) return false
    let front = self.controller === 0 ? self.y + 1 : self.y - 1
    if (edgesConnected(state)) front = ((front % GRID_H) + GRID_H) % GRID_H // "in front" wraps under the Globe
    const here = unit.x === self.x && unit.y === self.y && unit.region === self.region
    const ahead = unit.x === self.x && unit.y === front && unit.region === 'surface'
    return here || ahead
  },
})
