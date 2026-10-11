import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'

// 'Nearby allied Giants have Charge.'
registerScript('Rebecks', {
  grantsKeywords: (state, self, other) => {
    // "Nearby allied Giants have Charge." Rebecks is itself a Giant and its own square
    // counts as nearby, so it grants Charge to ITSELF too (no self-exclusion).
    if (other.isAvatar || other.controller !== self.controller) return []
    if (!effSubtypes(state, other).includes('Giant')) return []
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === other.x && s.y === other.y) ? ['charge'] : []
  },
})
