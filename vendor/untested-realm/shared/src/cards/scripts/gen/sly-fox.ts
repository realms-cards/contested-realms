import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Gains Stealth at the end of your turn.'
registerScript('Sly Fox', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self && !self.stealth) {
      self.stealth = true
      pushLog(ctx.state, ctx.controller, 'The Sly Fox slips out of sight.')
    }
  },
})
