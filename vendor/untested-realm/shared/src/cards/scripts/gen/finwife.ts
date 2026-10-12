import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Submerge / Provides (2) for each nearby enemy Avatar.'
registerScript('Finwife', {
  extraManaEachTurn: (state, sourceId) => {
    const self = state.units[sourceId]
    if (!self) return 0
    let n = 0
    for (const u of Object.values(state.units)) {
      if (u.isAvatar && u.controller !== self.controller && nearbySquaresW(state, self.x, self.y).some((s) => s.x === u.x && s.y === u.y)) n += 2
    }
    return n
  },
})
