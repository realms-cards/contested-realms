import { registerScript } from '../registry'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Banish an Evil minion anywhere in the realm.'
registerScript('Begone!', {
  targets: [{
    what: 'minion', count: 1, targeted: false, label: 'an Evil minion',
    filter: (state, u) => isEvilU(state, u),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if ('unit' in t) ctx.banish(t.unit)
  },
})
