import { registerScript } from '../registry'

// 'Airborne / At the start of your turn, you lose 2 life.'
registerScript('Màzuj Ifrit', {
  startOfTurn: (ctx) => ctx.loseLife(ctx.controller, 2),
})
