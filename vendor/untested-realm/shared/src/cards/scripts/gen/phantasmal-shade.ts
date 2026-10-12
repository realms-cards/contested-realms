import { registerScript } from '../registry'

// 'When Phantasmal Shade is struck, destroy it.'
registerScript('Phantasmal Shade', {
  onSelfStruck: (ctx) => ctx.kill(ctx.sourceId),
})
