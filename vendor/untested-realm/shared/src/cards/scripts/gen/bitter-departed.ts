import { registerScript } from '../registry'
import { sharedLocation } from '../../../engine/grid'
import type { PlayerId } from '../../../engine/types'

// 'Genesis → If an ally died last turn, may teleport to the killer to strike it.'
// Teleportation doesn't cross borders (Codex, Teleport): only a killer in the Departed's own region can be
// reached. Choosing it isn't targeting (no Ward breaks), and only a Departed that arrives there strikes.
registerScript('Bitter Departed', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const died: { controller: PlayerId; killerId: string | null }[] = ctx.state.flow?.diedLastTurn ?? []
    const killers = [...new Set(
      died.filter((d) => d.controller === ctx.controller && d.killerId && ctx.state.units[d.killerId]?.region === self.region).map((d) => d.killerId!),
    )]
    if (!killers.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The Bitter Departed hunt which killer? (skip for none)', data: { candidates: killers, count: 1, upTo: true, kind: 'unit', notTargeted: true } }, 'avenge')
  },
  conts: {
    avenge: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const killer = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !killer || killer.region !== self.region) return
      ctx.teleport(self.id, killer.x, killer.y, self.region)
      const me = ctx.state.units[self.id], foe = ctx.state.units[killer.id]
      if (me && foe && sharedLocation(me, foe)) ctx.strike(me, { unit: foe.id })
    },
  },
})
