import { registerScript, isStrikeDamage } from '../registry'
import { nearbySquaresW } from '../../../engine/grid'

// 'Strike damage and life loss caused by nearby units is reduced to 2.'
registerScript('Golden Harp', {
  damageModifierKind: 'cap',
  damageModifier: (state, selfId, victim, amount, source) => {
    if (!isStrikeDamage(source) || !source.attackerId) return amount
    const art = state.artifacts[selfId]
    const striker = state.units[source.attackerId]
    if (!art || !striker) return amount
    if (nearbySquaresW(state, art.x, art.y).some((s) => s.x === striker.x && s.y === striker.y)) {
      return Math.min(amount, 2)
    }
    return amount
  },
  // damage to a site is life loss for its controller — capped too when a nearby unit causes it
  siteDamageModifier: (state, selfId, _site, n, source) => {
    const art = state.artifacts[selfId]
    const causer = source && state.units[source.attackerId ?? source.sourceUnitId ?? '']
    if (!art || !causer) return n
    return nearbySquaresW(state, art.x, art.y).some((s) => s.x === causer.x && s.y === causer.y) ? Math.min(n, 2) : n
  },
})
