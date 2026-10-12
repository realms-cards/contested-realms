import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Other nearby minions are silenced.'
registerScript('Sisters of Silence', {
  silencesUnit: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || unit.id === selfId || unit.isAvatar) return false
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === unit.x && s.y === unit.y)
  },
})
