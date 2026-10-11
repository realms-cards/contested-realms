import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Nearby allies take 1 less damage.'
// "Nearby allies" (NOT "other nearby allies") — a unit is its own nearby ally, so the Shield
// Maidens reduce their OWN incoming damage too (their square is included in nearbySquaresW).
// Uses the Magellan-aware nearby helper so the wrap is honored.
registerScript('Shield Maidens', {
  damageReduction: (state, self, victim) => {
    if (victim.controller !== self.controller) return 0
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === victim.x && s.y === victim.y) ? 1 : 0
  },
})
