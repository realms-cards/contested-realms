import { registerScript } from '../registry'
import { wardUnit } from '../../../engine/effects'

// 'Genesis → Ward an allied minion.'
registerScript('Virgin in Prayer', {
  genesisTargets: [{ what: 'minion', count: 1, upTo: true, targeted: false, owner: 'ally', label: 'an allied minion' }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) {
      const u = ctx.state.units[t.unit]
      if (u) wardUnit(ctx.state, u)
    }
  },
})
