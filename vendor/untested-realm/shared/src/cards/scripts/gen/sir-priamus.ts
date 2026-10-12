import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Lance, Lethal / Nearby allies are immune to Lethal.'
// "Nearby allies" (not "OTHER nearby allies") — a unit is its own nearby ally (its square is in
// nearbySquaresW), so Sir Priamus is immune to Lethal himself too.
registerScript('Sir Priamus', {
  protectsAlliesFromLethal: (state, selfId, ally) => {
    const self = state.units[selfId]
    if (!self || ally.controller !== self.controller) return false
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === ally.x && s.y === ally.y)
  },
})
