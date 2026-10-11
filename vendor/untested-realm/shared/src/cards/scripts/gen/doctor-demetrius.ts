import { registerScript } from '../registry'
import { wardUnit } from '../../../engine/effects'
import { isEvilU } from '../multi-card-utils/is-evil-u'

// 'Once on your turn, Demetrius may Ward another adjacent minion.'
registerScript('Doctor Demetrius', {
  abilities: [{
    key: 'ward',
    label: 'Ward an adjacent minion',
    cost: {},
    oncePerTurn: true,
    targets: [{
      what: 'minion', count: 1, targeted: true, where: 'adjacent', label: 'another adjacent minion',
      filter: (state, u) => !isEvilU(state, u),
    }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (!('unit' in t) || t.unit === ctx.sourceId) return
      const u = ctx.state.units[t.unit]
      if (u) wardUnit(ctx.state, u) // helper enforces the Evil clause; filter is UX-only
    },
  }],
})
