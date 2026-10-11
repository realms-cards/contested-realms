import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'If a nearby Avatar or royalty (King, Queen, Prince, or Princess) would take damage, Royal Bodyguard
//  may take that damage instead.' — a REPLACEMENT the controller chooses each time (a yes/no prompt at
//  the moment of damage, even for simultaneous combat damage), handled by the engine via `guardsRoyalty`
//  (see dealDamageToUnit).
registerScript('Royal Bodyguard', {
  guardsRoyalty: (state, guard, victim) => {
    if (victim.id === guard.id || victim.controller !== guard.controller) return false
    const royal = victim.isAvatar || /\b(King|Queen|Prince|Princess)\b/.test(victim.name)
    if (!royal) return false
    return nearbySquaresW(state, guard.x, guard.y).some((s) => s.x === victim.x && s.y === victim.y)
  },
})
