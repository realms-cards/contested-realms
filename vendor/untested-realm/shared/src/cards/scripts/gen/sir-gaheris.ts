import { registerScript } from '../registry'

// 'Lance / Untaps at the end of your turn.'
registerScript('Sir Gaheris', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) self.tapped = false
  },
})
