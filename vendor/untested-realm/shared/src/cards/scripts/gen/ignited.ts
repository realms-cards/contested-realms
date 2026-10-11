import { registerScript } from '../registry'
import { killUnit } from '../../../engine/effects'

// 'Charge / Dies at the end of your turn.'
registerScript('Ignited', {
  endOfTurn: (ctx) => {
    if (ctx.state.units[ctx.sourceId]) killUnit(ctx.state, ctx.sourceId)
  },
})
