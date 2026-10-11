import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'If one or more allies here would take damage, prevent it. If the damage was
//  3 or more, the barricade breaks.'
registerScript('Makeshift Barricade', {
  damagePreventer: true,
  // The Barricade breaks on 3+ damage counted ACROSS everything it shelters at once (FAQ: 1 damage to
  // three allies here simultaneously = 3, so it breaks). So each prevented blow is TALLIED onto the
  // artifact; the break itself is settled at the outermost checkStateBased, once the whole simultaneous
  // event has landed (see breaksWhenAbsorbed / settleAbsorbBreak).
  breaksWhenAbsorbed: 3,
  damageModifier: (state, selfId, victim, amount, source) => {
    const art = state.artifacts[selfId]
    // "allies here" includes your Avatar — it's a unit and an ally, so the Barricade shields it too.
    if (!art || amount <= 0) return amount
    const controller = art.carriedBy ? state.units[art.carriedBy]?.controller : art.conjuredBy
    if (victim.controller !== controller) return amount
    if (victim.x !== art.x || victim.y !== art.y || victim.region !== art.region) return amount
    art.counters = art.counters ?? {}
    art.counters.absorbed = (art.counters.absorbed ?? 0) + amount
    pushLog(state, victim.controller, `The Makeshift Barricade absorbs the blow meant for ${victim.name}.`)
    return 0
  },
})
