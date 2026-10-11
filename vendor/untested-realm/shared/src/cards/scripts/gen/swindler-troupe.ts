import { registerScript } from '../registry'

// 'Genesis → Give another nearby allied minion Stealth.'
registerScript('Swindler Troupe', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: false, owner: 'ally', where: 'nearby', label: 'another nearby allied minion',
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t && t.unit !== ctx.sourceId) {
      const u = ctx.state.units[t.unit]
      if (u) u.stealth = true
    }
  },
})
