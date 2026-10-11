import { registerScript } from '../registry'
import { pushLog } from '../../../engine/effects'
import { siteAt, squareLabel } from '../../../engine/grid'

// 'Choose two different sites. This turn, units can move between them as if
//  they were adjacent.' (any player's units)
registerScript('Waypoint Portal', {
  onCast: (ctx) => {
    const sites = Object.values(ctx.state.sites).filter((s) => !s.isRubble).map((s) => ({ x: s.x, y: s.y }))
    if (sites.length < 2) return
    ctx.ask({ kind: 'chooseSquare', title: 'Waypoint Portal: first site.', data: { squares: sites } }, 'first')
  },
  conts: {
    first: (ctx, _c, sq) => {
      if (!sq || !siteAt(ctx.state, sq.x, sq.y)) return
      const rest = Object.values(ctx.state.sites)
        .filter((s) => !s.isRubble && !(s.x === sq.x && s.y === sq.y))
        .map((s) => ({ x: s.x, y: s.y }))
      ctx.ask({ kind: 'chooseSquare', title: 'Waypoint Portal: second site.', data: { squares: rest } }, 'second', { a: sq })
    },
    second: (ctx, c, sq) => {
      const a = c.a as { x: number; y: number }
      if (!sq || !siteAt(ctx.state, sq.x, sq.y) || (sq.x === a.x && sq.y === a.y)) return
      ctx.state.flow = ctx.state.flow ?? {}
      ctx.state.flow.tempAdjacency = [
        ...(ctx.state.flow.tempAdjacency ?? []),
        { player: null, turn: ctx.state.turn, squares: [a, { x: sq.x, y: sq.y }] },
      ]
      pushLog(ctx.state, null, `A shimmering portal links ${squareLabel(a.x, a.y)} and ${squareLabel(sq.x, sq.y)} this turn.`)
    },
  },
})
