import { registerScript } from '../registry'

// 'Spellcaster / Genesis → Draw three spells.'
registerScript('Grandmaster Wizard', {
  genesis: (ctx) => ctx.draw(ctx.controller, 'spellbook', 3),
})
