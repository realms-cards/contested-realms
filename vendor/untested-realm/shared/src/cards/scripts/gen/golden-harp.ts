import { registerScript } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Strike damage and life loss caused by nearby units is reduced to 2.'
registerScript('Golden Harp', {
  damageModifierKind: 'cap',
  damageModifier: (state, selfId, victim, amount, source) => {
    if (source.kind !== 'strike' || !source.attackerId) return amount
    const art = state.artifacts[selfId]
    const striker = state.units[source.attackerId]
    if (!art || !striker) return amount
    if (nearbySquaresW(state, art.x, art.y).some((s) => s.x === striker.x && s.y === striker.y)) {
      return Math.min(amount, 2)
    }
    return amount
  },
})
