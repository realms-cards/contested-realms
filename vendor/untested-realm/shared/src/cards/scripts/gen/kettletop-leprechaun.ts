import { registerScript } from '../registry'

// 'Deathrite → Draw a site.'
registerScript('Kettletop Leprechaun', {
  deathrite: (ctx) => ctx.draw(ctx.controller, 'atlas'),
})
