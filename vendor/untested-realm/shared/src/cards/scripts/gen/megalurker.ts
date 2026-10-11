import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import type { PlayerId } from '../../../engine/types'
import { orthAdjacentWrapped } from '../../../engine/grid'

// 'Genesis → If an ally died last turn, Megalurker may drag the killer from an
//  adjacent site to here.'
registerScript('Megalurker', {
  genesis: (ctx) => {
    const self = ctx.state.units[ctx.sourceId]
    if (!self) return
    const died: { controller: PlayerId; killerId: string | null }[] = ctx.state.flow?.diedLastTurn ?? []
    const killers = [...new Set(
      died
        .filter((d) => d.controller === ctx.controller && d.killerId)
        .map((d) => d.killerId!)
        .filter((id) => {
          const k = ctx.state.units[id]
          return k && orthAdjacentWrapped(ctx.state, self.x, self.y).some((s) => s.x === k.x && s.y === k.y)
        }),
    )]
    if (!killers.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The Megalurker drags which killer under? (skip for none)', data: { candidates: killers, count: 1, upTo: true, kind: 'unit' } }, 'drag')
  },
  conts: {
    drag: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.units[ctx.sourceId]
      const killer = typeof id === 'string' ? ctx.state.units[id] : null
      if (self && killer) {
        ctx.teleport(killer.id, self.x, self.y, self.region, { push: true }) // forced drag: Cage/push-ban/no-void aware
        pushLog(ctx.state, ctx.controller, `${killer.name} is dragged into the Megalurker's den!`)
      }
    },
  },
})
