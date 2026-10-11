import { registerScript } from '../registry'
import { occupies } from '../../../engine/grid'
import { bodyOfWaterCells } from '../multi-card-utils/body-of-water'

// "Submerge / Other allies occupying Lord of Unland's body of water have +1 power."
registerScript('Lord of Unland', {
  grantsPower: (state, self, other) => {
    if (other.id === self.id || other.controller !== self.controller) return 0
    return bodyOfWaterCells(state, self.x, self.y).some((sq) => occupies(other, sq.x, sq.y)) ? 1 : 0
  },
})
