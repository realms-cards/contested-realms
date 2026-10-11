import { registerScript } from '../registry'

// 'Draw three sites.'
registerScript('Tithe', {
  onCast: (ctx) => ctx.draw(ctx.controller, 'atlas', 3),
})
