import { registerScript } from '../registry'
import { bodyOfWater } from '../multi-card-utils/body-of-water'

// 'Submerge / Anui Undine has +1 power for each site in her body of water.'
registerScript('Anui Undine', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    return bodyOfWater(state, self.x, self.y).size
  },
})
