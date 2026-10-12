import { registerScript } from '../registry'

// 'Spellcaster / Genesis → Draw a spell.'
registerScript('Apprentice Wizard', {
  genesis: (ctx) => ctx.draw(ctx.controller, 'spellbook'),
})
