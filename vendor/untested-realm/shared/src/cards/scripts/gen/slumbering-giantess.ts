import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Fall asleep. Slumbering Giantess is disabled until hurt.'
registerScript('Slumbering Giantess', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    self.disabled = true
    self.counters = { ...self.counters, asleep: 1 }
    pushLog(ctx.state, ctx.controller, 'The Giantess settles down to sleep.')
  },
})
