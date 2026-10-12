import { registerScript } from '../registry'
import { pushLog, notifySiteInterference } from '../../../engine/effects'
import { nearbySquaresW, siteAt, squareLabel } from '../../../engine/grid'
import { carryContents } from './site-move'

// '(A)(A)(A) — Once on your turn, this site may fly to a nearby void.'
registerScript('Cloud City', {
  abilities: [{
    key: 'fly',
    label: 'Fly to a nearby void',
    cost: {},
    threshold: { air: 3 },
    oncePerTurn: true,
    effect: (ctx) => {
      const city = ctx.state.sites[ctx.sourceId]
      if (!city) return
      const squares = nearbySquaresW(ctx.state, city.x, city.y).filter((s) => !siteAt(ctx.state, s.x, s.y))
      if (!squares.length) return ctx.log('No nearby void to fly to.')
      ctx.ask({ kind: 'chooseSquare', title: 'Cloud City flies to which void?', data: { squares } }, 'fly')
    },
  }],
  conts: {
    fly: (ctx, _c, sq) => {
      const city = ctx.state.sites[ctx.sourceId]
      if (!city || !sq || siteAt(ctx.state, sq.x, sq.y)) return
      if (!nearbySquaresW(ctx.state, city.x, city.y).some((s) => s.x === sq.x && s.y === sq.y)) return
      const from = { x: city.x, y: city.y }
      const pre = { id: city.id, x: city.x, y: city.y, controller: city.controller }
      city.x = sq.x
      city.y = sq.y
      carryContents(ctx.state, from, sq)
      notifySiteInterference(ctx.state, 'move', pre, ctx.controller)
      pushLog(ctx.state, ctx.controller, `Cloud City drifts to ${squareLabel(sq.x, sq.y)}.`)
    },
  },
})
