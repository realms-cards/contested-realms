import { registerScript } from '../registry'

// 'Genesis → Untap an adjacent ally.'
registerScript('Helpful Hob', {
  genesisTargets: [{ what: 'unit', count: 1, upTo: true, targeted: false, owner: 'ally', where: 'adjacent', label: 'an adjacent ally' }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.untap(t.unit)
  },
})
