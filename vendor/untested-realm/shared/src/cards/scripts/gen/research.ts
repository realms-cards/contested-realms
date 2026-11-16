import { registerScript } from '../registry'

// 'Draw two spells.'
registerScript('Research', {
  onCast: (ctx) => ctx.draw(ctx.controller, 'spellbook', 2),
})
