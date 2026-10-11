import { registerScript } from '../registry'

// 'Give an allied minion Lethal this turn. Draw a spell.'
// The minion choice is optional (not a target): with no allied minion you can still cast it
// just to draw, and you may skip even with minions present. The draw always happens.
registerScript('Gift of the Serpent', {
  targets: [{ what: 'minion', count: 1, upTo: true, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.grantKeyword(t.unit, 'lethal', 'endOfTurn')
    ctx.draw(ctx.controller, 'spellbook')
  },
})
