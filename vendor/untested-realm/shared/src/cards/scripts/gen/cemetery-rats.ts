import { registerScript } from '../registry'

// 'Burrowing / Genesis → Discard your top two spells.'
registerScript('Cemetery Rats', {
  genesis: (ctx) => ctx.mill(ctx.controller, 'spellbook', 2),
})
