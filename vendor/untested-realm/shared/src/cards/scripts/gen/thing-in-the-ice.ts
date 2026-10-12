import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Genesis → Disabled for three of your turns. Can't be targeted or damaged by
//  magic until the ice melts.'
registerScript('Thing in the Ice', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    self.disabled = true
    self.counters = { ...self.counters, ice: 3 }
    pushLog(ctx.state, ctx.controller, 'Something stirs inside the ice…')
  },
  magicProtected: (state, selfId) => !!state.units[selfId]?.counters?.ice,
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self || !self.counters?.ice) return
    self.counters.ice -= 1
    if (self.counters.ice <= 0) {
      delete self.counters.ice
      self.disabled = undefined
      pushLog(ctx.state, ctx.controller, 'The ice shatters — the Thing is free!')
    } else {
      pushLog(ctx.state, ctx.controller, `The ice creaks (${self.counters.ice} turns to thaw).`)
    }
  },
})
