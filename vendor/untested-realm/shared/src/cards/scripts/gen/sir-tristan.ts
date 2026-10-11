import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'

// 'Once on your turn, Sir Tristan may tap target nearby enemy minion. That
//  enemy doesn't untap the next time it would.'
registerScript('Sir Tristan', {
  abilities: [{
    key: 'sorrow',
    label: 'Tap a nearby enemy minion (it stays down)',
    cost: {},
    oncePerTurn: true,
    targets: [{ what: 'minion', count: 1, targeted: true, where: 'nearby', owner: 'enemy', label: 'target nearby enemy minion' }],
    effect: (ctx) => {
      const t = ctx.targets[0]
      if (!t || !('unit' in t)) return
      const u = ctx.state.units[t.unit]
      if (!u) return
      u.tapped = true
      u.counters = { ...u.counters, skipUntap: 1 }
      pushLog(ctx.state, ctx.controller, `${u.name} is laid low by Tristan's sorrowful blade.`)
    },
  }],
})
