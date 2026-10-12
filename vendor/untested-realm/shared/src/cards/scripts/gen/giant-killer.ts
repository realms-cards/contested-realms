import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'

// 'Genesis → Kill target nearby Giant.'
registerScript('Giant Killer', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'nearby', label: 'target nearby Giant',
    filter: (state, u) => hasSubtype(state, u, 'Giant'),
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.kill(t.unit)
  },
})
