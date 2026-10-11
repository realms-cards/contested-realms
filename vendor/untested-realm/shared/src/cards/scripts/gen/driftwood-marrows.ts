import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// "Nearby allies can't be submerged."
registerScript('Driftwood Marrows', {
  protectsAlliesFromSubmerge: (state, selfId, ally) => {
    const self = state.units[selfId]
    if (!self || self.silenced) return false
    if (ally.controller !== self.controller) return false
    // 'nearby allies' includes the Marrows themselves (FAQ)
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === ally.x && s.y === ally.y)
  },
})
