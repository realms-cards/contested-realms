import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Other nearby allies have +1 power.'
registerScript('House Arn Bannerman', {
  grantsPower: (state, self, other) => {
    if (other.id === self.id || other.controller !== self.controller || other.region !== self.region) return 0
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === other.x && s.y === other.y) ? 1 : 0
  },
})
