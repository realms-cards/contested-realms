import { registerScript } from '../registry'
import { killUnit, checkStateBased } from '../../../engine/effects'
import { effSubtypes } from '../../../engine/statics'

// 'Kill all Demons, and one other target minion.'
registerScript('Satanic Panic', {
  targets: [{ what: 'minion', count: 1, targeted: true, label: 'one other target minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    for (const u of Object.values(ctx.state.units)) {
      if (!u.isAvatar && effSubtypes(ctx.state, u).includes('Demon')) killUnit(ctx.state, u.id)
    }
    if (t && 'unit' in t && ctx.state.units[t.unit]) killUnit(ctx.state, t.unit)
    checkStateBased(ctx.state)
  },
})
