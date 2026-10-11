import { registerScript } from '../registry'

// 'Genesis → May deal 2 damage to target adjacent unit.'
registerScript('Vile Imp', {
  genesisTargets: [{ what: 'unit', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent unit' }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.dealDamage({ unit: t.unit }, 2)
  },
})
