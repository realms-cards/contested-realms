import { registerScript } from '../registry'
import type { PlayerId } from '../../../engine/types'

// 'Genesis → If an ally died last turn, may teleport to the killer to strike it.'
registerScript('Bitter Departed', {
  genesis: (ctx) => {
    const died: { controller: PlayerId; killerId: string | null }[] = ctx.state.flow?.diedLastTurn ?? []
    const killers = [...new Set(
      died.filter((d) => d.controller === ctx.controller && d.killerId && ctx.state.units[d.killerId]).map((d) => d.killerId!),
    )]
    if (!killers.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The Bitter Departed hunt which killer? (skip for none)', data: { candidates: killers, count: 1, upTo: true, kind: 'unit' } }, 'avenge')
  },
  conts: {
    avenge: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const killer = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !killer) return
      ctx.teleport(self.id, killer.x, killer.y, killer.region)
      if (ctx.state.units[self.id]) ctx.strike(self, { unit: killer.id })
    },
  },
})
