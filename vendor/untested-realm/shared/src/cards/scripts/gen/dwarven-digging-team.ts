import { registerScript } from '../registry'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Burrowing / Allied minions occupying nearby sites have Burrowing.'
registerScript('Dwarven Digging Team', {
  grantsKeywords: (state, self, other) => {
    if (other.id === self.id || other.isAvatar || other.controller !== self.controller) return []
    if (nearbySquaresW(state, self.x, self.y).some((s) => s.x === other.x && s.y === other.y && siteAt(state, s.x, s.y))) return ['burrowing']
    return []
  },
})
