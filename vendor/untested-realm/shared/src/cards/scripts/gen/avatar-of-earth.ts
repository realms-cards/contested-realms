import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { getCard } from '../../db'

// 'You have +1 power for each nearby earth site.'
registerScript('Avatar of Earth', {
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    let n = 0
    for (const sq of nearbySquaresW(state, self.x, self.y)) {
      for (const site of Object.values(state.sites)) {
        if (site.x === sq.x && site.y === sq.y && !site.isRubble && getCard(site.name).thresholds.earth > 0) n++
      }
    }
    return n
  },
})
