import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'The first time Tuft Turtles would take damage each turn, prevent that damage.'
registerScript('Tufted Turtles', {
  damagePreventer: true,
  damageModifier: (state, selfId, victim, amount) => {
    if (victim.id !== selfId || amount <= 0) return amount
    if (victim.counters?.shellTurn === state.turn) return amount
    victim.counters = { ...victim.counters, shellTurn: state.turn }
    pushLog(state, victim.controller, 'The Tufted Turtles duck into their shells.')
    // PREVENT the damage (not merely reduce it to 0): prevention is final, so a nearby Panpipes of Pnom
    // can't then boost it back up to 2.
    return { amount: 0, prevented: true }
  },
})
