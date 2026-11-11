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
    // a striker, or a unit dealing damage with its ability (Hellstar): "from units" covers both
    const dealer = source?.attackerId ?? source?.sourceUnitId
    const striker = dealer ? state.units[dealer] : null
    return striker && effAttack(state, striker) >= 4 ? 0 : amount
  },
})
