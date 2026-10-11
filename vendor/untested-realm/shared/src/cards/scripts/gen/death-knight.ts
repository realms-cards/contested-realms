import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { hasSubtype } from '../../../engine/statics'

// 'Other nearby Undead allies have +1 power.'
registerScript('Death Knight', {
  grantsPower: (state, self, other) => {
    // "Other ... Undead allies" — an Undead allied AVATAR (a Corrupted/Undead-subtype avatar) qualifies;
    // the subtype gate below keeps ordinary avatars out.
    if (other.id === self.id || other.controller !== self.controller) return 0
    if (!hasSubtype(state, other, 'Undead')) return 0
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === other.x && s.y === other.y) ? 1 : 0
  },
})
