import { registerScript } from '../registry'

// 'Deathrite → You heal 3.'
registerScript('Muddy Pigs', {
  deathrite: (ctx) => ctx.gainLife(ctx.controller, 3),
})
