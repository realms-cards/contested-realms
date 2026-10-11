import { registerScript } from '../registry'
import { terrainAt } from '../../../engine/statics'
import { pushLog, checkStateBased } from '../../../engine/effects'

// 'Airborne, Stealth / Tap → Teleport to target tapped minion to burrow it.'
registerScript('Draco Corvus', {
  abilities: [{
    key: 'snatch',
    label: 'Tap → Teleport to a tapped minion and bury it',
    cost: { tap: true },
    targets: [{
      what: 'minion', count: 1, targeted: true, label: 'target tapped minion',
      filter: (state, u) => u.tapped,
    }],
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      const t = ctx.targets[0]
      if (!self || !t || !('unit' in t)) return
      const u = ctx.state.units[t.unit]
      if (!u || !u.tapped) return
      ctx.teleport(self.id, u.x, u.y, u.region)
      if (terrainAt(ctx.state, u.x, u.y) === 'land') {
        u.region = 'underground'
        pushLog(ctx.state, ctx.controller, `${u.name} is dragged underground!`)
        checkStateBased(ctx.state)
      }
    },
  }],
})
