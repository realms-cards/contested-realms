import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { isWolf } from '../multi-card-utils/is-wolf'

registerScript('Moonsong Talagelum', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    let n = 0
    for (const u of Object.values(state.units)) {
      if (u.id !== self.id && isWolf(u.name) && nearbySquaresW(state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y)) n++
    }
    return n
  },
})
