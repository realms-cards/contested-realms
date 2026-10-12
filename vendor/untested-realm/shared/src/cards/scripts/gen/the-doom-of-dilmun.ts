import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// "Can't be banished, destroyed, or modified."
// FAQ 1: a SACRIFICE still kills the Doom (a sacrifice is not a destroy). Sacrifice paths
// set flow.sacrificing to the unit id before calling killUnit; when that marks THIS unit we
// let the death proceed instead of preventing it.
registerScript('The Doom of Dilmun', {
  immovable: true,
  unbanishable: true,
  unmodifiable: true,
  onWouldDie: (state, selfId, dying) => {
    if (dying.id !== selfId) return false
    if (state.flow?.sacrificing === selfId) return false // sacrifice bypasses can't-be-destroyed
    dying.damage = 0
    pushLog(state, dying.controller, 'The Doom of Dilmun cannot be destroyed.')
    return true
  },
})
