import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'

// 'Other nearby Mortals have +1 power.'
registerScript('Mayor of Milborne', {
  grantsPower: (state, self, other) => {
    if (other.id === self.id || other.isAvatar) return 0
    if (!hasSubtype(state, other, 'Mortal')) return 0
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === other.x && s.y === other.y) ? 1 : 0
  },
})
