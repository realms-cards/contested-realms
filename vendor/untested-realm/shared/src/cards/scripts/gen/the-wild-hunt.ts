import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { effSubtypes } from '../../../engine/statics'

// 'Other nearby Spirits and Faeries have Charge.'
registerScript('The Wild Hunt', {
  grantsKeywords: (state, self, other) => {
    if (other.id === self.id || other.isAvatar || other.controller !== self.controller) return []
    const st = effSubtypes(state, other)
    if (!st.includes('Spirit') && !st.includes('Faerie')) return []
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === other.x && s.y === other.y) ? ['charge'] : []
  },
})
