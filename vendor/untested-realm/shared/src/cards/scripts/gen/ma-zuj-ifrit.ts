import { registerScript } from '../registry'

// 'Airborne / At the start of your turn, you lose 2 life.'
registerScript('Màzuj Ifrit', {
  turnTriggersFromCemetery: true, // "you lose 2 life" needs no realm position → a cemetery Vivien copying it fires it too (detrimental, but she has the ability "wherever she is")
  startOfTurn: (ctx) => ctx.loseLife(ctx.controller, 2),
})
