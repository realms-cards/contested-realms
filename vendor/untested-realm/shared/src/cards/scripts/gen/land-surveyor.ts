import { registerScript } from '../registry'

// 'Genesis → Draw a site.'
registerScript('Land Surveyor', {
  genesis: (ctx) => ctx.draw(ctx.controller, 'atlas'),
})
