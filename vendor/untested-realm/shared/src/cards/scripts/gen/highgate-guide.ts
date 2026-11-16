import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Nearby allies are Protected from sites.'
// Nearby allies include the Guide itself, and are region-locked to its own region. protectedFromSites
// (statics.ts) reads this, so every site ability that honours Key to the City honours the Guide too.
registerScript('Highgate Guide', {
  protectsAlliesFromSites: (state, selfId, ally) => {
    const self = state.units[selfId]
    if (!self || ally.controller !== self.controller || ally.region !== self.region) return false
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === ally.x && s.y === ally.y)
  },
})
