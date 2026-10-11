import { registerScript } from '../registry'

// 'Airborne, Ward / At the end of your turn, untap Malakhim.'
registerScript('Malakhim', {
  endOfTurn: (ctx) => ctx.untap(ctx.sourceId),
})
