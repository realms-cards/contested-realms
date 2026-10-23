import { registerScript } from '../registry'

// 'Once on your turn, Queen Guinevere may untap target allied minion.'
registerScript('Queen Guinevere', {
  abilities: [{
    key: 'grace',
    label: 'Untap target allied minion',
    cost: {},
    oncePerTurn: true,
    targets: [{ what: 'minion', count: 1, targeted: true, owner: 'ally', label: 'target allied minion' }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (t && 'unit' in t) ctx.untap(t.unit)
    },
  }],
})
