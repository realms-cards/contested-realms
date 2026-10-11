import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { unitsAt } from '../../../engine/grid'
import type { PlayerId } from '../../../engine/types'

// 'Genesis → Gain control of all tapped minions here until Puppet Master leaves the realm.'
registerScript('Puppet Master', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    // "tapped minions here" = the Puppet Master's own location (its region), not a burrowed/submerged one below
    for (const u of unitsAt(ctx.state, self.x, self.y, self.region)) {
      if (u.isAvatar || !u.tapped || u.controller === ctx.controller) continue
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.puppets = [...(ctx.state.flow.puppets ?? []), { unitId: u.id, back: u.controller, master: self.id }]
      u.controller = ctx.controller
      pushLog(ctx.state, ctx.controller, `${u.name} dances on the Puppet Master's strings.`)
    }
  },
  deathrite: (ctx) => {
    for (const rec of (ctx.state.flow?.puppets ?? []) as { unitId: string; back: PlayerId; master: string }[]) {
      if (rec.master !== ctx.sourceId) continue
      const u = ctx.state.units[rec.unitId]
      if (u) u.controller = rec.back
    }
    if (ctx.state.flow?.puppets) {
      ctx.state.flow.puppets = ctx.state.flow.puppets.filter((r: any) => r.master !== ctx.sourceId)
    }
  },
})
