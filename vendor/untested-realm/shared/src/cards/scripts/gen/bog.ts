import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, siteAt } from '../../../engine/grid'

// 'Genesis → Until your next turn, units are Immobile while atop target nearby site.'
registerScript('Bog', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const squares = nearbySquaresW(ctx.state, self.x, self.y).filter((s) => {
      const site = siteAt(ctx.state, s.x, s.y)
      return site && site.id !== self.id
    })
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'Bog: units atop which nearby site become Immobile?', data: { squares } }, 'sink')
  },
  conts: {
    sink: (ctx, _c, sq) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self || !sq) return
      const target = siteAt(ctx.state, sq.x, sq.y)
      if (!target || !nearbySquaresW(ctx.state, self.x, self.y).some((q) => q.x === sq.x && q.y === sq.y)) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.immobileSites = ctx.state.flow.immobileSites ?? []
      ctx.state.flow.immobileSites.push({ siteId: target.id, player: ctx.controller, turn: ctx.state.turn })
      pushLog(ctx.state, ctx.controller, `The Bog swallows ${target.name} — units there are stuck fast.`)
    },
  },
})
