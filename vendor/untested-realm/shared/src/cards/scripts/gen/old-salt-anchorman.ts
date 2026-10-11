import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// ---------- move protection ----------

// 'Nearby allies can't be moved by enemy spells and abilities.'
// "Nearby allies" is self-inclusive (a unit is its own nearby ally), so the Anchorman protects itself too.
registerScript('Old Salt Anchorman', {
  protectsAlliesFromMoves: (state, selfId, ally) => {
    const self = state.units[selfId]
    if (!self || ally.controller !== self.controller) return false
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === ally.x && s.y === ally.y)
  },
})
