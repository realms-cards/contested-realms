import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'

// 'Once on your turn, Thundering Giant may teleport to another nearby location.
//  Tap all other units there on arrival.'
registerScript('Thundering Giant', {
  abilities: [{
    key: 'thunder',
    label: 'Thunder-leap to a nearby location',
    cost: {},
    oncePerTurn: true,
    effect: (ctx) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self) return
      const squares = nearbySquaresW(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y) && !(s.x === self.x && s.y === self.y))
      if (!squares.length) return
      ctx.ask({ kind: 'chooseSquare', title: 'The Giant leaps where?', data: { squares } }, 'leap')
    },
  }],
  conts: {
    leap: (ctx, _c, sq) => {
      const self = ctx.state.units[ctx.sourceId]
      if (!self || !sq) return
      ctx.teleport(self.id, sq.x, sq.y, 'surface')
      for (const u of unitsAt(ctx.state, sq.x, sq.y)) {
        if (u.id !== self.id) u.tapped = true
      }
      pushLog(ctx.state, ctx.controller, 'THOOM. The very ground staggers everyone nearby.')
    },
  },
})
