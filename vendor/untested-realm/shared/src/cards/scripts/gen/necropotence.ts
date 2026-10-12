import { registerScript } from '../registry'
import { hasSubtype } from '../../../engine/statics'

// 'Give a nearby allied Undead +3 power this turn.'
registerScript('Necropotence', {
  targets: [{
    what: 'minion', count: 1, targeted: false, owner: 'ally', where: 'nearby', label: 'a nearby allied Undead',
    filter: (state, u) => hasSubtype(state, u, 'Undead'),
  }],
  onCast: (ctx) => {
    const t = ctx.targets[0]
    if ('unit' in t) ctx.addPower(t.unit, 3, 'endOfTurn')
  },
})
