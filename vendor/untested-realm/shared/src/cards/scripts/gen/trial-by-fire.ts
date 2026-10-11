import { registerScript } from '../registry'

// 'May be cast by any ally. / Deal 3 damage to target minion nearby.'
registerScript('Trial by Fire', {
  casterFilter: () => null,
  targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', label: 'target nearby minion' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.dealDamage({ unit: t.unit }, 3)
  },
})
