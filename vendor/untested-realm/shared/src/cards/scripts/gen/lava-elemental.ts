import { registerScript } from '../registry'

// 'Earth and Fire Spellcaster / Genesis → Deal 2 damage to target adjacent unit.'
registerScript('Lava Elemental', {
  genesisTargets: [{ what: 'unit', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent unit' }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t && ctx.state.units[t.unit]) ctx.dealDamage({ unit: t.unit }, 2)
  },
})
