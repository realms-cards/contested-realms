import { registerScript } from '../registry'
import { nearbySquaresW, siteAt, unitsAt } from '../../../engine/grid'

// 'Genesis → Deal 1 damage to each minion atop target nearby site.'
registerScript('Vast Desert', {
  genesis: (ctx) => {
    const self = ctx.state.sites[ctx.sourceId]
    if (!self) return
    const squares = nearbySquaresW(ctx.state, self.x, self.y).filter((s) => siteAt(ctx.state, s.x, s.y) && !(s.x === self.x && s.y === self.y))
    if (!squares.length) return
    ctx.ask({ kind: 'chooseSquare', title: 'The desert winds scour which nearby site?', data: { squares } }, 'scour')
  },
  conts: {
    scour: (ctx, _c, sq) => {
      if (!sq) return
      for (const u of unitsAt(ctx.state, sq.x, sq.y, 'surface')) {
        if (!u.isAvatar) ctx.dealDamage({ unit: u.id }, 1)
      }
    },
  },
})
