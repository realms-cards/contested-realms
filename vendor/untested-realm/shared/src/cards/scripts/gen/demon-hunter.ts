import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'

// 'Genesis → Kill target adjacent Demon.'
registerScript('Demon Hunter', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent Demon',
    filter: (state, u) => hasSubtype(state, u, 'Demon'),
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.kill(t.unit)
  },
})
