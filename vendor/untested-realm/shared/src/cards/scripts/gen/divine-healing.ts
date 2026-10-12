import { registerScript } from '../registry'

// 'You gain 7 life.'
registerScript('Divine Healing', {
  onCast: (ctx) => ctx.gainLife(ctx.controller, 7),
})
