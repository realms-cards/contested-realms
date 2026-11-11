import { registerScript, isStrikeDamage } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Nearby units take double damage, except from strikes.'
registerScript('Doomsday Prophet', {
  damageModifierKind: 'mul',
  damageModifier: (state, selfId, victim, amount, source) => {
    const self = state.units[selfId]
    if (!self || isStrikeDamage(source)) return amount
    if (victim.id === selfId) return amount
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === victim.x && s.y === victim.y) ? amount * 2 : amount
  },
})
