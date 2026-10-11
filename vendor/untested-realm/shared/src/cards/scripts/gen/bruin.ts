import { registerScript } from '../registry'
import { pushLog, dealDamageToUnit, checkStateBased } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'While near your Avatar, Bruin takes damage for them.'
registerScript('Bruin', {
  damageModifier: (state, selfId, victim, amount, source) => {
    if (!victim.isAvatar || amount <= 0) return amount
    const bruin = state.units[selfId]
    if (!bruin || bruin.silenced || bruin.controller !== victim.controller) return amount
    if (!nearbySquaresW(state, bruin.x, bruin.y).some((s) => s.x === victim.x && s.y === victim.y)) return amount
    dealDamageToUnit(state, bruin, amount, source?.player ?? victim.controller, { source })
    checkStateBased(state)
    pushLog(state, victim.controller, `Bruin throws himself in front of ${victim.name}!`)
    return 0
  },
})
