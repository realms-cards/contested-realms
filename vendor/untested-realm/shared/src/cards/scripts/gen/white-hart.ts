import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// "Other minions and locations nearby can't be attacked."
registerScript('White Hart', {
  unitBlocksAttacksAt: (state, selfId, x, y) => {
    const self = state.units[selfId]
    if (!self) return false
    if (self.x === x && self.y === y) return false // the Hart itself may be attacked
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === x && s.y === y)
  },
})
