import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'
import { effAttack, effSubtypes } from '../../../engine/statics'

// 'Nearby allied Faeries take no damage from units with 4 or more power.'
registerScript('The Faerie Queene', {
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    const self = state.units[selfId]
    if (!self || self.silenced || victim.controller !== self.controller || victim.isAvatar) return amount
    if (!effSubtypes(state, victim).includes('Faerie')) return amount
    if (!nearbySquaresW(state, self.x, self.y).some((s) => s.x === victim.x && s.y === victim.y)) return amount
    const striker = source?.attackerId ? state.units[source.attackerId] : null
    return striker && effAttack(state, striker) >= 4 ? 0 : amount
  },
})
