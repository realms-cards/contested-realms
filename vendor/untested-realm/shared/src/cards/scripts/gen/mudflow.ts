import { registerScript } from '../registry'
import { nearbySquaresW, unitsAt } from '../../../engine/grid'

// 'At the start of your turn, surface or unburrow each minion occupying target site nearby.'
registerScript('Mudflow', {
  startOfTurn: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const near = nearbySquaresW(ctx.state, self.x, self.y)
    const candidates = Object.values(ctx.state.sites)
      .filter((s) => near.some((sq) => sq.x === s.x && sq.y === s.y))
      .filter((s) => unitsAt(ctx.state, s.x, s.y).some((u) => !u.isAvatar && (u.region === 'underground' || u.region === 'underwater')))
      .map((s) => s.id)
    if (candidates.length === 0) return
    ctx.ask(
      { kind: 'chooseTargets', title: 'Mudflow: surface/unburrow each minion occupying which nearby site?', data: { candidates, count: 1, upTo: false, kind: 'site' } },
      'churn',
    )
  },
  conts: {
    churn: (ctx, contCtx, choice) => {
      const siteId = Array.isArray(choice) ? choice[0] : choice
      const site = ctx.state.sites[siteId]
      const self = ctx.state.sites[ctx.sourceId]
      if (!site || !self) return
      if (!nearbySquaresW(ctx.state, self.x, self.y).some((sq) => sq.x === site.x && sq.y === site.y)) return
      for (const u of unitsAt(ctx.state, site.x, site.y)) {
        if (!u.isAvatar && (u.region === 'underground' || u.region === 'underwater')) {
          ctx.teleport(u.id, site.x, site.y, 'surface')
        }
      }
    },
  },
})
