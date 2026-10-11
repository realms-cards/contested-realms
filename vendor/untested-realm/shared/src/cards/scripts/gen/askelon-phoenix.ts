import { registerScript } from '../registry'
import { getCard } from '../../db'
import { pushLog } from '../../../engine/effects'

// 'If Askelon Phoenix would take fire damage, it gains +1 power this turn instead.'
registerScript('Askelon Phoenix', {
  damagePreventer: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.id !== selfId) return amount
    const fiery = source.elements?.includes('Fire') || (source.name ? getCard(source.name).elements.includes('Fire') : false)
    if (!fiery) return amount
    const self = state.units[selfId]
    if (self) {
      self.modifiers.push({ kind: 'power', amount: 1, duration: 'endOfTurn', turn: state.turn, sourcePlayer: self.controller })
      pushLog(state, self.controller, 'The Phoenix drinks the flames: +1 power!')
    }
    return 0
  },
})
