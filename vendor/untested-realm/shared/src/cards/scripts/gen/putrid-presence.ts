import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Submerge, Burrowing / The subsurface of nearby sites can be attacked.'
registerScript('Putrid Presence', {
  allowsSubsurfaceAttackAt: (state, selfId, x, y) => {
    const self = state.units[selfId]
    return !!self && nearbySquaresW(state, self.x, self.y).some((s) => s.x === x && s.y === y)
  },
})
