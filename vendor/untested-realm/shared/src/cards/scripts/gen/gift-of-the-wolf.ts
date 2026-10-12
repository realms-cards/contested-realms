import { registerScript } from '../registry'

// 'Give an allied minion +2 power this turn. Draw a spell.'
// The minion choice is optional (not a target): with no allied minion you can still cast
// it just to draw, and you may skip the buff even with minions present. The draw always happens.
registerScript('Gift of the Wolf', {
  targets: [{ what: 'minion', count: 1, upTo: true, targeted: false, owner: 'ally', label: 'an allied minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.addPower(t.unit, 2, 'endOfTurn')
    ctx.draw(ctx.controller, 'spellbook')
  },
})
