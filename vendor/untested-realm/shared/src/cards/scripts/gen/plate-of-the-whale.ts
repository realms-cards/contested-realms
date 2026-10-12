import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { effAttack } from '../../../engine/statics'

// 'Bearer is immobile if it has less than 3 power. If it has more than 3 power,
//  prevent the first instance of damage it would take each turn.'
registerScript('Plate of the Whale', {
  damagePreventer: true,
  artifactGrantsKeywords: (state, artifactId, unit) => {
    const art = state.artifacts[artifactId]
    if (art?.carriedBy !== unit.id) return []
    return effAttack(state, unit) < 3 ? ['immobile'] : []
  },
  damageModifier: (state, selfId, victim, amount) => {
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== victim.id || amount <= 0) return amount
    if (effAttack(state, victim) <= 3) return amount
    if (art.counters?.blockedTurn === state.turn) return amount
    art.counters = { ...art.counters, blockedTurn: state.turn }
    pushLog(state, victim.controller, 'The Plate of the Whale shrugs off the blow.')
    return 0
  },
})
