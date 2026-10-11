import { registerScript } from '../registry'

// 'Genesis → Discard your top two spells.'
registerScript('Shallow Grave', {
  genesis: (ctx) => ctx.mill(ctx.controller, 'spellbook', 2),
})
