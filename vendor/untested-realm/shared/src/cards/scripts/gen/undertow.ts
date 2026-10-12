import { registerScript } from '../registry'
import { orthAdjacentWrapped, unitsAt } from '../../../engine/grid'
import { waterBody } from '../multi-card-utils/water-body'

// 'Genesis → Staying within this body of water, move target unit one step.'
registerScript('Undertow', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const body = waterBody(ctx.state, self.x, self.y)
    const swimmers = body.flatMap((s) => unitsAt(ctx.state, s.x, s.y)).map((u) => u.id)
    if (!swimmers.length) return
    ctx.ask({ kind: 'chooseTargets', title: 'The undertow tugs at which unit?', data: { candidates: swimmers, count: 1, upTo: true, kind: 'unit' } }, 'tug', { body })
  },
  conts: {
    tug: (ctx, c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!u) return
      const body = c.body as { x: number; y: number }[]
      const steps = orthAdjacentWrapped(ctx.state, u.x, u.y).filter((s) => body.some((b) => b.x === s.x && b.y === s.y))
      if (!steps.length) return
      ctx.ask({ kind: 'chooseSquare', title: `${u.name} is pulled where?`, data: { squares: steps } }, 'pullTo', { unitId: u.id })
    },
    pullTo: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq) ctx.teleport(u.id, sq.x, sq.y, u.region, { push: true }) // forced one-step move
    },
  },
})
