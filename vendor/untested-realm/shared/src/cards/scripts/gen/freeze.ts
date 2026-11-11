import { registerScript } from '../registry'
import { disableUntilYourNextTurn } from '../multi-card-utils/disable-until-next-turn'

// 'Disable target nearby minion until your next turn.'
registerScript('Freeze', {
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (!('unit' in t)) return
    const u = ctx.state.units[t.unit]
    if (u) disableUntilYourNextTurn(ctx.state, u.id, ctx.controller)
  },
})
