import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Units nearby take no damage from Magic spells.'
registerScript('Tragedy Worrywart', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (source?.kind !== 'magic') return amount
    const self = state.units[selfId]
    if (!self || self.silenced) return amount
    return nearbySquaresW(state, self.x, self.y).some((s) => s.x === victim.x && s.y === victim.y) ? 0 : amount
  },
})
