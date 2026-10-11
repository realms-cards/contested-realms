import { registerScript } from '../registry'

// 'Deal 1 damage to target unit.'
registerScript('Zap!', {
  targets: [{ what: 'unit', count: 1, targeted: true, label: 'target unit' }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.dealDamage({ unit: t.unit }, 1)
  },
})
