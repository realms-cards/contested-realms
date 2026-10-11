import { registerScript } from '../registry'
import { takeControl } from '../multi-card-utils/take-control'

// 'Gain control of target nearby minion.' (permanent)
registerScript('Mesmerism', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (u) takeControl(ctx.state, u, ctx.controller)
  },
})
