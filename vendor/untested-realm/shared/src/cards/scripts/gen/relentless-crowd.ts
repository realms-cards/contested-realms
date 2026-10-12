import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Your spellbook may include any number of Relentless Crowds. /
//  Has +1 power for each other Relentless Crowd nearby.'
registerScript('Relentless Crowd', {
  deckLimitExempt: true,
  grantsPower: (state, self, other) => {
    if (other.id !== self.id) return 0
    let n = 0
    for (const u of Object.values(state.units)) {
      if (u.id !== self.id && u.name === 'Relentless Crowd' && nearbySquaresW(state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y)) n++
    }
    return n
  },
})
