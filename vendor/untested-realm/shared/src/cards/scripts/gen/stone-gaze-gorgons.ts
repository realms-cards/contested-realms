import { registerScript } from '../registry'
import { adjacentSquaresW } from '../../../engine/grid'

// 'Other minions at rest at adjacent locations are disabled.'
// "Adjacent locations" = the Gorgons' OWN square plus the four orthogonal neighbours (Magellan-wrapped), so
// a minion sharing the Gorgons' square is disabled too. ("Other minions" still excludes the Gorgons itself
// and avatars, which are not minions.)
registerScript('Stone-gaze Gorgons', {
  disablesOnlyAtRest: true,
  disablesOther: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || unit.isAvatar || unit.id === selfId || unit.region !== self.region) return false
    return adjacentSquaresW(state, self.x, self.y).some((s) => s.x === unit.x && s.y === unit.y)
  },
})
