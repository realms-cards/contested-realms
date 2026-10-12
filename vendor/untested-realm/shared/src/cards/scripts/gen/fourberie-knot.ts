import { registerScript } from '../registry'
import { effAttack, effDefence } from '../../../engine/statics'

// 'Bearer minion takes no damage from units with 4 or more power, and is also a Faerie.'
registerScript('Fourberie Knot', {
  // "…and is also a Faerie": grant the Faerie subtype to the bearer DYNAMICALLY, so every
  // subtype-gated effect that reads effSubtypes (A Midsummer Night's Dream's power boost + dispel
  // check, Seelie/Unseelie Court, Fae City…) sees the bearer as a real Faerie. effSubtypes gates this
  // on the artifact not being silenced, so a silenced Knot stops granting it automatically.
  subtypeOverride: (state, selfId, unit, subtypes) => {
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== unit.id) return subtypes
    return subtypes.includes('Faerie') ? subtypes : [...subtypes, 'Faerie']
  },
  damagePreventer: true,
  damagePreviewPure: true,
  damageModifier: (state, selfId, victim, amount, source) => {
    const art = state.artifacts[selfId]
    if (!art || art.carriedBy !== victim.id || !source.attackerId) return amount
    const striker = state.units[source.attackerId]
    if (!striker) return amount
    const avg = Math.floor((effAttack(state, striker) + effDefence(state, striker)) / 2)
    return avg >= 4 ? 0 : amount
  },
})
