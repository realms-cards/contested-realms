import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Ward / Other nearby minions are silenced.'
registerScript('Sister Stefánia', {
  silencesUnit: (state, selfId, unit) => {
    const self = state.units[selfId]
    if (!self || unit.id === selfId || unit.isAvatar) return false
    // only minions in HER OWN region (a surface Sister doesn't silence a burrowed/submerged minion
    // beneath her, nor vice-versa) — "nearby" means the same region, adjacent or co-located.
    if (unit.region !== self.region) return false
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === unit.x && s.y === unit.y)
  },
})
