import { registerScript } from '../registry'

// 'If Sir Bedivere is carrying an artifact at the start of your turn, draw a card.'
registerScript('Sir Bedivere', {
  startOfTurn: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (self && self.carrying.length) ctx.drawCard(ctx.controller)
  },
})
