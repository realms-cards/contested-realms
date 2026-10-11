import { registerScript } from '../registry'

// 'Airborne / Genesis → Gain 2 life.'
registerScript('Grain Sparrow', {
  genesis: (ctx) => ctx.gainLife(ctx.controller, 2),
})
