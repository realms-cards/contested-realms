import { registerScript } from '../registry'

// 'Tap → Play or draw a site.' + 'Tap → Draw a spell.'
// (both abilities tap, so it's one or the other each turn)
registerScript('Sorcerer', {
  abilities: [{
    key: 'drawSpell',
    label: 'Tap → Draw a spell',
    cost: { tap: true },
    effect: (ctx) => ctx.draw(ctx.controller, 'spellbook'),
  }],
})
