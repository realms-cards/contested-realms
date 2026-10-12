import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Has nine lives. / Determine opponent's random outcomes.'
registerScript('Black Cat', {
  onWouldDie: (state, selfId, dying) => {
    if (dying.id !== selfId) return false
    const u = state.units[selfId]
    if (!u) return false
    u.counters = u.counters ?? {}
    const used = u.counters.livesLost ?? 0
    if (used >= 8) return false // the ninth death is final
    u.counters.livesLost = used + 1
    u.damage = 0
    pushLog(state, u.controller, `The Black Cat springs back to its feet — ${8 - used} spare live(s) left.`)
    return true
  },
})
