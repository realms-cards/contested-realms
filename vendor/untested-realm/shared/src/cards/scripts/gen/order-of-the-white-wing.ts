import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW } from '../../../engine/grid'

// 'Ward / If a minion would be summoned nearby and it wasn't cast from hand, banish it.'
registerScript('Order of the White Wing', {
  // FAQ: a replacement — the conjured thing NEVER enters the realm
  interceptsUnitEnter: (state, selfId, entering) => {
    const self = state.units[selfId]
    if (!self || entering.isAvatar) return false
    if (entering.counters?.castFromHand) return false
    if (entering.counters?.transformed) return false // a transform (Behemoth/Leviathan waking) isn't a summon
    if (!nearbySquaresW(state, self.x, self.y).some((s) => s.x === entering.x && s.y === entering.y)) return false
    pushLog(state, self.controller, `The White Wing suffers no conjured thing: ${entering.name} is turned away!`)
    return true
  },
})
