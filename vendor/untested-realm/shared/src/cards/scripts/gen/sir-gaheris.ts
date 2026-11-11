import { registerScript } from '../registry'
import { untapUnit } from '../../../engine/effects'

// 'Lance / Untaps at the end of your turn.'
registerScript('Sir Gaheris', {
  endOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self) untapUnit(ctx.state, self)
  },
})
