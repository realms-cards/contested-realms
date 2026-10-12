import { registerScript } from '../registry'

// 'Whenever Flagellant takes damage, you heal 1.'
registerScript('Flagellant', {
  onSelfDamaged: (ctx) => ctx.gainLife(ctx.controller, 1),
})
