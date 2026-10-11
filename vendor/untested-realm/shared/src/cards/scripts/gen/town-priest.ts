import { registerScript } from '../registry'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Genesis → Return target adjacent Evil minion to its owner's hand.'
registerScript('Town Priest', {
  genesisTargets: [{
    what: 'minion', count: 1, upTo: true, targeted: true, where: 'adjacent', label: 'target adjacent Evil minion',
    filter: (state, u) => isEvilU(state, u),
  }],
  genesis: (ctx) => {
    const t = ctx.targets[0]
    if (t && 'unit' in t) ctx.bounce(t.unit)
  },
})
