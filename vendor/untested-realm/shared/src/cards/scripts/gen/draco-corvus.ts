import { registerScript } from '../registry'
import { footprintAllTerrain } from '../../../engine/statics'
import { pushLog, checkStateBased, moveProtected } from '../../../engine/effects'
import { syncCarried } from '../../../engine/carrying'
import { sharedLocation } from '../../../engine/grid'

// 'Airborne, Stealth / Tap → Teleport to target tapped minion to burrow it.'
// It burrows the minion only if it got there. Burrowing is forced movement from the surface to the
// underground of a land site (Codex, Burrowing): it fails on a water site, on an oversized minion
// that isn't wholly on land, and on a minion that can't be moved by force.
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
      ctx.teleport(self.id, u.x, u.y, self.region)
      const me = ctx.state.units[self.id]
      if (!me || !ctx.state.units[u.id] || !sharedLocation(me, u)) return
      if (u.region !== 'surface' || !footprintAllTerrain(ctx.state, u, 'land')) return
      if (moveProtected(ctx.state, u, ctx.controller)) {
        pushLog(ctx.state, u.controller, `${u.name} holds its ground — it can't be moved by force.`)
        return
      }
      u.region = 'underground'
      syncCarried(ctx.state, u) // what it carries goes under with it
      pushLog(ctx.state, ctx.controller, `${u.name} is dragged underground!`)
      checkStateBased(ctx.state)
    },
  }],
})
