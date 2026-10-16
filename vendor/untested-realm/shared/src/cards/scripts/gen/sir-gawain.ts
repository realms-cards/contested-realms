import { registerScript } from '../registry'
import { pushLog, checkStateBased, dealDamageToUnit } from '../../../engine/effects'
import { orthAdjacentWrapped } from '../../../engine/grid'
import { effDefence } from '../../../engine/statics'

// 'Sir Gawain takes damage for other adjacent allies. If he dies from damage
//  taken this way, draw a card.'
registerScript('Sir Gawain', {
  damageModifier: (state, selfId, victim, amount, source) => {
    if (victim.id === selfId || victim.isAvatar || amount <= 0) return amount
    const gawain = state.units[selfId]
    if (!gawain || gawain.silenced || gawain.controller !== victim.controller) return amount
    if (!orthAdjacentWrapped(state, gawain.x, gawain.y).some((s) => s.x === victim.x && s.y === victim.y)) return amount
    const controller = gawain.controller
    dealDamageToUnit(state, gawain, amount, source?.player ?? controller, { source })
    checkStateBased(state)
    // FAQ (Oct 2026): he STILL draws when he dies from normal AND this redirected damage SIMULTANEOUSLY.
    // In a simultaneous damage event the death is deferred to the event boundary, so `state.units[selfId]`
    // can still be present here — judge by LETHALITY (accumulated damage ≥ defence), not just removal.
    const g = state.units[selfId]
    const dead = !g || effDefence(state, g) <= g.damage
    if (dead && !gawain.counters?.gawainDrew) {
      gawain.counters = { ...gawain.counters, gawainDrew: 1 } // draw at most once per fatal event
      pushLog(state, controller, 'Sir Gawain falls shielding his companions — his tale inspires.')
      const p = state.players[controller]
      const id = p.spellbook.shift()
      if (id !== undefined) p.hand.push(id)
    }
    return 0
  },
})
