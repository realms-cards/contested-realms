import { registerScript } from '../registry'
import { pushLog, dealDamageToUnit, checkStateBased } from '../../../engine/effects'

// 'Takes damage for other allies.'
registerScript('Goat for Azazel', {
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.isAvatar || amount <= 0 || victim.id === selfId) return amount
    const goat = state.units[selfId]
    if (!goat || goat.silenced || goat.controller !== victim.controller) return amount
    dealDamageToUnit(state, goat, amount, source?.player ?? victim.controller, { source })
    checkStateBased(state)
    pushLog(state, victim.controller, `The Goat for Azazel bears ${victim.name}'s suffering.`)
    return 0
  },
})
