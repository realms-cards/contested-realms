import { registerScript } from '../registry'

// 'Draw two sites.'
registerScript('Chart', {
  onCast: (ctx) => ctx.draw(ctx.controller, 'atlas', 2),
})
