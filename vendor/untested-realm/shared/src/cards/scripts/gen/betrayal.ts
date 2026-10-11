import { registerScript } from '../registry'
import { takeControl } from '../multi-card-utils/take-control'

// 'Gain control of target enemy minion this turn and untap it.'
registerScript('Betrayal', {
  targets: [{ what: 'minion', count: 1, targeted: true, owner: 'enemy', label: 'target enemy minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (!u) return
    takeControl(ctx.state, u, ctx.controller, true)
    u.tapped = false
    // mark the turncoat so "Top 10 anime betrayals" can fire if it attacks its own side's Avatar
    u.counters = { ...u.counters, betrayed: ctx.controller }
  },
})
