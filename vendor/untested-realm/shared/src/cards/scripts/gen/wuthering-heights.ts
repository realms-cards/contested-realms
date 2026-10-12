import { registerScript } from '../registry'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'

// 'Once on your turn, you may fly a minion atop here onto a nearby site.'
registerScript('Wuthering Heights', {
  abilities: [{
    key: 'gust',
    label: 'Fly a minion here to a nearby site',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.sites[ctx.sourceId]
      if (!self) return
      const riders = unitsAt(ctx.state, self.x, self.y, 'surface').filter((u) => !u.isAvatar).map((u) => u.id)
      if (!riders.length) return ctx.log('No one stands on the heights.')
      ctx.ask({ kind: 'chooseTargets', title: 'The wind lifts whom?', data: { candidates: riders, count: 1, upTo: false, kind: 'unit' } }, 'lift')
    },
  }],
  conts: {
    lift: (ctx, _c, choice) => {
      const id = Array.isArray(choice) ? choice[0] : choice
      const self = ctx.state.sites[ctx.sourceId]
      const u = typeof id === 'string' ? ctx.state.units[id] : null
      if (!self || !u) return
      const squares = nearbySquaresW(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y) && !(s.x === self.x && s.y === self.y))
      if (!squares.length) return
      ctx.ask({ kind: 'chooseSquare', title: `${u.name} is blown where?`, data: { squares } }, 'land', { unitId: u.id })
    },
    land: (ctx, c, sq) => {
      const u = ctx.state.units[c.unitId as string]
      if (u && sq) ctx.teleport(u.id, sq.x, sq.y, 'surface')
    },
  },
})
