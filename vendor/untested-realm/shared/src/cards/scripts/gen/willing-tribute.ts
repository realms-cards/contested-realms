import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Sacrifice → Untap an adjacent Evil ally.'
registerScript('Willing Tribute', {
  abilities: [{
    key: 'tribute',
    label: 'Sacrifice → Untap an adjacent Evil ally',
    cost: { sacrificeSelf: true },
    targets: [{
      what: 'minion', count: 1, targeted: false, owner: 'ally', where: 'adjacent', label: 'an adjacent Evil ally',
      filter: (state, u) => isEvilU(state, u),
    }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (t && 'unit' in t) {
        ctx.untap(t.unit)
        pushLog(ctx.state, ctx.controller, 'The tribute is accepted.')
      }
    },
  }],
})
