import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { realStepDistanceW } from '../../../engine/movement'

// ---------- sleep ----------

// 'Target minion at a location up to two steps away falls asleep. It's disabled
//  until it takes damage.'
registerScript('Sleep', {
  targets: [{
    what: 'minion', count: 1, targeted: true, label: 'target minion (≤2 steps)',
    filter: (state, u, source) => realStepDistanceW(state, u, source) <= 2, // "up to two steps away" (def. 1)
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!t || !('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    u.disabled = true
    u.counters = { ...u.counters, asleep: 1 }
    pushLog(ctx.state, ctx.controller, `${u.name} drifts into slumber.`)
  },
})
